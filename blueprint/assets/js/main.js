/* main.js: wires the modules together. No framework, no build step, no network calls. */
import { initPipe } from './pipe.js';
import { initHero } from './hero.js';
import { initServices } from './services.js';
import { initContact } from './contact.js';
import { initMenu, initBar, initReveal, initFigures, initCTAs, initMapPipe } from './ui.js';

document.documentElement.classList.add('ready');       // tells boot.js the app is alive

const $ = (s) => document.querySelector(s);
const header = $('#hdr');
const page = $('#page');
const hero = $('#top');
const hdrH = () => (header ? header.offsetHeight : 64);

const pipe = initPipe({ page, hero });

initHero({
  hero,
  onLock: ({ instant }) => (instant ? pipe.finishNow() : pipe.startIntro()),
  onReplay: () => pipe.retract(),
});

initMenu({ header });
initBar({ bar: $('#bar'), watch: [$('#contact'), $('#footer')] });
initServices({ section: $('#services'), hdrH });
const contact = initContact({ root: $('#contact') });
initCTAs({ contact, hdrH });
initFigures();
initMapPipe({ map: $('#map') });
initReveal({
  selectors: ['.sheet__head', '.dim', '.plates', '.blocked__panel', '.about__txt > *', '.map', '.careers__txt > *', '.contact__lead > *', '.contact__form', '.tblock'],
});
