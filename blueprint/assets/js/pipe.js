/* pipe.js: the red drainage line.
   One continuous SVG path is built from measured DOM anchors (the logo ring's outlet port, then
   every [data-node] attachment point down the page) using orthogonal runs with rounded elbows,
   like a drainage network in plan view. stroke-dasharray / stroke-dashoffset are linked to scroll
   progress, so the line draws itself as you read and leaves a junction manhole at every section.

   Modes
     pre     nothing drawn (hero lock-up is still playing)
     intro   time-driven pour out of the ring, then hands over to scroll
     scroll  drawn length follows the viewport "reading line"
     static  prefers-reduced-motion: the whole network is drawn, nothing animates                  */

const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mk = (name, attrs) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const f = (n) => Math.round(n * 100) / 100;

/** Build orthogonal path pieces. pts[0] is the start (heading south); every following point is a
 *  waypoint that is reached by going south, jogging horizontally at p.jog if x differs, then south. */
function buildPath(pts, r) {
  const segs = [];
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  let cx = pts[0].x;
  let cy = pts[0].y;
  let cum = 0;
  let firstRunEnd = 0;
  const nodeLens = [0];

  const line = (x, y) => {
    const len = Math.hypot(x - cx, y - cy);
    if (len < 0.01) return;
    segs.push({ y0: cy, y1: y, len, cum });
    d += `L${f(x)} ${f(y)}`;
    cum += len; cx = x; cy = y;
  };
  const arc = (x, y, sweep, rr) => {
    const len = (Math.PI / 2) * rr;
    segs.push({ y0: cy, y1: y, len, cum });
    d += `A${f(rr)} ${f(rr)} 0 0 ${sweep} ${f(x)} ${f(y)}`;
    cum += len; cx = x; cy = y;
  };

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const dx = p.x - cx;
    if (Math.abs(dx) < 1.5) {
      line(cx, p.y);
    } else {
      const dir = Math.sign(dx);
      const rr = Math.max(4, Math.min(r, Math.abs(dx) / 2 - 1, (p.y - cy) / 3));
      const jy = clamp(i === 1 ? pts[0].jog : p.jog, cy + rr * 2 + 2, p.y - rr - 2);
      line(cx, jy - rr);
      arc(cx + dir * rr, jy, dir > 0 ? 0 : 1, rr);      // south -> east: sweep 0, south -> west: sweep 1
      line(p.x - dir * rr, jy);
      arc(p.x, jy + rr, dir > 0 ? 1 : 0, rr);            // east -> south: sweep 1, west -> south: sweep 0
      if (i === 1) firstRunEnd = cum;
      line(p.x, p.y);
    }
    nodeLens.push(cum);
  }
  return { d, segs, total: cum, nodeLens, firstRunEnd };
}

/** drawn length that corresponds to a page-space y (path y never decreases, so this is a monotone map) */
function lengthAtY(segs, total, y) {
  for (const s of segs) {
    const ya = Math.min(s.y0, s.y1);
    const yb = Math.max(s.y0, s.y1);
    if (y >= yb) continue;
    if (y <= ya) return s.cum;
    return s.cum + (s.len * (y - ya)) / (yb - ya);
  }
  return total;
}

export function initPipe({ page, hero }) {
  const svg = page.querySelector('#pipe');
  const trench = svg.querySelector('#pipeTrench');
  const core = svg.querySelector('#pipeCore');
  const joints = svg.querySelector('#pipeJoints');
  const nodesG = svg.querySelector('#pipeNodes');
  const head = svg.querySelector('#pipeHead');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let geo = null;
  let nodeEls = [];
  let marks = [];
  let shownMarks = -1;
  let lastDrawn = -1;
  let mode = reduce.matches ? 'static' : 'pre';
  let introT0 = 0;
  let introLen = 0;
  let drawn = 0;
  let last = 0;
  let raf = 0;
  let snap = false;
  let headTimer = 0;
  let rebuildTimer = 0;
  const INTRO_MS = 1250;

  /* ---------- measure + build ---------- */
  function measure() {
    const pr = page.getBoundingClientRect();
    const rel = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - pr.left + r.width / 2, y: r.top - pr.top + r.height / 2 };
    };
    const portEl = hero.querySelector('#ringPort circle');
    const pc = rel(portEl);
    const jogEl = [...hero.querySelectorAll('[data-jog]')].find((e) => e.getClientRects().length);
    const jogY = jogEl ? rel(jogEl).y : pc.y + 70;
    const pts = [{ x: pc.x, y: pc.y, jog: jogY }];
    const anchors = [...page.querySelectorAll('[data-node]')];
    const narrow = window.innerWidth < 720;
    anchors.forEach((a) => {
      const p = rel(a);
      const sec = a.closest('section, footer');
      const top = sec ? sec.getBoundingClientRect().top - pr.top : p.y - 80;
      pts.push({ x: p.x, y: p.y, jog: top + (narrow ? 22 : 40), el: a });
    });
    return { W: Math.round(pr.width), H: Math.ceil(page.scrollHeight), pts, anchors, narrow };
  }

  function rebuild() {
    const m = measure();
    if (!m.W || m.pts.length < 2) return;
    const r = m.narrow ? 16 : 28;
    const nr = m.narrow ? 8 : 11;
    const built = buildPath(m.pts, r);

    svg.setAttribute('width', m.W);
    svg.setAttribute('height', m.H);
    svg.setAttribute('viewBox', `0 0 ${m.W} ${m.H}`);
    [trench, core].forEach((p) => p.setAttribute('d', built.d));
    joints.removeAttribute('d');

    const browserLen = core.getTotalLength();
    const scale = browserLen && built.total ? browserLen / built.total : 1;
    const dash = f(browserLen) + 1;
    trench.style.strokeDasharray = core.style.strokeDasharray = `${dash} ${dash}`;

    // pipe-length joints: short cross marks every ~180px, revealed only as the pipe reaches them
    marks = [];
    for (let l = 110; l < browserLen - 40; l += 180) {
      const a = core.getPointAtLength(l - 0.6);
      const b = core.getPointAtLength(l + 0.6);
      const c = core.getPointAtLength(l);
      const h = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / h;
      const ny = (b.x - a.x) / h;
      marks.push({ len: l, d: `M${f(c.x - nx * 5.5)} ${f(c.y - ny * 5.5)}L${f(c.x + nx * 5.5)} ${f(c.y + ny * 5.5)}` });
    }
    shownMarks = -1;

    // junction manholes
    nodesG.textContent = '';
    nodeEls = m.pts.slice(1).map((p, i) => {
      const anchor = p.el;
      const end = anchor.classList.contains('node--end');
      const foot = anchor.classList.contains('node--foot');
      const rad = (end ? nr * 1.35 : foot ? nr * 1.35 : nr);
      const g = mk('g', { class: 'pipe__node' + (end ? ' pipe__node--end' : '') + (foot ? ' pipe__node--cap' : ''), transform: `translate(${f(p.x)} ${f(p.y)})` });
      const inner = mk('g', { class: 'pipe__node-in' });
      inner.append(
        mk('circle', { class: 'n-ping', r: rad + 2 }),
        mk('circle', { class: 'n-ring', r: rad }),
        mk('circle', { class: 'n-dot', r: f(rad * 0.38) }),
        mk('path', { class: 'n-tick', d: `M${-rad - 7} 0H${-rad - 2}M${rad + 2} 0H${rad + 7}M0 ${-rad - 7}V${-rad - 2}M0 ${rad + 2}V${rad + 7}` })
      );
      g.append(inner);
      nodesG.append(g);
      return { g, len: built.nodeLens[i + 1] * scale, on: false };
    });

    geo = { segs: built.segs, total: built.total, scale, browserLen, dash, firstRunEnd: built.firstRunEnd * scale, offsetTop: page.offsetTop };
    introLen = Math.max(geo.firstRunEnd, lengthAtY(geo.segs, geo.total, window.innerHeight * 0.95 - geo.offsetTop) * scale);
    snap = true;
    lastDrawn = -1;
    request();
  }

  const scheduleRebuild = () => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuild, 80);
  };

  /* ---------- progress ---------- */
  function target() {
    if (!geo) return 0;
    if (mode === 'static') return geo.browserLen;
    if (mode === 'pre') return 0;
    const headY = window.scrollY + window.innerHeight * 0.74 - geo.offsetTop;
    const byScroll = lengthAtY(geo.segs, geo.total, headY) * geo.scale;
    if (mode === 'intro') {
      const u = clamp((performance.now() - introT0) / INTRO_MS, 0, 1);
      const e = 1 - Math.pow(1 - u, 3);
      if (u >= 1) mode = 'scroll';
      return Math.max(e * introLen, byScroll);
    }
    return Math.max(introLen, byScroll);
  }

  function render() {
    const off = geo.dash - drawn;            // dash = length + 1: offset == dash hides the path completely
    trench.style.strokeDashoffset = core.style.strokeDashoffset = `${f(off)}`;

    let k = 0;
    while (k < marks.length && marks[k].len <= drawn - 1) k++;
    if (k !== shownMarks) {
      shownMarks = k;
      joints.setAttribute('d', k ? marks.slice(0, k).map((m) => m.d).join('') : 'M0 0');
    }

    for (const n of nodeEls) {
      const on = drawn >= n.len - 1;
      if (on !== n.on) {
        n.on = on;
        n.g.classList.toggle('is-on', on);
      }
    }
    const live = mode !== 'static' && drawn > 2 && drawn < geo.browserLen - 2;
    if (live) {
      const p = core.getPointAtLength(drawn);
      head.setAttribute('transform', `translate(${f(p.x)} ${f(p.y)})`);
      head.classList.add('is-live');
      window.clearTimeout(headTimer);
      headTimer = window.setTimeout(() => head.classList.remove('is-live'), 700);
    } else {
      head.classList.remove('is-live');
    }
  }

  function tick(now) {
    raf = 0;
    if (!geo) return;
    const dt = Math.min(100, last ? now - last : 16);
    last = now;
    const tgt = target();
    if (snap) {
      drawn = tgt;
      snap = false;
    } else {
      drawn += (tgt - drawn) * (1 - Math.exp(-dt / 120));
    }
    if (Math.abs(tgt - drawn) < 0.35) drawn = tgt;
    if (drawn !== lastDrawn) { lastDrawn = drawn; render(); }
    if (drawn !== tgt || mode === 'intro') request();
    else last = 0;
  }

  function request() {
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  /* ---------- public control ---------- */
  function startIntro() {
    if (mode === 'static') return;
    mode = 'intro';
    introT0 = performance.now();
    request();
  }
  function finishNow() {
    if (mode === 'static') return;
    mode = 'scroll';
    snap = true;
    request();
  }
  function retract() {
    if (mode === 'static') return;
    mode = 'pre';
    request();
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', scheduleRebuild);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleRebuild).observe(page);
  window.addEventListener('load', scheduleRebuild);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleRebuild);
  reduce.addEventListener('change', () => { mode = reduce.matches ? 'static' : 'scroll'; snap = true; request(); });

  rebuild();
  return { startIntro, finishNow, retract, rebuild };
}
