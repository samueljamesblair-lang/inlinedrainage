/* clog.js: the "Blocked drain?" figure.
   A glass pipe with a plug in it. Water queues up behind the plug; as the section scrolls
   through the viewport (or the figure is tapped) the plug breaks apart and the flow
   rushes through. Purely illustrative, no claims. Pauses offscreen; reduced motion gets
   one static, still-blocked frame. */
(function () {
  'use strict';
  var win = window, doc = document;
  var I = win.Inline;
  if (!I || !I.Path) return;
  var host = doc.querySelector('[data-clog]');
  if (!host) return;
  var canvas = host.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var u = I.u, TAU = Math.PI * 2;
  var section = host.closest('section');

  var w = 0, h = 0, dpr = 1, path = null, tw = 44, plugS = 0, bake = null;
  var parts = [], blobs = [], clear = 0, poke = 0, visible = false, coarse = !I.fine();

  function build() {
    w = host.clientWidth; h = host.clientHeight;
    if (!w || !h) return false;
    dpr = Math.min(win.devicePixelRatio || 1, coarse ? 1.5 : 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tw = u.clamp(h * 0.22, 40, 84);
    var f = [[-0.06, 0.7], [0.18, 0.62], [0.36, 0.38], [0.52, 0.44], [0.68, 0.68], [0.86, 0.54], [1.06, 0.46]];
    path = new I.Path(I.spline(f.map(function (p) { return [p[0] * w, p[1] * h]; }), 14), 3);
    plugS = path.len * 0.5;

    bake = doc.createElement('canvas');
    bake.width = canvas.width; bake.height = canvas.height;
    var bc = bake.getContext('2d');
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    I.drawPipe(bc, path, tw, false);

    var N = coarse ? 58 : 96, i;
    parts = [];
    for (i = 0; i < N; i++) {
      parts.push({ s: Math.random() * plugS * 0.96, v: 90 + Math.random() * 130, lat: (Math.random() - 0.5) * (tw - 9), hot: Math.random() < 0.5 });
    }
    blobs = [];
    var B = 13, rnd;
    for (i = 0; i < B; i++) {
      rnd = Math.random();
      blobs.push({
        ds: (Math.random() - 0.5) * tw * 1.5, dl: (Math.random() - 0.5) * tw * 0.5, r: tw * (0.2 + Math.random() * 0.2),
        t0: 0.02 + (i / B) * 0.5, vs: 0.6 + rnd * 1.8, vl: (Math.random() - 0.5) * 2.2
      });
    }
    return true;
  }

  function sectionClear() {
    var r = section.getBoundingClientRect(), vh = win.innerHeight;
    var vp = (vh - r.top) / (vh + r.height);
    return u.smooth((vp - 0.4) / 0.22);
  }

  function render(dt, animate) {
    if (!path) return;
    var target = Math.max(sectionClear(), poke);
    if (animate) clear += (target - clear) * (1 - Math.exp(-dt * 4.2)); else clear = target;
    var gate = 1 - clear, burst = Math.sin(u.clamp(clear, 0, 1) * Math.PI);
    var len = path.len, stopAt = plugS - tw * 0.8, i, p, q, sp, m, d;
    var S = I.scroll, boost = 1 + Math.min(1.6, (win.performance.now() - S.t < 160 ? Math.abs(S.vel) : 0) / 900);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bake, 0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    var red = [], white = [];
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      sp = p.v * boost;
      if (animate) {
        /* slow to a stop in front of the plug while it is closed; surge when it opens */
        m = 1;
        if (p.s < plugS) {
          m = 1 - gate * (1 - u.smooth((stopAt - p.s) / 150));
          if (p.s > stopAt - 4 && gate > 0.5) m = 0.02;
          if (Math.abs(p.s - plugS) < 260) m *= 1 + burst * 2.4;
        }
        p.s += sp * m * dt;
        if (p.s > len + 20) p.s = -Math.random() * 140;
        if (gate > 0.6 && p.s > plugS - tw * 0.6 && p.s < plugS + 4) p.s = Math.min(p.s, plugS - tw * 0.6 - Math.random() * 6);
      }
      q = path.at(p.s);
      var x = q.x + q.nx * p.lat, y = q.y + q.ny * p.lat, L = 12 + sp * 0.06;
      q = path.at(p.s - L);
      (p.hot ? red : white).push(x, y, q.x + q.nx * p.lat, q.y + q.ny * p.lat);
    }
    var set = function (arr, col, lw) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (var k = 0; k < arr.length; k += 4) { ctx.moveTo(arr[k], arr[k + 1]); ctx.lineTo(arr[k + 2], arr[k + 3]); }
      ctx.stroke();
    };
    set(red, 'rgba(255,48,25,.16)', 8);
    set(red, 'rgba(255,96,68,.96)', 2.4);
    set(white, 'rgba(255,255,255,.82)', 1.8);

    /* the plug */
    var pc = path.at(plugS), cx = pc.x, cy = pc.y, tx = -pc.ny, ty = pc.nx;   // tangent
    var nx = pc.nx, ny = pc.ny;
    for (i = 0; i < blobs.length; i++) {
      m = blobs[i];
      d = u.clamp((clear - m.t0) / 0.38, 0, 1);
      if (d >= 1) continue;
      var bx = cx + tx * (m.ds + m.vs * d * tw * 2.6) + nx * (m.dl + m.vl * d * tw * 1.1);
      var by = cy + ty * (m.ds + m.vs * d * tw * 2.6) + ny * (m.dl + m.vl * d * tw * 1.1);
      var br = m.r * (1 - d * 0.88);
      ctx.globalAlpha = 1 - d;
      ctx.fillStyle = '#150b0a';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,72,48,.55)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = 'rgba(255,48,25,.18)';
      ctx.beginPath(); ctx.arc(bx - br * 0.25, by - br * 0.3, br * 0.45, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (gate > 0.02) {
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, tw * 1.6);
      g.addColorStop(0, 'rgba(255,48,25,' + (0.32 * gate).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,48,25,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, tw * 1.6, 0, TAU); ctx.fill();
    }
  }

  var task = {
    tick: function (now, dt) { render(dt, true); }
  };

  function applyMotion() {
    if (I.reduced()) {
      I.loop.stop(task);
      if (build()) { poke = 0; render(0.016, false); }
    } else if (visible) {
      I.loop.start(task);
    }
  }

  host.addEventListener('pointerdown', function () { poke = 1; });
  I.onScroll(function () {
    /* the tap-to-clear state resets once the figure is well out of view */
    if (!poke || !section) return;
    var r = section.getBoundingClientRect();
    if (r.bottom < -80 || r.top > win.innerHeight + 80) poke = 0;
  });

  if (build()) render(0.016, false);
  if ('IntersectionObserver' in win) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) applyMotion(); else I.loop.stop(task);
    }, { rootMargin: '10% 0px 10% 0px' }).observe(host);
  } else { visible = true; applyMotion(); }
  I.onReduce(applyMotion);

  var rq = 0;
  function onSize() {
    if (rq) return;
    rq = win.requestAnimationFrame(function () { rq = 0; if (build()) render(0.016, false); });
  }
  if ('ResizeObserver' in win) new ResizeObserver(onSize).observe(host);
  else win.addEventListener('resize', onSize);
})();
