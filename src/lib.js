import {fetchOrthoDBJson} from './orthodb'

import {namesByTaxid} from './organism-map'

/**
 * Get genomic coordinates of a gene using its NCBI Gene ID
 */
 export async function fetchAnnotsFromEUtils(ncbiGeneIds) {
  const annots = []

  const apiKey = '&api_key=e7ce8adecd69d0457df7ec2ccbb704c4e709';

  const ncbiBase =
    'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi' +
    '?db=gene&retmode=json' + apiKey;

  // Example:
  // https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&retmode=json&id=3565955
  const response = await fetch(ncbiBase + '&id=' + ncbiGeneIds.join(','))
  const data = await response.json()
  const result = data.result

  result.uids.forEach(uid => {
    const gene = result[uid]
    const loc = gene.genomicinfo[0]

    const annot = {
      name: gene.name,
      id: gene.uid
    }

    if (loc) {
      annot.chr = loc.chrloc,
      annot.start = loc.chrstart,
      annot.stop = loc.chrstop,
      annot.location = annot.chr + ':' + annot.start + '-' + annot.stop
    }

    annots.push(annot)
  })

  return annots
}


/**
 * Queries MyGene.info API, returns parsed JSON
 *
 * Docs:
 * https://docs.mygene.info/en/v3/
 *
 * Example:
 * https://mygene.info/v3/query?q=symbol:cdk2%20OR%20symbol:brca1&species=9606&fields=symbol,genomic_pos,name
 */
 async function fetchMyGeneInfo(queryString) {
  const myGeneBase = 'https://mygene.info/v3/query';
  const response = await fetch(myGeneBase + queryString + '&size=20');
  const data = await response.json();
  return data;
}

/**
 * Transforms MyGene.info (MGI) gene into Ideogram annotation
 */
 function parseAnnotFromMgiGene(gene) {

  // Filters out placements on alternative loci scaffolds, an advanced
  // genome assembly feature we are not concerned with in ideograms.
  //
  // Example:
  // https://mygene.info/v3/query?q=symbol:PTPRC&species=9606&fields=symbol,genomic_pos,name
  let genomicPos = null;
  if (Array.isArray(gene.genomic_pos)) {
    genomicPos = gene.genomic_pos.filter(pos => !pos.chr.includes('_'))[0];
  } else {
    genomicPos = gene.genomic_pos;
  }

  const annot = {
    name: gene.symbol,
    chr: genomicPos.chr,
    start: genomicPos.start,
    stop: genomicPos.end,
    id: genomicPos.ensemblgene
  };

  annot.location = annot.chr + ':' + annot.start + '-' + annot.stop

  return annot;
}

/**
 * Transforms Ensembl gene into Ideogram annotation
 */
 function parseAnnotFromEnsembl(gene) {

  const annot = {
    name: gene.display_name,
    chr: gene.seq_region_name,
    start: gene.start,
    stop: gene.end,
    id: gene.id
  };

  annot.location = annot.chr + ':' + annot.start + '-' + annot.stop

  return annot;
}

function getMyGeneInfoQueryString(genes, taxid) {
  const qParam = genes.map(gene => {
    if (gene.ensemblId) {
      return `ensemblgene:${gene.ensemblId}`
    } else {
    // Escape genes, so e.g. the fly gene Su(H) becomes Su\(H\).
    // https://mygene.info/v3/query?q=symbol:Su\(H\)&species=7227&fields=symbol,genomic_pos,name&size=20
    // See https://github.com/biothings/mygene.info/issues/112.
    if (gene.name) gene = gene.name
    const escapedGene = gene.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    return `symbol:${escapedGene}`;
    }
  }).join(' OR ');

  // Example:
  // https://mygene.info/v3/query?q=symbol:BRCA1&species=9606&fields=symbol,genomic_pos,name
  return `?q=${qParam}&species=${taxid}&fields=symbol,genomic_pos,name,exons`;
}

/** Fetch gene positions from Ensembl REST API */
async function fetchLocationsFromEnsembl(genes, taxid) {
  const organism = namesByTaxid[taxid].replace(/ /g, '_')

  // Docs: https://rest.ensembl.org/documentation/info/symbol_post
  const response = await fetch(
    `https://rest.ensembl.org/lookup/symbol/${organism}`,
    {
      method: 'POST',
      body: JSON.stringify({
        symbols: genes,
        // expand: 1, // Includes transcripts, exons
      }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  )

  const data = response.json()
  return data
}

/**
 * Fetch gene positions from MyGene.info (MGI), with NCBI as fallback
 *
 * MGI is fast but incomplete.  NCBI is slow but complete.  So try MGI
 * first, and fallback to the more robust but less speedy NCBI if MGI
 * results don't return adequate data.
 */
export async function fetchLocations(genes, taxid) {
  let annots = [];

  const queryString = getMyGeneInfoQueryString(genes, taxid)
  const data = await fetchMyGeneInfo(queryString);

  let insufficientData = false
  if (data.hits.length < genes.length) insufficientData = true

  data.hits.forEach(gene => {
    // If hit lacks position or name/id, flag for fallback approach
    if (
      'genomic_pos' in gene === false ||
      ('name' in gene === false && '_id' in gene === false)
    ) {
      insufficientData = true
      return
    };

    const annot = parseAnnotFromMgiGene(gene);
    annots.push(annot);
  });

  // If MGI fails, try getting data from NCBI
  if (insufficientData) {
    if (typeof genes[0] === 'string' || 'ncbiGeneId' in genes[0] === false) {
      // Send a signal upstream that we need more data from OrthoDB
      throw Error('Enrichment needed')
    }
    const ncbiGeneIds = genes.map(gene => gene.ncbiGeneId)
    annots = await fetchAnnotsFromEUtils(ncbiGeneIds)
  }

  return annots;
}
