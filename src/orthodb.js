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

/**
 * Canonicalize organism name to lower-case and hyphen-delimited form
 *
 * Example:
 * Caenorhabditis elegans -> caenorhabditis-elegans
 */
function normalize(name) {
  return name.toLowerCase().replace(' ', '-');
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
  var locations, searchResults, id, rawOrthologs, source,
    targets = [];

  // Example:
  // https://homology-api.firebaseapp.com/orthodb/search?query=NFYA
  searchResults = await fetchJson('/search?query=' + gene);
  id = searchResults[0];

  // Example:
  // https://homology-api.firebaseapp.com/orthodb/orthologs?id=1269806at2759&species=all
  rawOrthologs = await fetchJson('/orthologs?id=' + id + '&species=all');

  rawOrthologs.forEach(rawOrtholog => {
    var thisOrganism = normalize(rawOrtholog.organism.name);
    if (sourceOrg === thisOrganism) source = rawOrtholog;
    if (targetOrgs.includes(thisOrganism)) targets.push(rawOrtholog);
  });

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