const LINK_TYPES = ['Discord', 'Site web', 'Instagram', 'Twitter/X', 'Facebook', 'Autre'];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function linkLabel(link) {
  return link.type === 'Autre' && link.label ? link.label : link.type;
}

// pour ces types, un pseudo seul (ex. "@ernestie" ou "ernestie") est reconstruit en URL de profil
const HANDLE_BASE_URL = {
  Instagram: 'https://instagram.com/',
  'Twitter/X': 'https://x.com/',
  Facebook: 'https://facebook.com/',
};

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

// tolère "ernestie.fr" (sans protocole) et, pour les réseaux sociaux, "@pseudo" seul ;
// logique dupliquée côté serveur (server.js) qui reste la source de vérité pour ce qui est stocké
function normalizeLinkUrl(type, raw) {
  let value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';

  const handleBase = HANDLE_BASE_URL[type];
  if (handleBase && !HAS_SCHEME.test(value) && !value.includes('/')) {
    const handle = value.replace(/^@/, '');
    if (handle) return handleBase + handle;
  }

  if (!HAS_SCHEME.test(value)) value = `https://${value}`;
  return value;
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    // réponse sans corps JSON (ex. erreur réseau) : body reste null
  }
  if (!res.ok) {
    const message = (body && (body.error || (body.errors && body.errors.join(' ')))) || `Erreur ${res.status}`;
    throw new Error(message);
  }
  return body;
}

function renderHeader() {
  const el = document.getElementById('siteHeader');
  if (!el) return;
  el.innerHTML = `
    <div class="header-inner">
      <a class="site-title" href="/">Microlist</a>
      <nav class="site-nav">
        <a class="btn btn-secondary btn-small" href="/">Accueil</a>
        <a class="btn btn-secondary btn-small" href="/propose">Proposer une entrée</a>
        <a class="btn btn-secondary btn-small" href="/admin">Admin</a>
      </nav>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', renderHeader);
