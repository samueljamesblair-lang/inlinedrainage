/* flow.js: the water-flow engine.
   - spline() + Path: smooth pipe routes sampled at an even step (with normals)
   - FlowField: capped particle system that streams along those routes, bends around
     the pointer, speeds up with scroll velocity, degrades its own quality on slow
     frames, and renders a static frame when asked (reduced motion / offscreen). */
(function () {
  'use strict';
  var win = window, doc = document;
  var I = win.Inline;
  if (!I) return;
  var TAU = Math.PI * 2;

  /* Catmull-Rom spline through control points -> dense polyline */
  function spline(pts, per) {
    var out = [], n = pts.length, i, j;
    for (i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (j = 0; j < per; j++) {
        var t = j / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push([pts[n - 1][0], pts[n - 1][1]]);
    return out;
  }

  /* A route sampled every `step` px. at(s) -> shared {x,y,nx,ny} (no per-call allocation). */
  function Path(poly, step) {
    var n = poly.length, i, j = 0;
    var cum = new Float32Array(n);
    for (i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    var len = cum[n - 1] || 1;
    var count = Math.max(3, Math.ceil(len / step) + 1);
    var dx = len / (count - 1);
    var xs = new Float32Array(count), ys = new Float32Array(count), nx = new Float32Array(count), ny = new Float32Array(count);
    for (i = 0; i < count; i++) {
      var target = i * dx;
      while (j < n - 2 && cum[j + 1] < target) j++;
      var seg = (cum[j + 1] - cum[j]) || 1, t = (target - cum[j]) / seg;
      xs[i] = poly[j][0] + (poly[j + 1][0] - poly[j][0]) * t;
      ys[i] = poly[j][1] + (poly[j + 1][1] - poly[j][1]) * t;
    }
    for (i = 0; i < count; i++) {
      var a = Math.max(0, i - 1), b = Math.min(count - 1, i + 1);
      var tx = xs[b] - xs[a], ty = ys[b] - ys[a], l = Math.hypot(tx, ty) || 1;
      nx[i] = -ty / l; ny[i] = tx / l;
    }
    this.x = xs; this.y = ys; this.nx = nx; this.ny = ny;
    this.len = len; this.count = count; this.step = dx;
    this.p = { x: 0, y: 0, nx: 0, ny: 0 };
  }
  Path.prototype.at = function (s) {
    var c = this.count, f = s / this.step;
    if (f <= 0) f = 0; else if (f > c - 1.0001) f = c - 1.0001;
    var i = f | 0, t = f - i, p = this.p;
    p.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    p.y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
    p.nx = this.nx[i] + (this.nx[i + 1] - this.nx[i]) * t;
    p.ny = this.ny[i] + (this.ny[i + 1] - this.ny[i]) * t;
    return p;
  };
  /* append the polyline between two distances (optionally offset along the normal) to the current ctx path */
  Path.prototype.trace = function (ctx, s0, s1, off) {
    var i0 = Math.max(0, Math.floor(s0 / this.step)), i1 = Math.min(this.count - 1, Math.ceil(s1 / this.step));
    off = off || 0;
    for (var i = i0; i <= i1; i++) {
      var x = this.x[i] + this.nx[i] * off, y = this.y[i] + this.ny[i] * off;
      if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  };
  I.spline = spline;
  I.Path = Path;

  /* glass pipe: hairline walls, a faint bore, a specular line and couplings */
  function drawPipe(ctx, path, w, hot) {
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = hot ? 'rgba(255,80,55,.38)' : 'rgba(255,255,255,.15)';
    ctx.lineWidth = w; ctx.beginPath(); path.trace(ctx, 0, path.len, 0); ctx.stroke();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = w - 2.4; ctx.beginPath(); path.trace(ctx, 0, path.len, 0); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = hot ? 'rgba(255,48,25,.06)' : 'rgba(255,255,255,.03)';
    ctx.beginPath(); path.trace(ctx, 0, path.len, 0); ctx.stroke();
    ctx.strokeStyle = hot ? 'rgba(255,170,150,.22)' : 'rgba(255,255,255,.2)';
    ctx.lineWidth = Math.max(1, w * 0.06); ctx.beginPath(); path.trace(ctx, 0, path.len, -w * 0.27); ctx.stroke();
    var gap = 240 + w * 7, s, q, r = w / 2 + 3;
    ctx.lineWidth = 2.6; ctx.strokeStyle = hot ? 'rgba(255,90,68,.4)' : 'rgba(255,255,255,.22)';
    for (s = gap * 0.45; s < path.len - 40; s += gap) {
      q = path.at(s);
      ctx.beginPath(); ctx.moveTo(q.x + q.nx * r, q.y + q.ny * r); ctx.lineTo(q.x - q.nx * r, q.y - q.ny * r); ctx.stroke();
      q = path.at(s + 9);
      ctx.beginPath(); ctx.moveTo(q.x + q.nx * r, q.y + q.ny * r); ctx.lineTo(q.x - q.nx * r, q.y - q.ny * r); ctx.stroke();
    }
    ctx.restore();
  }
  I.drawPipe = drawPipe;

  /* ------------------------------------------------------------------ FlowField */
  function FlowField(o) {
    this.host = o.host;
    this.cp = o.pipes; this.cs = o.stream;
    this.layout = o.layout;
    this.max = o.count || 200;
    this.speed = o.speed || 1;
    this.dprCap = o.dprCap || 2;
    this.pointerOn = o.pointer !== false;
    this.minFrac = 0.34; this.frac = 1; this.lowQ = false;
    this.ctxS = this.cs.getContext('2d');
    this.ctxP = this.cp.getContext('2d');
    this.w = 0; this.h = 0; this.dpr = 1;
    this.paths = []; this.N = 0;
    this.boost = 0; this.ema = 0.016; this.slow = 0;
    this.ptr = { x: 0, y: 0, tx: 0, ty: 0, a: 0 };
    this.radius = 150; this.push = 56;
    this.resize();
  }

  FlowField.prototype.resize = function () {
    var w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(win.devicePixelRatio || 1, this.dprCap) * (this.lowQ ? 0.8 : 1);
    this.w = w; this.h = h; this.dpr = dpr;
    this.cp.width = this.cs.width = Math.round(w * dpr);
    this.cp.height = this.cs.height = Math.round(h * dpr);
    this.ctxP.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctxS.setTransform(dpr, 0, 0, dpr, 0, 0);
    var defs = this.layout(w, h);
    this.paths = defs.map(function (d) {
      var pts = d.pts.map(function (p) { return [p[0] * w, p[1] * h]; });
      var path = new Path(spline(pts, 14), 4);
      path.w = d.w; path.hot = !!d.hot; path.k = d.k || 1;
      return path;
    });
    this.radius = w < 700 ? 120 : 190;
    this.push = w < 700 ? 52 : 92;
    this.drawPipes();
    this.seed();
    this.drawStatic();
  };

  FlowField.prototype.drawPipes = function () {
    var c = this.ctxP, i;
    c.clearRect(0, 0, this.w, this.h);
    for (i = 0; i < this.paths.length; i++) drawPipe(c, this.paths[i], this.paths[i].w, this.paths[i].hot);
  };

  FlowField.prototype.seed = function () {
    var N = this.max, paths = this.paths, total = 0, i, pi, r;
    for (i = 0; i < paths.length; i++) total += paths[i].len * paths[i].k;
    this.N = N;
    this.pi = new Uint8Array(N); this.s = new Float32Array(N); this.v = new Float32Array(N);
    this.lat = new Float32Array(N); this.sz = new Uint8Array(N); this.col = new Uint8Array(N);
    this.ox = new Float32Array(N); this.oy = new Float32Array(N); this.buf = new Float32Array(N * 8);
    var groups = [[], [], [], []];
    for (i = 0; i < N; i++) {
      r = Math.random() * total;
      for (pi = 0; pi < paths.length - 1; pi++) { r -= paths[pi].len * paths[pi].k; if (r <= 0) break; }
      var path = paths[pi];
      this.pi[i] = pi;
      this.s[i] = Math.random() * path.len;
      this.v[i] = (120 + Math.random() * 190) * (0.75 + path.k * 0.45);
      this.lat[i] = (Math.random() - 0.5) * Math.max(2, path.w - 7);
      this.sz[i] = Math.random() < 0.3 ? 1 : 0;
      this.col[i] = (path.hot ? Math.random() < 0.82 : Math.random() < 0.34) ? 1 : 0;
      groups[this.col[i] * 2 + this.sz[i]].push(i);
    }
    this.groups = groups.map(function (g) { return new Int32Array(g); });
  };

  /* advance the simulation by dt seconds and refresh the position buffer */
  FlowField.prototype.step = function (dt, now, usePointer) {
    var paths = this.paths;
    if (!paths.length) return 0;
    var S = I.scroll, P = I.pointer, pt = this.ptr;
    var sv = (now - S.t < 170) ? Math.abs(S.vel) : 0;
    var bt = Math.min(2.4, sv / 650);
    this.boost += (bt - this.boost) * (1 - Math.exp(-dt * (bt > this.boost ? 6 : 2)));
    var on = usePointer && this.pointerOn && P.on;
    if (on) {
      var r = this.host.getBoundingClientRect();
      pt.tx = P.x - r.left; pt.ty = P.y - r.top;
      if (pt.a < 0.02) { pt.x = pt.tx; pt.y = pt.ty; }
    }
    pt.a += ((on ? 1 : 0) - pt.a) * (1 - Math.exp(-dt * 7));
    var kp = 1 - Math.exp(-dt * 22);
    pt.x += (pt.tx - pt.x) * kp; pt.y += (pt.ty - pt.y) * kp;

    var active = Math.max(24, Math.round(this.N * this.frac));
    var k = 1 - Math.exp(-dt * 9), R = this.radius, R2 = R * R, PUSH = this.push;
    var pi = this.pi, s = this.s, v = this.v, lat = this.lat, ox = this.ox, oy = this.oy, buf = this.buf;
    var i, j, path, q, sp, sp0, bx, by, tx, ty, dx, dy, d2, d, f, L, b, kk, boost = 1 + this.boost, spd = this.speed;
    var pointerLive = pt.a > 0.02;
    for (i = 0; i < active; i++) {
      path = paths[pi[i]];
      sp = v[i] * boost * spd;
      q = path.at(s[i]);
      bx = q.x + q.nx * lat[i]; by = q.y + q.ny * lat[i];
      tx = 0; ty = 0;
      if (pointerLive) {
        dx = bx - pt.x; dy = by - pt.y; d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          d = Math.sqrt(d2) || 1; f = 1 - d / R; f *= f;
          tx = dx / d * f * PUSH * pt.a; ty = dy / d * f * PUSH * pt.a;
          sp *= 1 + f * 2.2 * pt.a;
        }
      }
      ox[i] += (tx - ox[i]) * k; oy[i] += (ty - oy[i]) * k;
      /* head and tail are sampled from the same distance, THEN the particle advances / wraps.
         (sampling the tail after a wrap drew a one-frame chord from the pipe's end back to its start) */
      sp0 = s[i];
      L = 11 + sp * 0.075;
      b = i * 8;
      buf[b] = bx + ox[i]; buf[b + 1] = by + oy[i];
      for (j = 1; j < 4; j++) {
        q = path.at(sp0 - L * j / 3);
        kk = 1 - 0.14 * j;
        buf[b + j * 2] = q.x + q.nx * lat[i] + ox[i] * kk;
        buf[b + j * 2 + 1] = q.y + q.ny * lat[i] + oy[i] * kk;
      }
      s[i] = sp0 + sp * dt;
      if (s[i] > path.len + 40) {
        s[i] = -Math.random() * 90;
        lat[i] = (Math.random() - 0.5) * Math.max(2, path.w - 7);
      }
    }
    return active;
  };

  var TAIL_A = [0.95, 0.55, 0.24];
  FlowField.prototype.draw = function (active) {
    var c = this.ctxS, buf = this.buf, g, list, q, i, b, k, col, sz, rgb;
    c.clearRect(0, 0, this.w, this.h);
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (!this.lowQ) {
      c.strokeStyle = 'rgba(255,48,25,.11)'; c.lineWidth = 10; c.beginPath();
      for (g = 2; g < 4; g++) {
        list = this.groups[g];
        for (q = 0; q < list.length; q++) { i = list[q]; if (i >= active) continue; b = i * 8; c.moveTo(buf[b], buf[b + 1]); c.lineTo(buf[b + 2], buf[b + 3]); }
      }
      c.stroke();
    }
    for (g = 0; g < 4; g++) {
      list = this.groups[g]; col = g >> 1; sz = g & 1;
      if (!list.length) continue;
      rgb = col ? '255,92,64' : '255,255,255';
      for (k = 0; k < 3; k++) {
        c.beginPath();
        for (q = 0; q < list.length; q++) {
          i = list[q]; if (i >= active) continue;
          b = i * 8 + k * 2;
          c.moveTo(buf[b], buf[b + 1]); c.lineTo(buf[b + 2], buf[b + 3]);
        }
        c.strokeStyle = 'rgba(' + rgb + ',' + (TAIL_A[k] * (col ? 1 : 0.8)).toFixed(2) + ')';
        c.lineWidth = (sz ? 2.8 : 1.7) * (1 - k * 0.14);
        c.stroke();
      }
    }
  };

  /* live frame */
  FlowField.prototype.tick = function (now, dt) {
    this.ema += (dt - this.ema) * 0.06;
    if (this.ema > 0.028 && this.frac > this.minFrac) {
      if (++this.slow > 50) {          // sustained slow frames: shed particles, then glow, then resolution
        this.slow = 0; this.frac = Math.max(this.minFrac, this.frac * 0.76);
        if (!this.lowQ) { this.lowQ = true; this.resize(); }
      }
    } else if (this.slow > 0) { this.slow--; }
    this.draw(this.step(dt, now, true));
  };

  /* single non-animated frame (reduced motion, or before the first tick) */
  FlowField.prototype.drawStatic = function () {
    if (!this.paths.length) return;
    this.draw(this.step(0.0001, win.performance.now(), false));
  };

  I.FlowField = FlowField;
})();
