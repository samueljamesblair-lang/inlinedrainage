/* hero.js: the opening scene.
   Water-flow field on glass pipes (pointer + scroll reactive), pointer-driven light,
   a tilting photo monolith and a scroll "dolly" as the hero leaves the screen.
   Everything pauses when the hero is offscreen or the tab is hidden; reduced motion
   gets one static frame and no loop. */
(function () {
  'use strict';
  var win = window, doc = document;
  var I = win.Inline;
  if (!I || !I.FlowField) return;
  var hero = doc.getElementById('hero');
  if (!hero) return;
  var u = I.u;
  var $ = function (s) { return hero.querySelector(s); };

  var cPipes = $('.flow--pipes'), cStream = $('.flow--stream');
  var frame = $('[data-hero-frame]'), img = $('.hero__img'), sheen = $('.hero__sheen');
  var glow = $('[data-hero-glow]'), harbour = $('.hero__harbour'), copy = $('[data-hero-copy]');
  var hls = Array.prototype.slice.call(hero.querySelectorAll('.hl'));
  /* each highlighted verb gets an aria-hidden red twin that fades in over it (opacity only, no colour animation) */
  hls.forEach(function (el) {
    var word = el.textContent, base = doc.createElement('span'), red = doc.createElement('span');
    base.textContent = word; red.className = 'hl__r'; red.setAttribute('aria-hidden', 'true'); red.textContent = word;
    el.textContent = ''; el.appendChild(base); el.appendChild(red);
  });
  if (!cPipes || !cStream) return;

  /* pipe routes as fractions of the hero box. Desktop: two bundles, one above and one below the copy
     block, sweeping up and to the right and passing behind the photo. Phones: three light routes. */
  function layout(w, h) {
    if (w >= 900 && w / h > 1) {
      return [
        { w: 26, k: 0.9, pts: [[-0.08, 0.19], [0.12, 0.14], [0.3, 0.19], [0.5, 0.12], [0.7, 0.17], [0.9, 0.09], [1.1, 0.03]] },
        { w: 14, k: 0.8, hot: true, pts: [[-0.08, 0.27], [0.14, 0.2], [0.32, 0.25], [0.52, 0.18], [0.74, 0.22], [0.92, 0.14], [1.1, 0.1]] },
        { w: 30, k: 0.7, pts: [[-0.08, 1.04], [0.2, 1.0], [0.45, 0.94], [0.7, 0.9], [0.9, 0.76], [1.1, 0.66]] },
        { w: 22, k: 1.0, hot: true, pts: [[-0.08, 0.94], [0.12, 0.89], [0.3, 0.95], [0.5, 0.85], [0.68, 0.76], [0.86, 0.54], [1.1, 0.38]] },
        { w: 11, k: 0.6, pts: [[-0.08, 0.86], [0.16, 0.82], [0.34, 0.89], [0.56, 0.73], [0.78, 0.62], [0.92, 0.3], [1.1, 0.16]] }
      ];
    }
    return [
      { w: 22, k: 1.0, hot: true, pts: [[-0.12, 0.93], [0.2, 0.86], [0.5, 0.95], [0.8, 0.8], [1.12, 0.68]] },
      { w: 14, k: 0.8, pts: [[-0.12, 0.5], [0.25, 0.44], [0.55, 0.52], [0.85, 0.38], [1.12, 0.3]] },
      { w: 9, k: 0.6, pts: [[-0.12, 1.0], [0.3, 1.02], [0.62, 0.94], [1.12, 0.9]] }
    ];
  }

  var coarse = !I.fine();
  var field = new I.FlowField({
    host: hero, pipes: cPipes, stream: cStream, layout: layout,
    count: coarse ? 110 : 320, dprCap: coarse ? 1.5 : 2, pointer: true
  });

  I.hero = { field: field };   /* handy for inspecting particle count / quality in devtools */
  /* ---- smoothed state ---- */
  var tiltX = 0, tiltY = 0, gx = 0, gy = 0, gInit = false, glare = 0;
  var visible = false, hlIdx = -1, hlTimer = 0;

  function glowTarget(now, w, h) {
    var P = I.pointer;
    if (P.on && P.type !== 'touch' && !I.reduced()) {
      var r = hero.getBoundingClientRect();
      return [P.x - r.left, P.y - r.top];
    }
    var t = now / 1000;
    return [w * (coarse ? 0.7 : 0.72) + Math.sin(t * 0.35) * w * 0.05, h * (coarse ? 0.22 : 0.36) + Math.cos(t * 0.28) * h * 0.04];
  }

  var task = {
    tick: function (now, dt) {
      var w = field.w, h = field.h;
      if (!w) return;
      var S = I.scroll, P = I.pointer;
      var prog = u.clamp(S.y / Math.max(1, hero.offsetHeight), 0, 1.2);

      /* pointer-driven tilt (fine pointers only) */
      var tx = 0, ty = 0;
      if (!coarse && P.on) {
        var r = hero.getBoundingClientRect();
        tx = u.clamp((P.x - r.left - w / 2) / (w / 2), -1, 1);
        ty = u.clamp((P.y - r.top - h / 2) / (h / 2), -1, 1);
      }
      var k = 1 - Math.exp(-dt * 5);
      tiltX += (tx - tiltX) * k; tiltY += (ty - tiltY) * k;
      glare += ((Math.abs(tx) + Math.abs(ty)) * 0.5 - glare) * k;

      /* cursor light */
      var g = glowTarget(now, w, h);
      if (!gInit) { gx = g[0]; gy = g[1]; gInit = true; }
      var kg = 1 - Math.exp(-dt * 3.2);
      gx += (g[0] - gx) * kg; gy += (g[1] - gy) * kg;
      glow.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + (gy + prog * 90).toFixed(1) + 'px,0)';

      /* monolith: tilt + dolly */
      if (frame) {
        var sc = 1 - prog * 0.07;
        frame.style.transform = 'rotateY(' + (tiltX * 5.5).toFixed(2) + 'deg) rotateX(' + (-tiltY * 4).toFixed(2) + 'deg) translate3d(0,' + (prog * 70).toFixed(1) + 'px,0) scale(' + sc.toFixed(4) + ')';
        img.style.transform = 'translate3d(' + (-tiltX * 16).toFixed(1) + 'px,' + (-tiltY * 12 + prog * 38).toFixed(1) + 'px,0)';
        sheen.style.opacity = u.clamp(glare * 1.4, 0, 0.9).toFixed(3);
        sheen.style.transform = 'translate3d(' + (tiltX * 70).toFixed(1) + '%,0,0)';
      }
      if (copy) {
        copy.style.transform = 'translate3d(0,' + (-prog * 46).toFixed(1) + 'px,0)';
        copy.style.opacity = (1 - u.clamp((prog - 0.3) * 1.5, 0, 1)).toFixed(3);
      }
      if (harbour) harbour.style.transform = 'translate3d(0,' + (prog * 110).toFixed(1) + 'px,0)';

      field.tick(now, dt);
    }
  };

  /* ---- verbs light up one by one ---- */
  function cycle() {
    if (!visible || doc.hidden || I.reduced() || !hls.length) return;
    hlIdx = (hlIdx + 1) % hls.length;
    hls.forEach(function (el, i) { el.classList.toggle('is-lit', i === hlIdx); });
  }
  var hlStart = 0;
  function startCycle() {
    if (hlTimer || hlStart || I.reduced()) return;
    hlStart = win.setTimeout(function () { hlStart = 0; cycle(); hlTimer = win.setInterval(cycle, 2300); }, 1700);
  }
  function stopCycle() {
    if (hlStart) win.clearTimeout(hlStart);
    if (hlTimer) win.clearInterval(hlTimer);
    hlStart = 0; hlTimer = 0;
    hls.forEach(function (el) { el.classList.remove('is-lit'); });
    hlIdx = -1;
  }

  /* ---- run only while visible ---- */
  function applyMotion() {
    if (I.reduced()) {
      I.loop.stop(task);
      stopCycle();
      field.drawStatic();
      if (glow) glow.style.transform = 'translate3d(' + (field.w * 0.72).toFixed(0) + 'px,' + (field.h * 0.36).toFixed(0) + 'px,0)';
      [frame, img, sheen, copy, harbour].forEach(function (el) { if (el) { el.style.transform = ''; el.style.opacity = ''; } });
    } else if (visible) {
      I.loop.start(task);
      startCycle();
    }
  }
  if ('IntersectionObserver' in win) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) applyMotion(); else { I.loop.stop(task); }
    }, { threshold: 0 }).observe(hero);
  } else { visible = true; applyMotion(); }
  I.onReduce(applyMotion);

  /* ---- keep the canvases matched to the hero box ---- */
  var rq = 0;
  function onSize() {
    if (rq) return;
    rq = win.requestAnimationFrame(function () { rq = 0; field.resize(); });
  }
  if ('ResizeObserver' in win) new ResizeObserver(onSize).observe(hero);
  else win.addEventListener('resize', onSize);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(onSize);
})();
