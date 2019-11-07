require("babel-register");
require("babel-polyfill");

const fetch = require('node-fetch');

import fetchOrthologs from '../src/index.js';

describe('Homology.js', () => {
  beforeAll(() => {
    global.fetch = fetch;
  });

  it('should fetch orthologs from OMA', async () => {
  
    let genes = ['MTOR'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);
    
    expect(orthologs[0][0]).toBe('1:11107485-11259409');
    expect(orthologs[0][1]).toBe('4:148452271-148556860');
  });

  it('should fetch orthologs from OrthoDB', async () => {

    let genes = ['NFYA'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['caenorhabditis elegans'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs, 'orthodb');

    let expectedOrthologs = [
      '6:41072973-41102402',
      'I:11224835-11233333'
    ];

    expect(orthologs[0]).toStrictEqual(expectedOrthologs);
  });
});