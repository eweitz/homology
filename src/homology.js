import fetchOrthologsFromOma from './oma';
import fetchOrthologsFromOrthodb from './orthodb';

async function fetchOrthologs(gene, sourceOrg, targetOrgs, api='oma') {
  if (api === 'oma') {
    return await fetchOrthologsFromOma(gene, sourceOrg, targetOrgs);
  } else if (api === 'orthodb') {
    return await fetchOrthologsFromOrthodb(gene, sourceOrg, targetOrgs);
  }
}

export default fetchOrthologs