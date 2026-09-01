const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.set('trust proxy', 1); // derrière nginx : nécessaire pour que req.secure reflète X-Forwarded-Proto

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

const entriesPath = path.join(dataDir, 'entries.json');
const proposalsPath = path.join(dataDir, 'proposals.json');
const adminPasswordPath = path.join(dataDir, 'admin-password.json');
const sessionSecretPath = path.join(dataDir, 'session-secret');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

function loadJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let entries = loadJSON(entriesPath, []);
let proposals = loadJSON(proposalsPath, []);

function saveEntries() {
  saveJSON(entriesPath, entries);
}

function saveProposals() {
  saveJSON(proposalsPath, proposals);
}

function loadOrCreateSessionSecret() {
  try {
    return fs.readFileSync(sessionSecretPath, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(sessionSecretPath, secret);
    return secret;
  }
}

// { "hash": "saltHex:hashHex" }, généré à la main via scripts/hash-password.js ;
// null tant qu'il n'a pas été renseigné (personne ne peut se connecter dans ce cas)
function loadAdminPasswordHash() {
  const data = loadJSON(adminPasswordPath, { hash: null });
  return typeof data.hash === 'string' ? data.hash : null;
}

const sessionSecret = loadOrCreateSessionSecret();
const ADMIN_COOKIE = 'microlist_admin';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours

// stored = "saltHex:hashHex"
function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password || typeof stored !== 'string') return false;
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
}

function createAdminToken() {
  return sign('admin-session');
}

function verifyAdminToken(token) {
  if (typeof token !== 'string' || !token) return false;
  const expected = createAdminToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function setAdminCookie(res, req) {
  res.cookie(ADMIN_COOKIE, createAdminToken(), {
    httpOnly: true,
    sameSite: 'lax',
    // req.secure (via "trust proxy" + X-Forwarded-Proto derrière nginx) plutôt que true en dur :
    // un cookie Secure est silencieusement ignoré par le navigateur tant que le site tourne en
    // http:// (test local, ou avant que le nginx/TLS ne soit branché) — la connexion échouait
    // sans aucun message d'erreur
    secure: req.secure,
    maxAge: SESSION_MAX_AGE_MS,
  });
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  if (!verifyAdminToken(cookies[ADMIN_COOKIE])) {
    return res.status(401).json({ error: 'Authentification admin requise.' });
  }
  next();
}

function slugify(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'entree';
}

function generateEntryId(shortName) {
  const base = slugify(shortName);
  let id;
  do {
    id = `${base}-${crypto.randomBytes(3).toString('hex')}`;
  } while (entries.some(e => e.id === id));
  return id;
}

function generateProposalId() {
  return crypto.randomBytes(8).toString('hex');
}

const LINK_TYPES = new Set(['Discord', 'Site web', 'Instagram', 'Twitter/X', 'Facebook', 'Autre']);

// pour ces types, un pseudo seul (ex. "@ernestie" ou "ernestie") est reconstruit en URL de profil
const HANDLE_BASE_URL = {
  Instagram: 'https://instagram.com/',
  'Twitter/X': 'https://x.com/',
  Facebook: 'https://facebook.com/',
};

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

// tolère "ernestie.fr" (sans protocole) et, pour les réseaux sociaux, "@pseudo" seul
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

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// les liens sont facultatifs : toute entrée invalide est silencieusement ignorée plutôt que
// de bloquer la soumission
function parseLinks(raw) {
  let links;
  try {
    links = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(links)) return [];
  const cleaned = [];
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    const type = typeof link.type === 'string' && LINK_TYPES.has(link.type) ? link.type : 'Autre';
    const url = normalizeLinkUrl(type, link.url);
    if (!isValidUrl(url)) continue;
    const label = type === 'Autre' && typeof link.label === 'string' ? link.label.trim().slice(0, 60) : '';
    cleaned.push(label ? { type, label, url } : { type, url });
  }
  return cleaned;
}

const MICROCODE_RE = /^[A-Z]{3}$/;

function isMicrocodeTaken(code, excludeEntryId) {
  return entries.some(e => e.id !== excludeEntryId && e.microcode === code);
}

function parseLanguages(raw) {
  return (raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map(s => s.slice(0, 40));
}

// [{ id, name }] : id renseigné seulement s'il correspond à une entrée existante du site
// (sinon simple texte libre, pour les micronations pas encore référencées)
function parseRecognized(raw) {
  let items;
  try {
    items = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const cleaned = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 100) : '';
    if (!name) continue;
    const id = typeof item.id === 'string' && entries.some(e => e.id === item.id) ? item.id : null;
    cleaned.push(id ? { id, name } : { name });
    if (cleaned.length >= 30) break;
  }
  return cleaned;
}

// construit et valide les champs d'une entrée à partir d'un formulaire (proposition ou édition admin) ;
// existingFlag/existingCoatOfArms sont envoyés par le client en mode édition pour conserver l'image
// actuelle quand aucun nouveau fichier n'est choisi ; excludeEntryId exclut l'entrée éditée de la
// vérification d'unicité du microcode (sinon une entrée entrerait toujours en conflit avec elle-même)
function buildEntryData(body, files, excludeEntryId) {
  const errors = [];

  const shortName = (body.shortName || '').trim().slice(0, 100);
  if (!shortName) errors.push('Le nom court est requis.');

  const longName = (body.longName || '').trim().slice(0, 200) || null;

  const shortDescription = (body.shortDescription || '').trim().slice(0, 300) || null;

  const longDescription = (body.longDescription || '').trim().slice(0, 5000) || null;

  // texte libre et facultatif : "6 octobre 2025", "2025", une datation fictive...
  const foundingDate = (body.foundingDate || '').trim().slice(0, 100) || null;

  const microcodeRaw = (body.microcode || '').trim().toUpperCase();
  let microcode = null;
  if (microcodeRaw) {
    if (!MICROCODE_RE.test(microcodeRaw)) {
      errors.push('Le microcode doit être composé de 3 lettres.');
    } else if (isMicrocodeTaken(microcodeRaw, excludeEntryId)) {
      errors.push(`Le microcode "${microcodeRaw}" est déjà utilisé par une autre entrée.`);
    } else {
      microcode = microcodeRaw;
    }
  }

  const officialLanguages = parseLanguages(body.officialLanguages);
  const recognizedMicronations = parseRecognized(body.recognizedMicronations || '[]');

  const links = parseLinks(body.links || '[]');

  const flagFile = files.flag && files.flag[0];
  const coatFile = files.coatOfArms && files.coatOfArms[0];

  const flag = flagFile ? flagFile.filename : ((body.existingFlag || '').trim() || null);
  if (!flag) errors.push('Un drapeau est requis.');

  const coatOfArms = coatFile ? coatFile.filename : ((body.existingCoatOfArms || '').trim() || null);

  return {
    errors,
    data: {
      shortName, longName, shortDescription, longDescription, foundingDate,
      microcode, officialLanguages, recognizedMicronations,
      links, flag, coatOfArms,
    },
    newFlagUploaded: Boolean(flagFile),
    newCoatOfArmsUploaded: Boolean(coatFile),
  };
}

function deleteUpload(filename) {
  if (!filename) return;
  fs.unlink(path.join(uploadsDir, filename), () => {});
}

function cleanupFiles(files) {
  Object.values(files || {}).flat().forEach(f => fs.unlink(f.path, () => {}));
}

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = MIME_EXT[file.mimetype];
      if (!ext) return cb(new Error('Format d\'image non supporté (png, jpg, webp, gif ou svg attendu).'));
      cb(null, `${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (!MIME_EXT[file.mimetype]) {
      return cb(new Error('Format d\'image non supporté (png, jpg, webp, gif ou svg attendu).'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadEntryImages = upload.fields([
  { name: 'flag', maxCount: 1 },
  { name: 'coatOfArms', maxCount: 1 },
]);

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

// --- API publique ---

app.get('/api/entries', (req, res) => {
  const list = entries
    .map(e => ({ id: e.id, shortName: e.shortName, shortDescription: e.shortDescription, flag: e.flag, microcode: e.microcode }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, 'fr'));
  res.json(list);
});

app.get('/api/entries/:id', (req, res) => {
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entrée introuvable.' });
  res.json(entry);
});

app.post('/api/proposals', uploadEntryImages, (req, res) => {
  const files = req.files || {};

  // honeypot anti-spam : champ caché côté client, un humain ne le remplit jamais
  if ((req.body.website || '').trim()) {
    cleanupFiles(files);
    return res.status(201).json({ ok: true });
  }

  const targetId = (req.body.targetId || '').trim() || null;
  if (targetId && !entries.some(e => e.id === targetId)) {
    cleanupFiles(files);
    return res.status(404).json({ error: 'Entrée à modifier introuvable.' });
  }

  const { errors, data, newFlagUploaded, newCoatOfArmsUploaded } = buildEntryData(req.body, files, targetId);
  if (errors.length) {
    cleanupFiles(files);
    return res.status(400).json({ errors });
  }

  const proposal = {
    id: generateProposalId(),
    type: targetId ? 'edit' : 'create',
    targetId,
    data,
    newFlagUploaded,
    newCoatOfArmsUploaded,
    proposerContact: (req.body.proposerContact || '').trim().slice(0, 200) || null,
    submittedAt: new Date().toISOString(),
  };
  proposals.push(proposal);
  saveProposals();
  res.status(201).json({ ok: true });
});

// --- Admin : session ---

app.post('/api/admin/login', (req, res) => {
  const hash = loadAdminPasswordHash();
  if (!hash) {
    return res.status(401).json({ error: "Mot de passe admin non configuré (voir scripts/hash-password.js)." });
  }
  if (!verifyPassword(req.body.password, hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  setAdminCookie(res, req);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

// --- Admin : propositions ---

app.get('/api/admin/proposals', requireAdmin, (req, res) => {
  const list = proposals.map(p => ({
    ...p,
    targetEntry: p.targetId ? entries.find(e => e.id === p.targetId) || null : null,
  }));
  res.json(list);
});

app.post('/api/admin/proposals/:id/accept', requireAdmin, (req, res) => {
  const idx = proposals.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Proposition introuvable.' });
  const proposal = proposals[idx];
  const now = new Date().toISOString();

  // deux propositions en attente peuvent viser le même microcode : on revérifie au moment
  // d'accepter plutôt qu'à la seule soumission, sinon la 2e acceptée créerait un doublon
  if (proposal.data.microcode && isMicrocodeTaken(proposal.data.microcode, proposal.type === 'edit' ? proposal.targetId : null)) {
    return res.status(409).json({ error: `Le microcode "${proposal.data.microcode}" est déjà utilisé par une autre entrée.` });
  }

  if (proposal.type === 'create') {
    entries.push({ id: generateEntryId(proposal.data.shortName), ...proposal.data, createdAt: now, updatedAt: now });
  } else {
    const entry = entries.find(e => e.id === proposal.targetId);
    if (!entry) {
      proposals.splice(idx, 1);
      saveProposals();
      return res.status(404).json({ error: "L'entrée ciblée n'existe plus." });
    }
    const oldFlag = entry.flag;
    const oldCoatOfArms = entry.coatOfArms;
    Object.assign(entry, proposal.data, { updatedAt: now });
    // l'ancienne image n'est utilisée par aucune autre entrée dès qu'elle est remplacée
    if (oldFlag && oldFlag !== entry.flag) deleteUpload(oldFlag);
    if (oldCoatOfArms && oldCoatOfArms !== entry.coatOfArms) deleteUpload(oldCoatOfArms);
  }

  proposals.splice(idx, 1);
  saveEntries();
  saveProposals();
  res.json({ ok: true });
});

app.post('/api/admin/proposals/:id/reject', requireAdmin, (req, res) => {
  const idx = proposals.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Proposition introuvable.' });
  const proposal = proposals[idx];
  if (proposal.newFlagUploaded) deleteUpload(proposal.data.flag);
  if (proposal.newCoatOfArmsUploaded) deleteUpload(proposal.data.coatOfArms);
  proposals.splice(idx, 1);
  saveProposals();
  res.json({ ok: true });
});

// --- Admin : édition directe des entrées ---

app.post('/api/admin/entries', requireAdmin, uploadEntryImages, (req, res) => {
  const files = req.files || {};
  const { errors, data } = buildEntryData(req.body, files, null);
  if (errors.length) {
    cleanupFiles(files);
    return res.status(400).json({ errors });
  }
  const now = new Date().toISOString();
  const entry = { id: generateEntryId(data.shortName), ...data, createdAt: now, updatedAt: now };
  entries.push(entry);
  saveEntries();
  res.status(201).json(entry);
});

app.put('/api/admin/entries/:id', requireAdmin, uploadEntryImages, (req, res) => {
  const entry = entries.find(e => e.id === req.params.id);
  const files = req.files || {};
  if (!entry) {
    cleanupFiles(files);
    return res.status(404).json({ error: 'Entrée introuvable.' });
  }
  const { errors, data } = buildEntryData(req.body, files, entry.id);
  if (errors.length) {
    cleanupFiles(files);
    return res.status(400).json({ errors });
  }
  const oldFlag = entry.flag;
  const oldCoatOfArms = entry.coatOfArms;
  Object.assign(entry, data, { updatedAt: new Date().toISOString() });
  if (oldFlag && oldFlag !== entry.flag) deleteUpload(oldFlag);
  if (oldCoatOfArms && oldCoatOfArms !== entry.coatOfArms) deleteUpload(oldCoatOfArms);
  saveEntries();
  res.json(entry);
});

app.delete('/api/admin/entries/:id', requireAdmin, (req, res) => {
  const idx = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Entrée introuvable.' });
  const [entry] = entries.splice(idx, 1);
  deleteUpload(entry.flag);
  deleteUpload(entry.coatOfArms);
  saveEntries();
  res.json({ ok: true });
});

// --- Pages ---

function sendPage(file) {
  return (req, res) => res.sendFile(path.join(publicDir, file));
}

app.get('/entry/:id', sendPage('entry.html'));
app.get('/propose', sendPage('propose.html'));
app.get('/propose/:id', sendPage('propose.html'));
app.get('/admin/login', sendPage('admin-login.html'));
app.get('/admin', sendPage('admin.html'));
app.get('/srm-1-3', sendPage('srm-1-3.html'));

// erreurs multer (fichier trop lourd, format refusé...) et erreurs de parsing JSON
app.use((err, req, res, next) => {
  if (!err) return next();
  cleanupFiles(req.files);
  res.status(400).json({ error: err.message || 'Requête invalide.' });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`MicroList lancé sur http://localhost:${PORT}`);
});
