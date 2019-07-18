function reportError(error, errorObj=null, gene=null, org1=null, org2=null) {
  var summaries, summary, detail;

  summaries = {
      'geneNotFound': 'Gene "' + gene + '" not found in ' + org1,
      'orthologsNotFound': 'Orthologs not found for gene "' + gene + '"',
      'orthologsNotFoundInTarget':
        'Orthologs not found for gene "' + gene + '" in target organism ' + org2
  }
  detail = errorObj ? `<br/><small>${errorObj.message}</small>` : '';
  summary = summaries[error] + detail
  throw new Error(summary);
}

export {reportError}