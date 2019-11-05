import fetchOrthologsFromOma from './oma';
import fetchOrthologsFromOrthodb from './orthodb';

async function fetchOrthologs(genes, sourceOrg, targetOrgs, api='oma') {
  if (api === 'oma') {
    return await fetchOrthologsFromOma(genes, sourceOrg, targetOrgs);
  } else if (api === 'orthodb') {
    return await fetchOrthologsFromOrthodb(genes, sourceOrg, targetOrgs);
  }
}

export default fetchOrthologs