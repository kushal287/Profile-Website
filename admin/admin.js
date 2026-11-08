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
const TABS = { dash: viewDash, posts: viewPosts, github: viewGithub, resume: viewResume, profile: viewProfile };
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
    <div class="stat"><b>${o.reposVisible}/${o.repos}</b><span>Repos visible</span></div>
    <div class="stat"><b>${o.resume}</b><span>Resume versions</span></div>
  </div>
  <div class="card"><h2>AI “Tidy” button</h2><p class="muted small">${o.ai.length ? "✅ Providers (tried in order): " + esc(o.ai.join(" → ")) + ". The “Tidy with AI” button in the post box fixes spelling, spacing and removes hashtags." : "⚠️ No AI provider — the Tidy button uses a basic built-in cleaner."}</p></div>
  ${o.githubError ? `<div class="card"><h2>GitHub</h2><p class="muted small">⚠️ ${esc(o.githubError)} — showing cached data if available.</p></div>` : ''}
  <div class="card"><h2>Quick tips</h2>
    <p class="muted small">• Visitors never see a link to this page — only you know the address.<br>
    • Add a link inside a post with the <b>🔗 Add link</b> button — it becomes clickable text right inside your paragraph.<br>
    • Hidden items stay here in the panel, just not on the public site.</p></div>`;
}

/* ---------- inline link helper ---------- */
// Inserts [text](url) at the cursor so the link reads as normal text inside the paragraph.
function addLink(ta) {
  const s0 = ta.selectionStart, e0 = ta.selectionEnd;
  const selected = ta.value.slice(s0, e0);
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h2>Add a link</h2><p class="muted small">It shows up as clickable text inside your paragraph.</p>
    <label>Text to show</label><input id="alT" value="${esc(selected)}" placeholder="e.g. my new project">
    <label>Link (URL)</label><input id="alU" placeholder="https://…">
    <div class="row between" style="margin-top:20px"><button class="btn" type="button" id="alX">Cancel</button><button class="btn primary" type="button" id="alOk">Insert link</button></div>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  const close = () => { dlg.close(); dlg.remove(); ta.focus(); };
  dlg.addEventListener('cancel', () => dlg.remove());
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#alOk', dlg).click(); } });
  dlg.addEventListener('click', (e) => {
    if (e.target.id === 'alX') close();
    if (e.target.id === 'alOk') {
      let url = $('#alU', dlg).value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (!/^https?:\/\/[^\s()]+$/i.test(url)) return toast('Enter a valid link (no spaces or brackets)', 'bad');
      const label = ($('#alT', dlg).value.trim() || url).replace(/[\[\]]/g, '');
      ta.setRangeText('[' + label + '](' + url + ')', s0, e0, 'end');
      close();
    }
  });
  setTimeout(() => $(selected ? '#alU' : '#alT', dlg).focus(), 40);
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
    <div class="row" style="margin-top:8px"><button type="button" class="btn sm" id="addLink">🔗 Add link</button><span class="muted small">Inserted as clickable text inside your paragraph. Tip: select a word first to turn it into the link.</span></div>
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
  $('#addLink').addEventListener('click', () => addLink(form.text));
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
    <div style="margin-top:8px"><button type="button" class="btn sm" id="eLink">🔗 Add link</button></div>
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
    if (e.target.id === 'eLink') addLink($('#eText'));
    if (e.target.id === 'eSave') {
      const fd = new FormData(); fd.append('text', $('#eText').value); fd.append('removeAttachments', JSON.stringify([...remove]));
      [...$('#eFiles').files].forEach((f) => fd.append('files', f));
      await api('/api/admin/posts/' + p.id, { method: 'PUT', body: fd }); dlg.close(); toast('Saved ✔'); viewPosts();
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
  const o = await api('/api/admin/overview').catch(() => ({}));
  const f = (id, label, v, ph = '') => `<div><label>${label}</label><input id="${id}" value="${esc(v)}" placeholder="${esc(ph)}"></div>`;
  main.innerHTML = head('Profile', 'Edit the text shown on your home page.') + `
  <div class="card">
    <div class="grid2">${f('pName', 'Name', p.name)}${f('pHead', 'Headline', p.headline)}</div>
    <div class="grid2">${f('pLoc', 'Location', p.location)}${f('pStatus', 'Status badge', p.status)}</div>
    <label>Short intro (hero)</label><textarea id="pIntro" style="min-height:70px">${esc(p.intro)}</textarea>
    <label>About me — one paragraph per blank line</label><textarea id="pBio" style="min-height:220px">${esc(p.bio.join('\n\n'))}</textarea>
    <div class="grid2"><div><label>Typing roles (one per line)</label><textarea id="pRoles">${esc(p.roles.join('\n'))}</textarea></div><div><label>Skills / interests (one per line)</label><textarea id="pSkills">${esc(p.skills.join('\n'))}</textarea></div></div>
  </div>
  <div class="card"><h2>Tech stack</h2>
    <p class="muted small">One category per line: <code>Category: Item, Item, Item</code>. Add <code>@80</code> after an item to show a skill bar (optional), e.g. <code>Python @85</code>. Languages that appear in your GitHub repos become clickable filters on the site.</p>
    <textarea id="pTech" style="min-height:170px;font-family:var(--mono);font-size:.85rem">${esc((p.tech || []).map((c) => c.name + ': ' + c.items.map((i) => i.name + (i.level ? ' @' + i.level : '')).join(', ')).join('\n'))}</textarea></div>
  <div class="card"><h2>Education</h2>
    <div class="grid2">${f('eSchool', 'College', p.education.school)}${f('eDeg', 'Degree / branch', p.education.degree)}</div>
    <div class="grid2">${f('eYear', 'Year', p.education.year)}${f('ePlace', 'Place', p.education.place)}</div></div>
  <div class="card"><h2>Social links</h2>
    ${f('sGh', 'GitHub', p.socials.github)}${f('sLi', 'LinkedIn', p.socials.linkedin)}${f('sIg', 'Instagram', p.socials.instagram)}
    ${f('pMail', 'Public email (optional — shows an Email button)', p.email, 'you@example.com')}</div>
  <div class="card"><h2>Numbers on the home page</h2>
    <p class="muted small">Every number here is editable. A number appears on the site only when it is above 0 (or is text like “5+”). The first three are read automatically from your site and GitHub — turn one off to hide it, or type your own value to replace the real one. LinkedIn and Instagram don't let websites read follower counts, so type those yourself.</p>
    <label>Automatic numbers — show / hide, or type your own value instead</label>
    ${[['sProj', 'oProj', 'projects', 'Projects', o.reposVisible], ['sPosts', 'oPosts', 'posts', 'Posts shared', o.postsLive], ['sGhF', 'oGhF', 'githubFollowers', 'GitHub followers', o.githubFollowers]].map(([id, oid, k, l, n]) => `<div class="stat-edit"><label class="row" style="margin:0;text-transform:none;font-family:inherit;font-size:.9rem"><span class="switch"><input type="checkbox" id="${id}" ${(p.statsShow || {})[k] === false ? '' : 'checked'}><i></i></span> ${l}</label><input id="${oid}" value="${esc((p.statsOverride || {})[k] || '')}" placeholder="Real value: ${n ?? 0} — type to replace"></div>`).join('')}
    <div class="grid2">${f('fLi', 'LinkedIn followers (type it)', (p.followers && p.followers.linkedin) || 0)}${f('fIg', 'Instagram followers (type it)', (p.followers && p.followers.instagram) || 0)}</div>
    <label>Your own numbers — one per line: Label: value</label>
    <textarea id="pCustom" placeholder="Hackathons: 3&#10;Certifications: 2&#10;Years coding: 5+">${esc((p.customStats || []).map((c) => c.label + ': ' + c.value).join('\n'))}</textarea>
    <p class="muted small" style="margin-top:6px">Numbers count up on the page; text like “5+” is shown exactly as written. Up to 6.</p></div>
  <div class="card"><h2>Studio link (KDS)</h2>
    <p class="muted small">Your studio's logo and a link to its website appear on the home page (navigation bar, About section and footer). Leave the address empty to hide the link — the logo stays in the footer.</p>
    <div class="grid2">${f('stName', 'Studio name', (p.studio && p.studio.name) || 'Kushal Developer Studios')}${f('stUrl', 'Studio website address', (p.studio && p.studio.url) || '', 'https://your-studio-website.com')}</div>
    <p class="muted small" style="margin-top:8px">Logo: save your original KDS logo as <code>public/assets/kds-logo.png</code> in the project (or .webp / .jpg). Until that file exists, only the text “KDS” is shown — no substitute logo is used.</p></div>
  <button class="btn primary" id="saveProfile">Save profile</button>`;
  const lines = (id) => $(id).value.split('\n').map((s) => s.trim()).filter(Boolean);
  // "Languages: Python @85, TypeScript" -> [{ name, items: [{ name, level? }] }]
  const parseTech = (txt) => txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':'); if (i < 1) return null;
    const items = l.slice(i + 1).split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      const m = x.match(/^(.*?)\s*@\s*(\d{1,3})$/);
      return m ? { name: m[1].trim(), level: Math.min(100, +m[2]) } : { name: x };
    }).filter((x) => x.name);
    return { name: l.slice(0, i).trim(), items };
  }).filter((c) => c && c.name && c.items.length);
  $('#saveProfile').addEventListener('click', safe(async (e) => {
    busy(e.target, true);
    try {
      await api('/api/admin/profile', { method: 'PUT', json: {
        name: $('#pName').value, headline: $('#pHead').value, location: $('#pLoc').value, status: $('#pStatus').value, intro: $('#pIntro').value,
        bio: $('#pBio').value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean), roles: lines('#pRoles'), skills: lines('#pSkills'), tech: parseTech($('#pTech').value), followers: { linkedin: Number($('#fLi').value) || 0, instagram: Number($('#fIg').value) || 0 },
        studio: { name: $('#stName').value, url: $('#stUrl').value },
        statsShow: { projects: $('#sProj').checked, posts: $('#sPosts').checked, githubFollowers: $('#sGhF').checked },
        statsOverride: { projects: $('#oProj').value, posts: $('#oPosts').value, githubFollowers: $('#oGhF').value },
        customStats: lines('#pCustom').map((l) => { const i = l.indexOf(':'); return i < 1 ? null : { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() }; }).filter(Boolean), email: $('#pMail').value,
        education: { school: $('#eSchool').value, degree: $('#eDeg').value, year: $('#eYear').value, place: $('#ePlace').value },
        socials: { github: $('#sGh').value, linkedin: $('#sLi').value, instagram: $('#sIg').value }
      } });
      toast('Profile saved ✔');
    } finally { busy(e.target, false); }
  }));
}
})();
