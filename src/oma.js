/**
 * @fileoverview Client library for OMA (Orthology MAtrix)
 * API docs: https://omabrowser.org/api/docs
 *
 * This module supports fetching orthologs from OMA.  All functions here
 * support the single exported function `fetchOrthologsFromOma`.
 */

import {reportError} from './error';

var omaBase = 'https://omabrowser.org/api';

/**
  * Query Uniprot API for protein entry ID (e.g. P53_RAT) given gene and
  * organism.  This output is needed as input for the OMA API.
  */
async function fetchUniprotId(gene, org) {
  var uniprotBase, columns, query, query, response, data, lines, columns,
    i, genes, uniprotId;

  // Selected headers:
  //   - Entry, Entry name, Gene names
  // Default headers (omit `columns` parameter):
  //   - Entry, Entry name, Status, Protein names, Gene names, Organism, Length
  columns = 'columns=id,entry name,genes';

  // API docs: https://www.uniprot.org/help/api_queries
  uniprotBase = (
    'https://www.uniprot.org/uniprot/?format=tab&' + columns +
    '&sort=score'
  );

  query = '&query=gene:' + gene + '+AND+organism:' + org;
  response = await fetch(uniprotBase + query);
  data = await response.text();
  lines = data.split('\n').slice(1, -1); // Omit headers, empty last line

  for (i = 0; i < lines.length; i++) {
    columns = lines[i].split('\t');
    genes = columns[2].split(' ').map(d => d.toLowerCase()); // e.g. tp53
    uniprotId = columns[0]; // e.g. P53_RAT
    // uniprotName = columns[1]; // e.g. P53_RAT

    if (genes.includes(gene.toLowerCase())) return uniprotId;
  }

  throw Error(
    'No Uniprot entry found for gene name "' + gene + '" ' +
    'in organism "' + org + '"'
  );
}

/**
  * Query OMA API for orthology information on a protein 
  */
async function fetchOmaOrthologs(uniprotId) {
  var omaUrl, response, data;
  omaUrl = omaBase + '/protein/' + uniprotId + '/orthologs/';
  response = await fetch(omaUrl);
  data = await response.json();
  if (response.status === 404) {
    throw Error(
      'OMA orthologs not found for Uniprot protein "' + uniprotId + '".'
    );
  }
  return data;
}

/**
  * Query OMA API for information on a protein
  */
async function fetchOmaProtein(uniprotId) {
  var omaUrl, response, data;
  omaUrl = omaBase + '/protein/' + uniprotId + '/';
  response = await fetch(omaUrl);
  data = await response.json();
  if (response.status === 404) {
    throw Error(
      'OMA protein not found for Uniprot protein "' + uniprotId + '".'
    );
  }
  return data;
}

/**
  * Convert organism scientific name to OMA ID prefix.
  * Example: "rattus-norvegicus -> "RATNO"
  */
function getOmaIdPrefix(org) {
  // If this function proves inadequate, then refactor to use
  // https://omabrowser.org/api/taxonomy/.  Fetch on page load, collapse
  // tree, return leaf nodes as object with `name` as keys and `code` as
  // values.
  //
  // As is, the implementation below seems adequate, simpler, and faster.
  var prefix, genus, species;
  if (org === 'homo sapiens') {
    return 'HUMAN';
  } else if (org === 'mus musculus') {
    return 'MOUSE';
  } else {
    [genus, species] = org.split(' ');
    prefix = genus.slice(0, 3) + species.slice(0, 2);
    prefix = prefix.toUpperCase();
    return prefix;
  }
}

/**
  * Given genes in a source organism, retrieve their orthologs in
  * other organisms.  Returns OMA protein records for source and target
  * organisms.
  */
async function fetchOrthologsFromOma(genes, sourceOrg, targetOrgs) {
  var proteinId, sourceProtein, rawOrthologs, omaId, omaIdPrefix,
    theseOrthologs, error, targetOrgPrefixes, i, gene,
    orthologs = [];

  for (i = 0; i < genes.length; i++) {
    gene = genes[i];
    try {
      proteinId = await fetchUniprotId(gene, sourceOrg);
      sourceProtein = await fetchOmaProtein(proteinId);
    } catch(error) {
      reportError('geneNotFound', error, gene, sourceOrg, targetOrgs);
    }
    try {
      rawOrthologs = await fetchOmaOrthologs(proteinId);
    } catch(error) {
      reportError('orthologsNotFound', error, gene, sourceOrg, targetOrgs);
    }

    // Get OMA ID prefixes for each target organism
    targetOrgPrefixes = targetOrgs.map(org => getOmaIdPrefix(org));

    theseOrthologs = rawOrthologs.filter(rawOrtholog => {
      omaId = rawOrtholog.omaid; // e.g. RATNO03710
      omaIdPrefix = omaId.slice(0, 5); // e.g. RATNO
      return targetOrgPrefixes.includes(omaIdPrefix);
    });

    console.log(theseOrthologs)
    if (theseOrthologs.length === 0) {
      reportError('orthologsNotFoundInTarget', error, gene, sourceOrg, targetOrgs);
    }

    theseOrthologs.unshift(sourceProtein); // prepend to array

    theseOrthologs = theseOrthologs.map(d => {
      return d.chromosome + ':' + d.locus.start + '-' + d.locus.end
    });
    orthologs.push(theseOrthologs);
  }

  return orthologs;
}

export default fetchOrthologsFromOma;