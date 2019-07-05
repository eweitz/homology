/**
* @fileoverview Client library for OrthoDB
*
* API docs: https://www.orthodb.org/?page=api
*/

var orthodbBase = 'https://www.orthodb.org';

async function search(gene) {
  var response, ids;
  response = await fetch(orthodbBase + '/search?query=' + gene);
  ids = await response.json().data;
  console.log('ids', ids);
  return ids;
}

async function fetchOrthologsFromOrthodb(gene, sourceOrg, targetOrgs) {
  var ids, response, orthologs;

  ids = await search(gene);

  response = await fetch(orthodbBase + '/orthologs?id=' + ids[0] + '&species=all');
  orthologs = await response.json().data;
  console.log('orthologs', orthologs);
}

export default fetchOrthologsFromOrthodb;