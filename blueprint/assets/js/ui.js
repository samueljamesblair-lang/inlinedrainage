/* ui.js: small, independent behaviours. Each one is an IntersectionObserver / event hook;
   nothing here runs a permanent loop. */

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- mobile menu ---------- */
export function initMenu({ header }) {
  const btn = header.querySelector('#menuBtn');
  const nav = header.querySelector('#mnav');
  if (!btn || !nav) return;
  let closeTimer = 0;

  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
  function open() {
    window.clearTimeout(closeTimer);
    nav.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => nav.classList.add('is-open'));
  }
  function close(returnFocus) {
    btn.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    closeTimer = window.setTimeout(() => { nav.hidden = true; }, reduce.matches ? 0 : 260);
    if (returnFocus) btn.focus();
  }
  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(true); });
  window.matchMedia('(min-width: 1040px)').addEventListener('change', (e) => { if (e.matches && isOpen()) close(); });
}

/* ---------- sticky phone bar: hides while the contact section or footer is on screen ---------- */
export function initBar({ bar, watch }) {
  if (!bar || !('IntersectionObserver' in window)) return;
  const live = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { en.isIntersecting ? live.add(en.target) : live.delete(en.target); });
    bar.classList.toggle('is-hidden', live.size > 0);
  }, { rootMargin: '0px 0px -72px 0px', threshold: 0 });
  watch.forEach((el) => el && io.observe(el));
}

/* ---------- reveal on scroll (only for content that starts below the fold) ---------- */
export function initReveal({ selectors }) {
  if (reduce.matches || !('IntersectionObserver' in window)) return;
  const vh = window.innerHeight;
  const els = [];
  selectors.forEach((sel) => document.querySelectorAll(sel).forEach((e) => {
    if (e.getBoundingClientRect().top > vh * 0.92) els.push(e);
  }));
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((e, i) => {
    e.classList.add('rv');
    e.style.setProperty('--d', `${(i % 3) * 0.07}s`);
    io.observe(e);
  });
}

/* figures: add .is-in when a photo plate scrolls into view (draws the annotation boxes) */
export function initFigures() {
  const figs = [...document.querySelectorAll('.fig')];
  if (!figs.length) return;
  if (reduce.matches || !('IntersectionObserver' in window)) { figs.forEach((f) => f.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.35 });
  figs.forEach((f) => io.observe(f));
}

/* ---------- service / area CTAs: preselect the form, then go to it ---------- */
export function initCTAs({ contact, hdrH }) {
  const formWrap = document.querySelector('#formWrap');
  const section = document.querySelector('#contact');
  if (!contact || !formWrap || !section) return;

  document.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('[data-service], [data-area]') : null;
    if (!a) return;
    e.preventDefault();
    contact.preselect({ service: a.dataset.service || '', area: a.dataset.area || '' });
    if (window.location.hash !== '#contact') history.replaceState(null, '', '#contact');
    // where the form will sit once it has settled: its reveal (.rv, a translateY that is still easing in) is not part of that, so take it out
    const lift = new DOMMatrixReadOnly(window.getComputedStyle(formWrap).transform).m42;
    const top = formWrap.getBoundingClientRect().top - lift + window.scrollY - hdrH() - 16;
    window.scrollTo({ top, behavior: reduce.matches ? 'auto' : 'smooth' });
    // move focus along with the scroll, so Tab / a screen reader carries on from the form and not from the CTA thousands of pixels above it:
    // a keyboard press or a desktop pointer puts the caret in the first field; touch focuses the form itself (a field would raise the keyboard)
    const typing = e.detail === 0 || window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    window.setTimeout(() => (typing ? contact.focusFirst() : contact.focusForm()), reduce.matches ? 0 : 650);
  });
}

/* ---------- areas: schematic pipe draws with the section's scroll position; nodes power up as it reaches them ---------- */
const MAP_NODES = {
  'Kāpiti Coast': [90, 70], Porirua: [230, 170], Wellington: [230, 300],
  'Lower Hutt': [560, 300], 'Upper Hutt': [560, 110], Wairarapa: [880, 200],
};
export function initMapPipe({ map }) {
  if (!map) return;
  const paths = [...map.querySelectorAll('.map__pipe, .map__pipe-trench')];
  const areas = [...map.querySelectorAll('.area')];
  const allOn = () => areas.forEach((a) => a.classList.add('is-on'));
  if (!paths.length || !('IntersectionObserver' in window)) { allOn(); return; }
  const route = map.querySelector('.map__pipe');
  let len = 0;
  try { len = route.getTotalLength(); } catch (err) { len = 0; }
  if (!len) { allOn(); return; }
  paths.forEach((p) => { p.style.strokeDasharray = `${len + 1} ${len + 1}`; });
  const set = (u) => paths.forEach((p) => { p.style.strokeDashoffset = `${((1 + len) * (1 - u)).toFixed(1)}`; });

  // where along the route each node sits (nearest sample to its schematic coordinate).
  // Sampled once, lazily, the first time the map scrolls near the viewport (keeps start-up free of work).
  let at = null;
  const locate = () => {
    const pts = [];
    for (let l = 0; l <= len; l += 8) { const p = route.getPointAtLength(l); pts.push([l, p.x, p.y]); }
    at = areas.map((a) => {
      const t = MAP_NODES[a.dataset.area];
      if (!t) return 0;
      let best = 0;
      let bestD = Infinity;
      pts.forEach(([l, x, y]) => { const d = Math.hypot(x - t[0], y - t[1]); if (d < bestD) { bestD = d; best = l; } });
      return best;
    });
  };
  const paint = (u) => {
    set(u);
    if (!at) return;
    areas.forEach((a, i) => a.classList.toggle('is-on', u * len >= at[i] - 2));
  };

  if (reduce.matches) { set(1); allOn(); return; }
  set(0);
  let raf = 0;
  let live = false;
  const update = () => {
    raf = 0;
    if (!at) locate();
    const r = map.getBoundingClientRect();
    const vh = window.innerHeight;
    paint(clamp((vh * 0.9 - r.top) / (r.height * 0.85 + vh * 0.1), 0, 1));
  };
  const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(update); };
  new IntersectionObserver((entries) => {
    const on = entries.some((e) => e.isIntersecting);
    if (on && !live) { window.addEventListener('scroll', onScroll, { passive: true }); live = true; update(); }
    if (!on && live) { window.removeEventListener('scroll', onScroll); live = false; update(); }
  }, { rootMargin: '10% 0px 10% 0px' }).observe(map);
}
