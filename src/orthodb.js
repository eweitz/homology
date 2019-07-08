/**
* @fileoverview Client library for OrthoDB
*
* API docs: https://www.orthodb.org/?page=api
*/

// var orthodbBase = 'https://www.orthodb.org';
var orthodbBase = 'https://homology-api.firebaseapp.com/orthodb';
var ncbiBase = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&version=2.0&retmode=json';

async function fetchJson(path) {
  var response = await fetch(orthodbBase + path);
  return response.json();
}

async function fetchGeneLocation(ncbiGeneId) {
  var response, data, result, ginfo, location;
  response = await fetch(ncbiBase + '&id=2');
  data = await response.json();
  result = data.result;
  ginfo = result[result.uids[0]];
  location = ginfo.chrloc + ':' + ginfo.chrstart + '-' + ginfo.chrstop;
  return location;
}

async function fetchOrthologsFromOrthodb(gene, sourceOrg, targetOrgs) {
  var orthologs, searchResults, id, json, rawOrthologs, locations;

  searchResults = await fetchJson('/search?query=' + gene);
  console.log('searchResults')
  console.log(searchResults)
  id = searchResults.data[0];

  json = await fetchJson('/orthologs?id=' + id + '&species=all');
  rawOrthologs = json.data;

  orthologs = rawOrthologs.filter(d => {
    var thisOrganism = d.organism.name.toLowerCase().replace(' ', '-');
    return targetOrgs.includes(thisOrganism);
  });

  console.log('orthologs')
  console.log(orthologs)
  return orthologs;
}

export default fetchOrthologsFromOrthodb;