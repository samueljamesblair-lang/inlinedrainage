/* main.js: progressive-enhancement flag, scroll reveals, mobile call bar.
   No dependencies, no inline script, no eval. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasIO = 'IntersectionObserver' in window;

  /* Hidden-until-revealed states only exist once this flag is set,
     so if JS fails every card stays visible. */
  root.classList.add('js');

  /* ---------------------------------------------------------------
     1. Reveal on scroll (opacity + transform only)
     --------------------------------------------------------------- */
  var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  function revealNow(el) { el.classList.add('is-in'); }

  if (!items.length) {
    /* nothing to do */
  } else if (!hasIO || reduceMotion.matches) {
    items.forEach(revealNow);
  } else {
    var viewH = window.innerHeight || 800;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          revealNow(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    items.forEach(function (el, i) {
      /* light stagger inside a grid row */
      el.style.setProperty('--rd', (i % 3) * 60 + 'ms');
      var top = el.getBoundingClientRect().top;
      if (top < viewH * 0.9) { revealNow(el); } else { io.observe(el); }
    });
  }

  /* ---------------------------------------------------------------
     1b. Section headings: words rise out of a clip mask as the heading
     scrolls into view (same language as the hero headline on load).
     Static heading text only; skipped for reduced motion / no IO.
     --------------------------------------------------------------- */
  function splitWords(node, out) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var mask = document.createElement('span');
          var word = document.createElement('span');
          mask.className = 'mask';
          word.className = 'word';
          word.textContent = part;
          mask.appendChild(word);
          frag.appendChild(mask);
          out.push(word);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        splitWords(child, out);
      }
    });
  }

  var heads = Array.prototype.slice.call(document.querySelectorAll('.h-giant'));
  if (heads.length && hasIO && !reduceMotion.matches) {
    var headIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          headIO.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.2 });

    heads.forEach(function (h) {
      var words = [];
      splitWords(h, words);
      words.forEach(function (w, i) { w.style.setProperty('--wi', i); });
      h.classList.add('is-split');
      headIO.observe(h);
    });
  }

  /* ---------------------------------------------------------------
     2. Mobile call bar: stays out of the way of the quote form
     The bar is permanent everywhere except while the form (or the
     confirmation panel) is on screen, or a field has focus, so it can
     never cover what the visitor is typing.
     --------------------------------------------------------------- */
  var bar = document.querySelector('[data-callbar]');
  var quote = document.getElementById('quote');

  if (bar) {
    var formInView = false;
    var fieldFocused = false;

    var sync = function () {
      bar.classList.toggle('is-away', formInView || fieldFocused);
    };

    if (quote && hasIO) {
      /* only the part of the form the visitor can see counts: not the strip under the sticky header
         (the Careers anchor lands with the last pixels of the form there) nor the strip under the bar */
      var barH = bar.offsetHeight || 64;
      var headEl = document.querySelector('.site-header');
      var headH = (headEl && headEl.offsetHeight) || 60;
      new IntersectionObserver(function (entries) {
        formInView = entries[0].isIntersecting;
        sync();
      }, { rootMargin: '-' + headH + 'px 0px -' + barH + 'px 0px' }).observe(quote);
    }

    var isField = function (el) {
      return !!(el && el.matches && el.matches('input, select, textarea'));
    };
    document.addEventListener('focusin', function (e) {
      if (isField(e.target)) { fieldFocused = true; sync(); }
    });
    document.addEventListener('focusout', function (e) {
      if (isField(e.target)) { fieldFocused = false; sync(); }
    });
  }
})();
