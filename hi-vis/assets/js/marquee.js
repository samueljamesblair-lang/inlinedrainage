/* marquee.js: makes the CSS ribbon marquee kinetic.
   The base loop is a pure CSS animation (works without JS, runs on the compositor).
   Here we only steer its playbackRate from scroll velocity: scroll down fast and the
   tape speeds up, scroll up and it reverses. Work stops when the ribbon is offscreen. */
(function () {
  'use strict';

  var wraps = document.querySelectorAll('[data-marquee]');
  if (!wraps.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var items = [];
  Array.prototype.forEach.call(wraps, function (el) {
    var track = el.querySelector('.ribbon__track');
    var anims = track && track.getAnimations ? track.getAnimations() : [];
    var anim = anims[0];
    if (!anim || !anim.effect) return;
    /* start deep into the loop so a reversed playbackRate never runs out of runway */
    var timing = anim.effect.getComputedTiming();
    if (timing && timing.duration) { anim.currentTime = timing.duration * 400; }
    /* observe the visible tape (the wrapper itself is zero-height) */
    items.push({ el: el.querySelector('.ribbon__tape') || el, anim: anim, visible: false, applied: 1 });
  });
  if (!items.length) return;

  var running = false;
  var rate = 1;
  var dir = 1;
  var lastY = window.scrollY;
  var lastT = 0;

  function anyVisible() {
    for (var i = 0; i < items.length; i++) { if (items[i].visible) return true; }
    return false;
  }

  function frame(t) {
    var dt = lastT ? Math.max(1, t - lastT) : 16;
    lastT = t;
    var y = window.scrollY;
    var v = (y - lastY) / dt * 1000;               /* px per second */
    lastY = y;
    if (Math.abs(v) > 40) { dir = v > 0 ? 1 : -1; }
    var boost = Math.min(Math.abs(v) / 450, 7);     /* up to 8x */
    var target = dir * (1 + boost);
    rate += (target - rate) * 0.07;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.visible && Math.abs(rate - it.applied) > 0.015) {
        it.anim.playbackRate = rate;
        it.applied = rate;
      }
    }
    if (anyVisible()) { requestAnimationFrame(frame); } else { running = false; lastT = 0; }
  }

  function start() {
    if (running) return;
    running = true;
    lastY = window.scrollY;
    requestAnimationFrame(frame);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].el !== entry.target) continue;
        items[i].visible = entry.isIntersecting;
        if (entry.isIntersecting) { items[i].anim.play(); start(); } else { items[i].anim.pause(); }
      }
    });
  }, { rootMargin: '80px 0px 80px 0px' });

  items.forEach(function (it) { io.observe(it.el); });

  /* hidden tab: pause the tape as well */
  document.addEventListener('visibilitychange', function () {
    items.forEach(function (it) {
      if (document.hidden) { it.anim.pause(); } else if (it.visible) { it.anim.play(); }
    });
  });
})();
