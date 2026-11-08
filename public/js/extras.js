/* Interactive extras: tech-stack explorer, language mix, live GitHub log, terminal,
   section dots, magnetic buttons and card tilt. Reads shared data from window.PF (set by app.js). */
(() => {
'use strict';
const PF = window.PF;
if (!PF) return;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoverOK = matchMedia('(hover:hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;

const colorFor = (name) => {
  const k = Object.keys(PF.colors).find((x) => x.toLowerCase() === String(name).toLowerCase());
  return k ? PF.colors[k] : null;
};
// which GitHub language (if any) a stack item refers to
const langOf = (name) => {
  const all = new Set(PF.repos.flatMap((r) => r.langs || []));
  return [...all].find((l) => l.toLowerCase() === String(name).toLowerCase()) || null;
};
const repoCount = (lang) => PF.repos.filter((r) => (r.langs || []).includes(lang)).length;
const goProjects = () => $('#projects').scrollIntoView({ behavior: 'smooth' });

/* ------------------------------------------------------------------ language mix */
function renderLangs() {
  const bar = $('#langBar'), legend = $('#langLegend');
  if (!bar) return;
  const langs = PF.languages || [];
  if (!langs.length) { bar.style.display = 'none'; legend.innerHTML = '<span class="muted small">Language data will appear once GitHub responds.</span>'; return; }
  bar.style.display = '';
  const col = (l) => colorFor(l.name) || (l.name === 'Other' ? '#6b6b78' : '#8b8b9a');
  bar.innerHTML = langs.map((l) => `<button class="seg" data-l="${esc(l.name)}" style="flex:${l.pct};background:${col(l)}" aria-label="${esc(l.name)} ${l.pct.toFixed(1)} percent" title="${esc(l.name)} · ${l.pct.toFixed(1)}%"></button>`).join('');
  legend.innerHTML = langs.map((l) => `<span class="lg" data-l="${esc(l.name)}"><i style="background:${col(l)}"></i>${esc(l.name)} <b>${l.pct.toFixed(1)}%</b></span>`).join('');
  const hot = (name, on) => {
    bar.classList.toggle('dim', on);
    $$('.seg,.lg').forEach((e) => e.classList.toggle('hot', on && e.dataset.l === name));
  };
  $$('#langBar .seg, #langLegend .lg').forEach((e) => {
    e.addEventListener('mouseenter', () => hot(e.dataset.l, true));
    e.addEventListener('mouseleave', () => hot('', false));
    e.addEventListener('click', () => {
      if (e.dataset.l === 'Other') return;
      PF.filterLang(e.dataset.l); goProjects();
    });
  });
}

/* ------------------------------------------------------------------ stack explorer */
let curTab = 0;
function renderStack() {
  const p = PF.profile;
  if (!p || !Array.isArray(p.tech) || !p.tech.length) return;
  if (curTab >= p.tech.length) curTab = 0;
  $('#stackTabs').innerHTML = p.tech.map((c, i) => `<button class="fbtn ${i === curTab ? 'on' : ''}" data-i="${i}">${esc(c.name)} <small>${c.items.length}</small></button>`).join('');
  $('#stackItems').innerHTML = p.tech[curTab].items.map((it, i) => {
    const lang = langOf(it.name), n = lang ? repoCount(lang) : 0, c = colorFor(it.name);
    return `<button class="tech" data-name="${esc(it.name)}" style="${c ? '--c:' + c + ';' : ''}animation-delay:${i * 45}ms">
      <span class="tech-name">${esc(it.name)}</span>
      ${n ? `<span class="tech-n">${n} repo${n > 1 ? 's' : ''}</span>` : ''}
      ${it.level ? `<span class="tech-bar" title="${it.level}%"><i style="width:${it.level}%"></i></span>` : ''}
    </button>`;
  }).join('');
}
$('#stackTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  curTab = +b.dataset.i; renderStack();
});
$('#stackItems').addEventListener('click', (e) => {
  const b = e.target.closest('.tech'); if (!b) return;
  const name = b.dataset.name, lang = langOf(name), hint = $('#stackHint');
  if (lang) {
    const n = PF.filterLang(lang);
    hint.textContent = `Showing ${n} project${n === 1 ? '' : 's'} that use${n === 1 ? 's' : ''} ${lang}.`;
    goProjects();
  } else {
    b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
    hint.textContent = `${name} isn't tied to a specific repository — it's part of how I work or what I'm learning.`;
  }
});

/* ------------------------------------------------------------------ live GitHub log */
const ago = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 86400 * 30) return Math.round(s / 86400) + 'd ago';
  if (s < 86400 * 365) return Math.round(s / (86400 * 30)) + 'mo ago';
  return Math.round(s / (86400 * 365)) + 'y ago';
};
async function loadActivity() {
  const box = $('#gitLog');
  try {
    const items = await (await fetch('/api/github/activity')).json();
    box.innerHTML = items.length ? items.map((i) => `<a class="log-row" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer"><code>${esc(i.sha || '·······')}</code><span class="msg">${esc(i.message)} <span class="muted">— ${esc(i.repo)}</span></span><span class="meta">${ago(i.date)}</span></a>`).join('')
      : '<div class="muted small">No recent public activity to show.</div>';
  } catch { box.innerHTML = '<div class="muted small">Couldn\'t reach GitHub right now.</div>'; }
}

/* ------------------------------------------------------------------ terminal */
function initTerminal() {
  const out = $('#termOut'), inp = $('#termIn'), body = $('#termBody');
  const hist = []; let hi = 0;
  const print = (t, cls = '') => { const d = document.createElement('div'); d.className = 'ln ' + cls; d.textContent = t; out.appendChild(d); body.scrollTop = body.scrollHeight; };
  const printHtml = (h, cls = '') => { const d = document.createElement('div'); d.className = 'ln ' + cls; d.innerHTML = h; out.appendChild(d); body.scrollTop = body.scrollHeight; };
  const link = (u, label) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || u)}</a>`;
  const P = () => PF.profile || { name: 'Kushal', socials: {}, tech: [], bio: [], education: {} };
  const SECTIONS = ['home', 'about', 'stack', 'projects', 'posts', 'resume', 'contact'];

  const cmds = {
    help() {
      print('Available commands:', 'ok');
      [['whoami', 'who I am'], ['about', 'my story'], ['stack', 'tech by category'], ['langs', 'language mix from my GitHub'],
        ['projects', 'my repositories'], ['posts', 'latest posts'], ['resume', 'resume info'], ['contact', 'where to find me'],
        ['open <name>', 'github | linkedin | instagram | resume | <project>'], ['cd <section>', SECTIONS.join(' ')],
        ['neofetch', 'system-style summary'], ['theme [dark|light]', 'switch theme'], ['clear', 'clear the screen']]
        .forEach(([c, d]) => print('  ' + c.padEnd(22) + d));
      print('Tab autocompletes · ↑/↓ browse history · press / anywhere to jump here', 'dim');
    },
    whoami() {
      const p = P();
      print(p.name, 'ok'); print(p.headline || ''); print(`${p.education.degree || ''} · ${p.education.school || ''}`);
      print(`${p.location || ''} — ${p.status || ''}`, 'dim');
    },
    about() { (P().bio || []).forEach((b) => { print(b); print(''); }); },
    stack() {
      const t = P().tech || [];
      if (!t.length) return print('No stack listed yet.', 'dim');
      t.forEach((c) => print(c.name.padEnd(18) + c.items.map((i) => i.name).join(', ')));
    },
    langs() {
      const l = PF.languages || [];
      if (!l.length) return print('No language data yet.', 'dim');
      l.forEach((x) => { const n = Math.max(1, Math.round(x.pct / 5)); print(x.name.padEnd(12) + '█'.repeat(n) + '░'.repeat(20 - n) + ' ' + x.pct.toFixed(1) + '%'); });
    },
    projects() {
      if (!PF.repos.length) return print('No projects loaded yet.', 'dim');
      PF.repos.forEach((r, i) => print(`${String(i + 1).padStart(2)}. ${r.name}  [${(r.langs && r.langs[0]) || r.language || '—'}]  ${r.description || ''}`));
      print('Tip: open <project-name> to visit one.', 'dim');
    },
    posts() {
      if (!PF.posts.length) return print('No posts yet.', 'dim');
      PF.posts.slice(0, 3).forEach((p) => print('• ' + (p.text || '(attachment)').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 90)));
    },
    async resume() {
      try {
        const r = await (await fetch('/api/resume')).json();
        if (!r.available) return print('Resume not uploaded yet.', 'dim');
        printHtml('Resume: ' + link('/resume/download', 'download') + ' · ' + link('/resume/view', 'view'));
      } catch { print('Could not check the resume.', 'err'); }
    },
    contact() {
      const s = P().socials || {};
      Object.keys(s).filter((k) => s[k]).forEach((k) => printHtml(k.padEnd(11) + link(s[k])));
    },
    neofetch() {
      const p = P(), l = (PF.languages || []).filter((x) => x.name !== 'Other').slice(0, 4).map((x) => x.name).join(', ');
      [['', 'kushal@portfolio'], ['', '----------------'], ['Name', p.name], ['Role', p.headline], ['School', (p.education.school || '').replace(/\s*\(.*\)/, '') + ', ' + (p.location || '')],
        ['Languages', l || '—'], ['Repos', PF.repos.length + ' public'], ['Status', p.status], ['Theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark']]
        .forEach(([k, v]) => print(k ? k.padEnd(11) + v : v, k ? '' : 'ok'));
    },
    open(arg) {
      const t = (arg || '').toLowerCase().trim();
      if (!t) return print('usage: open <github|linkedin|instagram|resume|project>', 'dim');
      let url = (P().socials || {})[t];
      if (t === 'resume') url = '/resume/view';
      if (!url) { const r = PF.repos.find((x) => [x.name.toLowerCase(), x.name.toLowerCase().replace(/[-_]/g, ' ')].includes(t)); url = r && r.url; }
      if (!url) return print(`open: nothing called "${arg}"`, 'err');
      print('Opening ' + url + ' …', 'dim'); window.open(url, '_blank', 'noopener');
    },
    cd(arg) {
      const t = (arg || '').replace(/^#|\/$/g, '').toLowerCase();
      if (!SECTIONS.includes(t)) return print('cd: sections are ' + SECTIONS.join(', '), 'err');
      document.getElementById(t).scrollIntoView({ behavior: 'smooth' });
    },
    ls() { print(SECTIONS.join('  ')); },
    theme(arg) {
      const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const want = arg === 'light' || arg === 'dark' ? arg : (cur === 'light' ? 'dark' : 'light');
      if (want !== cur) $('#themeBtn').click();
      print('theme → ' + want, 'ok');
    },
    date() { print(new Date().toString()); },
    echo(arg) { print(arg || ''); },
    clear() { out.innerHTML = ''; },
    sudo(arg) {
      if (/hire/i.test(arg || '')) { print('[sudo] password for recruiter: ********', 'dim'); print('Access granted. Great decision! 🎉  Try: contact', 'ok'); }
      else print('Nice try. This portfolio runs without root.', 'err');
    }
  };

  async function run(line) {
    const raw = line.trim(); if (!raw) return;
    const d = document.createElement('div'); d.className = 'ln cmd'; d.textContent = raw; out.appendChild(d);
    const [name, ...rest] = raw.split(/\s+/); const arg = rest.join(' ');
    const fn = cmds[name.toLowerCase()];
    if (fn) await fn(arg); else print(`command not found: ${name} — type "help"`, 'err');
    body.scrollTop = body.scrollHeight;
  }

  $('#termForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = inp.value; inp.value = '';
    if (v.trim()) { hist.push(v); hi = hist.length; }
    run(v);
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) inp.value = hist[--hi]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); inp.value = hi < hist.length - 1 ? hist[++hi] : (hi = hist.length, ''); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const v = inp.value.trim().toLowerCase(); if (!v || v.includes(' ')) return;
      const m = Object.keys(cmds).filter((c) => c.startsWith(v));
      if (m.length === 1) inp.value = m[0] + ' '; else if (m.length > 1) print(m.join('  '), 'dim');
    }
  });
  body.addEventListener('click', () => { if (!getSelection().toString()) inp.focus({ preventScroll: true }); });
  $$('#termHints button').forEach((b) => b.addEventListener('click', () => { hist.push(b.textContent); hi = hist.length; run(b.textContent); }));
  addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    $('#term').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => inp.focus({ preventScroll: true }), 500);
  });

  print('Welcome to my terminal 👋  Type "help" to see what it can do.', 'ok');
  print('Pssst — press / anywhere on the page to jump straight here.', 'dim');
}

/* ------------------------------------------------------------------ section dots */
function initDots() {
  const items = [['home', 'Home'], ['about', 'About'], ['stack', 'Stack'], ['projects', 'Projects'], ['posts', 'Posts'], ['resume', 'Resume'], ['contact', 'Contact']];
  const nav = document.createElement('nav'); nav.className = 'dots'; nav.setAttribute('aria-label', 'Sections');
  nav.innerHTML = items.map(([id, l]) => `<a href="#${id}" data-id="${id}" data-label="${l}" aria-label="${l}"></a>`).join('');
  document.body.appendChild(nav);
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) $$('a', nav).forEach((a) => a.classList.toggle('on', a.dataset.id === e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  items.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

/* ------------------------------------------------------------------ magnetic buttons + card tilt */
function initPointerFx() {
  if (!hoverOK) return;
  let mag = null, tilt = null;
  const reset = () => { if (mag) mag.style.translate = ''; if (tilt) tilt.style.transform = ''; mag = tilt = null; };
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const m = t.closest('.btn,.soc,.conn'), c = t.closest('.repo,.stat');
    if (mag && mag !== m) { mag.style.translate = ''; mag = null; }
    if (tilt && tilt !== c) { tilt.style.transform = ''; tilt = null; }
    if (m) {
      const r = m.getBoundingClientRect();
      m.style.translate = `${((e.clientX - r.left) / r.width - 0.5) * 10}px ${((e.clientY - r.top) / r.height - 0.5) * 8}px`; mag = m;
    }
    if (c) {
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      c.style.transform = `perspective(900px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg) translateY(-4px)`; tilt = c;
    }
  }, { passive: true });
  document.addEventListener('mouseleave', reset);
}

/* ------------------------------------------------------------------ boot */
addEventListener('pf:profile', renderStack);
addEventListener('pf:repos', () => { renderLangs(); renderStack(); });
if (PF.profile) renderStack();
if (PF.repos.length) { renderLangs(); renderStack(); }
loadActivity();
initTerminal();
initDots();
initPointerFx();
})();
