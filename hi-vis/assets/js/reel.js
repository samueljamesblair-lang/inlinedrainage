/* reel.js: SIGNATURE MOMENT. Scroll-driven "project reel".

   The section is a tall runway containing one sticky stage. While the runway scrolls
   past, vertical scroll progress (0..1) becomes horizontal travel of the photo track.

   Performance rules followed here:
   - only transform is written per frame (track, per-photo parallax variable, progress bar)
   - geometry is measured once (resize / fonts / load), never inside the scroll frame
   - one read per frame (runway.getBoundingClientRect), then writes only
   - the scroll listener is attached only while the section is near the viewport
   - reduced motion / no JS: the CSS scroll-snap strip is left untouched              */
(function () {
  'use strict';

  var root = document.querySelector('[data-reel]');
  if (!root) return;

  var runway = root.querySelector('[data-reel-runway]');
  var stage = root.querySelector('[data-reel-stage]');
  var viewport = root.querySelector('[data-reel-viewport]');
  var track = root.querySelector('[data-reel-track]');
  var bgWord = root.querySelector('[data-reel-bg]');
  var bar = root.querySelector('[data-reel-bar]');
  var nowEl = root.querySelector('[data-reel-now]');
  var panels = Array.prototype.slice.call(track ? track.querySelectorAll('[data-panel]') : []);
  if (!runway || !stage || !viewport || !track || !panels.length) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasIO = 'IntersectionObserver' in window;

  var pinned = false;
  var listening = false;
  var queued = false;

  var vw = 0;            /* stage width */
  var shift = 0;         /* horizontal distance the track travels (px) */
  var travel = 0;        /* vertical scroll distance that maps onto it (px) */
  var stageTop = 0;      /* sticky offset (header height) */
  var bgShift = 0;
  var centres = [];      /* per-panel centre x inside the track */
  var lastP = -1;
  var lastIndex = -1;
  var io = null;

  var saved = {
    tabindex: viewport.getAttribute('tabindex'),
    role: viewport.getAttribute('role'),
    label: viewport.getAttribute('aria-label')
  };

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /* vertical px of scrolling per horizontal px of travel: a touch quicker on phones */
  function ratio() { return window.innerWidth < 900 ? 1.15 : 1.4; }

  function measure() {
    if (!pinned) return;
    vw = stage.clientWidth;
    var stageH = stage.offsetHeight;
    shift = Math.max(0, track.offsetWidth - vw);
    travel = Math.max(1, shift * ratio());
    runway.style.height = Math.round(stageH + travel) + 'px';
    stageTop = parseFloat(window.getComputedStyle(stage).top) || 0;
    centres = panels.map(function (p) { return p.offsetLeft + p.offsetWidth / 2; });
    bgShift = shift * 0.3;
    lastP = -1;
  }

  function update() {
    queued = false;
    if (!pinned) return;

    var top = runway.getBoundingClientRect().top;
    var p = clamp01((stageTop - top) / travel);
    if (p === lastP) return;
    lastP = p;

    var x = -p * shift;
    track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';

    var mid = vw / 2;
    for (var i = 0; i < centres.length; i++) {
      var o = (centres[i] + x - mid) / vw;    /* panel centre vs viewport centre, about -1 .. 1.4 */
      if (o > -1.5 && o < 1.5) { panels[i].style.setProperty('--o', o.toFixed(3)); }
    }
    /* counter follows progress so it reads 01 at the start and 05 at the end */
    var best = Math.round(p * (panels.length - 1));

    if (bar) { bar.style.transform = 'scaleX(' + p.toFixed(4) + ')'; }
    if (bgWord) { bgWord.style.transform = 'translate3d(' + (-p * bgShift).toFixed(1) + 'px,-50%,0)'; }
    if (nowEl && best !== lastIndex) { lastIndex = best; nowEl.textContent = pad2(best + 1); }
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  function listen(on) {
    if (on && !listening) { window.addEventListener('scroll', queue, { passive: true }); listening = true; queue(); }
    if (!on && listening) { window.removeEventListener('scroll', queue); listening = false; }
  }

  function enable() {
    if (pinned) return;
    pinned = true;
    root.classList.add('is-pinned');
    /* in pinned mode the strip is driven by page scroll, so it is no longer a scroll region */
    viewport.removeAttribute('tabindex');
    viewport.removeAttribute('role');
    viewport.removeAttribute('aria-label');
    measure();
    update();
    if (hasIO) {
      io = new IntersectionObserver(function (entries) { listen(entries[0].isIntersecting); },
        { rootMargin: '300px 0px 300px 0px' });
      io.observe(runway);
    } else {
      listen(true);
    }
  }

  function disable() {
    if (!pinned) return;
    pinned = false;
    listen(false);
    if (io) { io.disconnect(); io = null; }
    root.classList.remove('is-pinned');
    runway.style.height = '';
    track.style.transform = '';
    if (bar) { bar.style.transform = ''; }
    if (bgWord) { bgWord.style.transform = ''; }
    panels.forEach(function (p) { p.style.removeProperty('--o'); });
    if (saved.tabindex !== null) { viewport.setAttribute('tabindex', saved.tabindex); }
    if (saved.role !== null) { viewport.setAttribute('role', saved.role); }
    if (saved.label !== null) { viewport.setAttribute('aria-label', saved.label); }
    lastP = -1;
    lastIndex = -1;
  }

  /* pin only when motion is allowed and the viewport is tall enough for the stage
     (landscape phones fall back to the swipe strip rather than clipping the stage) */
  function canPin() { return !reduce.matches && window.innerHeight >= 520; }
  function sync() { if (canPin()) { enable(); } else { disable(); } }

  /* keyboard users tabbing into the closing CTA: bring that panel into view */
  root.addEventListener('focusin', function (e) {
    if (!pinned || !e.target.closest) return;
    var panel = e.target.closest('[data-panel]');
    if (!panel) return;
    var i = panels.indexOf(panel);
    if (i < 0 || !shift) return;
    var want = clamp01((centres[i] - vw / 2) / shift);
    var runwayDocTop = runway.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: runwayDocTop - stageTop + want * travel, behavior: 'instant' });
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (canPin() !== pinned) { sync(); } else { measure(); queue(); }
    }, 120);
  });
  window.addEventListener('load', function () { measure(); queue(); });
  window.addEventListener('pageshow', function () { measure(); queue(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); queue(); });
  }

  if (reduce.addEventListener) { reduce.addEventListener('change', sync); }
  else if (reduce.addListener) { reduce.addListener(sync); }

  sync();
})();
