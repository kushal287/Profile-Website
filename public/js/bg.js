/* Full-page interactive background — a "liquid aurora" in WebGL.
   • flows by itself, and the whole page shares it (fixed behind every section)
   • bends toward your cursor / finger and leaves a glowing fluid trail
   • click or tap sends a ripple through the liquid
   • colours travel with your scroll position: violet at the top → blue → magenta/amber → teal/lime at the bottom
   • renders at reduced resolution, adapts to slow devices, pauses in hidden tabs, respects reduced-motion.
   If WebGL is unavailable the CSS glow stays. */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 760;

  function start() {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', depth: false, stencil: false });
    if (!gl) return;

    const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uEnergy; uniform float uLight; uniform float uProg;
    uniform vec3 uTrail[8]; uniform vec4 uRip[3];

    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
    }
    float fbm(vec2 p){
      float v = 0., a = .5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(1.7, 9.2); a *= .5; }
      return v;
    }
    vec3 pick(vec3 a, vec3 b, vec3 c, vec3 d, float t){
      t = clamp(t, 0., 1.) * 3.;
      if (t < 1.) return mix(a, b, smoothstep(0., 1., t));
      if (t < 2.) return mix(b, c, smoothstep(0., 1., t - 1.));
      return mix(c, d, smoothstep(0., 1., t - 2.));
    }
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float asp = uRes.x / uRes.y;
      vec2 pc = (uv - .5) * vec2(asp, 1.) * 1.7;             // screen space (for the cursor effects)
      vec2 p = pc + vec2(0., uProg * 2.4);                    // the liquid scrolls with the page
      vec2 m = (uMouse - .5) * vec2(asp, 1.) * 1.7;
      float d = length(pc - m);

      // palette travels with scroll progress
      vec3 c1 = pick(vec3(.36, .24, 1.), vec3(.10, .52, .96), vec3(.86, .26, .74), vec3(.10, .78, .62), uProg);
      vec3 c2 = pick(vec3(.71, 1., .23), vec3(.46, .30, 1.), vec3(1., .66, .22), vec3(.71, 1., .23), uProg);

      // liquid pulled toward the cursor, harder when you move fast
      p -= (pc - m) * exp(-d * d * 2.2) * (.22 + .35 * uEnergy);
      float glow = exp(-d * d * 4.) * (.22 + .5 * uEnergy);

      // fluid trail left by the pointer
      for (int i = 0; i < 8; i++) {
        vec2 q = (uTrail[i].xy - .5) * vec2(asp, 1.) * 1.7;
        vec2 dv = pc - q; float dd = dot(dv, dv);
        glow += uTrail[i].z * exp(-dd * 16.) * .5;
        p -= dv * exp(-dd * 9.) * uTrail[i].z * .12;
      }
      // click / tap ripples
      for (int i = 0; i < 3; i++) {
        float age = uRip[i].z;
        if (age >= 0.) {
          vec2 q = (uRip[i].xy - .5) * vec2(asp, 1.) * 1.7;
          vec2 dv = pc - q; float dr = length(dv);
          float ring = exp(-pow((dr - age * 1.1) * 7., 2.)) * exp(-age * 1.5);
          glow += ring * .9;
          p += normalize(dv + 1e-4) * ring * .12;
        }
      }

      float t = uTime * .055 + uProg * 3.;
      vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p + 3. * q + vec2(1.7, 9.2) + t * 1.5), fbm(p + 3. * q + vec2(8.3, 2.8) - t));
      float f = fbm(p + 3. * r);

      // ---- dark ----
      vec3 dk = vec3(.028, .028, .042);
      dk += c1 * smoothstep(.34, .90, f) * .50 * (.30 + .75 * q.x);
      dk += vec3(.10, .55, .90) * smoothstep(.50, .98, q.y * f * 1.7) * .12;
      dk += c2 * smoothstep(.58, .99, r.y) * .17 * q.y;
      dk += (c1 * .55 + c2 * .34) * glow;
      dk = min(dk, vec3(.58, .54, .64));                       // never so bright that text suffers
      dk *= 1. - .45 * dot(uv - .5, uv - .5);

      // ---- light ----
      vec3 lt = vec3(.965, .963, .945);
      lt = mix(lt, mix(vec3(1.), c1, .42), smoothstep(.38, .92, f) * .55 * (.5 + q.x));
      lt = mix(lt, mix(vec3(1.), c2, .45), smoothstep(.6, 1., r.y) * .30);
      lt = mix(lt, mix(vec3(1.), c2, .55), clamp(glow, 0., 1.) * .45);

      vec3 col = mix(dk, lt, uLight);
      col += (hash(gl_FragCoord.xy + fract(uTime)) - .5) * .018;   // film grain
      gl_FragColor = vec4(col, 1.);
    }`;

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uRes', 'uTime', 'uMouse', 'uEnergy', 'uLight', 'uProg', 'uTrail', 'uRip'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    document.body.prepend(canvas);
    document.documentElement.classList.add('bg-on');

    // render at reduced resolution (it is a soft blur anyway) — and drop further if the device struggles
    let scale = small ? 0.36 : 0.5;
    function resize() {
      canvas.width = Math.max(2, Math.round(innerWidth * scale));
      canvas.height = Math.max(2, Math.round(innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    addEventListener('resize', () => { resize(); if (reduce) frame(performance.now()); });

    const mouse = { x: 0.5, y: 0.5 }, target = { x: 0.7, y: 0.55 };
    const trail = new Float32Array(24);   // 8 × (x, y, strength)
    const rip = new Float32Array(12);     // 3 × (x, y, age, -)
    for (let i = 0; i < 3; i++) rip[i * 4 + 2] = -1;
    let energy = 0, last = performance.now(), lastMove = 0, light = 0, px = null, py = null, ti = 0, lastTrail = 0, ri = 0;
    const ripBirth = [0, 0, 0];

    function point(cx, cy, now, spark) {
      const nx = cx / innerWidth, ny = 1 - cy / innerHeight;
      if (px !== null) energy = Math.min(1, Math.max(energy, Math.hypot(nx - px, ny - py) * 14));
      px = nx; py = ny; target.x = nx; target.y = ny; lastMove = now;
      if (spark || now - lastTrail > 45) {          // drop a glowing blob every ~45 ms
        lastTrail = now; trail[ti * 3] = nx; trail[ti * 3 + 1] = ny; trail[ti * 3 + 2] = 1; ti = (ti + 1) % 8;
      }
    }
    function ripple(cx, cy, now) {
      rip[ri * 4] = cx / innerWidth; rip[ri * 4 + 1] = 1 - cy / innerHeight; rip[ri * 4 + 2] = 0; ripBirth[ri] = now; ri = (ri + 1) % 3;
      energy = 1;
    }
    addEventListener('pointermove', (e) => point(e.clientX, e.clientY, performance.now()), { passive: true });
    addEventListener('pointerdown', (e) => { ripple(e.clientX, e.clientY, performance.now()); point(e.clientX, e.clientY, performance.now(), true); }, { passive: true });
    // finger drags keep firing touchmove even while the page scrolls
    addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY, performance.now()); }, { passive: true });

    let slow = 0, frames = 0, skip = false;
    function frame(now) {
      const dtRaw = (now - last) / 1000, dt = Math.min(0.05, dtRaw); last = now;
      // adaptive quality: if frames are slow for a while, render fewer pixels
      if (!reduce && dtRaw > (small ? 0.062 : 0.034)) { if (++slow > 25 && scale > 0.26) { scale = Math.max(0.26, scale - 0.07); slow = 0; resize(); } } else if (slow > 0) slow--;
      frames++;

      if (now - lastMove > 3500) {           // nobody touching it: the light wanders on its own
        const s = now / 1000;
        target.x = 0.5 + 0.32 * Math.sin(s * 0.27) + 0.1 * Math.sin(s * 0.7);
        target.y = 0.5 + 0.28 * Math.cos(s * 0.21);
      }
      mouse.x += (target.x - mouse.x) * Math.min(1, dt * 4);
      mouse.y += (target.y - mouse.y) * Math.min(1, dt * 4);
      energy *= Math.pow(0.12, dt);
      const decay = Math.pow(0.18, dt);       // trail fades in about a second
      for (let i = 0; i < 8; i++) trail[i * 3 + 2] *= decay;
      for (let i = 0; i < 3; i++) { if (rip[i * 4 + 2] >= 0) { rip[i * 4 + 2] = (now - ripBirth[i]) / 1000; if (rip[i * 4 + 2] > 2.2) rip[i * 4 + 2] = -1; } }
      const wantLight = document.documentElement.dataset.theme === 'light' ? 1 : 0;
      light += (wantLight - light) * Math.min(1, dt * 5);
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);

      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, reduce ? 12 : now / 1000);
      gl.uniform2f(U.uMouse, mouse.x, mouse.y);
      gl.uniform1f(U.uEnergy, reduce ? 0 : energy);
      gl.uniform1f(U.uLight, light);
      gl.uniform1f(U.uProg, Math.min(1, Math.max(0, scrollY / maxScroll)));
      gl.uniform3fv(U.uTrail, trail);
      gl.uniform4fv(U.uRip, rip);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    resize();
    if (reduce) {
      // static frame only; redraw when the theme or scroll position changes
      const redraw = () => { light = document.documentElement.dataset.theme === 'light' ? 1 : 0; frame(performance.now()); };
      new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      addEventListener('scroll', redraw, { passive: true });
      redraw();
      return;
    }
    (function loop(now) {
      // phones render every other frame (30 fps) to save battery
      if (!small || (skip = !skip)) frame(now);
      requestAnimationFrame(loop);
    })(performance.now());
  }

  // start after the page has painted, so the background never delays first content
  const go = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1200 }) : setTimeout(start, 200));
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
})();
