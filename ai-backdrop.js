/*!
 * ai-backdrop.js — drop-in ambient background layer.
 * Vanilla JS + 2D Canvas, no dependencies.
 *
 * Usage (pick one):
 *   <script src="ai-backdrop.js" data-variant="nodes"></script>   // auto-mounts
 *   AIBackdrop.set('flow');                                       // or from JS
 *   AIBackdrop.set('nodes', { count: 120, opacity: 0.5 });        // with overrides
 *   AIBackdrop.destroy();                                         // remove layer
 *
 * The layer is position:fixed, inset:0, z-index:-1, pointer-events:none,
 * fully transparent — it sits on top of your page background and under content.
 * NOTE: if BOTH html and body have opaque backgrounds, body's background paints
 * over negative-z-index layers. This script sets body background to transparent
 * (html's background still fills the viewport, so the page looks identical).
 * Respects prefers-reduced-motion (renders one static frame, no animation).
 * Pauses when the tab is hidden. Frame rate capped. Particle counts scale
 * down automatically on small screens.
 */
(function () {
  'use strict';

  /* ============================ CONFIG ============================ */

  // Variant 1 — particle node network (neural-net look)
  var NODES_CONFIG = {
    color: '26,26,26',      // RGB of dots + lines on light theme (site ink)
    colorDark: '247,244,237', // RGB used when AIBackdrop.setTheme('dark') is active
    accent: '16,185,129',   // RGB of occasional highlighted nodes (site emerald)
    accentRatio: 0.10,      // fraction of nodes tinted with the accent (0–1)
    count: 90,              // node count at ~1440×900; auto-scales with viewport area
    speed: 0.14,            // drift speed in px/frame — keep well under 0.3 for "breathing"
    linkDist: 140,          // px distance under which two nodes get a connecting line
    dotAlpha: 0.55,         // alpha of dots (before master opacity)
    lineAlpha: 0.30,        // max alpha of lines at zero distance (before master opacity)
    opacity: 0.65           // master layer opacity — overall visual weight
  };

  // Variant 2 — flow field (particles streaming along a vector field, faint trails)
  var FLOW_CONFIG = {
    color: '26,26,26',      // RGB of trail strokes (light theme)
    colorDark: '247,244,237', // RGB of trail strokes on dark theme
    accent: '16,185,129',   // RGB of a few accent-colored streams
    accentRatio: 0.08,      // fraction of accent-colored particles
    count: 220,             // particle count at ~1440×900; auto-scales with viewport area
    speed: 0.35,            // stream speed in px/frame
    scale: 0.0016,          // field frequency — smaller = broader, calmer swirls
    fade: 0.035,            // per-frame trail fade (0.02 long ghostly trails … 0.08 short)
    strokeAlpha: 0.20,      // alpha of each trail segment (before master opacity)
    opacity: 0.85           // master layer opacity
  };

  // Variant 3 — aurora / gradient mesh (soft blurred blobs drifting)
  var AURORA_CONFIG = {
    // Each blob: [r,g,b], base x/y (0–1 of viewport), radius (fraction of min side)
    blobs: [
      { color: [16, 185, 129], x: 0.20, y: 0.30, r: 0.55 }, // emerald
      { color: [45, 212, 191], x: 0.80, y: 0.25, r: 0.50 }, // teal
      { color: [163, 190, 140], x: 0.70, y: 0.80, r: 0.60 }, // sage
      { color: [16, 185, 129], x: 0.25, y: 0.85, r: 0.45 }  // emerald (low)
    ],
    drift: 0.14,            // how far blobs wander, as fraction of viewport (0–0.3)
    speed: 0.05,            // wander speed — cycles per ~2 minutes at 0.05
    blobAlpha: 0.5,         // gradient core alpha (before master opacity)
    opacity: 0.3            // master layer opacity — keep low, blobs are large
  };

  /* ========================= END CONFIG =========================== */

  var FPS_CAP = 30;               // max frames per second
  var REF_AREA = 1440 * 900;      // particle counts are tuned for this viewport area

  var canvas = null, ctx = null, raf = 0, lastFrame = 0, t0 = 0;
  var currentName = null, variant = null, reduced = false, running = false;
  var baseOpacity = 1, intensity = 1, energy = 0, everMounted = false;
  var themeMode = 'light';
  function ink(cfg) { return (themeMode === 'dark' && cfg.colorDark) ? cfg.colorDark : cfg.color; }
  var mqReduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function applyOpacity() { if (canvas) canvas.style.opacity = (baseOpacity * intensity).toFixed(3); }

  function dpr() { return Math.min(window.devicePixelRatio || 1, 1.5); }
  function scaleCount(n) {
    var area = window.innerWidth * window.innerHeight;
    return Math.max(12, Math.round(n * Math.min(1, area / REF_AREA)));
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------- variant: nodes ---------- */
  function makeNodes(cfg) {
    var pts = [];
    function seed(w, h) {
      pts = [];
      var n = scaleCount(cfg.count);
      for (var i = 0; i < n; i++) {
        pts.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: rand(-1, 1) * cfg.speed, vy: rand(-1, 1) * cfg.speed,
          r: rand(1, 2.1), a: Math.random() < cfg.accentRatio
        });
      }
    }
    function draw(w, h, dt) {
      ctx.clearRect(0, 0, w, h);
      var i, j, p, q, d2, ld = cfg.linkDist, ld2 = ld * ld, inkCol = ink(cfg);
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        var sm = 1 + (draw.energy || 0) * 1.2; // pulse: brief drift speed-up
        p.x += p.vx * dt * sm; p.y += p.vy * dt * sm;
        if (p.x < -ld) p.x = w + ld; else if (p.x > w + ld) p.x = -ld;
        if (p.y < -ld) p.y = h + ld; else if (p.y > h + ld) p.y = -ld;
      }
      ctx.lineWidth = 1;
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        for (j = i + 1; j < pts.length; j++) {
          q = pts[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          d2 = dx * dx + dy * dy;
          if (d2 < ld2) {
            var a = (1 - Math.sqrt(d2) / ld) * cfg.lineAlpha * (1 + (draw.energy || 0) * 0.8);
            ctx.strokeStyle = 'rgba(' + ((p.a && q.a) ? cfg.accent : inkCol) + ',' + a.toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        ctx.fillStyle = 'rgba(' + (p.a ? cfg.accent : inkCol) + ',' + (p.a ? cfg.dotAlpha * 1.6 : cfg.dotAlpha) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
    }
    return {
      resize: seed,
      step: function (w, h, dt, t, e) { draw.energy = e; draw(w, h, dt); },
      still: function (w, h) { draw.energy = 0; draw(w, h, 0); }
    };
  }

  /* ---------- variant: flow field ---------- */
  function makeFlow(cfg) {
    var pts = [];
    function spawn(w, h) {
      return { x: Math.random() * w, y: Math.random() * h, life: rand(80, 400), a: Math.random() < cfg.accentRatio };
    }
    function seed(w, h) {
      pts = [];
      var n = scaleCount(cfg.count);
      for (var i = 0; i < n; i++) pts.push(spawn(w, h));
      ctx.clearRect(0, 0, w, h);
    }
    // layered-sine pseudo-noise vector field, drifts slowly over time
    function angle(x, y, t) {
      var s = cfg.scale;
      return Math.sin(x * s + t * 0.00006) * 1.7
           + Math.cos(y * s * 1.3 - t * 0.00004) * 1.7
           + Math.sin((x + y) * s * 0.5 + t * 0.00003) * 1.2;
    }
    function step(w, h, dt, t) {
      // fade existing trails toward transparent
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + cfg.fade + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1;
      var inkCol = ink(cfg);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var a = angle(p.x, p.y, t);
        var nx = p.x + Math.cos(a) * cfg.speed * dt;
        var ny = p.y + Math.sin(a) * cfg.speed * dt;
        ctx.strokeStyle = 'rgba(' + (p.a ? cfg.accent : inkCol) + ',' + (p.a ? cfg.strokeAlpha * 1.8 : cfg.strokeAlpha) + ')';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
        p.x = nx; p.y = ny; p.life -= dt;
        if (p.life <= 0 || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) pts[i] = spawn(w, h);
      }
    }
    return {
      resize: seed,
      step: step,
      still: function (w, h) { // draw a static field of short strokes
        ctx.clearRect(0, 0, w, h);
        for (var k = 0; k < 40; k++) step(w, h, 2, 0);
      }
    };
  }

  /* ---------- variant: aurora ---------- */
  function makeAurora(cfg) {
    var off = document.createElement('canvas'), octx = off.getContext('2d');
    var phases = cfg.blobs.map(function (_, i) { return i * 2.399; }); // golden-angle offsets
    function seed(w, h) {
      off.width = Math.max(60, Math.round(w / 12));
      off.height = Math.max(40, Math.round(h / 12));
    }
    function step(w, h, dt, t) {
      var ow = off.width, oh = off.height, m = Math.min(ow, oh);
      octx.clearRect(0, 0, ow, oh);
      for (var i = 0; i < cfg.blobs.length; i++) {
        var b = cfg.blobs[i], ph = phases[i];
        var tt = t * 0.001 * cfg.speed;
        var x = (b.x + Math.sin(tt + ph) * cfg.drift + Math.sin(tt * 0.63 + ph * 2) * cfg.drift * 0.4) * ow;
        var y = (b.y + Math.cos(tt * 0.8 + ph) * cfg.drift + Math.cos(tt * 0.51 + ph * 3) * cfg.drift * 0.4) * oh;
        var r = b.r * m * (1 + 0.12 * Math.sin(tt * 1.3 + ph));
        var g = octx.createRadialGradient(x, y, 0, x, y, Math.max(4, r));
        var c = b.color.join(',');
        g.addColorStop(0, 'rgba(' + c + ',' + cfg.blobAlpha + ')');
        g.addColorStop(1, 'rgba(' + c + ',0)');
        octx.fillStyle = g;
        octx.fillRect(0, 0, ow, oh);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, w, h); // upscaling the tiny buffer = cheap giant blur
    }
    return { resize: seed, step: step, still: function (w, h) { step(w, h, 0, 0); } };
  }

  var FACTORIES = { nodes: [makeNodes, NODES_CONFIG], flow: [makeFlow, FLOW_CONFIG], aurora: [makeAurora, AURORA_CONFIG] };

  /* ---------- layer plumbing ---------- */
  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('data-ai-backdrop', '');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;display:block;background:transparent;transition:opacity 1.4s ease;opacity:0;';
    ctx = canvas.getContext('2d');
    themeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    // if both html and body paint a background, body's covers z-index:-1 layers —
    // make body transparent; html's background still fills the viewport unchanged.
    var htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    var bodyBg = getComputedStyle(document.body).backgroundColor;
    if (htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent' &&
        bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
      document.body.style.background = 'transparent';
    }
    document.body.insertBefore(canvas, document.body.firstChild);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    if (mqReduced) {
      reduced = mqReduced.matches;
      var onMq = function (e) { reduced = e.matches; restart(); };
      if (mqReduced.addEventListener) mqReduced.addEventListener('change', onMq);
      else if (mqReduced.addListener) mqReduced.addListener(onMq);
    }
  }
  function size() {
    var d = dpr(), w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { w: w, h: h };
  }
  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (variant) { var s = size(); variant.resize(s.w, s.h); if (reduced) variant.still(s.w, s.h); } }, 150);
  }
  function onVis() {
    if (document.hidden) stopLoop();
    else if (variant && !reduced) startLoop();
  }
  function stopLoop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function startLoop() {
    if (running) return;
    running = true;
    lastFrame = 0;
    raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!t0) t0 = now;
    var minInterval = 1000 / FPS_CAP;
    if (now - lastFrame < minInterval) return;
    var dt = lastFrame ? Math.min((now - lastFrame) / (1000 / 60), 3) : 1; // in 60fps-frame units, clamped
    lastFrame = now;
    if (energy > 0.005) energy *= Math.pow(0.94, dt); else energy = 0;
    variant.step(window.innerWidth, window.innerHeight, dt, now - t0, energy);
  }
  function restart() {
    if (!currentName) return;
    var name = currentName;
    currentName = null;
    set(name);
  }

  function set(name, overrides) {
    if (!FACTORIES[name]) { console.warn('[AIBackdrop] unknown variant:', name); return; }
    ensureCanvas();
    stopLoop();
    currentName = name;
    var f = FACTORIES[name];
    var cfg = f[1];
    if (overrides) { cfg = {}; for (var k in f[1]) cfg[k] = f[1][k]; for (var k2 in overrides) cfg[k2] = overrides[k2]; }
    baseOpacity = cfg.opacity;
    if (reduced) { canvas.style.transition = 'none'; }
    if (!everMounted && !reduced) {
      // entry: fade the layer in on first mount, with a settling burst of motion
      everMounted = true;
      energy = 1.4;
      canvas.style.opacity = '0';
      requestAnimationFrame(function () { requestAnimationFrame(applyOpacity); });
    } else {
      applyOpacity();
    }
    variant = f[0](cfg);
    var s = size();
    variant.resize(s.w, s.h);
    if (reduced) variant.still(s.w, s.h);
    else startLoop();
  }

  function destroy() {
    stopLoop();
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    canvas = null; ctx = null; variant = null; currentName = null;
  }

  window.AIBackdrop = {
    set: set,
    destroy: destroy,
    // transient energy burst — nodes drift faster and lines brighten, then settle (s ~ 0.3–1.5)
    pulse: function (s) { if (!reduced) energy = Math.min(2, Math.max(energy, s || 1)); },
    // persistent strength multiplier on the layer's opacity (1 = config value), smooth CSS fade
    setIntensity: function (m) { intensity = Math.max(0, Math.min(2, m == null ? 1 : m)); applyOpacity(); },
    // 'light' | 'dark' — swaps particle ink so the layer stays visible on dark backgrounds
    setTheme: function (m) {
      themeMode = m === 'dark' ? 'dark' : 'light';
      if (reduced && variant) variant.still(window.innerWidth, window.innerHeight);
    },
    get current() { return currentName; },
    variants: ['nodes', 'flow', 'aurora']
  };

  // auto-mount if the script tag declares data-variant="…"
  var me = document.currentScript;
  var auto = me && me.getAttribute('data-variant');
  if (auto) {
    if (document.body) set(auto);
    else document.addEventListener('DOMContentLoaded', function () { set(auto); });
  }
})();
