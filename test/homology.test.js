/**
 * @jest-environment jsdom
 */

require("babel-register");
require("babel-polyfill");

const fetch = require('node-fetch');

import fetchOrthologs from '../src/index.js';

describe('Homology.js', () => {

  jest.setTimeout(20000)

  beforeAll(() => {
    global.fetch = fetch;
  });

  it('fetches orthologs from OMA', async () => {

    let genes = ['MTOR'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs, 'oma');

    expect(orthologs[0][0].location).toBe('1:11107485-11259409');
    expect(orthologs[0][1].location).toBe('4:148452271-148556860');
  });

  it('fetches orthologs from OrthoDB', async () => {

    let genes = ['NFYA'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['caenorhabditis elegans'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs[0][0].location).toBe('6:41072974-41102403');
    expect(orthologs[0][1].location).toBe('I:11224836-11233334');
  });

  it('handles case-insensitive matches', async () => {

    let genes = ['nfya'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['caenorhabditis elegans'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs[0][0].location).toBe('6:41072974-41102403');
    expect(orthologs[0][1].location).toBe('I:11224836-11233334');
  });

  it('handles orthologs between human and mosquito', async () => {

    let genes = ['MTOR'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['anopheles gambiae'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    // console.log('orthologs', orthologs) previously output:
    //
    // orthologs [
    //   [
    //     { name: 'MTOR', location: '1:11106535-11262551' },
    //     { name: '3292017', location: '3R:2406092-2413890' },
    //     { name: '1278787', location: '3R:2406092-2413890' },
    //     { name: '4576162', location: '3R:2406092-2413890' },
    //     { name: 'AGAP010313', location: '3R:2406092-2413890' },
    //     { name: 'AGAP007873', location: '3R:2406092-2413890' }
    //   ]
    // ]
    //
    // But let's not be too stringent in this test, as this is mostly a test of
    // whether OrthoDB SPARQL processing returns anything reasonable for
    // mosquito.  OrthoDB has a nuanced form for mosquito NCBI Gene IDs.
    expect(orthologs[0].length).toBeGreaterThanOrEqual(2)
  });

  it('fetches orthologs for multiple genes', async () => {

    let genes = ['MTOR', 'BRCA1'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs.length).toEqual(2);
  });

  it('sorts by domains when lacking other data', async () => {

    let genes = ['THAP1'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs[0][0].name).toBe('THAP1');
    expect(orthologs[0][1].name).toBe('Thap1');
  });

  it('sorts by domains when lacking other data', async () => {

    let genes = ['THAP1'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs[0][0].name).toBe('THAP1');
    expect(orthologs[0][1].name).toBe('Thap1');
  });

  it('throws "Orthologs not found" error', async () => {

    let genes = ['asdf'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    try {
      await fetchOrthologs(genes, sourceOrg, targetOrgs);
    } catch (e) {
      expect(e.message).toBe('Orthologs not found for gene "asdf"');
    }

  });

  it('throws "Orthologs not found in target organism" error', async () => {

    let genes = ['AG'];
    let sourceOrg = 'arabidopsis thaliana';
    let targetOrgs = ['homo sapiens'];

    try {
      await fetchOrthologs(genes, sourceOrg, targetOrgs);
    } catch (e) {
      expect(e.message).toBe('Orthologs not found for gene "AG" in target organism "Homo sapiens"');
    }

  });

  it('handles initially unfound location for source gene', async () => {

    let genes = ['PG2'];
    let sourceOrg = 'solanum lycopersicum';
    let targetOrgs = ['capsicum annuum'];

    try {
      await fetchOrthologs(genes, sourceOrg, targetOrgs);
    } catch (e) {
      expect(e.message).toBe('Orthologs not found for gene "AG" in target organism "Homo sapiens"');
    }

  });

  it('handles no name match found', async () => {

    let genes = ['RAD51'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['zea mays'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs.length).toEqual(1);
  });

  it('filters out placements on alternative loci scaffolds', async () => {

    let genes = ['PTPRC'];
    let sourceOrg = 'homo sapiens';
    let targetOrgs = ['mus musculus'];

    let orthologs = await fetchOrthologs(genes, sourceOrg, targetOrgs);

    expect(orthologs.length).toEqual(1);
  });

});
