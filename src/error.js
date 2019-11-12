/**
 * Converts an all-lowercase name to uppercase genus, lowercase species
 * Example: mus musculus -> Mus musculus
 */
function normalizeOrganismName(name) {
  var genusSpecies, genus, species;
  genusSpecies = name.split(' ');

  // e.g. mus -> Mus
  genus = genusSpecies[0][0].toUpperCase() + genusSpecies[0].slice(1,);

  // Account for subspecies name, e.g. Canis lupus familiaris
  species = genusSpecies.slice(1,).join(' ');

  return genus + ' ' + species;
}

function reportError(error, errorObj=null, gene=null, org1=null, org2=null) {
  var summaries, summary, detail;

  if (org1 !== null) org1 = normalizeOrganismName(org1);
  if (org2 !== null) org2 = normalizeOrganismName(org2[0]);

  summaries = {
      'geneNotFound': `Gene "${gene}" not found in source organism "${org1}"`,
      'orthologsNotFound': `Orthologs not found for gene "${gene}"`,
      'orthologsNotFoundInTarget':
        `Orthologs not found for gene "${gene}" in target organism "${org2}"`
  }
  detail = errorObj ? `<br/><small>${errorObj.message}</small>` : '';
  summary = summaries[error] + detail
  throw new Error(summary);
}

export {reportError}