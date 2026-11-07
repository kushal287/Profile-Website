'use strict';
// Kushal Aggarwal — portfolio server
// Public site + hidden admin panel (served at /aaddmmiinn) + JSON-file storage.

try { process.loadEnvFile(); } catch { /* no .env file, use real env */ }

const express = require('express');
const multer = require('multer');
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
    skills: ['Web Development', 'JavaScript', 'Python', 'C / C++', 'Data Structures', 'Git & GitHub', 'Problem Solving', 'UI Design', 'AI / ML Curiosity'],
    email: '',
    socials: {
      github: 'https://github.com/kushal287',
      linkedin: 'https://www.linkedin.com/in/kushal-aggarwal-17464a373',
      instagram: 'https://www.instagram.com/kushal_agarwal78'
    }
  },
  posts: [],
  linkedin: [],
  repos: {},
  resume: { items: [], activeId: null }
};

let db;
function loadDb() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = { ...structuredClone(DEFAULT_DB), ...raw, profile: { ...structuredClone(DEFAULT_DB.profile), ...(raw.profile || {}) } };
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
  'You are the editor of a personal portfolio website (author: Kushal Aggarwal, a B.Tech student). You receive a raw LinkedIn post.',
  'Step 1 — analyse it: find the main message, the facts (names, events, numbers, tools, outcomes) and the tone.',
  'Step 2 — rewrite it so it reads naturally as a standalone entry on a website for ANY visitor, not as a social-media post.',
  'Rules:',
  '1. Remove every hashtag. If a hashtag is part of a sentence, keep the plain word without "#"; otherwise drop it.',
  '2. Remove @mentions/handles (keep the plain person or company name if it matters), emojis, and decorative symbols.',
  '3. Remove LinkedIn-specific and engagement-bait wording: "like / share / repost / follow me", "comment below", "link in comments", "DM me", "what do you think?", "agree?", "thanks for reading", "my LinkedIn family/connections" (say "everyone" or "my network" if needed).',
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

// After a bulk import, clean the posts one by one in the background (gentle on free-tier rate limits).
let cleaning = false;
async function backgroundClean() {
  if (cleaning) return;
  cleaning = true;
  try {
    for (;;) {
      const p = db.linkedin.find((x) => !x.aiFormatted);
      if (!p) break;
      const f = await aiFormat(p.raw || p.content);
      if (f.source !== 'ai') break; // no AI reachable — stop; admin can retry from the panel
      p.title = f.title; p.content = f.content; p.aiFormatted = true; saveDb();
      await new Promise((r) => setTimeout(r, 6000));
    }
  } finally { cleaning = false; }
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
async function getGithub(force = false) {
  if (!force && Date.now() - ghCache.at < 10 * 60 * 1000 && ghCache.repos.length) return ghCache;
  try {
    const [user, repos] = await Promise.all([
      ghFetch(`https://api.github.com/users/${GITHUB_USER}`),
      ghFetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=updated`)
    ]);
    ghCache = { at: Date.now(), user, repos, error: null };
  } catch (e) {
    ghCache = { ...ghCache, at: ghCache.repos.length ? ghCache.at : 0, error: e.message };
  }
  return ghCache;
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
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const imgUpload = mkUpload('posts', IMG_EXT, 10, 1);

function attachmentFrom(f, sub) {
  const ext = path.extname(f.filename).toLowerCase();
  return {
    name: f.originalname,
    url: `/uploads/${sub}/${f.filename}`,
    type: IMG_EXT.has(ext) ? 'image' : VID_EXT.has(ext) ? 'video' : 'file',
    size: f.size
  };
}
function deleteUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const p = path.normalize(path.join(ROOT, url));
  if (p.startsWith(UPLOAD_DIR + path.sep)) fs.unlink(p, () => {});
}

/* ------------------------------------------------------------------ *
 * LinkedIn CSV import (LinkedIn "Get a copy of your data" → Shares.csv)
 * ------------------------------------------------------------------ */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
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
app.use(express.json({ limit: '1mb' }));

/* ---------- public API ---------- */
app.get('/api/profile', (req, res) => res.json(db.profile));

app.get('/api/repos', async (req, res) => {
  const gh = await getGithub();
  const repos = gh.repos.map(repoView).filter((r) => !r.hidden)
    .sort((a, b) => (b.pinned - a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({
    repos,
    user: gh.user && { followers: gh.user.followers, publicRepos: gh.user.public_repos, avatar: gh.user.avatar_url, url: gh.user.html_url },
    error: repos.length ? null : gh.error
  });
});

// LinkedIn's official embed URL for a public post link (shows the original post exactly as on LinkedIn)
const LI_HOST = /^https?:\/\/([\w-]+\.)*linkedin\.com\//i;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
// Accepts a normal post link, a feed/update link, an embed link, or the whole "Embed this post" <iframe> code.
function parseLinkedinInput(input) {
  let s = String(input || '').trim();
  const iframe = s.match(/src=["']([^"']+)["']/i);
  if (iframe) s = iframe[1].trim();
  if (!s) return { url: '', embed: '' };
  if (!LI_HOST.test(s)) return { error: 'That is not a linkedin.com link' };
  const m = s.match(/(activity|ugcPost|share)[:-](\d{15,})/);
  const embed = m ? `https://www.linkedin.com/embed/feed/update/urn:li:${m[1]}:${m[2]}` : '';
  // an embed link is not a page people can open, so visitors get the normal permalink instead
  const url = m && /\/embed\//.test(s) ? `https://www.linkedin.com/feed/update/urn:li:${m[1]}:${m[2]}/` : s;
  return { url: url.slice(0, 500), embed };
}
// LinkedIn answers 404 for an embed that does not exist / is not public.
async function checkEmbed(embed) {
  if (!embed) return 'none';
  try {
    const r = await fetch(embed, { headers: { 'User-Agent': BROWSER_UA }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    r.body?.cancel?.();
    if (r.status === 404 || r.status === 410) return 'bad';
    return r.ok ? 'ok' : 'unknown';
  } catch { return 'unknown'; }
}
// Stores the link on a post and verifies it. Returns { error } or { warning }.
async function setLinkedinLink(p, input) {
  const r = parseLinkedinInput(input);
  if (r.error) return { error: r.error };
  p.url = r.url; p.embed = r.embed; p.embedStatus = await checkEmbed(r.embed);
  if (p.embedStatus === 'bad') return { warning: "LinkedIn can't find a public post at this link, so the “Show original post” button stays hidden. On LinkedIn open the post → ⋯ menu → Copy link to post (the post must be public), then edit this post and paste the link again." };
  if (r.url && p.embedStatus === 'none') return { warning: 'This link has no post ID, so only the “View on LinkedIn” button is shown. Use the post’s own link (⋯ → Copy link to post) to also show the original post.' };
  return { warning: null };
}
// verify links of imported posts one by one in the background
let checking = false;
async function backgroundCheckEmbeds() {
  if (checking) return;
  checking = true;
  try {
    for (const p of db.linkedin) {
      if (!p.url || p.embedStatus) continue;
      const r = parseLinkedinInput(p.url);
      p.embed = r.embed || ''; p.embedStatus = await checkEmbed(p.embed); saveDb();
      await new Promise((res) => setTimeout(res, 1500));
    }
  } finally { checking = false; }
}
function publicFeed() {
  const own = db.posts.filter((p) => !p.hidden).map((p) => ({
    id: p.id, kind: 'own', text: p.text, attachments: p.attachments, pinned: !!p.pinned, date: p.createdAt
  }));
  const li = db.linkedin.filter((p) => !p.hidden).map((p) => ({
    // hide the title when it is just the first line of the text (avoids showing the same words twice)
    id: p.id, kind: 'linkedin', title: p.title && !p.content.startsWith(p.title.replace(/…$/, '')) ? p.title : '', text: p.content, url: p.url, embed: p.embedStatus === 'bad' ? '' : (p.embed || parseLinkedinInput(p.url).embed || ''), image: p.image || '', attachments: [], pinned: false, date: p.date
  }));
  return [...own, ...li].sort((a, b) => (b.pinned - a.pinned) || new Date(b.date) - new Date(a.date));
}
app.get('/api/posts', (req, res) => res.json(publicFeed()));

app.get('/api/resume', (req, res) => {
  const r = db.resume.items.find((x) => x.id === db.resume.activeId);
  res.json(r ? { available: true, label: r.label, ext: path.extname(r.file).slice(1), updatedAt: r.uploadedAt, size: r.size } : { available: false });
});
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
    linkedin: db.linkedin.length,
    linkedinHidden: db.linkedin.filter((p) => p.hidden).length,
    repos: repos.length,
    reposVisible: repos.filter((r) => !r.hidden).length,
    resume: db.resume.items.length,
    ai: aiProviders().map((p) => p.name),
    cleanPending: db.linkedin.filter((p) => !p.aiFormatted).length,
    cleaning,
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
admin.post('/posts', postUpload.array('files', 8), (req, res) => {
  const text = String(req.body.text || '').trim();
  const attachments = (req.files || []).map((f) => attachmentFrom(f, 'posts'));
  if (!text && !attachments.length) return res.status(400).json({ error: 'Write something or attach a file' });
  const p = { id: uid(), text: text.slice(0, 10000), attachments, pinned: req.body.pinned === 'true', hidden: false, createdAt: now(), updatedAt: now() };
  db.posts.push(p); saveDb(); res.json(p);
});
admin.put('/posts/:id', postUpload.array('files', 8), (req, res) => {
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

/* LinkedIn */
admin.get('/linkedin', (req, res) => res.json(db.linkedin.slice().sort((a, b) => new Date(b.date) - new Date(a.date))));
admin.post('/ai/format', async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'No text' });
  res.json(await aiFormat(text));
});
admin.post('/linkedin', imgUpload.single('image'), async (req, res) => {
  const raw = String(req.body.text || '').trim();
  if (!raw) return res.status(400).json({ error: 'Paste the post text' });
  const link = parseLinkedinInput(req.body.url);
  if (link.error) return res.status(400).json({ error: link.error });
  const useAi = req.body.ai !== 'false';
  const f = useAi ? await aiFormat(raw) : localFormat(raw);
  const date = req.body.date ? new Date(req.body.date) : new Date();
  const p = {
    id: uid(), raw: raw.slice(0, 10000), title: f.title, content: f.content, url: '',
    date: isNaN(date) ? now() : date.toISOString(),
    image: req.file ? `/uploads/posts/${req.file.filename}` : '',
    hidden: false, aiFormatted: f.source === 'ai', createdAt: now()
  };
  const lk = await setLinkedinLink(p, req.body.url);
  db.linkedin.push(p); saveDb();
  res.json({ post: p, warning: [f.error, lk.warning].filter(Boolean).join(' ') || null, linkWarning: lk.warning || null });
});
admin.post('/linkedin/import', csvUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload Shares.csv from your LinkedIn data export' });
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length < 2) return res.status(400).json({ error: 'CSV looks empty' });
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const iDate = col('date'), iLink = col('sharelink'), iText = col('sharecommentary'), iMedia = col('mediaurl');
  if (iText < 0) return res.status(400).json({ error: 'Not a LinkedIn Shares.csv (no ShareCommentary column)' });
  const known = new Set(db.linkedin.map((p) => p.url).filter(Boolean));
  let added = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const text = (r[iText] || '').trim();
    const link = (iLink >= 0 ? r[iLink] : '').trim();
    if (!text || (link && known.has(link))) { skipped++; continue; }
    const f = localFormat(text);
    const d = iDate >= 0 ? new Date(String(r[iDate]).replace(' ', 'T') + 'Z') : new Date();
    db.linkedin.push({
      id: uid(), raw: text, title: f.title, content: f.content, url: link,
      date: isNaN(d) ? now() : d.toISOString(),
      image: '', mediaUrl: iMedia >= 0 ? r[iMedia] : '', hidden: false, aiFormatted: false, createdAt: now()
    });
    if (link) known.add(link);
    added++;
  }
  saveDb();
  if (added) { backgroundClean(); backgroundCheckEmbeds(); }
  res.json({ added, skipped, cleaning: added > 0 });
});
admin.post('/linkedin/ai-all', async (req, res) => {
  const todo = db.linkedin.filter((p) => !p.aiFormatted).slice(0, 15);
  let done = 0, error = null;
  for (const p of todo) {
    const f = await aiFormat(p.raw || p.content);
    if (f.source !== 'ai') { error = f.error; break; }
    p.title = f.title; p.content = f.content; p.aiFormatted = true; done++;
  }
  saveDb();
  res.json({ done, remaining: db.linkedin.filter((p) => !p.aiFormatted).length, error });
});
admin.put('/linkedin/:id', async (req, res) => {
  const p = db.linkedin.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  let warning = null;
  if (b.reformat) {
    const f = await aiFormat(p.raw || p.content);
    p.title = f.title; p.content = f.content; p.aiFormatted = f.source === 'ai'; warning = f.error || null;
  }
  if (typeof b.title === 'string') p.title = b.title.trim().slice(0, 140);
  if (typeof b.content === 'string') p.content = b.content.trim().slice(0, 10000);
  if (typeof b.hidden === 'boolean') p.hidden = b.hidden;
  if (typeof b.url === 'string' || b.recheck) {
    const lk = await setLinkedinLink(p, typeof b.url === 'string' ? b.url : p.url);
    if (lk.error) return res.status(400).json({ error: lk.error });
    warning = [warning, lk.warning].filter(Boolean).join(' ') || null;
  }
  if (b.date) { const d = new Date(b.date); if (!isNaN(d)) p.date = d.toISOString(); }
  saveDb(); res.json({ post: p, warning });
});
admin.delete('/linkedin/:id', (req, res) => {
  const i = db.linkedin.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  deleteUpload(db.linkedin[i].image);
  db.linkedin.splice(i, 1); saveDb(); res.json({ ok: true });
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
// Only post attachments / LinkedIn images are public; resumes go through /resume/* routes.
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
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

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
