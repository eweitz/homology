import fetchOrthologsFromOma from './oma';
import {
  fetchOrthologsFromOrthodbSparql
} from './orthodb';

async function fetchOrthologs(genes, sourceOrg, targetOrgs, api='orthodb') {
  if (api === 'orthodb') {
    return await fetchOrthologsFromOrthodbSparql(genes, sourceOrg, targetOrgs);
  } else if (api === 'oma') {
    return await fetchOrthologsFromOma(genes, sourceOrg, targetOrgs);
  }
}

export default fetchOrthologs
