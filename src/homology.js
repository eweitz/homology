import fetchOrthologsFromOma from './oma';

async function fetchOrthologs(gene, sourceOrg, targetOrgs, service='oma') {
  if (service === 'oma') {
    return await fetchOrthologsFromOma(gene, sourceOrg, targetOrgs);
  }
}

export default fetchOrthologs