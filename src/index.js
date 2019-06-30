import fetchOrthologs from './homology';

// Enable references to Ideogram when loaded via traditional script tag
window.fetchOrthologs = fetchOrthologs;

// Enable references to Ideogram when imported as an ES6 module
export default fetchOrthologs;
