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

  // TODO: Handle below
  // // Filters out placements on alternative loci scaffolds, an advanced
  // // genome assembly feature we are not concerned with in ideograms.
  // //
  // // Example:
  // // https://mygene.info/v3/query?q=symbol:PTPRC&species=9606&fields=symbol,genomic_pos,name
  // let genomicPos = null;
  // if (Array.isArray(gene.genomic_pos)) {
  //   genomicPos = gene.genomic_pos.filter(pos => {
  //     return pos.chr in ideo.chromosomes[ideo.config.taxid];
  //   })[0];
  // } else {
  //   genomicPos = gene.genomic_pos;
  // }

  const genomicPos = gene.genomic_pos;

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

/** Fetch gene positions from MyGene.info API */
export async function fetchLocationsFromMyGeneInfo(genes, taxid) {
  const annots = [];
  const qParam = genes.map(gene => {
    return `symbol:${gene}`;
  }).join(' OR ');

  // Example:
  // https://mygene.info/v3/query?q=symbol:BRCA1&species=9606&fields=symbol,genomic_pos,name
  const queryString =
    `?q=${qParam}&species=${taxid}&fields=symbol,genomic_pos,name`;
  const data = await fetchMyGeneInfo(queryString);

  data.hits.forEach(gene => {

    // If hit lacks position, skip processing
    if ('genomic_pos' in gene === false) return;
    if ('name' in gene === false) return;

    const annot = parseAnnotFromMgiGene(gene);
    annots.push(annot);
  });

  return annots;
}
