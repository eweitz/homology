require("babel-register");
require("babel-polyfill");

const fetch = require('node-fetch');

import fetchOrthologs from '../src/index.js';

describe('Homology.js', () => {

  jest.setTimeout(20000)

  beforeAll(() => {
    global.fetch = fetch;
  });

  it('should fetch orthologs from OMA', async () => {

    let genes = ['MTOR'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs, 'oma');

    expect(orthologs[0][0].location).toBe('1:11107485-11259409');
    expect(orthologs[0][1].location).toBe('4:148452271-148556860');
  });

  it('should fetch orthologs from OrthoDB', async () => {

    let genes = ['NFYA'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['caenorhabditis elegans'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs[0][0].location).toBe('6:41072974-41102403');
    expect(orthologs[0][1].location).toBe('I:11224836-11233334');
  });
});
