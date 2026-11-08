'use strict';
// Kushal Aggarwal — portfolio server
// Public site + hidden admin panel (served at /aaddmmiinn) + JSON-file storage.

try { process.loadEnvFile(); } catch { /* no .env file, use real env */ }

const express = require('express');
const compression = require('compression');
const multer = require('multer');
let sharp = null; try { sharp = require('sharp'); } catch { /* optional: uploads are then stored as-is */ }
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const GITHUB_USER = process.env.GITHUB_USERNAME || 'kushal287';
const ADMIN_PATH = '/aaddmmiinn';

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
for (const d of [DATA_DIR, UPLOAD_DIR, path.join(UPLOAD_DIR, 'posts'), path.join(UPLOAD_DIR, 'resume')]) {
  fs.mkdirSync(d, { recursive: true });
}

if (!ADMIN_PASSWORD) console.warn('[warn] ADMIN_PASSWORD is not set — admin login is disabled.');

/* ------------------------------------------------------------------ *
 * Storage (single JSON file, atomic writes)
 * ------------------------------------------------------------------ */
const DEFAULT_DB = {
  profile: {
    name: 'Kushal Aggarwal',
    headline: 'B.Tech student · Builder · Lifelong learner',
    roles: ['Engineering student', 'Web developer', 'Problem solver', 'Curious builder'],
    location: 'Bengaluru, India',
    status: 'Open to internships & collabs',
    intro: 'Second-year B.Tech student at NMIT, turning ideas into things that actually work.',
    bio: [
      "I'm Kushal Aggarwal — a second-year B.Tech student at Nitte Meenakshi Institute of Technology (NMIT), Bengaluru.",
      'I love building things on the web, tinkering with code, and learning something new every single week. I believe the best way to grow as an engineer is to ship projects, share what I learn, and stay curious.',
      "This space is my corner of the internet: the projects I build, the thoughts I share, and the journey I'm on — all in one place."
    ],
    education: {
      school: 'Nitte Meenakshi Institute of Technology (NMIT)',
      degree: 'B.Tech',
      year: '2nd Year',
      place: 'Bengaluru, Karnataka'
    },
    skills: ['Python', 'TypeScript', 'JavaScript', 'HTML & CSS', 'Git & GitHub', 'Web Development', 'AI / ML', 'Vercel'],
    // Edit freely in the admin panel (Profile → Tech stack). level is optional (0-100).
    tech: [
      { name: 'Languages', items: [{ name: 'Python' }, { name: 'TypeScript' }, { name: 'JavaScript' }, { name: 'HTML' }, { name: 'CSS' }] },
      { name: 'Web & Deployment', items: [{ name: 'Web Development' }, { name: 'Responsive Design' }, { name: 'Vercel' }] },
      { name: 'Tools', items: [{ name: 'Git' }, { name: 'GitHub' }] },
      { name: 'Exploring', items: [{ name: 'AI / Machine Learning' }, { name: 'Data Structures & Algorithms' }, { name: 'Backend Development' }] }
    ],
    email: '',
    studio: { name: 'Kushal Developer Studios', short: 'KDS', url: '' }, // set the link in Admin → Profile
    followers: { linkedin: 0, instagram: 0 }, // typed in by hand (these sites don't allow reading them)
    statsShow: { projects: true, posts: true, githubFollowers: true }, // automatic numbers can be switched off
    statsOverride: { projects: '', posts: '', githubFollowers: '' }, // blank = use the real value
    customStats: [], // [{ label, value }] typed in by hand, e.g. Hackathons: 3
    socials: {
      github: 'https://github.com/kushal287',
      linkedin: 'https://www.linkedin.com/in/kushal-aggarwal-17464a373',
      instagram: 'https://www.instagram.com/kushal_agarwal78'
    }
  },
  posts: [],
  repos: {},
  resume: { items: [], activeId: null }
};

let db;
function loadDb() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = { ...structuredClone(DEFAULT_DB), ...raw, profile: { ...structuredClone(DEFAULT_DB.profile), ...(raw.profile || {}) } };
    const OLD_SKILLS = JSON.stringify(['Web Development', 'JavaScript', 'Python', 'C / C++', 'Data Structures', 'Git & GitHub', 'Problem Solving', 'UI Design', 'AI / ML Curiosity']);
    if (JSON.stringify(db.profile.skills) === OLD_SKILLS) db.profile.skills = [...DEFAULT_DB.profile.skills];
  } catch {
    db = structuredClone(DEFAULT_DB);
    saveDb();
  }
}
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
loadDb();
delete db.linkedin; // LinkedIn integration was removed

const uid = () => crypto.randomBytes(8).toString('hex');
const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ *
 * Auth — password check on the server, signed httpOnly cookie
 * ------------------------------------------------------------------ */
const SECRET_FILE = path.join(DATA_DIR, '.secret');
let SECRET;
try { SECRET = fs.readFileSync(SECRET_FILE, 'utf8'); } catch {
  SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, SECRET);
}
const SESSION_MS = 1000 * 60 * 60 * 12; // 12h

const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeToken() {
  const payload = String(Date.now() + SESSION_MS);
  return payload + '.' + sign(payload);
}
function validToken(tok) {
  if (!tok || typeof tok !== 'string') return false;
  const [payload, sig] = tok.split('.');
  if (!payload || !sig) return false;
  const good = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload) > Date.now();
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function requireAuth(req, res, next) {
  if (validToken(getCookie(req, 'adm'))) return next();
  res.status(401).json({ error: 'Not authorised' });
}

// brute-force protection: 6 failures / 15 min / IP
const fails = new Map();
function lockedOut(ip) {
  const f = fails.get(ip);
  return f && f.count >= 6 && Date.now() - f.first < 15 * 60 * 1000;
}
function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.first > 15 * 60 * 1000) fails.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

/* ------------------------------------------------------------------ *
 * AI content formatter (Grok / xAI, OpenAI-compatible) with local fallback
 * ------------------------------------------------------------------ */
function localFormat(text) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1');          // hashtags
  // drop engagement-bait lines ("like & share if you agree", "follow me for more", "repost ♻️" …)
  const bait = /\b(like|share|repost)\b[^.!?\n]{0,30}\b(if you|and share|& share|and comment|\bit\b)|follow (me|for more)|♻|\bturn on (the )?notifications|what do you think\?/i;
  t = t.split('\n').filter((l) => !(l.trim().length < 90 && bait.test(l))).join('\n');
  t = t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  const first = t.split(/\n/)[0].replace(/[*_`]/g, '').trim();
  let title = first.length > 90 ? first.slice(0, 87).replace(/\s+\S*$/, '') + '…' : first;
  return { title, content: t, source: 'local' };
}

const AI_SYSTEM = [
  'You are the editor of a personal portfolio website (author: Kushal Aggarwal, a B.Tech student). You receive a rough draft of a short post.',
  'Step 1 — analyse it: find the main message, the facts (names, events, numbers, tools, outcomes) and the tone.',
  'Step 2 — rewrite it so it reads naturally as a standalone entry on a website for ANY visitor, not as a social-media post.',
  'Rules:',
  '1. Remove every hashtag. If a hashtag is part of a sentence, keep the plain word without "#"; otherwise drop it.',
  '2. Remove @mentions/handles (keep the plain person or company name if it matters), emojis, and decorative symbols.',
  '3. Remove social-media and engagement-bait wording: "like / share / repost / follow me", "comment below", "link in comments", "DM me", "what do you think?", "agree?", "thanks for reading", "my LinkedIn family/connections" (say "everyone" if needed).',
  '4. Generalise platform- and time-specific phrasing: replace "today / yesterday / this week / just now / recently" and "this post" with neutral wording, because the website already shows the date.',
  '5. Keep the author\'s first-person voice and EVERY fact. NEVER add facts, names, numbers, links or claims that are not in the original. Do not exaggerate.',
  '6. Fix spelling, grammar and spacing. Use short paragraphs separated by a blank line; keep lists as lines starting with "- ". No markdown headings, no bold.',
  '7. Write a clear, descriptive title (max 70 characters, no quotes, no hashtags, no emoji).',
  'Reply with ONLY a JSON object: {"title": string, "content": string}.'
].join('\n');

// Presets so switching provider is one line in .env (AI_PROVIDER=groq|gemini|openrouter|xai)
const AI_PRESETS = {
  groq:       { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  gemini:     { base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  openrouter: { base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  xai:        { base: 'https://api.x.ai/v1', model: 'grok-3-mini' }
};
// Ordered list of providers to try: your own key first, then a keyless free service.
function aiProviders() {
  const list = [];
  const key = process.env.AI_API_KEY || process.env.GROK_API_KEY;
  if (key) {
    const preset = AI_PRESETS[(process.env.AI_PROVIDER || 'gemini').toLowerCase()] || AI_PRESETS.gemini;
    list.push({
      name: process.env.AI_PROVIDER || 'gemini',
      base: (process.env.AI_BASE_URL || process.env.GROK_BASE_URL || preset.base).replace(/\/$/, ''),
      model: process.env.AI_MODEL || process.env.GROK_MODEL || preset.model,
      key
    });
  }
  if (process.env.AI_FREE_FALLBACK !== 'false') {
    list.push({ name: 'free (pollinations)', base: 'https://text.pollinations.ai', path: '/openai', model: 'openai', key: '' });
  }
  return list;
}
async function callProvider(p, text) {
  const headers = { 'Content-Type': 'application/json' };
  if (p.key) headers.Authorization = 'Bearer ' + p.key;
  const r = await fetch(p.base + (p.path || '/chat/completions'), {
    method: 'POST', headers,
    body: JSON.stringify({ model: p.model, temperature: 0.2, messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: String(text).slice(0, 8000) }] }),
    signal: AbortSignal.timeout(40000)
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${body.slice(0, 140)}`);
  const out = JSON.parse(body).choices?.[0]?.message?.content || '';
  const m = out.match(/\{[\s\S]*\}/);
  const j = JSON.parse(m ? m[0] : out);
  if (!j.content || typeof j.content !== 'string') throw new Error('Unexpected AI response');
  const clean = localFormat(j.content); // belt & braces: strip any stray hashtags / bait
  return { title: String(j.title || clean.title).replace(/#/g, '').slice(0, 120), content: clean.content, source: 'ai', provider: p.name };
}
async function aiFormat(text) {
  const fallback = localFormat(text);
  const errors = [];
  for (const p of aiProviders()) {
    try { return await callProvider(p, text); }
    catch (e) { errors.push(`${p.name}: ${e.message || e}`); }
  }
  return { ...fallback, error: errors.length ? errors.join(' | ') : 'No AI provider configured' };
}

/* ------------------------------------------------------------------ *
 * GitHub (public API, cached)
 * ------------------------------------------------------------------ */
let ghCache = { at: 0, repos: [], user: null, error: null };
async function ghFetch(url) {
  const headers = { 'User-Agent': 'kushal-portfolio', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}
const langCache = new Map(); // repo name -> { pushed, langs: { Language: bytes } }
async function fillLanguages(repos) {
  const want = repos.filter((r) => !r.fork || (db.repos[r.name] && db.repos[r.name].hidden === false)).slice(0, 40);
  await Promise.all(want.map(async (r) => {
    const c = langCache.get(r.name);
    if (c && c.pushed === r.pushed_at) return;
    try { langCache.set(r.name, { pushed: r.pushed_at, langs: await ghFetch(r.languages_url) }); } catch { /* keep old value */ }
  }));
}
async function getGithub(force = false) {
  if (!force && Date.now() - ghCache.at < 10 * 60 * 1000 && ghCache.repos.length) return ghCache;
  try {
    const [user, repos] = await Promise.all([
      ghFetch(`https://api.github.com/users/${GITHUB_USER}`),
      ghFetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`)
    ]);
    await fillLanguages(repos);
    ghCache = { at: Date.now(), user, repos, error: null };
    saveGhCache();
  } catch (e) {
    // keep serving the last good data and try again in about a minute
    ghCache = { ...ghCache, at: ghCache.repos.length ? Date.now() - 9 * 60 * 1000 : 0, error: e.message };
  }
  return ghCache;
}
// Remember GitHub data on disk: restarts and temporary rate limits (60 requests/hour without a token)
// then keep showing the last good data instead of an empty projects list.
const GH_CACHE_FILE = path.join(DATA_DIR, 'github-cache.json');
try {
  const c = JSON.parse(fs.readFileSync(GH_CACHE_FILE, 'utf8'));
  ghCache = { at: 0, user: c.user || null, repos: c.repos || [], error: null };
  for (const [k, v] of Object.entries(c.langs || {})) langCache.set(k, v);
} catch { /* no cache yet */ }
function saveGhCache() {
  try { fs.writeFileSync(GH_CACHE_FILE, JSON.stringify({ user: ghCache.user, repos: ghCache.repos, langs: Object.fromEntries(langCache) })); } catch { /* ignore */ }
}
function repoView(r) {
  const cfg = db.repos[r.name] || {};
  // forks and the profile-README repo are hidden by default; admin can switch them on
  const hidden = cfg.hidden !== undefined ? !!cfg.hidden : (!!r.fork || r.name.toLowerCase() === GITHUB_USER.toLowerCase());
  return {
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    homepage: r.homepage || '',
    description: cfg.description || r.description || '',
    originalDescription: r.description || '',
    language: r.language || '',
    langBytes: (langCache.get(r.name) || {}).langs || {},
    langs: Object.entries((langCache.get(r.name) || {}).langs || {}).sort((a, b) => b[1] - a[1]).map((x) => x[0]),
    stars: r.stargazers_count,
    forks: r.forks_count,
    fork: !!r.fork,
    archived: !!r.archived,
    topics: r.topics || [],
    updatedAt: r.pushed_at || r.updated_at,
    createdAt: r.created_at,
    hidden,
    pinned: !!cfg.pinned
  };
}

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */
const POST_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.pdf', '.zip', '.txt', '.doc', '.docx', '.pptx']);
const RESUME_EXT = new Set(['.pdf', '.doc', '.docx']);
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VID_EXT = new Set(['.mp4', '.webm']);

const mkUpload = (sub, allowed, maxMb, maxFiles) =>
  multer({
    storage: multer.diskStorage({
      destination: path.join(UPLOAD_DIR, sub),
      filename: (req, file, cb) => cb(null, uid() + uid() + path.extname(file.originalname).toLowerCase())
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles },
    fileFilter: (req, file, cb) => {
      const ok = allowed.has(path.extname(file.originalname).toLowerCase());
      cb(ok ? null : new Error('File type not allowed: ' + file.originalname), ok);
    }
  });
const postUpload = mkUpload('posts', POST_EXT, 50, 8);
const resumeUpload = mkUpload('resume', RESUME_EXT, 10, 1);

function attachmentFrom(f, sub) {
  const ext = path.extname(f.filename).toLowerCase();
  return {
    name: f.originalname,
    url: `/uploads/${sub}/${f.filename}`,
    type: IMG_EXT.has(ext) ? 'image' : VID_EXT.has(ext) ? 'video' : 'file',
    size: f.size
  };
}
async function optimizeUploads(files) {
  if (!sharp) return;
  for (const f of files || []) {
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f.filename).toLowerCase())) continue;
    const out = f.filename.replace(/\.[^.]+$/, '') + '-o.webp';
    const outPath = path.join(path.dirname(f.path), out);
    try {
      const info = await sharp(f.path).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(outPath);
      fs.unlink(f.path, () => {});
      f.filename = out; f.path = outPath; f.size = info.size;
    } catch { /* keep the original if conversion fails */ }
  }
}
function deleteUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const p = path.normalize(path.join(ROOT, url));
  if (p.startsWith(UPLOAD_DIR + path.sep)) fs.unlink(p, () => {});
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(compression());
app.use(express.json({ limit: '1mb' }));

/* ---------- public API ---------- */
app.get('/api/profile', (req, res) => res.json(db.profile));

function reposPayload(gh) {
  const repos = gh.repos.map(repoView).filter((r) => !r.hidden)
    .sort((a, b) => (b.pinned - a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
  const bytes = {};
  for (const r of repos) for (const [l, n] of Object.entries(r.langBytes || {})) bytes[l] = (bytes[l] || 0) + n;
  const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
  let languages = Object.entries(bytes).map(([name, n]) => ({ name, pct: (n / total) * 100 })).sort((a, b) => b.pct - a.pct);
  const small = languages.filter((l) => l.pct < 1.5).reduce((a, l) => a + l.pct, 0);
  languages = languages.filter((l) => l.pct >= 1.5);
  if (small > 0) languages.push({ name: 'Other', pct: small });
  return {
    repos: repos.map((r) => ({ ...r, langBytes: undefined })),
    languages,
    user: gh.user && { followers: gh.user.followers, publicRepos: gh.user.public_repos, avatar: gh.user.avatar_url, url: gh.user.html_url },
    error: repos.length ? null : gh.error
  };
}
function publicFeed() {
  return db.posts.filter((p) => !p.hidden).map((p) => ({
    id: p.id, kind: 'own', text: p.text, attachments: p.attachments, pinned: !!p.pinned, date: p.createdAt
  })).sort((a, b) => (b.pinned - a.pinned) || new Date(b.date) - new Date(a.date));
}
function resumePayload() {
  const r = db.resume.items.find((x) => x.id === db.resume.activeId);
  return r ? { available: true, label: r.label, ext: path.extname(r.file).slice(1), updatedAt: r.uploadedAt, size: r.size } : { available: false };
}
const homePayload = (gh) => ({ profile: db.profile, repos: reposPayload(gh), posts: publicFeed(), resume: resumePayload() });

app.get('/api/repos', async (req, res) => res.json(reposPayload(await getGithub())));
app.get('/api/posts', (req, res) => res.json(publicFeed()));
app.get('/api/resume', (req, res) => res.json(resumePayload()));
// everything the home page needs in ONE request
app.get('/api/home', async (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.json(homePayload(await getGithub())); });

function activeResume() {
  const r = db.resume.items.find((x) => x.id === db.resume.activeId);
  return r && { r, file: path.join(UPLOAD_DIR, 'resume', r.file) };
}
app.get('/resume/download', (req, res) => {
  const a = activeResume();
  if (!a || !fs.existsSync(a.file)) return res.status(404).send('Resume not available');
  res.download(a.file, 'Kushal_Aggarwal_Resume' + path.extname(a.r.file));
});
app.get('/resume/view', (req, res) => {
  const a = activeResume();
  if (!a || !fs.existsSync(a.file)) return res.status(404).send('Resume not available');
  res.setHeader('Content-Disposition', 'inline; filename="Kushal_Aggarwal_Resume' + path.extname(a.r.file) + '"');
  res.sendFile(a.file);
});

/* ---------- admin auth ---------- */
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin disabled' });
  if (lockedOut(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const pw = req.body && req.body.password;
  if (typeof pw !== 'string' || !safeEqual(pw, ADMIN_PASSWORD)) {
    noteFail(ip);
    return setTimeout(() => res.status(401).json({ error: 'Wrong password' }), 600);
  }
  fails.delete(ip);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `adm=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'adm=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', (req, res) => res.json({ authed: validToken(getCookie(req, 'adm')) }));

/* ---------- admin API (everything below needs auth) ---------- */
const admin = express.Router();
admin.use(requireAuth);

admin.get('/overview', async (req, res) => {
  const gh = await getGithub();
  const repos = gh.repos.map(repoView);
  res.json({
    posts: db.posts.length,
    repos: repos.length,
    reposVisible: repos.filter((r) => !r.hidden).length,
    postsLive: db.posts.filter((p) => !p.hidden).length,
    githubFollowers: gh.user ? gh.user.followers : 0,
    resume: db.resume.items.length,
    ai: aiProviders().map((p) => p.name),
    githubError: gh.error
  });
});

admin.put('/profile', (req, res) => {
  const b = req.body || {};
  const p = db.profile;
  const str = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
  for (const k of ['name', 'headline', 'location', 'status', 'intro', 'email']) {
    const v = str(b[k], 300); if (v !== undefined) p[k] = v;
  }
  if (Array.isArray(b.roles)) p.roles = b.roles.map((x) => str(x, 60)).filter(Boolean).slice(0, 12);
  if (Array.isArray(b.skills)) p.skills = b.skills.map((x) => str(x, 40)).filter(Boolean).slice(0, 40);
  if (Array.isArray(b.tech)) {
    p.tech = b.tech.slice(0, 12).map((c) => ({
      name: str(c && c.name, 40) || '',
      items: Array.isArray(c && c.items) ? c.items.slice(0, 30).map((i) => {
        const name = str(i && i.name, 40); const lv = Number(i && i.level);
        return name ? (lv > 0 && lv <= 100 ? { name, level: Math.round(lv) } : { name }) : null;
      }).filter(Boolean) : []
    })).filter((c) => c.name && c.items.length);
  }
  if (b.statsShow && typeof b.statsShow === 'object') {
    p.statsShow = p.statsShow || {};
    for (const k of ['projects', 'posts', 'githubFollowers']) if (typeof b.statsShow[k] === 'boolean') p.statsShow[k] = b.statsShow[k];
  }
  if (b.statsOverride && typeof b.statsOverride === 'object') {
    p.statsOverride = p.statsOverride || {};
    for (const k of ['projects', 'posts', 'githubFollowers']) {
      const v = str(String(b.statsOverride[k] ?? ''), 12);
      if (v !== undefined) p.statsOverride[k] = v;
    }
  }
  if (Array.isArray(b.customStats)) {
    p.customStats = b.customStats.slice(0, 6)
      .map((c) => ({ label: str(c && c.label, 30) || '', value: str(String((c && c.value) ?? ''), 12) || '' }))
      .filter((c) => c.label && c.value);
  }
  if (b.followers && typeof b.followers === 'object') {
    p.followers = p.followers || {};
    for (const k of ['linkedin', 'instagram']) {
      const n = Math.floor(Number(b.followers[k]));
      if (Number.isFinite(n) && n >= 0 && n <= 1e9) p.followers[k] = n;
    }
  }
  if (b.studio && typeof b.studio === 'object') {
    p.studio = p.studio || { name: 'Kushal Developer Studios', short: 'KDS', url: '' };
    const nm = str(b.studio.name, 60); if (nm) p.studio.name = nm;
    if (typeof b.studio.url === 'string') {
      const u = b.studio.url.trim();
      if (!u) p.studio.url = '';
      else {
        const w = /^https?:\/\//i.test(u) ? u : 'https://' + u;
        try { new URL(w); p.studio.url = w.slice(0, 300); } catch { /* ignore an invalid address */ }
      }
    }
  }
  if (Array.isArray(b.bio)) p.bio = b.bio.map((x) => str(x, 1500)).filter(Boolean).slice(0, 8);
  if (b.education && typeof b.education === 'object') {
    for (const k of ['school', 'degree', 'year', 'place']) { const v = str(b.education[k], 160); if (v !== undefined) p.education[k] = v; }
  }
  if (b.socials && typeof b.socials === 'object') {
    for (const k of Object.keys(b.socials)) {
      const v = str(b.socials[k], 300);
      if (v === undefined) continue;
      if (v && !/^https?:\/\//i.test(v)) continue; // only http(s) links
      p.socials[k] = v;
    }
  }
  saveDb();
  res.json(p);
});

/* posts */
admin.get('/posts', (req, res) => res.json(db.posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))));
admin.post('/posts', postUpload.array('files', 8), async (req, res) => {
  await optimizeUploads(req.files);
  const text = String(req.body.text || '').trim();
  const attachments = (req.files || []).map((f) => attachmentFrom(f, 'posts'));
  if (!text && !attachments.length) return res.status(400).json({ error: 'Write something or attach a file' });
  const p = { id: uid(), text: text.slice(0, 10000), attachments, pinned: req.body.pinned === 'true', hidden: false, createdAt: now(), updatedAt: now() };
  db.posts.push(p); saveDb(); res.json(p);
});
admin.put('/posts/:id', postUpload.array('files', 8), async (req, res) => {
  await optimizeUploads(req.files);
  const p = db.posts.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.body.text !== undefined) p.text = String(req.body.text).trim().slice(0, 10000);
  if (req.body.pinned !== undefined) p.pinned = req.body.pinned === 'true' || req.body.pinned === true;
  if (req.body.hidden !== undefined) p.hidden = req.body.hidden === 'true' || req.body.hidden === true;
  let remove = [];
  try { remove = JSON.parse(req.body.removeAttachments || '[]'); } catch { /* ignore */ }
  p.attachments = p.attachments.filter((a) => { if (remove.includes(a.url)) { deleteUpload(a.url); return false; } return true; });
  p.attachments.push(...(req.files || []).map((f) => attachmentFrom(f, 'posts')));
  p.updatedAt = now(); saveDb(); res.json(p);
});
admin.delete('/posts/:id', (req, res) => {
  const i = db.posts.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  db.posts[i].attachments.forEach((a) => deleteUpload(a.url));
  db.posts.splice(i, 1); saveDb(); res.json({ ok: true });
});

/* AI tidy for the post composer */
admin.post('/ai/format', async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'No text' });
  res.json(await aiFormat(text));
});

/* GitHub repos */
admin.get('/repos', async (req, res) => {
  const gh = await getGithub(req.query.refresh === '1');
  res.json({ repos: gh.repos.map(repoView), error: gh.error });
});
admin.put('/repos/:name', (req, res) => {
  const name = req.params.name;
  if (!ghCache.repos.some((r) => r.name === name)) return res.status(404).json({ error: 'Unknown repo' });
  const c = db.repos[name] || (db.repos[name] = {});
  const b = req.body || {};
  if (typeof b.hidden === 'boolean') c.hidden = b.hidden;
  if (typeof b.pinned === 'boolean') c.pinned = b.pinned;
  if (typeof b.description === 'string') c.description = b.description.trim().slice(0, 300);
  saveDb();
  res.json(repoView(ghCache.repos.find((r) => r.name === name)));
});

/* resume */
admin.get('/resume', (req, res) => res.json(db.resume));
admin.post('/resume', resumeUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF / DOC / DOCX file' });
  const item = {
    id: uid(), label: String(req.body.label || req.file.originalname).trim().slice(0, 100),
    file: req.file.filename, originalName: req.file.originalname, size: req.file.size, uploadedAt: now()
  };
  db.resume.items.push(item);
  db.resume.activeId = item.id; // newest upload becomes live
  saveDb(); res.json(db.resume);
});
admin.put('/resume/:id', (req, res) => {
  const it = db.resume.items.find((x) => x.id === req.params.id);
  if (!it) return res.status(404).json({ error: 'Not found' });
  if (req.body.active) db.resume.activeId = it.id;
  if (typeof req.body.label === 'string') it.label = req.body.label.trim().slice(0, 100);
  saveDb(); res.json(db.resume);
});
admin.delete('/resume/:id', (req, res) => {
  const i = db.resume.items.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  deleteUpload('/uploads/resume/' + db.resume.items[i].file);
  db.resume.items.splice(i, 1);
  if (db.resume.activeId === req.params.id) db.resume.activeId = db.resume.items.length ? db.resume.items[db.resume.items.length - 1].id : null;
  saveDb(); res.json(db.resume);
});

app.use('/api/admin', admin);

/* ---------- static ---------- */
// Only post attachments are public; resumes go through /resume/* routes.
app.use('/uploads/posts', express.static(path.join(UPLOAD_DIR, 'posts'), { maxAge: '7d', index: false, dotfiles: 'deny' }));

// Hidden admin panel: no link anywhere on the site, only reachable by typing the URL.
const adminPage = (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
};
app.get(ADMIN_PATH, adminPage);
app.get(ADMIN_PATH + '/', adminPage);
app.use(ADMIN_PATH + '/static', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); },
  express.static(path.join(ROOT, 'admin'), { index: false }));

app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nAllow: /\n'));
// The home page ships with its data inlined, so it can paint without waiting for any API call.
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    getGithub().catch(() => {}); // refresh GitHub data in the background, never block the page on it
    const data = JSON.stringify(homePayload(ghCache)).replace(/</g, '\\u003c');
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(html.replace('<!--HOME_DATA-->', '<script>window.__HOME__=' + data + '</script>'));
  } catch (e) { next(e); }
});
// Studio logo: drop your own file in public/assets as kds-logo.png (or .webp/.jpg) and it replaces the built-in SVG.
app.get('/assets/kds-logo', (req, res, next) => {
  const dir = path.join(ROOT, 'public', 'assets');
  const f = ['png', 'webp', 'jpg', 'jpeg', 'svg'].map((e) => path.join(dir, 'kds-logo.' + e)).find((p) => fs.existsSync(p));
  if (!f) return next();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(f);
});
app.use(express.static(path.join(ROOT, 'public'), {
  extensions: ['html'],
  setHeaders(res, file) {
    // code revalidates (cheap 304s); images are cached for a week
    res.setHeader('Cache-Control', /\.(css|js|html)$/.test(file) ? 'no-cache' : 'public, max-age=604800');
    if (file.endsWith('.avif')) res.setHeader('Content-Type', 'image/avif');
  }
}));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(ROOT, 'public', '404.html'));
});
app.use((err, req, res, next) => { // eslint-disable-line
  const code = err instanceof multer.MulterError ? 400 : 500;
  res.status(code).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Portfolio running → http://localhost:${PORT}`);
  console.log(`Admin → http://localhost:${PORT}${ADMIN_PATH}`);
});
