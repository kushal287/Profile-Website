(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');

const ICONS = {
  github: '<svg viewBox="0 0 24 24"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.600-.3-5.300-1.300-5.300-5.800 0-1.300.5-2.300 1.200-3.100-.1-.3-.5-1.500.1-3.100 0 0 1-.3 3.200 1.200a11 11 0 0 1 5.800 0c2.200-1.500 3.200-1.200 3.200-1.200.6 1.600.2 2.800.1 3.100.8.800 1.200 1.800 1.200 3.100 0 4.500-2.700 5.500-5.300 5.800.4.400.8 1.100.8 2.200v3.300c0 .3.2.700.8.600A11.500 11.500 0 0 0 23.500 12C23.500 5.700 18.300.5 12 .5z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24"><path d="M20.4 20.5h-3.6v-5.6c0-1.300 0-3-1.800-3s-2.100 1.400-2.100 2.900v5.700H9.400V9h3.400v1.600h.1c.5-.9 1.600-1.800 3.400-1.800 3.600 0 4.300 2.400 4.300 5.500v6.200zM5.300 7.400a2.100 2.100 0 1 1 0-4.200 2.100 2.100 0 0 1 0 4.200zM7.100 20.500H3.600V9h3.500v11.500zM22.200 0H1.800C.8 0 0 .8 0 1.700v20.600c0 .9.800 1.700 1.800 1.700h20.400c1 0 1.800-.8 1.800-1.700V1.700C24 .8 23.200 0 22.200 0z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24"><path d="M12 2.200c3.200 0 3.600 0 4.800.1 3.300.1 4.800 1.700 4.900 4.900.1 1.300.1 1.600.1 4.800s0 3.600-.1 4.800c-.1 3.200-1.700 4.800-4.900 4.900-1.300.1-1.600.1-4.800.1s-3.600 0-4.800-.1c-3.300-.1-4.800-1.700-4.900-4.900C2.200 15.600 2.200 15.200 2.200 12s0-3.600.1-4.800C2.400 3.900 4 2.400 7.200 2.300 8.400 2.200 8.800 2.200 12 2.200zM12 0C8.700 0 8.300 0 7.100.1 2.700.3.300 2.700.1 7.100 0 8.300 0 8.700 0 12s0 3.700.1 4.900c.2 4.400 2.600 6.800 7 7C8.300 24 8.700 24 12 24s3.700 0 4.900-.1c4.400-.2 6.800-2.600 7-7 .1-1.200.1-1.600.1-4.900s0-3.700-.1-4.900c-.2-4.400-2.600-6.800-7-7C15.700 0 15.300 0 12 0zm0 5.800a6.200 6.200 0 1 0 0 12.400 6.200 6.200 0 0 0 0-12.400zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.400-11.800a1.400 1.400 0 1 0 0 2.900 1.400 1.400 0 0 0 0-2.900z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><path d="M2 5.500A1.500 1.500 0 0 1 3.500 4h17A1.500 1.500 0 0 1 22 5.500v13a1.500 1.500 0 0 1-1.500 1.500h-17A1.500 1.500 0 0 1 2 18.500v-13zm2.400.5L12 12.200 19.600 6H4.400zM20 7.900l-8 6.500-8-6.500v10.600h16V7.900z"/></svg>'
};
const LANG_COLORS = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26', CSS: '#563d7c', Java: '#b07219', 'C++': '#f34b7d', C: '#aaaaaa', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95', Shell: '#89e051', Kotlin: '#A97BFF', Dart: '#00B4AB', Jupyter: '#DA5B0B', 'Jupyter Notebook': '#DA5B0B', Ruby: '#701516', Swift: '#F05138', SCSS: '#c6538c', Vue: '#41b883' };

window.PF = { profile: null, repos: [], languages: [], posts: [], colors: LANG_COLORS, filterLang: () => 0 };
// One request (or none: the server inlines the data into the page) feeds profile, projects, posts and resume.
let HOMEP = null;
const HOME_PICK = { '/api/profile': (d) => d.profile, '/api/repos': (d) => d.repos, '/api/posts': (d) => d.posts, '/api/resume': (d) => d.resume };
function home() {
  if (!HOMEP) {
    const inj = window.__HOME__;
    HOMEP = inj && inj.repos && inj.repos.repos && inj.repos.repos.length ? Promise.resolve(inj) : fetch('/api/home').then((r) => r.json());
  }
  return HOMEP;
}
async function api(u) {
  if (HOME_PICK[u]) return HOME_PICK[u](await home());
  const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json();
}
function renderStudio(s) {
  s = s || {};
  const url = /^https?:\/\//i.test(s.url || '') ? s.url : '';
  $$('[data-kds-name]').forEach((e) => (e.textContent = s.name || 'Kushal Developer Studios'));
  $$('.kds-link').forEach((el) => {
    if (url) { el.href = url; el.target = '_blank'; el.rel = 'noopener'; el.hidden = false; }
    else { el.removeAttribute('href'); el.hidden = el.classList.contains('kds-pill') || el.classList.contains('btn'); }
  });
}
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

/* safe lightweight text → HTML (escape first, then format) */
function fmtText(t) {
  const NUL = String.fromCharCode(0);
  const blocks = String(t || '').replace(/\r/g, '').split(/\n{2,}/);
  const inline = (raw) => {
    const anchors = [];
    // 1) [label](https://url) -> link that reads as part of the sentence
    let out = esc(raw).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => {
      anchors.push('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
      return NUL + (anchors.length - 1) + NUL;
    });
    // 2) **bold**
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 3) bare URLs
    out = out.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (m) => {
      anchors.push('<a href="' + m + '" target="_blank" rel="noopener noreferrer">' + (m.length > 44 ? m.slice(0, 42) + '…' : m) + '</a>');
      return NUL + (anchors.length - 1) + NUL;
    });
    return out.replace(new RegExp(NUL + '(\\d+)' + NUL, 'g'), (m, i) => anchors[i]);
  };
  return blocks.map((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return '<ul>' + lines.map((l) => '<li>' + inline(l.replace(/^\s*[-•*]\s+/, '')) + '</li>').join('') + '</ul>';
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('');
}

/* ---------- theme / nav / scroll ---------- */
$('#year').textContent = new Date().getFullYear();
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
});
const nav = $('.nav');
$('#menuBtn').addEventListener('click', () => nav.classList.toggle('open'));
$$('#navLinks a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));

const prog = $('#progress'), glow = $('#glow');
addEventListener('scroll', () => {
  const h = document.documentElement;
  prog.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight || 1)) * 100 + '%';
}, { passive: true });
addEventListener('pointermove', (e) => {
  glow.style.setProperty('--mx', e.clientX + 'px'); glow.style.setProperty('--my', e.clientY + 'px');
}, { passive: true });

// active link
const secIds = ['home', 'about', 'projects', 'posts', 'resume', 'contact'];
const so = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) $$('#navLinks a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
secIds.forEach((id) => so.observe($('#' + id)));

// reveal
const ro = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), { threshold: 0.12 });
const observeReveals = () => $$('.reveal:not(.in)').forEach((el) => ro.observe(el));
observeReveals();

// tilt on hero photo
const tilt = $('#tilt');
if (matchMedia('(hover:hover)').matches) {
  tilt.addEventListener('pointermove', (e) => {
    const r = tilt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    tilt.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
  });
  tilt.addEventListener('pointerleave', () => (tilt.style.transform = ''));
}

// count up
function countUp(el, to) {
  if (!to) { el.textContent = '0'; return; }
  const t0 = performance.now(), d = 1200;
  const step = (t) => { const p = Math.min(1, (t - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN'); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const countWhenSeen = (el, n) => {
  const o = new IntersectionObserver((es) => { if (es[0].isIntersecting) { countUp(el, n); o.disconnect(); } }, { threshold: 0.5 });
  o.observe(el);
};

/* ---------- typed roles ---------- */
function typer(words) {
  const el = $('#typed'); if (!words.length) return;
  let w = 0, c = 0, del = false;
  (function tick() {
    const word = words[w];
    c += del ? -1 : 1;
    el.textContent = word.slice(0, c);
    let wait = del ? 35 : 80;
    if (!del && c === word.length) { del = true; wait = 1500; }
    else if (del && c === 0) { del = false; w = (w + 1) % words.length; wait = 350; }
    setTimeout(tick, wait);
  })();
}

/* ---------- profile ---------- */
function socialLinks(p, cls) {
  return ['github', 'linkedin', 'instagram'].filter((k) => p.socials[k])
    .map((k) => `<a class="${cls}" href="${esc(safeUrl(p.socials[k]))}" target="_blank" rel="noopener noreferrer" aria-label="${k}" title="${k}">${ICONS[k]}</a>`).join('');
}
let PROFILE = null;
function renderProfile(p) {
  PROFILE = p; PF.profile = p; renderStudio(p.studio); $('.marquee').hidden = !(p.skills && p.skills.length); renderStats(); dispatchEvent(new Event('pf:profile'));
  if (typeof POSTS !== 'undefined' && POSTS.length) renderPosts();
  const parts = p.name.split(' ');
  $('#heroName').innerHTML = esc(parts[0]) + (parts.length > 1 ? ' <em>' + esc(parts.slice(1).join(' ')) + '</em>' : '');
  document.title = `${p.name} — ${p.headline}`;
  $('#status').textContent = p.status;
  $('#heroIntro').textContent = p.intro;
  $('#locBadge').textContent = p.location;
  $('#bioText').innerHTML = p.bio.map((t) => `<p>${esc(t)}</p>`).join('');
  const e = p.education;
  $('#eduSchool').textContent = e.school; $('#eduDegree').textContent = e.degree;
  $('#eduYear').textContent = e.year; $('#eduPlace').textContent = e.place;
  $('#skills').innerHTML = p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('');
  const m = p.skills.concat(p.skills).map((s) => `<span>${esc(s)}</span>`).join('');
  $('#marquee').innerHTML = m + m;
  $('#heroSocials').innerHTML = socialLinks(p, 'soc');
  $('#aboutSocials').innerHTML = ['github', 'linkedin', 'instagram'].filter((k) => p.socials[k])
    .map((k) => `<a class="conn" href="${esc(safeUrl(p.socials[k]))}" target="_blank" rel="noopener noreferrer"><span>${ICONS[k]}${k[0].toUpperCase() + k.slice(1)}</span>↗</a>`).join('');
  const cl = ['linkedin', 'github', 'instagram'].filter((k) => p.socials[k])
    .map((k, i) => `<a class="btn ${i ? 'btn-ghost' : 'btn-primary'}" href="${esc(safeUrl(p.socials[k]))}" target="_blank" rel="noopener noreferrer">${ICONS[k]} ${k[0].toUpperCase() + k.slice(1)}</a>`);
  if (p.email) cl.push(`<a class="btn btn-ghost" href="mailto:${esc(p.email)}">${ICONS.mail} Email</a>`);
  $('#contactLinks').innerHTML = cl.join('');
  if (p.socials.github) $('#allRepos').href = safeUrl(p.socials.github);
  typer(p.roles);
}

/* ---------- repos ---------- */
let REPOS = [], langFilter = 'all';
function renderRepos() {
  const q = $('#repoSearch').value.trim().toLowerCase();
  const list = REPOS.filter((r) => (langFilter === 'all' || (r.langs || []).includes(langFilter) || r.language === langFilter) &&
    (!q || (r.name + ' ' + r.description + ' ' + r.topics.join(' ')).toLowerCase().includes(q)));
  $('#repos').innerHTML = list.length ? list.map((r) => `
    <article class="card repo">
      <div class="repo-top">
        <h3>${esc(r.name.replace(/[-_]/g, ' '))}</h3>
        <a class="go" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(r.name)} on GitHub">→</a>
      </div>
      ${r.pinned ? '<div><span class="badge">Featured</span></div>' : ''}
      <p>${esc(r.description) || 'No description yet — check the code on GitHub.'}</p>
      ${r.topics.length ? `<div class="topics">${r.topics.slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="repo-meta">
        ${r.language ? `<span class="lang"><i style="background:${LANG_COLORS[r.language] || '#8b8b9a'}"></i>${esc(r.language)}</span>` : ''}
        <span>★ ${r.stars}</span><span>⑂ ${r.forks}</span><span>Updated ${fmtDate(r.updatedAt)}</span>
      </div>
      <div class="repo-links"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Code ↗</a>${r.homepage ? `<a href="${esc(safeUrl(r.homepage))}" target="_blank" rel="noopener noreferrer">Live demo ↗</a>` : ''}</div>
    </article>`).join('') : '<div class="empty">No projects match yet.</div>';
  $$('.repo').forEach((c) => c.addEventListener('pointermove', (e) => {
    const b = c.getBoundingClientRect(); c.style.setProperty('--rx', e.clientX - b.left + 'px'); c.style.setProperty('--ry', e.clientY - b.top + 'px');
  }));
}
async function loadRepos() {
  try {
    const d = await api('/api/repos');
    REPOS = d.repos; PF.repos = REPOS; PF.languages = d.languages || []; dispatchEvent(new Event('pf:repos'));
    GH_FOLLOWERS = d.user ? d.user.followers : 0;
    $('#repoStat').textContent = REPOS.length; $('.float.f3').hidden = !REPOS.length;
    setSection('projects', REPOS.length > 0);
    renderStats();
    const freq = {};
    REPOS.forEach((r) => (r.langs && r.langs.length ? r.langs : [r.language]).filter(Boolean).forEach((l) => (freq[l] = (freq[l] || 0) + 1)));
    const langs = Object.keys(freq).sort((x, y) => freq[y] - freq[x]).slice(0, 8);
    $('#langFilters').innerHTML = langs.length > 1 ? ['all', ...langs].map((l) => `<button class="fbtn ${l === 'all' ? 'on' : ''}" data-l="${esc(l)}">${l === 'all' ? 'All' : esc(l)}</button>`).join('') : '';
    $$('#langFilters .fbtn').forEach((b) => b.addEventListener('click', () => {
      langFilter = b.dataset.l; $$('#langFilters .fbtn').forEach((x) => x.classList.toggle('on', x === b)); renderRepos();
    }));
    PF.filterLang = (l) => {
      langFilter = l || 'all';
      $$('#langFilters .fbtn').forEach((x) => x.classList.toggle('on', x.dataset.l === langFilter));
      renderRepos();
      return $$('#repos .repo').length;
    };
    renderRepos();
    if (!REPOS.length) $('#repos').innerHTML = `<div class="empty">${d.error ? 'Projects will appear here as soon as GitHub responds.' : 'Projects are on the way — stay tuned.'}</div>`;
  } catch {
    $('#repos').innerHTML = '<div class="empty">Couldn\'t load projects right now.</div>';
  }
}
$('#repoSearch').addEventListener('input', renderRepos);

/* ---------- posts ---------- */
let POSTS = [];
function mediaHtml(p) {
  const imgs = [...(p.attachments || []).filter((a) => a.type === 'image')];
  if (p.image) imgs.unshift({ url: p.image, name: p.title || 'Post image' });
  const vids = (p.attachments || []).filter((a) => a.type === 'video');
  const files = (p.attachments || []).filter((a) => a.type === 'file');
  let h = '';
  if (imgs.length) h += `<div class="media n${Math.min(imgs.length, 4)}">${imgs.slice(0, 4).map((a) => `<img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy">`).join('')}</div>`;
  if (vids.length) h += vids.map((a) => `<div class="media n1"><video src="${esc(a.url)}" controls preload="metadata"></video></div>`).join('');
  return { top: h, files: files.length ? `<div class="files">${files.map((a) => `<a class="file" href="${esc(a.url)}" target="_blank" rel="noopener" download>📎 ${esc(a.name)}<small>${fmtSize(a.size)}</small></a>`).join('')}</div>` : '' };
}
function renderPosts() {
  const list = POSTS;
  if (!list.length) { $('#feed').innerHTML = '<div class="empty" style="column-span:all">Nothing here yet — check back soon.</div>'; return; }
  $('#feed').innerHTML = list.map((p) => {
    const m = mediaHtml(p);
    const long = (p.text || '').length > 380;
    return '<article class="card post">' + m.top +
      '<div class="post-body">' +
        '<div class="post-head"><span class="src own">✦ Update</span><span>' + (p.pinned ? '<span class="pin">📌 Pinned · </span>' : '') + fmtDate(p.date) + '</span></div>' +
        (p.text ? '<div class="post-text ' + (long ? 'clamp' : '') + '">' + fmtText(p.text) + '</div>' : '') +
        (long ? '<button class="more">Read more ↓</button>' : '') +
        m.files +
      '</div></article>';
  }).join('');
  $$('#feed .more').forEach((b) => b.addEventListener('click', () => {
    const t = b.previousElementSibling; const open = t.classList.toggle('clamp'); b.textContent = open ? 'Read more ↓' : 'Show less ↑';
  }));
  $$('#feed .media img').forEach((i) => i.addEventListener('click', () => { const lb = $('#lightbox'); $('img', lb).src = i.src; lb.hidden = false; }));
}
async function loadPosts() {
  try {
    POSTS = await api('/api/posts'); PF.posts = POSTS;
    setSection('posts', POSTS.length > 0);
    renderStats();
    renderPosts();
  } catch { $('#feed').innerHTML = '<div class="empty" style="column-span:all">Couldn\'t load posts.</div>'; }
}
$('#lightbox').addEventListener('click', () => ($('#lightbox').hidden = true));
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#lightbox').hidden = true; });

/* ---------- resume ---------- */
async function loadResume() {
  try {
    const r = await api('/api/resume');
    if (!r.available) {
      setSection('resume', false); $('#heroResume').hidden = true; // nothing to show, so hide it
      return;
    }
    setSection('resume', true); $('#heroResume').hidden = false;
    $('#resumeTitle').textContent = r.label || 'Resume';
    $('#resumeMeta').textContent = `${r.ext.toUpperCase()} · ${fmtSize(r.size)} · Updated ${fmtDate(r.updatedAt)}`;
    if (r.ext === 'pdf') $('#resumePreview').innerHTML = '<iframe src="/resume/view#toolbar=0&navpanes=0" title="Resume preview" loading="lazy"></iframe>';
    else { $('#resumePreview').innerHTML = '<div class="none">Preview is available for PDF files.<br>Use Download to open it.</div>'; $('#resumeView').style.display = 'none'; }
  } catch { /* leave defaults */ }
}

/* ---------- hide what is empty ---------- */
let GH_FOLLOWERS = 0, statSig = '';
function renumber() {
  let n = 0;
  $$('main .section').forEach((sec) => {
    if (sec.hidden) return;
    n++;
    const e = sec.querySelector('.eyebrow'); if (!e) return;
    e.textContent = String(n).padStart(2, '0') + ' — ' + e.textContent.split('—').slice(1).join('—').trim();
  });
}
function setSection(id, show) {
  const s = document.getElementById(id); if (!s) return;
  s.hidden = !show;
  $$('#navLinks a[href="#' + id + '"], .dots a[data-id="' + id + '"]').forEach((a) => (a.hidden = !show));
  renumber();
}
PF.setSection = setSection;
// only numbers above zero are shown; with none, the whole row disappears
function renderStats() {
  const f = (PROFILE && PROFILE.followers) || {};
  const show = (PROFILE && PROFILE.statsShow) || {};
  const custom = ((PROFILE && PROFILE.customStats) || []).filter((c) => c.label && String(c.value).trim() && String(c.value).trim() !== '0');
  const ov = (PROFILE && PROFILE.statsOverride) || {};
  // a value typed in the admin panel replaces the real one; blank means "use the real value"
  // typed values may be plain numbers (they count up) or text such as "300+" / "1.2K" (shown as written)
  const val = (k, real, typedOnly) => {
    const o = String(typedOnly ? real ?? '' : ov[k] ?? '').trim();
    if (!o) return typedOnly ? 0 : real;
    return /^\d[\d,]*$/.test(o) ? +o.replace(/,/g, '') : o;
  };
  const items = [
    show.projects !== false && ['Projects', val('projects', REPOS.length)],
    show.posts !== false && ['Posts shared', val('posts', POSTS.length)],
    show.githubFollowers !== false && ['GitHub followers', val('githubFollowers', GH_FOLLOWERS)],
    ['LinkedIn followers', val('', f.linkedin, true)],
    ['Instagram followers', val('', f.instagram, true)],
    // typed-in numbers count up; text like "5+" is shown as written
    ...custom.map((c) => [c.label, /^\d[\d,]*$/.test(c.value.trim()) ? +c.value.replace(/,/g, '') : c.value.trim()])
  ].filter((x) => x && (typeof x[1] === 'string' ? x[1] !== '' : x[1] > 0));
  const sig = JSON.stringify(items);
  if (sig === statSig) return;
  statSig = sig;
  const row = $('#statsRow');
  row.hidden = !items.length;
  row.innerHTML = items.map(([l, v]) => '<article class="card stat reveal"><div class="num">' + (typeof v === 'number' ? '0' : esc(v)) + '</div><div class="muted">' + esc(l) + '</div></article>').join('');
  $$('.stat', row).forEach((c, i) => { if (typeof items[i][1] === 'number') countWhenSeen($('.num', c), items[i][1]); });
  observeReveals();
}

/* ---------- boot ---------- */
api('/api/profile').then(renderProfile).catch(() => {}).finally(observeReveals);
loadRepos(); loadPosts(); loadResume();
})();
