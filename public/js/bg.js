/* Interactive background: a flowing "liquid aurora" (domain-warped noise) rendered in WebGL.
   It drifts on its own, bends toward the cursor / finger, flares when you move fast,
   shifts with scroll and follows the light/dark theme. Falls back to the CSS glow if WebGL is unavailable. */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.id = 'bg';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uEnergy; uniform float uLight; uniform float uScroll;

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
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes;
    float asp = uRes.x / uRes.y;
    vec2 p = (uv - .5) * vec2(asp, 1.) * 1.7;
    p.y += uScroll * .7;
    vec2 m = (uMouse - .5) * vec2(asp, 1.) * 1.7;
    float d = length(p - m);

    // the liquid is pulled toward the cursor, harder when you move fast
    p -= (p - m) * exp(-d * d * 2.2) * (.22 + .35 * uEnergy);

    float t = uTime * .055;
    vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3. * q + vec2(1.7, 9.2) + t * 1.5), fbm(p + 3. * q + vec2(8.3, 2.8) - t));
    float f = fbm(p + 3. * r);

    // ---- dark palette: ink + violet + lime ----
    vec3 violet = vec3(.36, .24, 1.), lime = vec3(.71, 1., .23), cyan = vec3(.1, .6, .9);
    vec3 dk = vec3(.028, .028, .042);
    dk += violet * smoothstep(.34, .90, f) * .50 * (.30 + .75 * q.x);
    dk += cyan   * smoothstep(.50, .98, q.y * f * 1.7) * .14;
    dk += lime   * smoothstep(.58, .99, r.y) * .17 * q.y;
    dk += (violet * .55 + lime * .34) * exp(-d * d * 4.) * (.22 + .5 * uEnergy);    // cursor glow
    dk = min(dk, vec3(.55, .5, .62));                                               // never so bright that text suffers
    dk *= 1. - .45 * dot(uv - .5, uv - .5);                                         // vignette

    // ---- light palette: warm paper + soft pastel ink ----
    vec3 lt = vec3(.965, .963, .945);
    lt = mix(lt, vec3(.76, .70, 1.0), smoothstep(.38, .92, f) * .55 * (.5 + q.x));
    lt = mix(lt, vec3(1., .78, .86), smoothstep(.6, 1., r.y) * .30);
    lt = mix(lt, vec3(.80, .93, .55), exp(-d * d * 5.) * (.22 + .3 * uEnergy));

    vec3 col = mix(dk, lt, uLight);
    col += (hash(gl_FragCoord.xy + fract(uTime)) - .5) * .018;                      // film grain
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
  ['uRes', 'uTime', 'uMouse', 'uEnergy', 'uLight', 'uScroll'].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

  document.body.prepend(canvas);
  document.documentElement.classList.add('bg-on');

  // render at reduced resolution (it's a soft blur anyway) — big perf win
  const SCALE = innerWidth < 760 ? 0.45 : 0.5;
  function resize() {
    canvas.width = Math.max(2, Math.round(innerWidth * SCALE));
    canvas.height = Math.max(2, Math.round(innerHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (reduce) frame(performance.now());
  }
  addEventListener('resize', resize);

  const mouse = { x: 0.5, y: 0.5 }, target = { x: 0.7, y: 0.55 };
  let energy = 0, last = performance.now(), lastMove = 0, light = 0, px = null, py = null;
  addEventListener('pointermove', (e) => {
    const nx = e.clientX / innerWidth, ny = 1 - e.clientY / innerHeight;
    if (px !== null) energy = Math.min(1, Math.max(energy, Math.hypot(nx - px, ny - py) * 14));
    px = nx; py = ny; target.x = nx; target.y = ny; lastMove = performance.now();
  }, { passive: true });
  addEventListener('pointerdown', () => { energy = 1; }, { passive: true });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // when nobody is touching it, the light wanders by itself so the page always feels alive
    if (now - lastMove > 3500) {
      const s = now / 1000;
      target.x = 0.5 + 0.32 * Math.sin(s * 0.27) + 0.1 * Math.sin(s * 0.7);
      target.y = 0.5 + 0.28 * Math.cos(s * 0.21);
    }
    mouse.x += (target.x - mouse.x) * Math.min(1, dt * 4);
    mouse.y += (target.y - mouse.y) * Math.min(1, dt * 4);
    energy *= Math.pow(0.12, dt);
    const wantLight = document.documentElement.dataset.theme === 'light' ? 1 : 0;
    light += (wantLight - light) * Math.min(1, dt * 5);

    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, reduce ? 12 : now / 1000);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);
    gl.uniform1f(U.uEnergy, reduce ? 0 : energy);
    gl.uniform1f(U.uLight, light);
    gl.uniform1f(U.uScroll, scrollY / Math.max(1, innerHeight));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  resize();
  if (reduce) {
    // static frame only; redraw when the theme is switched
    new MutationObserver(() => { light = document.documentElement.dataset.theme === 'light' ? 1 : 0; frame(performance.now()); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    frame(performance.now());
    return;
  }
  (function loop(now) { frame(now); requestAnimationFrame(loop); })(performance.now());
})();
