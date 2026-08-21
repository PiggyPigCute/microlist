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
  const microcodeInput = document.getElementById('microcode');
  const recognizedChips = document.getElementById('recognizedChips');
  const recognizedInput = document.getElementById('recognizedInput');
  const recognizedSuggestions = document.getElementById('recognizedSuggestions');

  document.getElementById('targetId').value = targetId || '';

  microcodeInput.addEventListener('input', () => {
    microcodeInput.value = microcodeInput.value.toUpperCase();
  });

  let allEntries = [];
  let recognizedItems = [];

  function renderChips() {
    recognizedChips.innerHTML = recognizedItems.map((item, i) => `
      <span class="chip ${item.id ? '' : 'chip-unlinked'}">
        ${escapeHtml(item.name)}
        <button type="button" class="chip-remove" data-index="${i}" aria-label="Retirer">✕</button>
      </span>
    `).join('');
    recognizedChips.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        recognizedItems.splice(Number(btn.dataset.index), 1);
        renderChips();
      });
    });
  }

  function addRecognizedItem(item) {
    const already = recognizedItems.some(r =>
      (item.id && r.id === item.id) || (!item.id && !r.id && r.name.toLowerCase() === item.name.toLowerCase())
    );
    if (!already) recognizedItems.push(item);
    recognizedInput.value = '';
    hideSuggestions();
    renderChips();
  }

  function hideSuggestions() {
    recognizedSuggestions.hidden = true;
    recognizedSuggestions.innerHTML = '';
  }

  recognizedInput.addEventListener('input', () => {
    const query = recognizedInput.value.trim().toLowerCase();
    if (!query) return hideSuggestions();
    const matches = allEntries
      .filter(e => e.id !== targetId)
      .filter(e => !recognizedItems.some(r => r.id === e.id))
      .filter(e => e.shortName.toLowerCase().includes(query))
      .slice(0, 6);
    if (!matches.length) return hideSuggestions();
    recognizedSuggestions.innerHTML = matches.map(e => `
      <div class="autocomplete-suggestion" data-id="${escapeHtml(e.id)}" data-name="${escapeHtml(e.shortName)}">${escapeHtml(e.shortName)}</div>
    `).join('');
    recognizedSuggestions.hidden = false;
    recognizedSuggestions.querySelectorAll('.autocomplete-suggestion').forEach(el => {
      el.addEventListener('click', () => addRecognizedItem({ id: el.dataset.id, name: el.dataset.name }));
    });
  });

  recognizedInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = recognizedInput.value.trim();
    if (!value) return;
    const exactMatch = allEntries.find(en => en.id !== targetId && en.shortName.toLowerCase() === value.toLowerCase());
    addRecognizedItem(exactMatch ? { id: exactMatch.id, name: exactMatch.shortName } : { name: value });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrap')) hideSuggestions();
  });

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
    try {
      allEntries = await api('/api/entries');
    } catch {
      allEntries = [];
    }

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
        form.microcode.value = entry.microcode || '';
        form.officialLanguages.value = (entry.officialLanguages || []).join(', ');
        recognizedItems = (entry.recognizedMicronations || []).map(item => ({ ...item }));
        renderChips();
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

    if (microcodeInput.value && !/^[A-Z]{2,5}$/.test(microcodeInput.value)) {
      showError('Le microcode doit être composé de 2 à 5 lettres.');
      return;
    }

    const links = collectLinks();
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
    formData.set('recognizedMicronations', JSON.stringify(recognizedItems));

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
