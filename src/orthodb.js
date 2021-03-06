/**
* @fileoverview Client library for OrthoDB
* API docs: https://www.orthodb.org/?page=api
*
* This module supports fetching orthologs from OMA.  All functions here
* support the single exported function `fetchOrthologsFromOrthoDb`.
*/

import Bottleneck from 'bottleneck';

var taxidByName = {
  'anopheles gambiae': '7165',
  'arabidopsis thaliana': '3702',
  'aspergillis fumigatus': '746128',
  'aspergillus niger': '5061',
  'aspergillus oryzae': '5062',
  'brachypodium distachyon': '15368',
  'caenorhabditis elegans': '6239',
  'canis lupus familiaris': '9615',
  'chlorocebus sabaeus': '60711',
  'ciona intestinalis': '7719',
  'drosophila melanogaster': '7227',
  'felis catus': '9685',
  'gallus gallus': '9031',
  'gorilla gorilla': '9593',
  'homo sapiens': '9606',
  'hordeum vulgare': '4513',
  'macaca fascicularis': '9541',
  'macaca mulatta': '9544',
  'mus musculus': '10090',
  'musa acuminata': '4641',
  'oryza sativa': '4530',
  'pan paniscus': '9597',
  'pan troglodytes': '9598',
  'rattus norvegicus': '10116',
  'zea mays': '4577'
}

import {reportError} from './error';

var limiter = new Bottleneck({
  minTime: 333,
  maxConcurrent: 3
});

// OrthoDB does not support CORS.  Homology API on Firebase proxies OrthoDB and
// supports CORS.  This enables client-side web requests to the OrthoDB API.
//
// var orthodbBase = 'https://www.orthodb.org/';
var orthodbBase = 'https://homology-api.firebaseapp.com/orthodb/';
// var orthodbBase = 'http://localhost:5000/orthodb/';

var apiKey = '&api_key=e7ce8adecd69d0457df7ec2ccbb704c4e709';

var ncbiBase =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi' +
  '?db=gene&retmode=json' + apiKey;

/**
 * Get JSON response from OrthoDB API
 */
async function fetchJson(path) {
  var response = await fetch(orthodbBase + path);
  var json = await response.json();
  return json.data;
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
  ogDetails = await fetchJson('ogdetails?id=' + orthodbGeneId);

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
  rawOrthologs = await fetchJson(`orthologs?id=${orthologId}&species=${speciesParam}`);

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
  ids = await fetchJson('search?query=' + gene + '&' + scope);

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
 * For a gene in a source organism, find orthologs in target organisms and
 * return the genomic coordinates of the source gene and orthologous genes.
 *
 * Example:
 * fetchOrthologsFromOrthodb(
 *  'NFYA',
 *  'homo-sapiens',
 *  ['caenorhabditis-elegans']
 * );
 *
 * @param {String} gene Gene name
 * @param {String} sourceOrg Source organism name
 * @param {Array<String>} targetOrgs List of target organism names
 */
async function fetchOrthologsFromOrthodb(genes, sourceOrg, targetOrgs) {
  var tasks = genes.map(gene => fetchOrtholog(gene, sourceOrg, targetOrgs));
  return Promise.all(tasks);
}

export default fetchOrthologsFromOrthodb;
