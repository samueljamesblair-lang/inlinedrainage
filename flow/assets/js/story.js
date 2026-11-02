/* story.js: the pinned services story.
   One sticky stage walks the seven services as stops along a single flowing pipe.
   Scroll position drives (a) a scrubbed photo crossfade with a slow push-in and
   (b) the lit pipe + particles; the card text swaps on a time-based transition.
   The pinned layout is only switched on from JS, so without JS, with reduced motion
   or on very short screens the same markup is a clean vertical stack of cards.
   In the pinned layout the inactive cards are faded, not hidden: all seven services stay in the accessibility
   tree (their links just leave the tab order), a polite status line names the service on screen, and keyboard
   focus pulls the story to the focused service instead of letting the browser scroll it past. */
(function () {
  'use strict';
  var win = window, doc = document;
  var I = win.Inline;
  if (!I || !I.Path) return;
  var root = doc.querySelector('[data-story]');
  if (!root) return;
  var u = I.u, TAU = Math.PI * 2;

  var stage = root.querySelector('.story__stage');
  var track = root.querySelector('.story__track');
  var head = root.querySelector('.story__head');
  var stops = Array.prototype.slice.call(root.querySelectorAll('.stop'));
  var n = stops.length;
  var medias = stops.map(function (s) { return s.querySelector('.stop__media'); });
  var imgs = medias.map(function (m) { return m.querySelector('img'); });
  var titles = stops.map(function (s) { return s.querySelector('.stop__title').textContent.trim(); });
  var links = stops.map(function (s) { return Array.prototype.slice.call(s.querySelectorAll('a')); });
  var countEl = root.querySelector('.story__count .roll');
  /* pinned only where the stage has room for its parts: from 900px wide the rail is vertical with a name beside each node and
     needs about 275px of height (a 44px node pitch), reached from a 680px-tall window; on a phone the card has to clear the
     horizontal rail above it: the longest service text (Development Siteworks at 320px wide) makes a 344px card, which clears
     the rail from 640px of height. Shorter windows get the stack of cards instead. */
  var mq = win.matchMedia ? win.matchMedia('(min-width: 900px) and (min-height: 680px), (max-width: 899px) and (min-height: 640px)') : { matches: true };

  var pinned = false, idx = -1, pe = 0, dist = 1, rail = null, started = false, inView = false;
  var status = null, statusTimer = 0;
  var zooms = stops.map(function () { return 1; });
  var pox = 0, poy = 0;   // smoothed pointer offsets (px) applied to the photo layers

  function el(tag, cls) { var e = doc.createElement(tag); if (cls) e.className = cls; return e; }

  /* ----------------------------------------------------------------- the rail */
  function Rail() {
    this.wrap = el('div', 'rail');
    this.canvas = el('canvas', 'rail__canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.list = el('ol', 'rail__list');
    this.nodes = [];
    this.target = 0; this.fp = 0; this.boost = 0;
    this.parts = []; this.stopsAt = [];
    var self = this;
    titles.forEach(function (t, i) {
      var li = el('li', 'rail__item'), b = el('button', 'rail__node');
      b.type = 'button';
      b.setAttribute('aria-label', 'Show service ' + (i + 1) + ' of ' + n + ': ' + t);
      b.setAttribute('aria-controls', stops[i].id);
      var dot = el('span', 'rail__dot'), num = el('span', 'rail__num'), lab = el('span', 'rail__label');
      num.textContent = String(i + 1); num.setAttribute('aria-hidden', 'true');
      lab.textContent = t;
      dot.appendChild(num); b.appendChild(dot); b.appendChild(lab); li.appendChild(b);
      self.list.appendChild(li);
      self.nodes.push({ li: li, b: b });
      b.addEventListener('click', function () { goTo(i); });
    });
    this.wrap.appendChild(this.canvas);
    this.wrap.appendChild(this.list);
    stage.appendChild(this.wrap);
    this.layout();
  }

  Rail.prototype.layout = function () {
    var w = this.wrap.clientWidth, h = this.wrap.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(win.devicePixelRatio || 1, 2);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var horizontal = win.innerWidth < 900, pts = [], steps = 14, i, t;   // same breakpoint as the CSS: it swaps to the labelless phone rail below 900px
    this.horizontal = horizontal;
    if (horizontal) {
      var amp = Math.min(7, h * 0.12);
      for (i = 0; i <= steps; i++) { t = i / steps; pts.push([24 + t * (w - 48), h / 2 + Math.sin(t * TAU * 1.25 + 0.4) * amp]); }
    } else {
      for (i = 0; i <= steps; i++) { t = i / steps; pts.push([22 + Math.sin(t * TAU * 1.5 + 0.5) * 13, 10 + t * (h - 20)]); }
    }
    this.path = new I.Path(I.spline(pts, 12), 3);
    this.stopsAt = [];
    for (i = 0; i < n; i++) {
      var s = this.path.len * (i / (n - 1)), p = this.path.at(s);
      this.stopsAt.push(s);
      this.nodes[i].li.style.transform = 'translate3d(' + (p.x - 22).toFixed(1) + 'px,' + (p.y - 22).toFixed(1) + 'px,0)';
    }
    var count = horizontal ? 20 : 34;
    this.parts = [];
    for (i = 0; i < count; i++) {
      this.parts.push({ s: Math.random() * this.path.len, v: 70 + Math.random() * 90, lat: (Math.random() - 0.5) * 7, hot: Math.random() < 0.55 });
    }
  };

  Rail.prototype.setActive = function (a) {
    this.nodes.forEach(function (nd, i) {
      nd.b.classList.toggle('is-active', i === a);
      nd.b.classList.toggle('is-past', i < a);
      if (i === a) nd.b.setAttribute('aria-current', 'step'); else nd.b.removeAttribute('aria-current');
    });
  };

  Rail.prototype.draw = function (dt, now) {
    var c = this.ctx, path = this.path;
    if (!c || !path) return;
    this.fp += (this.target - this.fp) * (1 - Math.exp(-dt * 5.5));
    var S = I.scroll, sv = (now - S.t < 170) ? Math.abs(S.vel) : 0;
    var bt = Math.min(2.4, sv / 700);
    this.boost += (bt - this.boost) * (1 - Math.exp(-dt * (bt > this.boost ? 6 : 2)));
    var len = path.len, fl = this.fp * len, i, q;
    c.clearRect(0, 0, this.w, this.h);
    c.lineCap = 'round'; c.lineJoin = 'round';

    /* glass tube */
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(255,255,255,.17)'; c.lineWidth = 19; c.beginPath(); path.trace(c, 0, len, 0); c.stroke();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 16.4; c.beginPath(); path.trace(c, 0, len, 0); c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(255,255,255,.035)'; c.beginPath(); path.trace(c, 0, len, 0); c.stroke();

    /* lit run up to the current stop */
    var hx = 0, hy = 0;
    if (fl > 1) {
      var a = path.at(0), ax = a.x, ay = a.y, f = path.at(fl);
      hx = f.x; hy = f.y;
      var g = c.createLinearGradient(ax, ay, hx, hy);
      g.addColorStop(0, 'rgba(255,48,25,.3)'); g.addColorStop(1, 'rgba(255,66,40,1)');
      c.strokeStyle = 'rgba(255,48,25,.2)'; c.lineWidth = 26; c.beginPath(); path.trace(c, 0, fl, 0); c.stroke();
      c.strokeStyle = g; c.lineWidth = 9; c.beginPath(); path.trace(c, 0, fl, 0); c.stroke();
      c.strokeStyle = 'rgba(255,230,220,.7)'; c.lineWidth = 1.6; c.beginPath(); path.trace(c, 0, fl, 0); c.stroke();
      var rg = c.createRadialGradient(hx, hy, 0, hx, hy, 34);
      rg.addColorStop(0, 'rgba(255,120,90,.95)'); rg.addColorStop(0.28, 'rgba(255,60,35,.5)'); rg.addColorStop(1, 'rgba(255,48,25,0)');
      c.fillStyle = rg; c.beginPath(); c.arc(hx, hy, 34, 0, TAU); c.fill();
    }

    /* particles: bright inside the lit run, faint beyond it */
    var lit = [], dim = [], p, sp, x, y, tx, ty;
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      sp = p.v * (1 + this.boost * 1.2);
      p.s += sp * dt;
      if (p.s > len + 10) p.s = -Math.random() * 30;
      q = path.at(p.s); x = q.x + q.nx * p.lat; y = q.y + q.ny * p.lat;
      q = path.at(p.s - 10); tx = q.x + q.nx * p.lat; ty = q.y + q.ny * p.lat;
      (p.s < fl ? lit : dim).push(x, y, tx, ty, p.hot ? 1 : 0);
    }
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,255,255,.2)'; c.beginPath();
    for (i = 0; i < dim.length; i += 5) { c.moveTo(dim[i], dim[i + 1]); c.lineTo(dim[i + 2], dim[i + 3]); }
    c.stroke();
    c.lineWidth = 2.3;
    c.strokeStyle = 'rgba(255,245,240,.95)'; c.beginPath();
    for (i = 0; i < lit.length; i += 5) { if (!lit[i + 4]) { c.moveTo(lit[i], lit[i + 1]); c.lineTo(lit[i + 2], lit[i + 3]); } }
    c.stroke();
    c.strokeStyle = 'rgba(255,120,90,.95)'; c.beginPath();
    for (i = 0; i < lit.length; i += 5) { if (lit[i + 4]) { c.moveTo(lit[i], lit[i + 1]); c.lineTo(lit[i + 2], lit[i + 3]); } }
    c.stroke();
  };

  Rail.prototype.destroy = function () {
    if (this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
  };

  var railTask = {
    tick: function (now, dt) {
      if (rail) rail.draw(dt, now);
      if (I.fine() && !I.reduced()) {            // layered parallax: the photo drifts against the cursor
        var P = I.pointer, S = I.scroll, tx = 0, ty = 0;
        if (P.on) { tx = -(P.x / S.vw - 0.5) * 30; ty = -(P.y / S.vh - 0.5) * 20; }
        var k = 1 - Math.exp(-dt * 3.5), nx = pox + (tx - pox) * k, ny = poy + (ty - poy) * k;
        if (Math.abs(nx - pox) > 0.04 || Math.abs(ny - poy) > 0.04) { pox = nx; poy = ny; paintMedia(); }
      }
    }
  };

  /* ------------------------------------------------------- scroll -> story state */
  function plateau(p) {
    if (p >= n - 1) return n - 1;
    var i = Math.floor(p), f = p - i;
    return i + u.smooth((f - 0.26) / 0.48);
  }

  function paintMedia() {
    var base = Math.floor(pe + 1e-4), i, m, d, o, sc, ty, show;
    for (i = 0; i < n; i++) {
      m = medias[i];
      d = pe - (i - 1);
      show = (i >= base && i <= base + 1);
      if (!show) {
        if (m.__on !== false) { m.style.visibility = 'hidden'; m.style.opacity = '0'; m.__on = false; }
        continue;
      }
      m.__on = true;
      o = i === 0 ? 1 : u.clamp(d, 0, 1);
      sc = (1.05 + 0.07 * u.clamp(d / 2, 0, 1)) * zooms[i];
      ty = (i - pe) * 28;
      m.style.visibility = 'visible';
      m.style.opacity = o.toFixed(3);
      imgs[i].style.transform = 'translate3d(' + pox.toFixed(1) + 'px,' + (ty + poy).toFixed(1) + 'px,0) scale(' + sc.toFixed(4) + ')';
    }
  }

  function setActive(i) {
    var prev = idx, held = doc.activeElement;
    idx = i;
    stops.forEach(function (s, k) {
      s.classList.toggle('is-active', k === i);
      s.classList.toggle('is-past', k < i);
      links[k].forEach(function (a) { if (k === i) a.removeAttribute('tabindex'); else a.setAttribute('tabindex', '-1'); });
    });
    /* a faded card is no longer a place for focus: if it was inside the card that just left, follow the story */
    if (prev >= 0 && prev !== i && held && stops[prev].contains(held)) {
      var next = stops[i].querySelector('.btn');
      if (next) next.focus({ preventScroll: true });
    }
    if (rail) rail.setActive(i);
    if (countEl) I.roll.set(countEl, i + 1);
    if (status && prev >= 0) {   // say the service that settled, not every one scrolled past
      win.clearTimeout(statusTimer);
      statusTimer = win.setTimeout(function () { status.textContent = 'Service ' + (i + 1) + ' of ' + n + ': ' + titles[i]; }, 500);
    }
  }

  function update() {
    if (!pinned) return;
    var top = track.getBoundingClientRect().top;          // live: always matches the real layout
    var prog = u.clamp(-top / dist, 0, 1);
    pe = plateau(prog * (n - 1));
    paintMedia();
    var a = u.clamp(Math.round(pe), 0, n - 1);
    if (a !== idx) setActive(a);
    var begun = prog > 0.012;
    if (begun !== started) { started = begun; root.classList.toggle('is-started', begun); }
    if (rail) rail.target = pe / (n - 1);
  }

  function measure() {
    dist = Math.max(1, track.offsetHeight - 2 * stage.offsetHeight);   // minus the stage + the curtain stage
    zooms = stops.map(function (st) { return parseFloat(win.getComputedStyle(st).getPropertyValue('--zoom')) || 1; });
    var hb = head.getBoundingClientRect(), sb = stage.getBoundingClientRect();
    var narrow = win.innerWidth < 900;
    root.style.setProperty('--rail-top', Math.round(hb.bottom - sb.top + (narrow ? 12 : 30)) + 'px');
    if (rail) rail.layout();
  }

  function goTo(i, instant) {
    var absTop = track.getBoundingClientRect().top + (win.pageYOffset || 0);
    win.scrollTo({ top: absTop + (i / (n - 1)) * dist + 1, behavior: instant ? 'instant' : I.reduced() ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------------- mode switching */
  var io = null;
  function enable() {
    if (pinned) return;
    pinned = true;
    root.classList.add('is-pinned');
    medias.forEach(function (m) { m.setAttribute('aria-hidden', 'true'); });   // scrubbed backdrop here: each card carries its own text
    status = el('p', 'sr-only'); status.setAttribute('role', 'status');
    stage.appendChild(status);
    rail = new Rail();
    measure();
    idx = -1;
    update();
    if ('IntersectionObserver' in win) {
      io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView && pinned) I.loop.start(railTask); else I.loop.stop(railTask);
      }, { threshold: 0, rootMargin: '10% 0px 10% 0px' });
      io.observe(root);
    } else { I.loop.start(railTask); }
  }
  function disable() {
    if (!pinned) return;
    pinned = false;
    if (io) { io.disconnect(); io = null; }
    I.loop.stop(railTask);
    root.classList.remove('is-pinned', 'is-started');
    if (rail) { rail.destroy(); rail = null; }
    if (status) { win.clearTimeout(statusTimer); if (status.parentNode) status.parentNode.removeChild(status); status = null; }
    links.forEach(function (ls) { ls.forEach(function (a) { a.removeAttribute('tabindex'); }); });
    medias.forEach(function (m) { m.style.opacity = ''; m.style.visibility = ''; m.removeAttribute('aria-hidden'); m.__on = undefined; });
    imgs.forEach(function (im) { im.style.transform = ''; });
    stops.forEach(function (s) { s.classList.remove('is-active', 'is-past'); });
    root.style.removeProperty('--rail-top');
    started = false; idx = -1;
  }
  function evaluate() {
    if (I.reduced() || !mq.matches) disable(); else enable();
  }

  /* focus inside the stage. If the story is on another service, has not reached the stage yet, or has run on under the next
     section (which curtains over it), bring it to the focused service so the control and its focus ring are on screen; done
     before the browser's own focus-scroll, which would otherwise push the story past it or leave focus out of sight. */
  stage.addEventListener('focusin', function (e) {
    if (!pinned) return;
    var s = e.target.closest ? e.target.closest('.stop') : null;
    var k = s ? stops.indexOf(s) : Math.max(idx, 0);          // rail buttons: wherever the story already is
    var top = track.getBoundingClientRect().top;
    if ((s && k !== idx) || top > 1 || -top > dist + 1) goTo(k, true);
  });

  I.onScroll(update);
  I.onResize(function () { if (pinned) { measure(); update(); } });
  I.onReduce(evaluate);
  if (mq.addEventListener) mq.addEventListener('change', evaluate);
  else if (mq.addListener) mq.addListener(evaluate);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (pinned) { measure(); update(); } });
  win.addEventListener('load', function () { if (pinned) { measure(); update(); } });
  evaluate();

  I.story = { goTo: goTo };
})();
