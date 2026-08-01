(async function () {
  const container = document.getElementById('entryContainer');
  const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');

  try {
    const entry = await api(`/api/entries/${encodeURIComponent(id)}`);
    document.title = `${entry.shortName} — Microlist`;

    const linksHtml = entry.links.map(link => `
      <a class="btn btn-secondary" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(linkLabel(link))}
      </a>
    `).join('');

    container.innerHTML = `
      <div class="entry-header">
        <div>
          <img class="entry-flag-large" src="/uploads/${encodeURIComponent(entry.flag)}" alt="Drapeau de ${escapeHtml(entry.shortName)}">
          ${entry.coatOfArms ? `<img class="entry-coat-of-arms" src="/uploads/${encodeURIComponent(entry.coatOfArms)}" alt="Armoiries de ${escapeHtml(entry.shortName)}">` : ''}
        </div>
        <div class="entry-titles">
          <h1 class="page-title">${escapeHtml(entry.shortName)}</h1>
          ${entry.longName ? `<p class="entry-long-name">${escapeHtml(entry.longName)}</p>` : ''}
          ${entry.foundingDate ? `<p class="entry-founding">Fondée le ${escapeHtml(entry.foundingDate)}</p>` : ''}
        </div>
      </div>

      <div class="entry-section">
        <p>${escapeHtml(entry.shortDescription)}</p>
        ${entry.longDescription ? `<p>${escapeHtml(entry.longDescription).replace(/\n/g, '<br>')}</p>` : ''}
      </div>

      <div class="entry-section entry-links">
        ${linksHtml}
      </div>

      <div class="entry-actions">
        <a class="btn btn-primary" href="/propose/${encodeURIComponent(entry.id)}">Proposer une modification</a>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
  }
})();
