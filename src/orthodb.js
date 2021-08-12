/**
* @fileoverview Client library for OrthoDB
* API docs: https://www.orthodb.org/?page=api
*
* This module supports fetching orthologs from OrthoDB, using:
* - REST API, via fetchOrthologsFromOrthodb, or
* - SPARQL API, via fetchOrthologsFromOrthodbSparql
*
* The SPARQL API is more robust and faster, but the REST API
* is retained as a potential future fallback.
*/

import {taxidsByName} from './organism-map';
import {reportError} from './error';
import {fetchLocations, fetchAnnotsFromEUtils} from './lib';

// OrthoDB does not support CORS.  Homology API on Firebase proxies OrthoDB and
// supports CORS.  This enables client-side web requests to the OrthoDB API.
//
// var orthodbBase = 'https://www.orthodb.org/';
var orthodbBase = 'https://homology-api.firebaseapp.com/orthodb/';
// var orthodbBase = 'http://localhost:5000/orthodb/';
// var orthodbBase = 'http://localhost:5001/homology-api/us-central1/app/orthodb/'

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

/** Get NCBI Gene ID from ogDetails object */
function getNcbiGeneId(ogDetails) {
  var ncbiGeneId;

  if ('entrez' in ogDetails) {
    ncbiGeneId = ogDetails.entrez[0].id;
  } else {
    // Occurs in Drosophila melanogaster, e.g.
    // https://homology-api.firebaseapp.com/orthodb/ogdetails?id=7227_0:000534
    ogDetails.xrefs.forEach(xref => {
      if (xref.type === 'NCBIgene') ncbiGeneId = xref.name;
    });
  }

  return ncbiGeneId
}

/**
 * E.g. http://purl.orthodb.org/odbgene/6239_0_000f12 -> 6239_0:000f12
 */
function getOrthoDBId(url) {
  const splitId = url.split('/').slice(-1)[0].split('_')
  return splitId[0] + '_' + splitId[1] + ':' + splitId[2]
}

/** Determine if n is a number */
function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
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
    const rawSource = result.gene_s_name.value
    let source = rawSource
    if (rawSource.includes(';')) {
      // Accounts for e.g. searching for ortholog of human "ACE2" in mouse
      // OrthoDB returns the raw source "ACE2;BMX"
      const rawSources = rawSource.split(';')
      source = genes.find(gene => rawSources.includes(gene))

      // No name match found, as in search for human RAD51 in Zea mays.
      if (typeof source === 'undefined') return
    }

    const sourceId = getOrthoDBId(result.gene_s.value)

    // If user e.g. types in "mtor" for human, canonicalize to "MTOR".
    // This makes source gene matches case-insensitive, as expected.
    genes.forEach(gene => {
      if (
        gene in orthologMap &&
        gene !== source &&
        gene.toLowerCase() === source.toLowerCase()
      ) {
        orthologMap[source] = orthologMap[gene].slice()
        seenTargetNames[source] = seenTargetNames[gene].slice()
        delete orthologMap[gene]
        delete seenTargetNames[gene]
      }
    })

    // if (orthologMap[source]?.length > 0) {
      sources[source] = {id: sourceId}
    // }

    let name = result.gene_t_name.value;

    // Handle OrthoDB's unique practice of sometimes including aliases
    // via semicolon-delmiting the name.  This can break downstream
    // look-up of genomic position, which first queries by name (and does
    // not expect semicolons).
    if (name.includes(';')) {
      const splitName = name.split(';')
      const numericName = splitName.find(name => isNumeric(name))

      if (numericName) {
        // Use the non-numeric name if one exists, or the first name
        const nonNumericName = splitName.find(name => !isNumeric(name))
        name = nonNumericName ? nonNumericName : splitName[0]
      } else {
        // Use the shorter name of the two, which is typically the more
        // prominent one.
        name = splitName.sort((a, b) => a.length < b.length)[0]
      }
    }

    const id = getOrthoDBId(result.gene_t.value)
    if (source in seenTargetNames && !seenTargetNames[source].includes(name)) {
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
function sortTargetGenes(targetGenes, sourceGene, sources) {
  const source = sources[sourceGene]
  sourceGene = sourceGene.toLowerCase()
  return targetGenes.sort((a, b) => {
    const geneA = a.name.toLowerCase()
    const geneB = b.name.toLowerCase()

    if (geneA === sourceGene) return -1
    if (geneB === sourceGene) return 1

    if (a.exons !== b.exons) {
      if (a.exons == source.exons) return -1
      if (b.exons == source.exons) return 1
    }

    if (
      a.domains?.length > 1 && b.domains?.length > 1 &&
      geneA !== sourceGene && geneB !== sourceGene
    ) {
      // Good test case: search for human THAP1 in mouse
      const aDomains = a.domains.length
      const bDomains = b.domains.length
      const sourceDomains = source.domains.length

      if (aDomains === sourceDomains) return -1
      if (bDomains === sourceDomains) return 1

      const aDiff = Math.abs(aDomains - sourceDomains)
      const bDiff = Math.abs(bDomains - sourceDomains)
      if (aDiff < bDiff) return -1
      if (aDiff > bDiff) return 1
    }
  })
}

/**
 * Add Ensembl ID, domains, # amino acids, # exons to a gene.
 */
async function enrichGene(gene) {
  const ogDetails = await fetchOrthoDBJson('ogdetails?id=' + gene.id);
  // console.log('ogDetails for gene', ogDetails)
  if (ogDetails.ensembl) {
    gene.ensemblId = ogDetails.ensembl[0].id
  }

  gene.ncbiGeneId = getNcbiGeneId(ogDetails)

  gene.aas = ogDetails.aas // length in amino acids
  gene.exons = ogDetails.exons // number of exons
  gene.domains = ogDetails.interpro

  return gene
}

/**
 * Add Ensembl ID, domains, # amino acids, # exons to source and target genes.
 */
async function enrichMap(orthologMap, sources, forceEnrich = false) {

  const enrichedMap = {}
  const enrichedSources = {}

  // Parallelizes as described in https://medium.com/@antonioval/6315c3225838
  // (but without library advertised there).
  await Promise.all(
    Object.entries(orthologMap).map(async ([sourceName, targets]) => {
      const sourceGene = sources[sourceName]

      if (typeof sourceGene === 'undefined') {
        throw Error(`${sourceName} not found in target`)
      }

      // If any target matches the source name, it's an ortholog
      // and we can drastically speed up the UI by avoiding all the
      // network chatter needs for enrichment
      const needsEnrichment = forceEnrich || targets.every(target => {
        return target.name.toLowerCase() !== sourceName.toLowerCase()
      })

      if (needsEnrichment === false) {
        enrichedMap[sourceName] = targets
        return
      }

      const enrichedSource = await enrichGene(sourceGene)

      enrichedSources[sourceName] = enrichedSource

      // Parallelize OrthoDB REST API requests
      const promises = targets.map(async target => await enrichGene(target))
      const enrichedTargets = await Promise.all(promises)

      enrichedMap[sourceName] = enrichedTargets
    })
  )

  orthologMap = enrichedMap
  sources = enrichedSources

  return {orthologMap, sources}
}

/** Compare two strings, roughly. */
function fuzzyMatch(a, b) {
  if (a === b) return true

  // Disregard hyphens, e.g. allow searching Arabidopsis NFYC6,
  // which formally has symbol "NF-YC6", to match human NFYC6
  // (which formally has symbol "NFYC6").
  const fuzzyA = a.replace(/-/g, '')
  const fuzzyB = b.replace(/-/g, '')

  return fuzzyA === fuzzyB
}

/** Determines whether a candidate object matches a reference */
function isSuitableMatch(candidate, referenceName) {
  return (
    candidate.name !== undefined &&

    // Encountered when searching e.g. SP5G and PG2
    // between Solanum lycopersicum and Capsicum annuum.
    candidate.location !== undefined &&

    fuzzyMatch(candidate.name, referenceName)
  )
}

async function fetchOrthologsFromOrthodbSparql(genes, sourceOrg, targetOrgs) {
  const genesClause = genes.join('%7C') // URL encoding for | (i.e. OR)

  // TODO: Support multiple target organisms
  const targetOrg = targetOrgs[0]

  const sourceTaxid = taxidsByName[sourceOrg]
  const targetTaxid = taxidsByName[targetOrg]

  const query = encodeURIComponent([
    'prefix : <http://purl.orthodb.org/>',
    'select *',
    'where {',
      '?og a :OrthoGroup .',
      '?gene_s a :Gene .', // source gene
      '?gene_t a :Gene .', // target gene
      `?gene_s up:organism/a taxon:${sourceTaxid} .`,
      `?gene_t up:organism/a taxon:${targetTaxid} .`,
      '?gene_s :memberOf ?og .',
      '?gene_t :memberOf ?og .',
      '?gene_s :name ?gene_s_name .',
      '?gene_t :name ?gene_t_name .',
      `filter (regex(?gene_s_name, "(^;?${genesClause};?)", "i"))`,
    '}'
  ].join('\n'));

  // Below is an example query for ACE2, which you can plug
  // into https://sparql.orthodb.org to debug or explore.
  //
  // The ";?" clauses handle edge cases, where e.g. the queried gene "ACE2"
  // matches against the "ACE2;BMX" source gene contained in OrthoDB.
  //
  // prefix : <http://purl.orthodb.org/>
  // select *
  // where {
  // ?og a :OrthoGroup .
  // ?gene_s a :Gene .
  // ?gene_t a :Gene .
  // ?gene_s up:organism/a taxon:9606 .
  // ?gene_t up:organism/a taxon:10090 .
  // ?gene_s :memberOf ?og .
  // ?gene_t :memberOf ?og .
  // ?gene_s :name ?gene_s_name .
  // ?gene_t :name ?gene_t_name .
  // filter (regex(?gene_s_name, "(^;?ACE2;?)", "i"))
  // }

  const sparqlJson = await fetchOrthoDBJson('sparql/?query=' + query, false);
  // console.log('sparql json:', sparqlJson);

  if (sparqlJson.results.bindings.length === 0) {
    reportError('orthologsNotFound', null, genes);
  }

  const map = getOrthologMap(genes, sparqlJson);

  let enrichedMap
  try {
    enrichedMap = await enrichMap(map.orthologMap, map.sources)
  } catch(e) {
    const gene = e.message.split(' ')[0]
    reportError('orthologsNotFoundInTarget', null, gene, sourceOrg, targetOrgs);
  }

  let orthologMap = enrichedMap.orthologMap
  let sources = enrichedMap.sources

  let sourceLocations
  try {
    sourceLocations = await fetchLocations(genes, sourceTaxid);
  } catch (e) {
    // If no locations were found due to lacking IDs, then force
    // enrichment and try again
    enrichedMap = await enrichMap(map.orthologMap, map.sources, true)
    orthologMap = enrichedMap.orthologMap
    sources = enrichedMap.sources
    const ncbiGeneIds = Object.values(sources).map(s => s.ncbiGeneId)
    sourceLocations = await fetchAnnotsFromEUtils(ncbiGeneIds);
  }

  let rawTargets
  let targetLocations
  try {
    rawTargets = []
    Object.entries(orthologMap).forEach(([source, targets]) => {
      rawTargets = rawTargets.concat(targets)
    })
    targetLocations =
      await fetchLocations(rawTargets, targetTaxid)
  } catch (e) {
    // If no locations were found due to lacking IDs, then force
    // enrichment and try again
    enrichedMap = await enrichMap(map.orthologMap, map.sources, true)
    orthologMap = enrichedMap.orthologMap

    rawTargets = []
    Object.entries(orthologMap).forEach(([source, targets]) => {
      rawTargets = rawTargets.concat(targets)
    })
    sources = enrichedMap.sources
    targetLocations =
      await fetchLocations(rawTargets, targetTaxid)
  }

  const orthologs = []

  Object.entries(orthologMap).forEach(([sourceGene, targetGenes], i) => {
    const ortholog = []

    targetGenes = sortTargetGenes(targetGenes, sourceGene, sources)

    const sourceLocation =
      sourceLocations.find(sl => isSuitableMatch(sl, sourceGene)).location
    const source = {name: sourceGene, location: sourceLocation}
    ortholog.push(source)

    targetGenes.forEach(targetGene => {
      const targetName = targetGene.name
      let targetLocation =
        targetLocations.find(tl => isSuitableMatch(tl, targetName))

      if (!targetLocation) { targetLocation = targetLocations[i]}

      const target = {name: targetName, location: targetLocation.location}
      ortholog.push(target)
    })
    orthologs.push(ortholog)
  })

  // console.log('orthologs', orthologs)

  return orthologs
}

// export {fetchOrthologsFromOrthodb, fetchOrthologsFromOrthodbSparql};
export {fetchOrthologsFromOrthodbSparql};
