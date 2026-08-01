(function () {
  const form = document.getElementById('loginForm');
  const messages = document.getElementById('loginMessages');

  api('/api/admin/me').then(() => {
    location.href = '/admin';
  }).catch(() => {});

  form.addEventListener('submit', async e => {
    e.preventDefault();
    messages.innerHTML = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password.value }),
      });
      location.href = '/admin';
    } catch (err) {
      messages.innerHTML = `<p class="alert alert-error">${escapeHtml(err.message)}</p>`;
    }
  });
})();
