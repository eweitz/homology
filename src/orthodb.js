/**
* @fileoverview Client library for OrthoDB
* API docs: https://www.orthodb.org/?page=api
*
* This module supports fetching orthologs from OMA.  All functions here
* support the single exported function `fetchOrthologsFromOrthoDb`.
*/

import Bottleneck from 'bottleneck';

import taxidByName from './organism-map';
import {reportError} from './error';
import {fetchLocationsFromMyGeneInfo} from './lib';

var limiter = new Bottleneck({
  minTime: 333,
  maxConcurrent: 3
});

// OrthoDB does not support CORS.  Homology API on Firebase proxies OrthoDB and
// supports CORS.  This enables client-side web requests to the OrthoDB API.
//
// var orthodbBase = 'https://www.orthodb.org/';
// var orthodbBase = 'https://homology-api.firebaseapp.com/orthodb/';
// var orthodbBase = 'http://localhost:5000/orthodb/';
var orthodbBase = 'http://localhost:5001/homology-api/us-central1/app/orthodb/'

var apiKey = '&api_key=e7ce8adecd69d0457df7ec2ccbb704c4e709';

var ncbiBase =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi' +
  '?db=gene&retmode=json' + apiKey;

/**
 * Get JSON response from OrthoDB API
 */
export async function fetchOrthoDBJson(path, isRest=true) {
  var response = await fetch(orthodbBase + path);
  var json = await response.json();
  if (isRest) {
    return json.data;
  } else {
    return json;
  }
}

/**
 * Get genomic coordinates of a gene using its NCBI Gene ID
 */
async function fetchGeneLocationFromEUtils(ncbiGeneId) {
  var response, data, result, ginfo, location;
  // Example:
  // https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&retmode=json&id=3565955
  response = await fetch(ncbiBase + '&id=' + ncbiGeneId);
  data = await response.json();
  result = data.result;
  ginfo = result[result.uids[0]].genomicinfo[0];
  location = ginfo.chrloc + ':' + ginfo.chrstart + '-' + ginfo.chrstop;
  return location;
}

async function fetchLocation(orthodbGene) {
  var ncbiGeneId, ogDetails, location,
    orthodbGeneId = orthodbGene.gene_id.param;

  // Example:
  // https://homology-api.firebaseapp.com/orthodb/ogdetails?id=6239_0:0008da
  ogDetails = await fetchOrthoDBJson('ogdetails?id=' + orthodbGeneId);

  if ('entrez' in ogDetails) {
    ncbiGeneId = ogDetails.entrez[0].id;
  } else {
    // Occurs in Drosophila melanogaster, e.g.
    // https://homology-api.firebaseapp.com/orthodb/ogdetails?id=7227_0:000534
    ogDetails.xrefs.forEach(xref => {
      if (xref.type === 'NCBIgene') ncbiGeneId = xref.name;
    });
  }

  location = await limiter.schedule(() => fetchGeneLocationFromEUtils(ncbiGeneId));
  return location;
}

function taxidFromOrganismName(name) {
  return name in taxidByName ? taxidByName[name] : 'all';
}

/**
 * See if an ortholog matches a queried organism, and how well it matches
 */
async function findBestOrtholog(orthologId, gene, sourceOrg, targetOrgs) {
  var source, rawOrthologs,
    targets = [],
    hasSourceNameMatch = false;

  const sourceTaxid = taxidFromOrganismName(sourceOrg);
  const targetTaxid = taxidFromOrganismName(targetOrgs[0]);
  const speciesParam = sourceTaxid + ',' + targetTaxid;

  // Example:
  // https://homology-api.firebaseapp.com/orthodb/orthologs?id=1269806at2759&species=all
  rawOrthologs = await fetchOrthoDBJson(`orthologs?id=${orthologId}&species=${speciesParam}`);

  rawOrthologs.forEach(rawOrtholog => {

    // Is this ortholog record for the source organism?
    var thisOrganism = rawOrtholog.organism.name.toLowerCase();
    if (sourceOrg === thisOrganism) {
      source = rawOrtholog;

      // Do any genes in the record have a name matching the queried gene?
      rawOrtholog.genes.forEach(geneObj => {
        var thisGene = geneObj.gene_id.id.toLowerCase();
        if (gene.toLowerCase() === thisGene) {
          hasSourceNameMatch = true;
        }
      });
    }

    if (targetOrgs.includes(thisOrganism)) targets.push(rawOrtholog);
  });

  return [source, targets, hasSourceNameMatch];
}

function getTargetGene(target, sourceGeneName) {
  var nameMatches = target.genes.filter(gene => {
    return gene.gene_id.id.toLowerCase() === sourceGeneName.toLowerCase();
  });
  if (nameMatches.length === 0) {
    return target.genes[0];
  } else {
    return nameMatches[0];
  }
}

/**
 * E.g. http://purl.orthodb.org/odbgene/6239_0_000f12 -> 6239_0:000f12
 */
function getOrthoDBId(url) {
  const splitId = url.split('/').slice(-1)[0].split('_')
  return splitId[0] + '_' + splitId[1] + ':' + splitId[2]
}

async function getTarget(targets, gene) {
  // TODO: Return 1-to-many mappings
  // Example with many target hits this (over)simplifies:
  // http://eweitz.github.io/ideogram/comparative-genomics?org=homo-sapiens&org2=mus-musculus&source=orthodb&gene=SAP30
  var targetGene = getTargetGene(targets[0], gene)
  var targetLocation = await fetchLocation(targetGene);

  var splitName = targetGene.gene_id.id.split(';');
  var nameIndex = (splitName.length > 1) ? 1 : 0;
  var targetGeneName = splitName[nameIndex];

  return [targetLocation, targetGeneName];
}

async function fetchOrtholog(gene, sourceOrg, targetOrgs) {
  var ortholog, ids, j, id, source, gene, scope, ids, sourceGene,
    hasSourceNameMatch = false,
    targets = [],
    targetOrg = targetOrgs[0],
    targetTaxid = taxidFromOrganismName(targetOrg),
    sourceTaxid = taxidFromOrganismName(sourceOrg)

  // 2759 is the NCBI Taxonomy ID for Eukaryota (eukaryote)
  // https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=2759
  scope = "level=2759&species=" + targetTaxid + ',' + sourceTaxid;

  // Example:
  // https://homology-api.firebaseapp.com/orthodb/search?query=NFYA&level=2759&species=2759
  ids = await fetchOrthoDBJson('search?query=' + gene + '&' + scope);

  // Iterate through returned ortholog IDs
  // Prefer orthologous pairs that have a gene name matching the queried gene
  for (j = 0; j < ids.length; j++) {
    id = ids[j];
    [source, targets, hasSourceNameMatch] =
      await findBestOrtholog(id, gene, sourceOrg, targetOrgs);
    if (hasSourceNameMatch) break;
  }

  if (typeof source === 'undefined') {
    reportError('orthologsNotFound', null, gene, sourceOrg, targetOrgs);
  }

  sourceGene = source.genes.filter(geneObj => {
    var thisGene = geneObj.gene_id.id.toLowerCase();
    return gene.toLowerCase() === thisGene;
  })[0];

  if (typeof sourceGene === 'undefined') {
   reportError('geneNotFound', null, gene, sourceOrg);
  }
  var sourceLocation = await fetchLocation(sourceGene);

  if (targets.length === 0) {
    reportError('orthologsNotFoundInTarget', null, gene, sourceOrg, targetOrgs);
  }

  var [targetLocation, targetGeneName] = await getTarget(targets, gene);

  // TODO:
  //  * Uncomment this when multi-target orthology support is implemented
  //  * Implement exponential backoff and jitter to address rate limits
  // var locations = await Promise.all(targets.map(async (target) => {
  //   return await Promise.all(target.genes.map(async (gene) => {
  //     return fetchLocation(gene);
  //   }));
  // }));
  // locations = locations[0];
  // locations.unshift(sourceLocation); // prepend to source to target array

  ortholog = [
    {gene: gene, location: sourceLocation},
    {gene: targetGeneName, location: targetLocation}
  ];

  return ortholog;
}

/**
 * Get genomic locations of orthologs from OrthoDB
 *
 * For genes in a source organism, find orthologs in target organisms and
 * return the genomic coordinates of the source gene and orthologous genes.
 *
 * Example:
 * fetchOrthologsFromOrthodb(
 *  ['NFYA'],
 *  'homo-sapiens',
 *  ['caenorhabditis-elegans']
 * );
 *
 * @param {Array} genes Gene name
 * @param {String} sourceOrg Source organism name
 * @param {Array<String>} targetOrgs List of target organism names
 */
async function fetchOrthologsFromOrthodb(genes, sourceOrg, targetOrgs) {
  var tasks = genes.map(gene => fetchOrtholog(gene, sourceOrg, targetOrgs));
  return Promise.all(tasks);
}

/** Deduplicates gene names in a list of results from SPARQL query */
function getOrthologMap(genes, sparqlJson) {

  const orthologMap = {}
  const seenTargetNames = {}
  genes.forEach(gene => {
    seenTargetNames[gene] = []
    orthologMap[gene] = []
  })

  const sources = {}

  sparqlJson.results.bindings.forEach(result => {
    const source = result.gene_s_name.value
    const sourceId = getOrthoDBId(result.gene_s.value)
    if (orthologMap[source].length > 0) sources[source] = {id: sourceId}

    const name = result.gene_t_name.value;
    const id = getOrthoDBId(result.gene_t.value)
    if (!seenTargetNames[source].includes(name)) {
      seenTargetNames[source].push(name)
      orthologMap[source].push({name, id})
    }
  })

  return {orthologMap, sources}
}

/**
 * Sort orthologs by name similarity to source gene
 *
 * A given gene (source gene) can have multiple target genes (orthologs).
 *
 */
function sortTargetGenes(sourceGene, targetGenes) {
  console.log('sourceGene, targetGenes', sourceGene, targetGenes)
  sourceGene = sourceGene.toLowerCase()
  return targetGenes.sort((a, b) => {
    const geneA = a.name.toLowerCase()
    const geneB = b.name.toLowerCase()
    if (geneA !== sourceGene && geneB !== sourceGene) {

    }
    if (geneA === sourceGene) return -1
    if (geneB === sourceGene) return 1
  })
}

/**
 * Add Ensembl ID, # amino acids, and # exons to a gene.
 */
async function enrichGene(gene) {
  const ogDetails = await fetchOrthoDBJson('ogdetails?id=' + gene.id);
  console.log('ogDetails for gene', ogDetails)
  if (ogDetails.ensembl) {
    gene.ensemblId = ogDetails.ensembl[0].id
    gene.aas = ogDetails.aas // length in amino acids
    gene.exons = ogDetails.exons // number of exons
  }

  return gene
}

/**
 * Add Ensembl IDs, # amino acids, and # exons to source and target genes.
 */
async function enrichMap(orthologMap, sources) {
  const enrichedMap = {}
  const enrichedSources = {}

  // Parallelizes as described in https://medium.com/@antonioval/6315c3225838
  // (but without library advertised there).
  await Promise.all(
    Object.entries(orthologMap).map(async ([sourceName, targets]) => {
      const enrichedSource = await enrichGene(sources[sourceName])
      console.log('sources, sourceName, enrichedSource', sources, sourceName, enrichedSource)
      enrichedSource[sourceName] = enrichedSource

      // Parallelize OrthoDB REST API requests
      const promises = targets.map(async target => await enrichGene(target))
      const enrichedTargets = await Promise.all(promises)

      enrichedMap[sourceName] = enrichedTargets
    })
  )

  console.log('enrichedSources', enrichedSources)

  return {enrichedMap, enrichedSources}
}

async function fetchOrthologsFromOrthodbSparql(genes, sourceOrg, targetOrgs) {
  const genesClause = genes.join('%7C') // URL encoding for | (i.e. OR)

  // TODO: Support multiple target organisms
  const sourceTaxid = taxidByName[sourceOrg]
  const targetTaxid = taxidByName[targetOrgs[0]]

  console.log('sourceOrg', sourceOrg)

  const query =
    'sparql/?query=prefix+%3A+%3Chttp%3A%2F%2Fpurl.orthodb.org%2F%3E%0D%0A' +
    'select+*%0D%0A' +
    'where+%7B%0D%0A' +
    '%3Fog+a+%3AOrthoGroup.%0D%0A' +
    '%3Fgene_s+a+%3AGene.%0D%0A' + // source gene
    '%3Fgene_t+a+%3AGene.%0D%0A' + // target gene
    `%3Fgene_s+up%3Aorganism%2Fa+taxon%3A${sourceTaxid}.%0D%0A` +
    `%3Fgene_t+up%3Aorganism%2Fa+taxon%3A${targetTaxid}.%0D%0A` +
    '%3Fgene_s+%3AmemberOf+%3Fog.%0D%0A' +
    '%3Fgene_t+%3AmemberOf+%3Fog.%0D%0A' +
    '%3Fgene_s+%3Aname+%3Fgene_s_name.%0D%0A' +
    '%3Fgene_t+%3Aname+%3Fgene_t_name.%0D%0A' +
    `filter+%28regex%28%3Fgene_s_name%2C+%22%5E%28${genesClause}%29%24%22%2C+%22i%22%29%29%0D%0A` +
    '%7D';
  const sparqlJson = await fetchOrthoDBJson(query, false);
  console.log('sparql json:', sparqlJson);

  let {orthologMap, sources} = getOrthologMap(genes, sparqlJson);

  console.log('orthologMap, sources, before addEnsemblIds: ', orthologMap, sources)

  orthologMap, sources = await enrichMap(orthologMap, sources)

  console.log('orthologMap, after enrichMap: ', enrichMap)

  const sourceLocations = await fetchLocationsFromMyGeneInfo(genes, sourceTaxid);

  let rawTargets = []
  Object.entries(orthologMap).forEach(([source, targets]) => {
    rawTargets = rawTargets.concat(targets)
  })

  const targetLocations =
    await fetchLocationsFromMyGeneInfo(rawTargets, targetTaxid)

  const orthologs = []

  Object.entries(orthologMap).forEach(([sourceGene, targetGenes]) => {
    const ortholog = []

    console.log('targets, unsorted', targetGenes)
    targetGenes = sortTargetGenes(sourceGene, targetGenes)
    console.log('targets, sorted', targetGenes)

    const sourceLocation =
      sourceLocations.find(sl => sl.name === sourceGene).location
    console.log('sourceLocations', sourceLocations)
    const source = {gene: sourceGene, location: sourceLocation}
    ortholog.push(source)
    console.log('source', source)
    targetGenes.forEach(targetGene => {
      const targetName = targetGene.name
      let targetLocation =
        targetLocations.find(tl => tl.name === targetName)

      if (!targetLocation) { targetLocation = targetLocations[0]}

      const target = {gene: targetName, location: targetLocation.location}
      ortholog.push(target)
    })
    orthologs.push(ortholog)
  })

  console.log(orthologs)

  return orthologs
}

export {fetchOrthologsFromOrthodb, fetchOrthologsFromOrthodbSparql};
