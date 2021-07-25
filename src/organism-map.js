export const taxidsByName = {
  'aedes aegypti': '7159',
  'anopheles gambiae': '7165',
  'arabidopsis thaliana': '3702',
  'aspergillis fumigatus': '746128',
  'aspergillus niger': '5061',
  'aspergillus oryzae': '5062',
  'bos taurus': '9913',
  'brachypodium distachyon': '15368',
  'caenorhabditis elegans': '6239',
  'callithrix jacchus': '9483',
  'canis lupus familiaris': '9615',
  'chlorocebus sabaeus': '60711',
  'ciona intestinalis': '7719',
  'capsicum annuum': '4072',
  'culex quinquefasciatus': '7176',
  'danio rerio': '7955',
  'drosophila melanogaster': '7227',
  'equus caballus': '9796',
  'felis catus': '9685',
  'gallus gallus': '9031',
  'glycine max': '3847',
  'gorilla gorilla': '9593',
  'homo sapiens': '9606',
  'hordeum vulgare': '4513',
  'macaca fascicularis': '9541',
  'macaca mulatta': '9544',
  'mus musculus': '10090',
  'musa acuminata': '4641',
  'oryza sativa': '4530',
  'ornithorhynchus anatinus': '9258',
  'pan paniscus': '9597',
  'pan troglodytes': '9598',
  'plasmodium falciparum': '5833',
  'rattus norvegicus': '10116',
  'saccharomyces cerevisiae': '4932',
  'solanum lycopersicum': '4081',
  'sus scrofa': '9823',
  'vitis vinifera': '29760',
  'zea mays': '4577'
}

// Invert keys and values in object, per
// https://stackoverflow.com/a/23013726/10564415
function invert(obj) {
  const ret = {};
  Object.keys(obj).forEach(key => {
    ret[obj[key]] = key;
  });
  return ret;
}

export const namesByTaxid = invert(taxidsByName)

