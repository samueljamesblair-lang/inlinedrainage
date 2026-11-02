/* services.js: the index of plates.
   Exactly one plate is open. It opens on mouse hover (with intent + scroll guards), tap/click,
   Enter/Space, and Arrow/Home/End keys. Opening is a layout change done ONCE; the neighbours
   then glide to their new positions with a FLIP transform, and the new panel reveals with
   transform + opacity only, so nothing animates width/height.
   Without JS every plate is simply open (the CSS only collapses them under html.js).            */

export function initServices({ section, hdrH }) {
  const list = section.querySelector('#plates');
  if (!list) return;
  const plates = [...list.querySelectorAll('.plate')];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let current = plates.find((p) => p.classList.contains('is-open')) || plates[0];

  let lockUntil = 0;       // ignore hover while the list is gliding
  let scrolling = false;
  let scrollTimer = 0;
  let intent = 0;
  let glide = 0;           // id of the glide currently allowed to clean up after itself

  const btnOf = (p) => p.querySelector('.plate__btn');

  function set(next, by) {
    if (!next || next === current) return;
    const prev = current;

    // FLIP: First = where each plate is drawn right now (including any glide still in flight)
    const first = plates.map((p) => p.getBoundingClientRect().top);
    prev.classList.remove('is-open', 'is-reveal');
    btnOf(prev).setAttribute('aria-expanded', 'false');
    next.classList.add('is-open');
    btnOf(next).setAttribute('aria-expanded', 'true');
    current = next;

    // Last = pure layout after the change (drop leftover transforms first so they cannot skew the read)
    plates.forEach((p) => { p.style.transition = 'none'; p.style.transform = ''; });
    const last = plates.map((p) => p.getBoundingClientRect().top);       // forces layout once

    if (!reduce.matches) {
      const id = ++glide;
      next.classList.add('is-reveal');
      window.setTimeout(() => next.classList.remove('is-reveal'), 1400);

      // Invert: put every plate back where it was drawn, then Play: let it glide to its new place
      plates.forEach((p, i) => {
        const dy = first[i] - last[i];
        if (Math.abs(dy) > 1) {
          p.style.transform = `translateY(${dy}px)`;
          p.style.willChange = 'transform';
        }
      });
      void list.offsetWidth;
      window.requestAnimationFrame(() => {
        plates.forEach((p) => {
          if (p.style.transform) {
            p.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1)';
            p.style.transform = '';
          }
        });
        window.setTimeout(() => {
          if (id !== glide) return;
          plates.forEach((p) => { p.style.transition = ''; p.style.willChange = ''; });
        }, 800);
      });
      lockUntil = performance.now() + 760;
    } else {
      plates.forEach((p) => { p.style.transition = ''; });
    }

    if (by !== 'hover') keepInView(plates.indexOf(next), last[plates.indexOf(next)]);
  }

  // after tap / keyboard, make sure the opened plate (and its CTA) is on screen
  function keepInView(idx, top) {
    const plate = plates[idx];
    const h = plate.offsetHeight;
    const vh = window.innerHeight;
    const topLimit = hdrH() + 10;
    const bottomLimit = vh - (window.innerWidth < 760 ? 74 : 24);
    let dy = 0;
    if (top < topLimit) dy = top - topLimit;
    else if (top + h > bottomLimit) dy = Math.min(top + h - bottomLimit, top - topLimit);
    if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: reduce.matches ? 'auto' : 'smooth' });
  }

  plates.forEach((p) => {
    btnOf(p).addEventListener('click', () => set(p, 'click'));
    btnOf(p).addEventListener('keydown', (e) => {
      const i = plates.indexOf(p);
      let n = -1;
      if (e.key === 'ArrowDown') n = Math.min(plates.length - 1, i + 1);
      else if (e.key === 'ArrowUp') n = Math.max(0, i - 1);
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = plates.length - 1;
      if (n < 0) return;
      e.preventDefault();
      btnOf(plates[n]).focus({ preventScroll: true });
      set(plates[n], 'key');
    });
  });

  // hover: real pointer movement only; the open itself waits for scrolling / gliding to finish
  const hovered = () => plates.find((p) => p.matches(':hover'));
  function consider(hit) {
    window.clearTimeout(intent);
    if (!hit || hit === current || !fine.matches) return;
    intent = window.setTimeout(() => {
      if (scrolling || performance.now() < lockUntil) {            // not now: look again once things settle
        intent = window.setTimeout(() => consider(hovered()), 190);
        return;
      }
      if (hit.matches(':hover')) set(hit, 'hover');
    }, 110);
  }
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    consider(e.target.closest ? e.target.closest('.plate') : null);
  }, { passive: true });
  list.addEventListener('pointerleave', () => window.clearTimeout(intent));
  window.addEventListener('scroll', () => {
    scrolling = true;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => { scrolling = false; }, 170);
  }, { passive: true });

  // warm the closed plates' photos shortly before the section is reached so hover/tap feels instant
  const imgs = [...list.querySelectorAll('img[loading="lazy"]')];
  const saveData = navigator.connection && navigator.connection.saveData;
  if ('IntersectionObserver' in window && !saveData) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        imgs.forEach((im) => { im.loading = 'eager'; });
        io.disconnect();
      }
    }, { rootMargin: '700px 0px' });
    io.observe(section);
  }

  return { open: (i) => set(plates[i], 'api') };
}
