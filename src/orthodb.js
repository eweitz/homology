/**
* @fileoverview Client library for OrthoDB
* API docs: https://www.orthodb.org/?page=api
*
* This module supports fetching orthologs from OMA.  All functions here
* support the single exported function `fetchOrthologsFromOrthoDb`.
*/

import {reportError} from './error';

// OrthoDB does not support CORS.  Homology API on Firebase proxies OrthoDB and
// supports CORS.  This enables client-side web requests to the OrthoDB API.
//
// var orthodbBase = 'https://www.orthodb.org';
var orthodbBase = 'https://homology-api.firebaseapp.com/orthodb';
// var orthodbBase = 'http://localhost:5000/orthodb';

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
  ogDetails = await fetchJson('/ogdetails?id=' + orthodbGeneId);

  if ('entrez' in ogDetails) {
    ncbiGeneId = ogDetails.entrez[0].id;
  } else {
    // Occurs in Drosophila melanogaster, e.g.
    // https://homology-api.firebaseapp.com/orthodb/ogdetails?id=7227_0:000534
    ogDetails.xrefs.forEach(xref => {
      if (xref.type === 'NCBIgene') ncbiGeneId = xref.name;
    });
  }

  location = await fetchGeneLocationFromEUtils(ncbiGeneId);
  return location;
}

/**
 * See if an ortholog matches a queried organism, and how well it matches
 */
async function findBestOrtholog(orthologId, gene, sourceOrg, targetOrgs) {
  var source, rawOrthologs,
    targets = [],
    hasSourceNameMatch = false;

  // Example:
  // https://homology-api.firebaseapp.com/orthodb/orthologs?id=1269806at2759&species=all
  rawOrthologs = await fetchJson(`/orthologs?id=${orthologId}&species=all`);

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
  var ids, i, j, id, source, gene, scope,
    hasSourceNameMatch = false,
    targets = [],
    locations = [];

  // 2759 is the NCBI Taxonomy ID for Eukaryota (eukaryote)
  // https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=2759
  var scope = "&level=2759&species=9606";

  for (i = 0; i < genes.length; i++) {
    gene = genes[i];
    // Example:
    // https://homology-api.firebaseapp.com/orthodb/search?query=NFYA&level=2759&species=2759
    ids = await fetchJson('/search?query=' + gene + '&' + scope);

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
    var sourceGene = source.genes.filter(geneObj => {
      var thisGene = geneObj.gene_id.id.toLowerCase();
      return gene.toLowerCase() === thisGene;
    })[0];
    var sourceLocation = await fetchLocation(sourceGene);

    if (targets.length === 0) {
      reportError('orthologsNotFoundInTarget', null, gene, sourceOrg, targetOrgs);
    }

    // NCBI rate limits prevent quickly fetching many gene locations, so
    // simply locate the first gene in the first target.
    // Example with many target hits this (over)simplifies:
    // http://eweitz.github.io/ideogram/comparative-genomics?org=homo-sapiens&org2=mus-musculus&source=orthodb&gene=SAP30
    var targetLocation = await fetchLocation(targets[0].genes[0]);

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

    locations.push([sourceLocation, targetLocation]);
  }

  return locations;
}

export default fetchOrthologsFromOrthodb;