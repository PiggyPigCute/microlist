(async function () {
  const tbody = document.getElementById('microcodeTableBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');

  let rows = [];

  function render(list) {
    tbody.innerHTML = list.map(entry => `
      <tr data-id="${escapeHtml(entry.id)}" tabindex="0">
        <td>${escapeHtml(entry.shortName)}</td>
        <td>${escapeHtml(entry.microcode)}</td>
      </tr>
    `).join('');
    emptyState.hidden = list.length > 0;

    tbody.querySelectorAll('tr').forEach(tr => {
      const go = () => { location.href = `/entry/${encodeURIComponent(tr.dataset.id)}`; };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });
  }

  function applySearch() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return render(rows);
    render(rows.filter(e =>
      e.shortName.toLowerCase().includes(q) || e.microcode.toLowerCase().includes(q)
    ));
  }

  searchInput.addEventListener('input', applySearch);

  try {
    const entries = await api('/api/entries');
    rows = entries
      .filter(e => e.microcode)
      .sort((a, b) => a.microcode.localeCompare(b.microcode));
    render(rows);
  } catch (err) {
    tbody.innerHTML = '';
    emptyState.hidden = true;
    document.querySelector('.microcode-table').insertAdjacentHTML(
      'afterend',
      `<p class="alert alert-error">${escapeHtml(err.message)}</p>`
    );
  }
})();
