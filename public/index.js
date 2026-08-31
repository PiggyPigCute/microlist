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

  function applySearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return render(entries);
    render(entries.filter(e =>
      e.shortName.toLowerCase().includes(q) || (e.shortDescription || '').toLowerCase().includes(q)
    ));
  }

  searchInput.addEventListener('input', applySearch);

  try {
    entries = await api('/api/entries');
    render(entries);
  } catch (err) {
    grid.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
  }
})();
