/**
* @fileoverview Client library for OrthoDB
*
* API docs: https://www.orthodb.org/?page=api
*/


// OrthoDB does not support CORS.  Homology API on Firebase proxies OrthoDB and
// supports CORS.  This enables client-side web requests to the OrthoDB API.
//
// var orthodbBase = 'https://www.orthodb.org';
var orthodbBase = 'https://homology-api.firebaseapp.com/orthodb';

var ncbiBase = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&version=2.0&retmode=json';

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
  // https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&version=2.0&retmode=json&id=3565955
  response = await fetch(ncbiBase + '&id=' + ncbiGeneId);
  data = await response.json();
  result = data.result;
  ginfo = result[result.uids[0]].genomicinfo[0];
  location = ginfo.chrloc + ':' + ginfo.chrstart + '-' + ginfo.chrstop;
  return location;
}

async function fetchLocation(orthodbGene) {
  var orthodbGeneId = orthodbGene.gene_id.param;
  // Example:
  // https://homology-api.firebaseapp.com/orthodb/ogdetails?id=6239_0:0008da
  var ogDetails = await fetchJson('/ogdetails?id=' + orthodbGeneId);
  var ncbiGeneId = ogDetails.entrez[0].id;
  var location = await fetchGeneLocationFromEUtils(ncbiGeneId);
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
async function fetchOrthologsFromOrthodb(gene, sourceOrg, targetOrgs) {
  var locations, ids, i, id, source,
    hasSourceNameMatch = false,
    targets = [];

  // 2759 is the NCBI Taxonomy ID for Eukaryota (eukaryote)
  // https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=2759
  var scope = "&level=2759&species=9606";

  // Example:
  // https://homology-api.firebaseapp.com/orthodb/search?query=NFYA&level=2759&species=2759
  ids = await fetchJson('/search?query=' + gene + '&' + scope);

  // Iterate through returned ortholog IDs
  // Prefer orthologous pairs that have a gene name matching the queried gene
  for (i = 0; i < ids.length; i++) {
    id = ids[i];
    [source, targets, hasSourceNameMatch] =
      await findBestOrtholog(id, gene, sourceOrg, targetOrgs);
    if (hasSourceNameMatch) break;
  }

  if (typeof source === 'undefined') {
    throw Error(
      `Ortholog not found for "${gene}" in source organism "${sourceOrg}"`
    );
  }
  var sourceLocation = await fetchLocation(source.genes[0]);

  var locations = await Promise.all(targets.map(async (target) => {
    return await Promise.all(target.genes.map(async (gene) => {
      return fetchLocation(gene);
    }));
  }));

  locations = locations[0];

  locations.unshift(sourceLocation); // prepend to source to target array

  return locations;
}

export default fetchOrthologsFromOrthodb;