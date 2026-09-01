(async function () {
  const container = document.getElementById('entryContainer');
  const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');

  function closeModal() {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
  }

  function openLinkModal(entryId, match) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <p>Lier ce bouton à la micronation ${escapeHtml(match.shortName)}</p>
        <div class="entry-card-mini">
          <img src="/uploads/${encodeURIComponent(match.flag)}" alt="Drapeau de ${escapeHtml(match.shortName)}">
          <div>
            <div class="entry-card-name">${escapeHtml(match.shortName)}</div>
            ${match.shortDescription ? `<div class="entry-card-desc">${escapeHtml(match.shortDescription)}</div>` : ''}
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="modalCancelBtn">Annuler</button>
          <button type="button" class="btn btn-primary" id="modalLinkBtn">Lier</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });
    overlay.querySelector('#modalCancelBtn').addEventListener('click', closeModal);
    overlay.querySelector('#modalLinkBtn').addEventListener('click', async () => {
      try {
        await api(`/api/entries/${encodeURIComponent(entryId)}/link-recognized`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: match.id }),
        });
        closeModal();
        location.reload();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  try {
    const [entry, allEntries] = await Promise.all([
      api(`/api/entries/${encodeURIComponent(id)}`),
      api('/api/entries').catch(() => []),
    ]);
    document.title = `${entry.shortName} — MicroList`;

    const linksHtml = entry.links.map(link => `
      <a class="btn btn-secondary" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(linkLabel(link))}
      </a>
    `).join('');

    const recognizedHtml = (entry.recognizedMicronations || []).map(m => {
      if (m.id) return `<a class="chip" href="/entry/${encodeURIComponent(m.id)}">${escapeHtml(m.name)}</a>`;
      const match = allEntries.find(e => e.shortName === m.name && e.id !== entry.id);
      if (!match) return `<span class="chip chip-unlinked">${escapeHtml(m.name)}</span>`;
      return `
        <button type="button" class="chip chip-unlinked chip-matchable" data-match-id="${escapeHtml(match.id)}">
          ${escapeHtml(m.name)}
          <span class="chip-dot" title="Une micronation du même nom existe sur le site"></span>
        </button>
      `;
    }).join('');

    container.innerHTML = `
      <div class="entry-header">
        <div>
          <img class="entry-flag-large" src="/uploads/${encodeURIComponent(entry.flag)}" alt="Drapeau de ${escapeHtml(entry.shortName)}">
          ${entry.coatOfArms ? `<img class="entry-coat-of-arms" src="/uploads/${encodeURIComponent(entry.coatOfArms)}" alt="Armoiries de ${escapeHtml(entry.shortName)}">` : ''}
        </div>
        <div class="entry-titles">
          <h1 class="page-title">${escapeHtml(entry.shortName)}${entry.microcode ? ` <a class="badge badge-microcode" href="/srm">${escapeHtml(entry.microcode)}</a>` : ''}</h1>
          ${entry.longName ? `<p class="entry-long-name">${escapeHtml(entry.longName)}</p>` : ''}
          ${entry.foundingDate ? `<p class="entry-founding">Fondée le ${escapeHtml(entry.foundingDate)}</p>` : ''}
          ${(entry.officialLanguages || []).length ? `<p class="entry-founding">Langues officielles : ${escapeHtml(entry.officialLanguages.join(', '))}</p>` : ''}
        </div>
      </div>

      ${entry.shortDescription || entry.longDescription ? `
        <div class="entry-section">
          ${entry.shortDescription ? `<p>${escapeHtml(entry.shortDescription)}</p>` : ''}
          ${entry.longDescription ? `<p>${escapeHtml(entry.longDescription).replace(/\n/g, '<br>')}</p>` : ''}
        </div>
      ` : ''}

      <div class="entry-section entry-links">
        ${linksHtml}
      </div>

      ${recognizedHtml ? `
        <div class="entry-section">
          <h3>Micronations reconnues</h3>
          <div class="chip-list">${recognizedHtml}</div>
        </div>
      ` : ''}

      <div class="entry-actions">
        <a class="btn btn-primary" href="/propose/${encodeURIComponent(entry.id)}">Proposer une modification</a>
      </div>
    `;

    container.querySelectorAll('.chip-matchable').forEach(btn => {
      const match = allEntries.find(e => e.id === btn.dataset.matchId);
      if (!match) return;
      btn.addEventListener('click', () => openLinkModal(entry.id, match));
    });
  } catch (err) {
    container.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
  }
})();
