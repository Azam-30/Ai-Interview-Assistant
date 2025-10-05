// simple localStorage helpers
export function loadCandidates() {
  try { return JSON.parse(localStorage.getItem('candidates') || '[]'); }
  catch(e){ return []; }
}
export function saveCandidates(cands) {
  localStorage.setItem('candidates', JSON.stringify(cands || []));
}
