(function () {
  const params = new URLSearchParams(location.search);
  const isAdmin = params.get('admin') === '1';
  const pathParts = location.pathname.split('/').filter(Boolean); // ['propose'] ou ['propose', id]
  const targetId = pathParts[1] ? decodeURIComponent(pathParts[1]) : null;
  const isEdit = Boolean(targetId);

  const form = document.getElementById('entryForm');
  const formTitle = document.getElementById('formTitle');
  const formSubtitle = document.getElementById('formSubtitle');
  const formMessages = document.getElementById('formMessages');
  const submitBtn = document.getElementById('submitBtn');
  const linksEditor = document.getElementById('linksEditor');
  const proposerContactField = document.getElementById('proposerContactField');

  document.getElementById('targetId').value = targetId || '';

  function showError(message) {
    formMessages.innerHTML = `<p class="alert alert-error">${escapeHtml(message)}</p>`;
  }

  function linkRowHtml(link) {
    const type = link && LINK_TYPES.includes(link.type) ? link.type : 'Discord';
    const url = link ? link.url || '' : '';
    const label = link ? link.label || '' : '';
    const options = LINK_TYPES.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${t}</option>`).join('');
    return `
      <div class="link-row">
        <select class="link-type">${options}</select>
        <input type="text" class="link-label" placeholder="Nom du lien" value="${escapeHtml(label)}" style="${type === 'Autre' ? '' : 'display:none'}">
        <input type="text" class="link-url" placeholder="ernestie.fr, @pseudo, https://..." value="${escapeHtml(url)}">
        <button type="button" class="btn btn-secondary btn-small link-remove">✕</button>
      </div>
    `;
  }

  function addLinkRow(link) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = linkRowHtml(link).trim();
    const row = wrapper.firstChild;
    linksEditor.appendChild(row);
    row.querySelector('.link-type').addEventListener('change', e => {
      row.querySelector('.link-label').style.display = e.target.value === 'Autre' ? '' : 'none';
    });
    row.querySelector('.link-remove').addEventListener('click', () => row.remove());
  }

  function collectLinks() {
    return [...linksEditor.querySelectorAll('.link-row')]
      .map(row => {
        const type = row.querySelector('.link-type').value;
        const rawUrl = row.querySelector('.link-url').value.trim();
        return {
          type,
          label: row.querySelector('.link-label').value.trim(),
          url: normalizeLinkUrl(type, rawUrl),
        };
      })
      .filter(link => link.url);
  }

  function imagePreview(wrapId, hiddenFieldId, filename, removable) {
    const wrap = document.getElementById(wrapId);
    if (!filename) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <img class="current-image-preview" src="/uploads/${encodeURIComponent(filename)}" alt="Image actuelle">
      ${removable ? '<button type="button" class="btn btn-secondary btn-small" id="removeCoatBtn">Retirer</button>' : ''}
    `;
    if (removable) {
      document.getElementById('removeCoatBtn').addEventListener('click', () => {
        document.getElementById(hiddenFieldId).value = '';
        wrap.innerHTML = '';
      });
    }
  }

  async function init() {
    if (isAdmin) {
      try {
        await api('/api/admin/me');
      } catch {
        location.href = '/admin/login';
        return;
      }
      proposerContactField.hidden = true;
    }

    if (isEdit) {
      formTitle.textContent = isAdmin ? "Modifier l'entrée" : 'Proposer une modification';
      formSubtitle.textContent = isAdmin
        ? "La modification est appliquée immédiatement."
        : "Votre proposition sera soumise à l'administrateur.";
      try {
        const entry = await api(`/api/entries/${encodeURIComponent(targetId)}`);
        form.shortName.value = entry.shortName || '';
        form.longName.value = entry.longName || '';
        form.shortDescription.value = entry.shortDescription || '';
        form.longDescription.value = entry.longDescription || '';
        form.foundingDate.value = entry.foundingDate || '';
        document.getElementById('existingFlag').value = entry.flag || '';
        document.getElementById('existingCoatOfArms').value = entry.coatOfArms || '';
        imagePreview('currentFlagPreviewWrap', 'existingFlag', entry.flag, false);
        imagePreview('currentCoatPreviewWrap', 'existingCoatOfArms', entry.coatOfArms, true);
        (entry.links || []).forEach(addLinkRow);
        if (!(entry.links || []).length) addLinkRow();
      } catch (err) {
        showError(err.message);
        submitBtn.disabled = true;
      }
    } else {
      formTitle.textContent = isAdmin ? 'Ajouter une entrée' : 'Proposer une nouvelle entrée';
      formSubtitle.textContent = isAdmin
        ? "L'entrée est créée immédiatement."
        : "Votre proposition sera soumise à l'administrateur.";
      addLinkRow();
    }
  }

  document.getElementById('addLinkBtn').addEventListener('click', () => addLinkRow());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    formMessages.innerHTML = '';

    const links = collectLinks();
    if (!links.length) {
      showError('Ajoutez au moins un lien valide (Discord, site web...).');
      return;
    }
    for (const link of links) {
      try {
        new URL(link.url);
      } catch {
        showError(`Le lien "${link.url}" n'est pas une URL valide (doit commencer par http:// ou https://).`);
        return;
      }
    }

    if (!isEdit && !document.getElementById('flagFile').files.length) {
      showError('Un drapeau est requis.');
      return;
    }

    const formData = new FormData(form);
    formData.set('links', JSON.stringify(links));

    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi...';

    try {
      let entry;
      if (isAdmin) {
        entry = isEdit
          ? await api(`/api/admin/entries/${encodeURIComponent(targetId)}`, { method: 'PUT', body: formData })
          : await api('/api/admin/entries', { method: 'POST', body: formData });
        location.href = `/entry/${encodeURIComponent(entry.id)}`;
      } else {
        await api('/api/proposals', { method: 'POST', body: formData });
        form.remove();
        formMessages.innerHTML = `
          <p class="alert alert-success">
            Merci ! Votre proposition a été envoyée et sera examinée par un administrateur.
          </p>
          <a class="btn btn-secondary" href="/">Retour à l'accueil</a>
        `;
      }
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Envoyer';
    }
  });

  init();
})();
