(async function () {
  const grid = document.getElementById('entriesGrid');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');

  let entries = [];

  function render(list) {
    grid.innerHTML = list.map(entry => `
      <a class="entry-card" href="/entry/${encodeURIComponent(entry.id)}">
        <img class="entry-card-flag" src="/uploads/${encodeURIComponent(entry.flag)}" alt="Drapeau de ${escapeHtml(entry.shortName)}">
        <div class="entry-card-body">
          <div class="entry-card-name">${escapeHtml(entry.shortName)}</div>
          ${entry.shortDescription ? `<div class="entry-card-desc">${escapeHtml(entry.shortDescription)}</div>` : ''}
        </div>
      </a>
    `).join('');
    emptyState.hidden = list.length > 0;
  }

  // priorité de recherche : microcode, puis nom court, puis nom long, puis description ;
  // -1 = aucune correspondance (exclu des résultats)
  function matchRank(entry, q) {
    if ((entry.microcode || '').toLowerCase().includes(q)) return 0;
    if (entry.shortName.toLowerCase().includes(q)) return 1;
    if ((entry.longName || '').toLowerCase().includes(q)) return 2;
    if ((entry.shortDescription || '').toLowerCase().includes(q)) return 3;
    return -1;
  }

  function applySearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return render(entries);
    const ranked = entries
      .map(entry => ({ entry, rank: matchRank(entry, q) }))
      .filter(r => r.rank !== -1)
      .sort((a, b) => a.rank - b.rank);
    render(ranked.map(r => r.entry));
  }

  searchInput.addEventListener('input', applySearch);

  try {
    entries = await api('/api/entries');
    render(entries);
  } catch (err) {
    grid.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
  }
})();
