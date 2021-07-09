import {fetchOrthoDBJson} from './orthodb'

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

  // console.log('in parseAnnotFromMgiGene, gene:', gene)
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

function getMyGeneInfoQueryString(genes, taxid) {
  const qParam = genes.map(gene => {
    if (gene.ensemblId) {
      return `ensemblgene:${gene.ensemblId}`
    } else {
    // Escape genes, so e.g. the fly gene Su(H) becomes Su\(H\).
    // https://mygene.info/v3/query?q=symbol:Su\(H\)&species=7227&fields=symbol,genomic_pos,name&size=20
    // See https://github.com/biothings/mygene.info/issues/112.
    if (gene.name) gene = gene.name
    const escapedGene = gene.replaceAll('(', '\\(').replaceAll(')', '\\)')
    return `symbol:${escapedGene}`;
    }
  }).join(' OR ');

  // Example:
  // https://mygene.info/v3/query?q=symbol:BRCA1&species=9606&fields=symbol,genomic_pos,name
  return `?q=${qParam}&species=${taxid}&fields=symbol,genomic_pos,name,exons`;
}

/** Fetch gene positions from MyGene.info API */
export async function fetchLocationsFromMyGeneInfo(genes, taxid) {
  const annots = [];

  let queryString = getMyGeneInfoQueryString(genes, taxid)
  const initialData = await fetchMyGeneInfo(queryString);

  let data = initialData

  console.log('data', data)

  data.hits.forEach(gene => {
    console.log('gene', gene)
    // If hit lacks position, skip processing
    if ('genomic_pos' in gene === false) return;
    if ('name' in gene === false) return;

    const annot = parseAnnotFromMgiGene(gene);
    annots.push(annot);
    // console.log('gene, length:', gene, annot.stop - annot.start)
  });

  return annots;
}
