/* hero.js: the signature moment.
   The two halves of the logo ring (a white pipe and a red pipe with flanged ends) start misaligned,
   rotate into line, drift together, then SNAP shut. A joint flash, shock ring and flange recoil
   sell the contact; the letters IN fill in at the same instant, and the red pipe pours out of the
   ring's outlet and down the page. Only the ring animates: the headline, buttons and phone numbers
   are readable in their final position from first paint.

   Everything animates transform + opacity. One rAF loop runs for ~1.8 s and then stops.
   prefers-reduced-motion, or a page that loads already scrolled past the hero, skips straight to the end state. */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeInQuad = (u) => u * u;
const easeOutBack = (u, s) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);

// timeline (ms)
const HOLD = 320;      // show the misaligned state first
const ROT = 860;       // rotation + vertical alignment
const DRIFT = 880;     // slide to 8 % residual
const SNAP = 130;      // final snap into the flange joint
const CONTACT = HOLD + DRIFT + SNAP;
const END = CONTACT + 620;

export function initHero({ hero, onLock, onReplay }) {
  const q = (s) => hero.querySelector(s);
  const halfW = q('#halfW');
  const halfR = q('#halfR');
  const stage = q('.ring__stage');
  const fxEls = ['#fxShock', '#fxTop', '#fxBot', '#fxStreakT', '#fxStreakB'].map(q);
  const valEl = q('#readoutV');
  const stateEl = q('#readoutS');
  const replayBtn = q('#replay');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let rafId = 0;
  let runId = 0;
  let shownVal = -1;
  let shownState = '';
  let locked = false;

  function offsets() {
    const k = window.innerWidth < 560 ? 0.62 : 1;
    return {
      w: { x: -104 * k, y: -42 * k, r: -34 },
      r: { x: 112 * k, y: 50 * k, r: 41 },
    };
  }

  function setReadout(val, state) {
    if (val !== shownVal) { valEl.textContent = String(val).padStart(3, '0'); shownVal = val; }
    if (state !== shownState) { stateEl.textContent = state; shownState = state; }
  }

  function pose(t, o) {
    const tt = t - HOLD;
    const ur = clamp01(tt / ROT);
    const rotP = tt <= 0 ? 0 : easeOutBack(ur, 2.4);     // overshoots ~18 %: the halves wobble into line
    const yP = tt <= 0 ? 0 : easeInOutCubic(ur);
    let xP = 0;
    if (tt > 0 && tt < DRIFT) xP = 0.92 * easeInOutCubic(tt / DRIFT);
    else if (tt >= DRIFT && tt < DRIFT + SNAP) xP = 0.92 + 0.08 * easeInQuad((tt - DRIFT) / SNAP);
    else if (tt >= DRIFT + SNAP) xP = 1;

    // flange recoil after contact: a short, damped squeeze-and-release along the joint axis
    const tc = t - CONTACT;
    const rec = tc > 0 ? 2.8 * Math.exp(-tc / 75) * Math.cos(tc / 21) : 0;

    // the whole ring takes the hit: a quick 2 % thump that decays
    const thump = tc > 0 ? 1 + 0.022 * Math.exp(-tc / 85) : 1;

    return {
      w: { x: o.w.x * (1 - xP) + rec, y: o.w.y * (1 - yP), r: o.w.r * (1 - rotP) },
      r: { x: o.r.x * (1 - xP) - rec, y: o.r.y * (1 - yP), r: o.r.r * (1 - rotP) },
      xP,
      thump,
    };
  }

  const apply = (el, p) => { el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${p.r.toFixed(3)}deg)`; };

  function clearFx() {
    fxEls.forEach((e) => { e.classList.remove('is-on'); });
  }
  function fireFx() {
    clearFx();
    void hero.offsetWidth;                       // restart the CSS animations
    fxEls.forEach((e) => e.classList.add('is-on'));
  }

  function finish(instant) {
    window.cancelAnimationFrame(rafId);
    halfW.style.transform = '';
    halfR.style.transform = '';
    if (stage) stage.style.transform = '';
    hero.classList.add('is-locked', 'is-done');
    hero.classList.remove('is-resetting', 'is-playing');
    setReadout(100, 'INLINE');
    locked = true;
    onLock && onLock({ instant });
  }

  function play({ replay = false } = {}) {
    const id = ++runId;
    window.cancelAnimationFrame(rafId);
    locked = false;
    const o = offsets();

    if (replay) {
      hero.classList.add('is-resetting');
      hero.classList.remove('is-locked', 'is-done');
      clearFx();
      onReplay && onReplay();
      void hero.offsetWidth;
      hero.classList.remove('is-resetting');
    }
    hero.classList.add('is-playing');
    apply(halfW, o.w);
    apply(halfR, o.r);
    setReadout(0, 'MISALIGNED');

    const gone = hero.offsetHeight * 0.6;
    let t0 = 0;
    let lockedClassAt = false;
    let fxDone = false;
    let lockCalled = false;

    const frame = (now) => {
      if (id !== runId) return;
      if (!t0) t0 = now;
      if (window.scrollY > gone) { finish(true); return; }      // scrolled away mid-animation: jump to the end state
      const t = now - t0;
      const p = pose(t, o);
      apply(halfW, p.w);
      apply(halfR, p.r);
      if (stage) stage.style.transform = p.thump === 1 ? '' : `scale(${p.thump.toFixed(4)})`;

      const pct = Math.round(p.xP * 100);
      setReadout(pct, t < HOLD ? 'MISALIGNED' : p.xP >= 1 ? 'INLINE' : 'ALIGNING');

      if (!lockedClassAt && t >= CONTACT - 170) {      // the IN lettering starts filling in just before contact
        hero.classList.add('is-locked');
        lockedClassAt = true;
      }
      if (!fxDone && t >= CONTACT) {
        fireFx();
        fxDone = true;
      }
      if (!lockCalled && t >= CONTACT + 200) {          // pipe leaves the ring a beat after the clunk
        lockCalled = true;
        locked = true;
        onLock && onLock({ instant: false });
      }
      if (t >= END) {
        halfW.style.transform = '';
        halfR.style.transform = '';
        if (stage) stage.style.transform = '';
        hero.classList.add('is-done');
        hero.classList.remove('is-playing');
        return;
      }
      rafId = window.requestAnimationFrame(frame);
    };
    rafId = window.requestAnimationFrame(frame);
  }

  function start() {
    const scrolledPast = window.scrollY > hero.offsetHeight * 0.55;
    if (reduce.matches || scrolledPast || document.hidden) {
      finish(true);
      return;
    }
    play();
  }

  replayBtn.addEventListener('click', () => {
    if (reduce.matches) return;
    play({ replay: true });
  });

  // wait (briefly) for web fonts so a re-wrapped headline does not shift the layout under the ring mid-animation
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((res) => window.setTimeout(res, 900))]).then(start);

  initCrosshair(hero);
  return { replay: () => play({ replay: true }), isLocked: () => locked };
}

/* decorative CAD-style crosshair that follows a mouse inside the hero (hover-capable devices only) */
function initCrosshair(hero) {
  const box = hero.querySelector('#xhair');
  if (!box || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const v = box.querySelector('.xhair__v');
  const h = box.querySelector('.xhair__h');
  const t = box.querySelector('#xhairT');
  let x = 0;
  let y = 0;
  let raf = 0;
  let shown = '';

  const paint = () => {
    raf = 0;
    v.style.transform = `translate3d(${x}px,0,0)`;
    h.style.transform = `translate3d(0,${y}px,0)`;
    t.style.transform = `translate3d(${x + 14}px,${y + 14}px,0)`;
    const label = `X ${String(Math.round(x)).padStart(4, '0')}  Y ${String(Math.round(y)).padStart(4, '0')}`;
    if (label !== shown) { t.textContent = label; shown = label; }
  };
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    x = e.clientX - r.left;
    y = e.clientY - r.top;
    hero.classList.add('is-aim');
    if (!raf) raf = window.requestAnimationFrame(paint);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => hero.classList.remove('is-aim'));
}
