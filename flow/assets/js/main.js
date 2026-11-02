/* main.js: shared runtime (loop, scroll, pointer) + page behaviours.
   No libraries. Every animation here moves transform / opacity only. */
(function () {
  'use strict';
  var win = window, doc = document, root = doc.documentElement;
  var I = win.Inline = win.Inline || {};
  root.classList.add('js-ready');

  /* ------------------------------------------------------------------ helpers */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  I.u = { clamp: clamp, lerp: lerp, smooth: smooth };
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var hasIO = 'IntersectionObserver' in win;

  var mqReduce = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqFine = win.matchMedia ? win.matchMedia('(hover: hover) and (pointer: fine)') : null;
  I.reduced = function () { return !!(mqReduce && mqReduce.matches); };
  I.fine = function () { return !!(mqFine && mqFine.matches); };
  var reduceCbs = [];
  I.onReduce = function (fn) { reduceCbs.push(fn); };
  if (mqReduce) {
    var onReduce = function () {
      root.classList.toggle('reduce', mqReduce.matches);
      for (var i = 0; i < reduceCbs.length; i++) reduceCbs[i](mqReduce.matches);
    };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduce);
    else if (mqReduce.addListener) mqReduce.addListener(onReduce);
  }

  /* ------------------------------------------------------------ one rAF loop */
  var tasks = [], raf = 0, last = 0, tabVisible = !doc.hidden;
  function frame(now) {
    raf = 0;
    if (!tasks.length || !tabVisible) return;
    var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    for (var i = 0; i < tasks.length; i++) tasks[i].tick(now, dt);
    raf = win.requestAnimationFrame(frame);
  }
  function kick() {
    if (raf || !tasks.length || !tabVisible) return;
    last = win.performance.now();
    raf = win.requestAnimationFrame(frame);
  }
  I.loop = {
    start: function (t) { if (tasks.indexOf(t) < 0) tasks.push(t); kick(); },
    stop: function (t) { var i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }
  };
  doc.addEventListener('visibilitychange', function () {
    tabVisible = !doc.hidden;
    if (tabVisible) kick();
    else if (raf) { win.cancelAnimationFrame(raf); raf = 0; }
  });

  /* ------------------------------------------------------------ scroll state */
  var S = I.scroll = { y: win.pageYOffset || 0, vel: 0, dir: 0, t: 0, vw: win.innerWidth, vh: win.innerHeight };
  var scrollCbs = [], resizeCbs = [];
  I.onScroll = function (fn) { scrollCbs.push(fn); fn(S); };
  I.onResize = function (fn) { resizeCbs.push(fn); };
  var sQueued = false, lastY = S.y, lastT = win.performance.now();
  function scrollFrame(now) {
    sQueued = false;
    var y = win.pageYOffset || root.scrollTop || 0;
    var dt = Math.max(1, now - lastT) / 1000;
    S.vel += ((y - lastY) / dt - S.vel) * 0.5;
    if (y !== lastY) S.dir = y > lastY ? 1 : -1;
    S.y = y; S.t = now; lastY = y; lastT = now;
    for (var i = 0; i < scrollCbs.length; i++) scrollCbs[i](S);
  }
  win.addEventListener('scroll', function () {
    if (!sQueued) { sQueued = true; win.requestAnimationFrame(scrollFrame); }
  }, { passive: true });
  var rQueued = false;
  win.addEventListener('resize', function () {
    if (rQueued) return;
    rQueued = true;
    win.requestAnimationFrame(function () {
      rQueued = false; S.vw = win.innerWidth; S.vh = win.innerHeight;
      for (var i = 0; i < resizeCbs.length; i++) resizeCbs[i](S);
      for (var j = 0; j < scrollCbs.length; j++) scrollCbs[j](S);
    });
  });

  /* ----------------------------------------------------------- pointer state */
  var P = I.pointer = { x: -9999, y: -9999, on: false, type: 'mouse' };
  win.addEventListener('pointermove', function (e) {
    P.x = e.clientX; P.y = e.clientY; P.on = true; P.type = e.pointerType || 'mouse';
  }, { passive: true });
  win.addEventListener('pointerdown', function (e) {
    P.x = e.clientX; P.y = e.clientY; P.on = true; P.type = e.pointerType || 'mouse';
  }, { passive: true });
  var pointerOff = function () { P.on = false; };
  win.addEventListener('pointerup', function (e) { if (e.pointerType === 'touch') pointerOff(); }, { passive: true });
  win.addEventListener('pointercancel', pointerOff, { passive: true });
  doc.documentElement.addEventListener('mouseleave', pointerOff);
  win.addEventListener('blur', pointerOff);

  /* ------------------------------------------------------------ word wrapping */
  function wrapWords(el, cls, nested) {
    var words = [], idx = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var parts = c.textContent.split(/(\s+)/), frag = doc.createDocumentFragment();
          parts.forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(doc.createTextNode(p)); return; }
            var w = doc.createElement('span');
            w.className = cls;
            if (nested) {
              var inner = doc.createElement('span');
              inner.className = cls + '__i';
              inner.textContent = p;
              inner.style.setProperty('--i', idx);
              w.appendChild(inner);
            } else {
              w.textContent = p;
            }
            idx++; words.push(w); frag.appendChild(w);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1) { walk(c); }
      });
    })(el);
    return words;
  }
  I.wrapWords = wrapWords;

  /* ----------------------------------------------------------- reveal + split */
  var splitEls = $$('[data-split]');
  if (!I.reduced()) {
    splitEls.forEach(function (el) { wrapWords(el, 'w', true); el.classList.add('is-split'); });
  } else {
    splitEls.forEach(function (el) { el.classList.add('is-split'); });
  }
  $$('.hero__copy, .clog__copy, .careers__inner, .contact__intro, .statement__side').forEach(function (parent) {
    var kids = $$('.reveal', parent), base = parent.classList.contains('hero__copy') ? 260 : 120;
    kids.forEach(function (k, i) { k.style.setProperty('--d', (base + i * 110) + 'ms'); });
  });
  var revealEls = $$('.reveal, [data-split]');
  if (hasIO) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); rio.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { rio.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ----------------------------------------------------------------- odometer */
  var Roll = I.roll = {
    build: function (el) {
      if (el.__roll) return el.__roll;
      var raw = el.getAttribute('data-roll') || el.textContent.trim();
      var pad = parseInt(el.getAttribute('data-pad') || '0', 10);
      var target = String(raw);
      while (target.length < pad) target = '0' + target;
      el.textContent = '';
      var sr = doc.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = raw;
      el.appendChild(sr);
      var strips = [];
      for (var i = 0; i < target.length; i++) {
        var col = doc.createElement('span'), strip = doc.createElement('span');
        col.className = 'roll__col'; strip.className = 'roll__strip';
        col.setAttribute('aria-hidden', 'true');
        strip.style.setProperty('--c', String(i));
        for (var d = 0; d < 10; d++) { var s = doc.createElement('span'); s.textContent = String(d); strip.appendChild(s); }
        col.appendChild(strip); el.appendChild(col); strips.push(strip);
      }
      el.__roll = { strips: strips, len: target.length, target: target };
      return el.__roll;
    },
    set: function (el, value) {
      var api = el.__roll || Roll.build(el);
      var str = String(value);
      while (str.length < api.len) str = '0' + str;
      api.strips.forEach(function (st, i) {
        var dgt = parseInt(str.charAt(i), 10) || 0;
        st.style.transform = 'translate3d(0,' + (-dgt * 10) + '%,0)';
      });
    }
  };
  var rolls = $$('[data-roll]');
  rolls.forEach(function (el) { Roll.build(el); });
  var autoRolls = rolls.filter(function (el) { return !el.hasAttribute('data-manual'); });
  function runRoll(el) {
    var api = el.__roll;
    win.requestAnimationFrame(function () { win.requestAnimationFrame(function () { Roll.set(el, api.target); }); });
  }
  if (I.reduced() || !hasIO) {
    autoRolls.forEach(function (el) { Roll.set(el, el.__roll.target); });
  } else {
    var oio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { runRoll(e.target); oio.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    autoRolls.forEach(function (el) { oio.observe(el); });
  }

  /* ----------------------------------------------------------- scroll-lit text */
  var lit = $('[data-lit]');
  if (lit && !I.reduced()) {
    var lw = wrapWords(lit, 'lw', false), litN = -1;
    I.onScroll(function (s) {
      var r = lit.getBoundingClientRect();
      if (r.bottom < -200 || r.top > s.vh + 200) return;
      var p = clamp((s.vh * 0.86 - r.top) / (r.height + s.vh * 0.42), 0, 1);
      var n = Math.round(p * lw.length);
      if (n === litN) return;
      litN = n;
      for (var i = 0; i < lw.length; i++) lw[i].classList.toggle('is-on', i < n);
    });
  }

  /* --------------------------------------------------------------- page line */
  var line = $('.page-line__fill'), docH = 1;
  if (line) {
    var measureDoc = function () { docH = Math.max(1, root.scrollHeight - win.innerHeight); };
    measureDoc();
    I.onResize(measureDoc);
    win.addEventListener('load', measureDoc);
    I.onScroll(function (s) { line.style.transform = 'scaleY(' + clamp(s.y / docH, 0, 1).toFixed(4) + ')'; });
  }

  /* ------------------------------------------------------------ header + menu */
  var header = $('[data-header]'), menu = $('#menu'), toggle = $('[data-menu-toggle]'), menuOpen = false;
  function setMenu(open) {
    if (!menu || !toggle || open === menuOpen) return;
    menuOpen = open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    root.classList.toggle('menu-open', open);
    ['main', '.site-footer', '[data-bar]'].forEach(function (sel) {
      var el = $(sel);
      if (!el) return;
      if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
    if (open) {
      menu.hidden = false;
      if (header) header.classList.remove('is-hidden');
      win.requestAnimationFrame(function () { win.requestAnimationFrame(function () { menu.classList.add('is-open'); }); });
      var first = $('a', menu);
      if (first) win.setTimeout(function () { if (menuOpen) first.focus(); }, 80);
    } else {
      menu.classList.remove('is-open');
      win.setTimeout(function () { if (!menuOpen) menu.hidden = true; }, 440);
    }
  }
  if (toggle) toggle.addEventListener('click', function () { setMenu(!menuOpen); });
  if (menu) menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuOpen) { setMenu(false); if (toggle) toggle.focus({ preventScroll: true }); }
  });
  I.onResize(function (s) { if (s.vw >= 900 && menuOpen) setMenu(false); });
  I.onScroll(function (s) {
    if (!header) return;
    header.classList.toggle('is-solid', s.y > 24);
    var hide = s.vw < 900 && !menuOpen && s.dir > 0 && s.y > 240 && !header.contains(doc.activeElement);
    header.classList.toggle('is-hidden', hide);
  });

  /* ------------------------------------------------------------- nav scrollspy */
  var navLinks = $$('.nav a'), spyTargets = navLinks.map(function (a) { return $(a.getAttribute('href')); }), spyIdx = -2;
  if (navLinks.length) {
    I.onScroll(function (s) {
      var mid = s.vh * 0.4, found = -1;
      for (var i = 0; i < spyTargets.length; i++) {
        var t = spyTargets[i];
        if (!t) continue;
        var r = t.getBoundingClientRect();
        if (r.top <= mid && r.bottom > mid) found = i;
      }
      if (found === spyIdx) return;
      spyIdx = found;
      navLinks.forEach(function (a, i) {
        if (i === found) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    });
  }

  /* -------------------------------------------------- sticky bar: step aside at the form */
  var bar = $('[data-bar]'), contact = $('#contact');
  if (bar && contact && hasIO) {
    new IntersectionObserver(function (es) {
      bar.classList.toggle('is-away', es[0].isIntersecting);
    }, { threshold: 0.01 }).observe(contact);
  }

  /* ----------------------------------------------- cursor-reactive light + magnets */
  if (I.fine()) {
    $$('[data-glow]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--gx', (e.clientX - r.left).toFixed(1) + 'px');
        el.style.setProperty('--gy', (e.clientY - r.top).toFixed(1) + 'px');
        el.classList.add('is-lit');
      }, { passive: true });
      el.addEventListener('pointerleave', function () { el.classList.remove('is-lit'); });
    });
    if (!I.reduced()) {
      $$('[data-magnet]').forEach(function (el) {
        el.addEventListener('pointermove', function (e) {
          var r = el.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
          el.style.transform = 'translate3d(' + (dx * 10).toFixed(1) + 'px,' + (dy * 8 - 2).toFixed(1) + 'px,0)';
        }, { passive: true });
        el.addEventListener('pointerleave', function () { el.style.transform = ''; });
      });
    }
  }

  /* --------------------------------------------------- parallax photography */
  var plx = [];
  $$('[data-parallax]').forEach(function (box) {
    plx.push({ box: box, img: $('img', box), k: parseFloat(box.getAttribute('data-parallax')) || 0.1, cap: 0.075, vis: false });
  });
  [['[data-areas-bg]', 0.12, 0.075], ['[data-careers-bg]', 0.14, 0.09]].forEach(function (c) {
    var img = $(c[0]);
    if (img) plx.push({ box: img.closest('section'), img: img, k: c[1], cap: c[2], vis: false });
  });
  if (plx.length && !I.reduced()) {
    if (hasIO) {
      var pio = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          for (var i = 0; i < plx.length; i++) if (plx[i].box === e.target) plx[i].vis = e.isIntersecting;
        });
      }, { rootMargin: '10% 0px 10% 0px' });
      plx.forEach(function (p) { pio.observe(p.box); });
    } else { plx.forEach(function (p) { p.vis = true; }); }
    I.onScroll(function (s) {
      if (I.reduced()) return;
      for (var i = 0; i < plx.length; i++) {
        var p = plx[i];
        if (!p.vis) continue;
        var r = p.box.getBoundingClientRect();
        var c = (r.top + r.height / 2 - s.vh / 2) / s.vh;
        var ty = clamp(-c * p.k * r.height, -p.cap * r.height, p.cap * r.height);
        p.img.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
      }
    });
  }

  /* ------------------------------------------------------------ areas: pulses */
  var lineWrap = $('.line-wrap');
  if (lineWrap && hasIO) {
    new IntersectionObserver(function (es) { lineWrap.classList.toggle('is-live', es[0].isIntersecting); }).observe(lineWrap);
  }

  /* ----------------------------------------- service / area CTAs preselect the form */
  function setSelect(id, val) {
    var sel = doc.getElementById(id);
    if (!sel) return false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === val || sel.options[i].text === val) {
        sel.selectedIndex = i;
        var fld = sel.closest('.field') || sel;
        fld.classList.remove('is-flash');
        void fld.offsetWidth;
        fld.classList.add('is-flash');
        win.setTimeout(function () { fld.classList.remove('is-flash'); }, 2000);
        return true;
      }
    }
    return false;
  }
  doc.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-service],[data-area]') : null;
    if (!a || !contact) return;
    e.preventDefault();
    if (I.contact && I.contact.showForm) I.contact.showForm();
    var svc = a.getAttribute('data-service'), area = a.getAttribute('data-area'), note = [];
    if (svc) setSelect('f-service', svc);
    if (area) setSelect('f-area', area);
    var curSvc = doc.getElementById('f-service'), curArea = doc.getElementById('f-area');
    if (curSvc && curSvc.value) note.push('Service: ' + curSvc.value);
    if (curArea && curArea.value) note.push('Area: ' + curArea.value);
    var ps = $('#preselect');
    if (ps) ps.textContent = note.length ? 'Preselected for you. ' + note.join('. ') + '.' : '';
    var target = win.innerWidth < 960 ? ($('.contact__panel') || contact) : contact;
    target.scrollIntoView({ behavior: I.reduced() ? 'auto' : 'smooth', block: 'start' });
    contact.focus({ preventScroll: true });
    if (win.history && win.history.replaceState) win.history.replaceState(null, '', '#contact');
  });
})();
