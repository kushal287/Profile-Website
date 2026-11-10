'use strict';
// Optional "GitHub as a disk" storage, for hosts with an ephemeral filesystem (e.g. Render's free plan).
// When PERSIST_GITHUB_REPO and a token are set:
//   • on startup, data/db.json and uploads/** are downloaded from the (private) data repo
//   • every change is pushed back to it in the background
// Without those settings this module does nothing and files simply stay on local disk.
const fs = require('fs');
const path = require('path');

const cfg = () => ({
  repo: process.env.PERSIST_GITHUB_REPO || '',
  token: process.env.PERSIST_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '',
  branch: process.env.PERSIST_GITHUB_BRANCH || 'main',
  base: (process.env.PERSIST_API_BASE || 'https://api.github.com').replace(/\/$/, '')
});
const enabled = () => { const c = cfg(); return !!(c.repo && c.token); };
const storageDir = () => (process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : __dirname);
const relOf = (localPath) => path.relative(storageDir(), localPath).split(path.sep).join('/');

const shas = new Map(); // remote path -> blob sha (null = known not to exist)

function api(method, remotePath, { body, raw } = {}) {
  const c = cfg();
  const url = `${c.base}/repos/${c.repo}/contents/${remotePath.split('/').map(encodeURIComponent).join('/')}` +
    (method === 'GET' ? `?ref=${encodeURIComponent(c.branch)}` : '');
  return fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + c.token,
      'User-Agent': 'kushal-portfolio',
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000)
  });
}
const fail = async (what, r) => new Error(`${what}: HTTP ${r.status} ${(await r.text()).slice(0, 140)}`);

async function currentSha(rel) {
  const r = await api('GET', rel);
  if (r.status === 404) { shas.set(rel, null); return null; }
  if (!r.ok) throw await fail('lookup ' + rel, r);
  const j = await r.json();
  shas.set(rel, j.sha);
  return j.sha;
}

async function pushFile(localPath) {
  if (!enabled()) return;
  const rel = relOf(localPath);
  let buf;
  try { buf = fs.readFileSync(localPath); } catch { return; } // file vanished (deleted meanwhile)
  for (let attempt = 0; attempt < 3; attempt++) {
    let sha = shas.get(rel);
    if (sha === undefined) sha = await currentSha(rel);
    const r = await api('PUT', rel, { body: { message: 'sync ' + rel, content: buf.toString('base64'), branch: cfg().branch, ...(sha ? { sha } : {}) } });
    if (r.ok) { shas.set(rel, (await r.json()).content.sha); return; }
    if (r.status === 409 || r.status === 422) { shas.delete(rel); continue; } // stale sha → look it up again
    throw await fail('push ' + rel, r);
  }
  throw new Error('push ' + rel + ': gave up after 3 conflicts');
}

async function removeRemote(rel) {
  if (!enabled()) return;
  const sha = shas.get(rel) === undefined ? await currentSha(rel) : shas.get(rel);
  if (!sha) return;
  const r = await api('DELETE', rel, { body: { message: 'remove ' + rel, sha, branch: cfg().branch } });
  if (!r.ok && r.status !== 404) throw await fail('delete ' + rel, r);
  shas.set(rel, null);
}

/* ---------- background queue: one push at a time, never throws into the app ---------- */
let chain = Promise.resolve();
const enqueue = (fn) => { chain = chain.then(fn).catch((e) => console.warn('[persist]', e.message)); return chain; };
const timers = new Map();

/** Push soon (debounced 2 s) — used for db.json, which can change many times in a row. */
function saveSoon(localPath) {
  if (!enabled()) return;
  clearTimeout(timers.get(localPath));
  timers.set(localPath, setTimeout(() => { timers.delete(localPath); enqueue(() => pushFile(localPath)); }, 2000));
}
function pushNow(localPath) { if (enabled()) enqueue(() => pushFile(localPath)); }
function removeUpload(url) {
  if (!enabled() || !url || !url.startsWith('/uploads/')) return;
  enqueue(() => removeRemote(url.slice(1)));
}
/** Run pending pushes right away and wait for them (called when the server is shutting down). */
async function flush() {
  for (const [p, t] of timers) { clearTimeout(t); timers.delete(p); enqueue(() => pushFile(p)); }
  await chain;
}

/* ---------- restore on startup ---------- */
async function restore() {
  if (!enabled()) return false;
  const base = storageDir();
  const write = (rel, buf) => { const dest = path.join(base, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); };

  let r = await api('GET', 'data/db.json');
  if (r.status === 200) {
    const j = await r.json();
    shas.set('data/db.json', j.sha);
    let buf = j.content ? Buffer.from(j.content, 'base64') : null;
    if (!buf) { const rr = await api('GET', 'data/db.json', { raw: true }); if (!rr.ok) throw await fail('download db.json', rr); buf = Buffer.from(await rr.arrayBuffer()); }
    write('data/db.json', buf);
  } else if (r.status !== 404) throw await fail('restore db.json', r);

  for (const dir of ['uploads/posts', 'uploads/resume']) {
    r = await api('GET', dir);
    if (r.status === 404) continue;
    if (!r.ok) throw await fail('list ' + dir, r);
    for (const f of await r.json()) {
      if (f.type !== 'file') continue;
      shas.set(f.path, f.sha);
      if (fs.existsSync(path.join(base, f.path))) continue;
      const rr = await api('GET', f.path, { raw: true });
      if (!rr.ok) throw await fail('download ' + f.path, rr);
      write(f.path, Buffer.from(await rr.arrayBuffer()));
    }
  }
  return true;
}

module.exports = { enabled, restore, saveSoon, pushNow, removeUpload, flush };
