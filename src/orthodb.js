/**
* @fileoverview Client library for OrthoDB
*
* API docs: https://www.orthodb.org/?page=api
*/

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
async function fetchGeneLocation(ncbiGeneId) {
  var response, data, result, ginfo, location;
  response = await fetch(ncbiBase + '&id=' + ncbiGeneId);
  data = await response.json();
  result = data.result;
  ginfo = result[result.uids[0]].genomicinfo[0];
  location = ginfo.chrloc + ':' + ginfo.chrstart + '-' + ginfo.chrstop;
  return location;
}

async function fetchOrthologsFromOrthodb(gene, sourceOrg, targetOrgs) {
  var orthologs, searchResults, id, rawOrthologs, locations;

  searchResults = await fetchJson('/search?query=' + gene);
  id = searchResults[0];

  rawOrthologs = await fetchJson('/orthologs?id=' + id + '&species=all');

  orthologs = rawOrthologs.filter(ro => {
    var thisOrganism = ro.organism.name.toLowerCase().replace(' ', '-');
    return targetOrgs.includes(thisOrganism);
  });

  locations = await Promise.all(orthologs.map(async (ortholog) => {
    var locs = await Promise.all(ortholog.genes.map(async (gene) => {
      var orthodbGeneId = gene.gene_id.param;
      var ogDetails = await fetchJson('/ogdetails?id=' + orthodbGeneId);
      var ncbiGeneId = ogDetails.entrez[0].id;
      var location = await fetchGeneLocation(ncbiGeneId);
      return location;
    }));
    return locs;
  }));

  locations = locations[0];

  return locations;
}

export default fetchOrthologsFromOrthodb;