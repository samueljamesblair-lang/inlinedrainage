/* boot.js: runs before first paint. Only sets state classes on <html> so that
   "hidden until revealed" styles exist only when JavaScript is actually running. */
(function () {
  'use strict';
  var d = document.documentElement;
  d.classList.add('js');
  if (!window.matchMedia) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) d.classList.add('reduce');
})();
