(function () {
  const proposalsList = document.getElementById('proposalsList');
  const noProposals = document.getElementById('noProposals');
  const entriesTableBody = document.getElementById('entriesTableBody');

  const FIELD_LABELS = {
    shortName: 'Nom court',
    longName: 'Nom long',
    shortDescription: 'Description courte',
    longDescription: 'Description longue',
    foundingDate: 'Date de fondation',
    flag: 'Drapeau',
    coatOfArms: 'Armoiries',
    links: 'Liens',
  };

  function fieldValueHtml(field, value) {
    if (field === 'flag' || field === 'coatOfArms') {
      return value ? `<img class="current-image-preview" src="/uploads/${encodeURIComponent(value)}">` : '<em>aucune</em>';
    }
    if (field === 'links') {
      return (value || []).map(l => `${escapeHtml(linkLabel(l))} : ${escapeHtml(l.url)}`).join('<br>') || '<em>aucun</em>';
    }
    return value ? escapeHtml(value) : '<em>—</em>';
  }

  function valuesEqual(field, a, b) {
    if (field === 'links') return JSON.stringify(a || []) === JSON.stringify(b || []);
    return (a || null) === (b || null);
  }

  function buildFieldsHtml(oldEntry, data) {
    return Object.keys(FIELD_LABELS).map(field => {
      const newVal = data[field];
      if (!oldEntry) {
        return `<tr><th>${FIELD_LABELS[field]}</th><td>${fieldValueHtml(field, newVal)}</td></tr>`;
      }
      const oldVal = oldEntry[field];
      const changed = !valuesEqual(field, oldVal, newVal);
      if (!changed) {
        return `<tr><th>${FIELD_LABELS[field]}</th><td>${fieldValueHtml(field, newVal)}</td></tr>`;
      }
      return `
        <tr>
          <th>${FIELD_LABELS[field]}</th>
          <td>
            <div class="diff-old">${fieldValueHtml(field, oldVal)}</div>
            <div class="diff-new">${fieldValueHtml(field, newVal)}</div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function proposalCardHtml(proposal) {
    const isCreate = proposal.type === 'create';
    const badge = isCreate
      ? '<span class="badge badge-create">Nouvelle entrée</span>'
      : '<span class="badge badge-edit">Modification</span>';
    const targetLabel = !isCreate && proposal.targetEntry
      ? ` de <strong>${escapeHtml(proposal.targetEntry.shortName)}</strong>`
      : !isCreate ? ' (entrée introuvable)' : '';

    return `
      <div class="proposal-card" data-id="${escapeHtml(proposal.id)}">
        <div class="proposal-head">
          <div>
            ${badge}${targetLabel}
            <div class="proposal-meta">
              Proposé le ${new Date(proposal.submittedAt).toLocaleString('fr-FR')}
              ${proposal.proposerContact ? ` par ${escapeHtml(proposal.proposerContact)}` : ''}
            </div>
          </div>
        </div>
        <table class="diff-table">
          ${buildFieldsHtml(isCreate ? null : proposal.targetEntry, proposal.data)}
        </table>
        <div class="proposal-actions">
          <button type="button" class="btn btn-primary btn-small accept-btn">Accepter</button>
          <button type="button" class="btn btn-danger btn-small reject-btn">Refuser</button>
        </div>
      </div>
    `;
  }

  async function loadProposals() {
    const proposals = await api('/api/admin/proposals');
    proposalsList.innerHTML = proposals.map(proposalCardHtml).join('');
    noProposals.hidden = proposals.length > 0;

    proposalsList.querySelectorAll('.accept-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.proposal-card').dataset.id;
        btn.disabled = true;
        try {
          await api(`/api/admin/proposals/${encodeURIComponent(id)}/accept`, { method: 'POST' });
          await refresh();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });

    proposalsList.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.proposal-card').dataset.id;
        if (!confirm('Refuser cette proposition ?')) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/proposals/${encodeURIComponent(id)}/reject`, { method: 'POST' });
          await refresh();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  }

  async function loadEntries() {
    const entries = await api('/api/entries');
    entriesTableBody.innerHTML = entries.map(entry => `
      <tr data-id="${escapeHtml(entry.id)}">
        <td><img src="/uploads/${encodeURIComponent(entry.flag)}" alt=""></td>
        <td><a href="/entry/${encodeURIComponent(entry.id)}">${escapeHtml(entry.shortName)}</a></td>
        <td>${escapeHtml(entry.shortDescription)}</td>
        <td class="admin-actions-cell">
          <a class="btn btn-secondary btn-small" href="/propose/${encodeURIComponent(entry.id)}?admin=1">Modifier</a>
          <button type="button" class="btn btn-danger btn-small delete-btn">Supprimer</button>
        </td>
      </tr>
    `).join('');

    entriesTableBody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        if (!confirm('Supprimer définitivement cette entrée ?')) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
          await loadEntries();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
  }

  async function refresh() {
    await Promise.all([loadProposals(), loadEntries()]);
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.href = '/admin/login';
  });

  api('/api/admin/me')
    .then(refresh)
    .catch(() => {
      location.href = '/admin/login';
    });
})();
