(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

let toastT;
function toast(msg, kind = 'good') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), kind === 'bad' ? 9000 : 3800);
}
async function api(url, opts = {}) {
  const o = { credentials: 'same-origin', ...opts };
  if (o.json !== undefined) { o.method = o.method || 'POST'; o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.json); }
  const r = await fetch(url, o);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith('/login')) { showGate(); throw new Error('Session expired'); }
  if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
  return data;
}
const safe = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'bad'); } };
const busy = (btn, on) => { if (btn) { btn.disabled = on; } };

/* ---------- auth ---------- */
function showGate() { $('#app').hidden = true; $('#gate').hidden = false; $('#pw').value = ''; setTimeout(() => $('#pw').focus(), 50); }
function showApp() { $('#gate').hidden = true; $('#app').hidden = false; go(location.hash.slice(1) || 'dash'); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginForm button'); busy(btn, true); $('#loginErr').textContent = '';
  try { await api('/api/admin/login', { json: { password: $('#pw').value } }); showApp(); }
  catch (err) { $('#loginErr').textContent = err.message; }
  busy(btn, false);
});
$('#logout').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); showGate(); });
api('/api/admin/me').then((d) => (d.authed ? showApp() : showGate())).catch(showGate);

/* ---------- nav ---------- */
const TABS = { dash: viewDash, posts: viewPosts, linkedin: viewLinkedin, github: viewGithub, resume: viewResume, profile: viewProfile };
function go(tab) {
  if (!TABS[tab]) tab = 'dash';
  location.hash = tab;
  $$('#sideNav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#main').innerHTML = '<div class="empty">Loading…</div>';
  safe(TABS[tab])();
}
$('#sideNav').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) go(b.dataset.tab); });
const main = $('#main');
const head = (t, s) => `<h1>${t}</h1><p class="sub">${s}</p>`;
const sw = (cls, checked, id) => `<label class="switch" title="Toggle"><input type="checkbox" class="${cls}" data-id="${esc(id)}" ${checked ? 'checked' : ''}><i></i></label>`;

/* ---------- overview ---------- */
async function viewDash() {
  const o = await api('/api/admin/overview');
  main.innerHTML = head('Overview', 'Everything about your site at a glance.') + `
  <div class="stats">
    <div class="stat"><b>${o.posts}</b><span>My posts</span></div>
    <div class="stat"><b>${o.linkedin}</b><span>LinkedIn posts (${o.linkedinHidden} hidden)</span></div>
    <div class="stat"><b>${o.reposVisible}/${o.repos}</b><span>Repos visible</span></div>
    <div class="stat"><b>${o.resume}</b><span>Resume versions</span></div>
  </div>
  <div class="card"><h2>AI formatter${o.cleanPending ? ` <span class="tag blue">${o.cleanPending} waiting${o.cleaning ? " · cleaning now" : ""}</span>` : ""}</h2><p class="muted small">${o.ai.length ? "✅ Providers (tried in order): " + esc(o.ai.join(" → ")) + ". LinkedIn posts are cleaned — hashtags removed, tidy paragraphs, auto title." : "⚠️ No AI provider — using the basic built-in cleaner."}</p></div>
  ${o.githubError ? `<div class="card"><h2>GitHub</h2><p class="muted small">⚠️ ${esc(o.githubError)} — showing cached data if available.</p></div>` : ''}
  <div class="card"><h2>Quick tips</h2>
    <p class="muted small">• Visitors never see a link to this page — only you know the address.<br>
    • LinkedIn doesn't allow sites to read your posts automatically. Paste a post, or upload the <b>Shares.csv</b> file from LinkedIn → Settings → Data privacy → <i>Get a copy of your data</i> to bulk-import every post.<br>
    • Hidden items stay here in the panel, just not on the public site.</p></div>`;
}

/* ---------- my posts ---------- */
let editingFiles = [];
async function viewPosts() {
  const posts = await api('/api/admin/posts');
  main.innerHTML = head('My posts', 'Write an update, attach photos / videos / files, and publish it to the site.') + `
  <form class="card" id="postForm">
    <h2>New post</h2>
    <label>What's on your mind?</label>
    <textarea name="text" placeholder="Share an update, a win, something you learned…" maxlength="10000"></textarea>
    <label>Attachments (images, video, PDF, zip — up to 8 files, 50 MB each)</label>
    <div class="drop" id="drop">Click or drop files here<input type="file" name="files" id="files" multiple hidden></div>
    <div id="picked"></div>
    <div class="row between" style="margin-top:16px">
      <label class="row" style="margin:0;text-transform:none;font-family:inherit;font-size:.9rem"><span class="switch"><input type="checkbox" name="pinned" id="pinNew"><i></i></span> Pin to top</label>
      <div class="row"><button type="button" class="btn" id="aiTidy">✨ Tidy with AI</button><button class="btn primary" type="submit">Publish</button></div>
    </div>
  </form>
  <div class="card"><h2>Published (${posts.length})</h2>
    ${posts.length ? posts.map((p) => `
    <div class="item" data-id="${esc(p.id)}">
      <div class="body">
        <div>${p.hidden ? '<span class="tag off">hidden</span>' : '<span class="tag ok">live</span>'}${p.pinned ? '<span class="tag">pinned</span>' : ''}<span class="muted small">${fmtDate(p.createdAt)}</span></div>
        <p>${esc(p.text) || '<i>(attachment only)</i>'}</p>
        <div class="thumbs">${p.attachments.map((a) => a.type === 'image' ? `<img src="${esc(a.url)}" alt="">` : `<span class="attach-pill">${a.type === 'video' ? '🎞' : '📎'} ${esc(a.name)}</span>`).join('')}</div>
      </div>
      <div class="acts">
        <button class="btn sm" data-act="edit">Edit</button>
        <button class="btn sm" data-act="pin">${p.pinned ? 'Unpin' : 'Pin'}</button>
        <button class="btn sm" data-act="hide">${p.hidden ? 'Show' : 'Hide'}</button>
        <button class="btn sm danger" data-act="del">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty">No posts yet — write your first one above.</div>'}
  </div>
  <dialog id="editDlg"></dialog>`;
  const form = $('#postForm'), drop = $('#drop'), files = $('#files');
  let picked = [];
  const renderPicked = () => ($('#picked').innerHTML = picked.map((f, i) => `<span class="attach-pill">${esc(f.name)} <small>${fmtSize(f.size)}</small> <button type="button" data-rm="${i}">✕</button></span>`).join(''));
  const addFiles = (list) => { picked = [...picked, ...list].slice(0, 8); renderPicked(); };
  drop.addEventListener('click', () => files.click());
  files.addEventListener('change', () => { addFiles(files.files); files.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
  $('#picked').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { picked.splice(+b.dataset.rm, 1); renderPicked(); } });
  $('#aiTidy').addEventListener('click', safe(async (e) => {
    const ta = form.text; if (!ta.value.trim()) return;
    busy(e.target, true); e.target.textContent = '✨ Working…';
    const r = await api('/api/admin/ai/format', { json: { text: ta.value } }).finally(() => { busy(e.target, false); e.target.textContent = '✨ Tidy with AI'; });
    ta.value = r.content; toast(r.source === 'ai' ? 'Tidied with AI (' + (r.provider || 'ai') + ')' : 'Basic clean applied' + (r.error ? ' (' + r.error.slice(0, 80) + ')' : ''), r.source === 'ai' ? 'good' : 'bad');
  }));
  form.addEventListener('submit', safe(async (e) => {
    e.preventDefault();
    const fd = new FormData(); fd.append('text', form.text.value); fd.append('pinned', $('#pinNew').checked);
    picked.forEach((f) => fd.append('files', f));
    const btn = $('button[type=submit]', form); busy(btn, true);
    try { await api('/api/admin/posts', { method: 'POST', body: fd }); toast('Published ✔'); viewPosts(); }
    finally { busy(btn, false); }
  }));
  main.onclick = safe(async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.item').dataset.id, p = posts.find((x) => x.id === id);
    if (b.dataset.act === 'del') { if (!confirm('Delete this post permanently?')) return; await api('/api/admin/posts/' + id, { method: 'DELETE' }); toast('Deleted'); viewPosts(); }
    if (b.dataset.act === 'hide') { await api('/api/admin/posts/' + id, { method: 'PUT', json: { hidden: !p.hidden } }); viewPosts(); }
    if (b.dataset.act === 'pin') { await api('/api/admin/posts/' + id, { method: 'PUT', json: { pinned: !p.pinned } }); viewPosts(); }
    if (b.dataset.act === 'edit') openEdit(p);
  });
}
function openEdit(p) {
  const dlg = $('#editDlg'); const remove = new Set(); let add = [];
  const draw = () => {
    dlg.innerHTML = `<h2>Edit post</h2>
    <label>Text</label><textarea id="eText" style="min-height:160px">${esc(p.text)}</textarea>
    <label>Attachments</label>
    <div>${p.attachments.filter((a) => !remove.has(a.url)).map((a) => `<span class="attach-pill">${esc(a.name)} <button data-rm="${esc(a.url)}">✕</button></span>`).join('') || '<span class="muted small">none</span>'}</div>
    <div style="margin-top:10px"><input type="file" id="eFiles" multiple></div>
    <div class="row between" style="margin-top:20px"><button class="btn" id="eCancel">Cancel</button><button class="btn primary" id="eSave">Save changes</button></div>`;
  };
  draw(); dlg.showModal();
  dlg.onclick = safe(async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { const t = $('#eText').value; remove.add(rm.dataset.rm); draw(); $('#eText').value = t; }
    if (e.target.id === 'eCancel') dlg.close();
    if (e.target.id === 'eSave') {
      const fd = new FormData(); fd.append('text', $('#eText').value); fd.append('removeAttachments', JSON.stringify([...remove]));
      [...$('#eFiles').files].forEach((f) => fd.append('files', f));
      await api('/api/admin/posts/' + p.id, { method: 'PUT', body: fd }); dlg.close(); toast('Saved ✔'); viewPosts();
    }
  });
}

/* ---------- LinkedIn ---------- */
let liFilter = 'all';
async function viewLinkedin() {
  const posts = await api('/api/admin/linkedin');
  const list = posts.filter((p) => liFilter === 'all' || (liFilter === 'hidden' ? p.hidden : !p.hidden));
  main.innerHTML = head('LinkedIn posts', 'Everything you add here is cleaned up (no hashtags, tidy paragraphs) and shown in your site theme. Hide any post — you will still see it here.') + `
  <div class="grid2">
    <form class="card" id="liForm">
      <h2>Add a post</h2><p class="muted small">Copy the text from your LinkedIn post and paste it here.</p>
      <label>Post text</label><textarea name="text" required placeholder="Paste the LinkedIn post text…" style="min-height:140px"></textarea>
      <label>Link to the post (optional)</label><input name="url" type="text" placeholder="Paste the post link, or the “Embed this post” code">
      <p class="muted small" style="margin-top:6px">On LinkedIn open your post → <b>⋯</b> menu → <b>Copy link to post</b>. The post must be <b>public</b> for “Show original post” to work. The link is checked with LinkedIn when you save.</p>
      <div class="grid2"><div><label>Date posted</label><input name="date" type="date"></div><div><label>Image (optional)</label><input name="image" type="file" accept="image/*"></div></div>
      <div class="row between" style="margin-top:16px">
        <label class="row" style="margin:0;text-transform:none;font-family:inherit;font-size:.9rem"><span class="switch"><input type="checkbox" name="ai" checked><i></i></span> Clean with AI</label>
        <button class="btn primary" type="submit">Add post</button>
      </div>
    </form>
    <div class="card">
      <h2>Bulk import</h2><p class="muted small">Get every post at once: LinkedIn → Settings → Data privacy → <b>Get a copy of your data</b> → choose “Posts” → download → unzip → upload <b>Shares.csv</b>.</p>
      <label>Shares.csv</label><input type="file" id="csv" accept=".csv">
      <div class="row" style="margin-top:16px"><button class="btn primary" id="csvGo">Import posts</button><button class="btn" id="aiAll">✨ Clean all with AI</button></div>
      <p class="muted small" style="margin-top:12px">Imports are de-duplicated by post link. “Clean all with AI” processes up to 15 posts per click.</p>
    </div>
  </div>
  <div class="tabs">${['all', 'visible', 'hidden'].map((f) => `<button class="pill ${liFilter === f ? 'on' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
  <div class="card">
    ${list.length ? list.map((p) => `
    <div class="item" data-id="${esc(p.id)}">
      ${sw('li-vis', !p.hidden, p.id)}
      <div class="body">
        <div>${p.hidden ? '<span class="tag off">hidden</span>' : '<span class="tag ok">visible</span>'}${p.aiFormatted ? '<span class="tag blue">AI cleaned</span>' : ''}${p.embedStatus === 'ok' ? '<span class="tag ok">link verified</span>' : p.embedStatus === 'bad' ? '<span class="tag off">link not found on LinkedIn</span>' : p.url ? '<span class="tag">link unchecked</span>' : '<span class="tag">no link</span>'}<span class="muted small">${fmtDate(p.date)}</span></div>
        <h3>${esc(p.title) || '(untitled)'}</h3>
        <p>${esc(p.content)}</p>
        ${p.url ? `<a class="small muted" href="${esc(p.url)}" target="_blank" rel="noopener">Open on LinkedIn ↗</a>` : ''}
      </div>
      <div class="acts"><button class="btn sm" data-act="edit">Edit</button><button class="btn sm" data-act="re">✨ Re-clean</button>${p.url ? '<button class="btn sm" data-act="chk">Re-check link</button>' : ''}<button class="btn sm danger" data-act="del">Delete</button></div>
    </div>`).join('') : '<div class="empty">Nothing here yet.</div>'}
  </div><dialog id="liDlg"></dialog>`;

  $('#liForm').addEventListener('submit', safe(async (e) => {
    e.preventDefault();
    const f = e.target, fd = new FormData();
    ['text', 'url', 'date'].forEach((k) => fd.append(k, f[k].value));
    fd.append('ai', f.ai.checked); if (f.image.files[0]) fd.append('image', f.image.files[0]);
    const btn = $('button[type=submit]', f); busy(btn, true); btn.textContent = 'Working…';
    try { const r = await api('/api/admin/linkedin', { method: 'POST', body: fd }); toast(r.linkWarning ? 'Added, but: ' + r.linkWarning : r.warning ? 'Added (basic clean): ' + r.warning.slice(0, 100) : 'Added ✔', r.warning ? 'bad' : 'good'); viewLinkedin(); }
    finally { busy(btn, false); btn.textContent = 'Add post'; }
  }));
  $('#csvGo').addEventListener('click', safe(async (e) => {
    const f = $('#csv').files[0]; if (!f) return toast('Choose Shares.csv first', 'bad');
    const fd = new FormData(); fd.append('file', f); busy(e.target, true);
    try { const r = await api('/api/admin/linkedin/import', { method: 'POST', body: fd }); toast(`Imported ${r.added}, skipped ${r.skipped}` + (r.cleaning ? " — AI is cleaning them in the background" : "")); viewLinkedin(); } finally { busy(e.target, false); }
  }));
  $('#aiAll').addEventListener('click', safe(async (e) => {
    busy(e.target, true); e.target.textContent = 'Working…';
    try { const r = await api('/api/admin/linkedin/ai-all', { method: 'POST' }); toast(`Cleaned ${r.done}, ${r.remaining} left` + (r.error ? ' — ' + r.error.slice(0, 90) : ''), r.error ? 'bad' : 'good'); viewLinkedin(); }
    finally { busy(e.target, false); e.target.textContent = '✨ Clean all with AI'; }
  }));
  $$('.tabs .pill').forEach((b) => b.addEventListener('click', () => { liFilter = b.dataset.f; viewLinkedin(); }));
  main.onchange = safe(async (e) => {
    if (!e.target.classList.contains('li-vis')) return;
    await api('/api/admin/linkedin/' + e.target.dataset.id, { method: 'PUT', json: { hidden: !e.target.checked } });
    toast(e.target.checked ? 'Now visible on site' : 'Hidden from site'); viewLinkedin();
  });
  main.onclick = safe(async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.item').dataset.id, p = posts.find((x) => x.id === id);
    if (b.dataset.act === 'del') { if (!confirm('Delete this LinkedIn post from your site?')) return; await api('/api/admin/linkedin/' + id, { method: 'DELETE' }); toast('Deleted'); viewLinkedin(); }
    if (b.dataset.act === 'chk') {
      b.disabled = true; b.textContent = 'Checking…';
      const r = await api('/api/admin/linkedin/' + id, { method: 'PUT', json: { recheck: true } });
      toast(r.warning || 'Link verified with LinkedIn ✔', r.warning ? 'bad' : 'good'); viewLinkedin();
    }
    if (b.dataset.act === 're') {
      b.disabled = true; b.textContent = 'Working…';
      const r = await api('/api/admin/linkedin/' + id, { method: 'PUT', json: { reformat: true } });
      toast(r.warning ? 'Basic clean only: ' + r.warning.slice(0, 100) : 'Re-cleaned with AI ✔', r.warning ? 'bad' : 'good'); viewLinkedin();
    }
    if (b.dataset.act === 'edit') {
      const dlg = $('#liDlg');
      dlg.innerHTML = `<h2>Edit LinkedIn post</h2>
      <label>Title</label><input id="lT" value="${esc(p.title)}">
      <label>Content</label><textarea id="lC" style="min-height:220px">${esc(p.content)}</textarea>
      <div class="grid2"><div><label>Link</label><input id="lU" value="${esc(p.url)}"></div><div><label>Date</label><input id="lD" type="date" value="${esc((p.date || '').slice(0, 10))}"></div></div>
      <details style="margin-top:12px"><summary class="muted small">Original text</summary><div class="preview-box">${esc(p.raw)}</div></details>
      <div class="row between" style="margin-top:20px"><button class="btn" id="lX">Cancel</button><button class="btn primary" id="lS">Save</button></div>`;
      dlg.showModal();
      dlg.onclick = safe(async (ev) => {
        if (ev.target.id === 'lX') dlg.close();
        if (ev.target.id === 'lS') { const r = await api('/api/admin/linkedin/' + id, { method: 'PUT', json: { title: $('#lT').value, content: $('#lC').value, url: $('#lU').value, date: $('#lD').value } }); dlg.close(); toast(r.warning ? 'Saved, but: ' + r.warning : 'Saved ✔', r.warning ? 'bad' : 'good'); viewLinkedin(); }
      });
    }
  });
}

/* ---------- GitHub ---------- */
async function viewGithub(refresh) {
  const d = await api('/api/admin/repos' + (refresh ? '?refresh=1' : ''));
  const vis = d.repos.filter((r) => !r.hidden).length;
  main.innerHTML = head('GitHub repositories', `${vis} of ${d.repos.length} are visible on your site. Toggle any repo off to hide it — it stays listed here.`) + `
  <div class="row between" style="margin-bottom:14px"><span class="muted small">${d.error ? '⚠️ ' + esc(d.error) : 'Synced from github.com/kushal287'}</span><button class="btn" id="sync">↻ Refresh from GitHub</button></div>
  <div class="card">${d.repos.length ? d.repos.map((r) => `
    <div class="item" data-name="${esc(r.name)}">
      ${sw('repo-vis', !r.hidden, r.name)}
      <div class="body">
        <h3>${esc(r.name)} ${r.fork ? '<span class="tag">fork</span>' : ''}${r.archived ? '<span class="tag">archived</span>' : ''}${r.pinned ? '<span class="tag ok">featured</span>' : ''}</h3>
        <p>${esc(r.description) || '<i>No description</i>'}</p>
        <span class="muted small">${esc(r.language || '—')} · ★ ${r.stars} · updated ${fmtDate(r.updatedAt)}</span>
      </div>
      <div class="acts"><button class="btn sm" data-act="pin">${r.pinned ? 'Unfeature' : 'Feature'}</button><button class="btn sm" data-act="desc">Edit text</button><a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">Open ↗</a></div>
    </div>`).join('') : '<div class="empty">No repositories found.</div>'}</div>`;
  $('#sync').addEventListener('click', () => safe(() => viewGithub(true))());
  main.onchange = safe(async (e) => {
    if (!e.target.classList.contains('repo-vis')) return;
    await api('/api/admin/repos/' + encodeURIComponent(e.target.dataset.id), { method: 'PUT', json: { hidden: !e.target.checked } });
    toast(e.target.checked ? 'Visible on site' : 'Hidden from site'); viewGithub();
  });
  main.onclick = safe(async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const name = b.closest('.item').dataset.name, r = d.repos.find((x) => x.name === name);
    if (b.dataset.act === 'pin') { await api('/api/admin/repos/' + encodeURIComponent(name), { method: 'PUT', json: { pinned: !r.pinned } }); viewGithub(); }
    if (b.dataset.act === 'desc') {
      const v = prompt('Description shown on your site (leave empty to use the GitHub one):', r.description);
      if (v === null) return;
      await api('/api/admin/repos/' + encodeURIComponent(name), { method: 'PUT', json: { description: v } }); toast('Saved ✔'); viewGithub();
    }
  });
}

/* ---------- resume ---------- */
async function viewResume() {
  const d = await api('/api/admin/resume');
  main.innerHTML = head('Resume', 'Upload a new version, switch which one is live, or remove old ones. Visitors always download the live version.') + `
  <form class="card" id="rForm">
    <h2>Upload / replace</h2><p class="muted small">PDF recommended (shows a preview on the site). DOC/DOCX also work. Max 10 MB. A new upload becomes live immediately.</p>
    <div class="grid2"><div><label>File</label><input type="file" name="file" accept=".pdf,.doc,.docx" required></div><div><label>Label</label><input name="label" placeholder="e.g. Resume — Nov 2026"></div></div>
    <div class="row" style="margin-top:16px"><button class="btn primary" type="submit">Upload resume</button></div>
  </form>
  <div class="card"><h2>Versions</h2>
    ${d.items.length ? d.items.slice().reverse().map((it) => `
    <div class="item" data-id="${esc(it.id)}">
      <div class="body"><h3>${esc(it.label)} ${it.id === d.activeId ? '<span class="tag ok">live</span>' : ''}</h3><p>${esc(it.originalName)} · ${fmtSize(it.size)} · uploaded ${fmtDate(it.uploadedAt)}</p></div>
      <div class="acts">${it.id !== d.activeId ? '<button class="btn sm" data-act="live">Make live</button>' : '<a class="btn sm" href="/resume/view" target="_blank">Preview ↗</a>'}<button class="btn sm" data-act="ren">Rename</button><button class="btn sm danger" data-act="del">Delete</button></div>
    </div>`).join('') : '<div class="empty">No resume uploaded yet.</div>'}</div>`;
  $('#rForm').addEventListener('submit', safe(async (e) => {
    e.preventDefault(); const fd = new FormData(e.target); const btn = $('button', e.target); busy(btn, true);
    try { await api('/api/admin/resume', { method: 'POST', body: fd }); toast('Resume uploaded & live ✔'); viewResume(); } finally { busy(btn, false); }
  }));
  main.onclick = safe(async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.item').dataset.id, it = d.items.find((x) => x.id === id);
    if (b.dataset.act === 'live') { await api('/api/admin/resume/' + id, { method: 'PUT', json: { active: true } }); toast('Now live'); viewResume(); }
    if (b.dataset.act === 'ren') { const v = prompt('New label:', it.label); if (v) { await api('/api/admin/resume/' + id, { method: 'PUT', json: { label: v } }); viewResume(); } }
    if (b.dataset.act === 'del') { if (!confirm('Delete this resume file permanently?')) return; await api('/api/admin/resume/' + id, { method: 'DELETE' }); toast('Deleted'); viewResume(); }
  });
}

/* ---------- profile ---------- */
async function viewProfile() {
  const p = await fetch('/api/profile').then((r) => r.json());
  const f = (id, label, v, ph = '') => `<div><label>${label}</label><input id="${id}" value="${esc(v)}" placeholder="${esc(ph)}"></div>`;
  main.innerHTML = head('Profile', 'Edit the text shown on your home page.') + `
  <div class="card">
    <div class="grid2">${f('pName', 'Name', p.name)}${f('pHead', 'Headline', p.headline)}</div>
    <div class="grid2">${f('pLoc', 'Location', p.location)}${f('pStatus', 'Status badge', p.status)}</div>
    <label>Short intro (hero)</label><textarea id="pIntro" style="min-height:70px">${esc(p.intro)}</textarea>
    <label>About me — one paragraph per blank line</label><textarea id="pBio" style="min-height:220px">${esc(p.bio.join('\n\n'))}</textarea>
    <div class="grid2"><div><label>Typing roles (one per line)</label><textarea id="pRoles">${esc(p.roles.join('\n'))}</textarea></div><div><label>Skills / interests (one per line)</label><textarea id="pSkills">${esc(p.skills.join('\n'))}</textarea></div></div>
  </div>
  <div class="card"><h2>Education</h2>
    <div class="grid2">${f('eSchool', 'College', p.education.school)}${f('eDeg', 'Degree / branch', p.education.degree)}</div>
    <div class="grid2">${f('eYear', 'Year', p.education.year)}${f('ePlace', 'Place', p.education.place)}</div></div>
  <div class="card"><h2>Social links</h2>
    ${f('sGh', 'GitHub', p.socials.github)}${f('sLi', 'LinkedIn', p.socials.linkedin)}${f('sIg', 'Instagram', p.socials.instagram)}
    ${f('pMail', 'Public email (optional — shows an Email button)', p.email, 'you@example.com')}</div>
  <button class="btn primary" id="saveProfile">Save profile</button>`;
  const lines = (id) => $(id).value.split('\n').map((s) => s.trim()).filter(Boolean);
  $('#saveProfile').addEventListener('click', safe(async (e) => {
    busy(e.target, true);
    try {
      await api('/api/admin/profile', { method: 'PUT', json: {
        name: $('#pName').value, headline: $('#pHead').value, location: $('#pLoc').value, status: $('#pStatus').value, intro: $('#pIntro').value,
        bio: $('#pBio').value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean), roles: lines('#pRoles'), skills: lines('#pSkills'), email: $('#pMail').value,
        education: { school: $('#eSchool').value, degree: $('#eDeg').value, year: $('#eYear').value, place: $('#ePlace').value },
        socials: { github: $('#sGh').value, linkedin: $('#sLi').value, instagram: $('#sIg').value }
      } });
      toast('Profile saved ✔');
    } finally { busy(e.target, false); }
  }));
}
})();
