/* boot.js: runs before first paint (tiny, render-blocking on purpose).
   1. Marks the document as JS-capable so progressive-enhancement states
      (collapsed plates, misaligned logo halves, reveal-on-scroll) exist ONLY
      when scripting works. Without it the page is the finished, fully visible state.
   2. Failsafe: if the app module never reports "ready" (blocked, offline, syntax error),
      drop back to the plain no-JS presentation after a few seconds. */
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  window.setTimeout(function () {
    if (!root.classList.contains('ready')) root.classList.remove('js');
  }, 6000);
})();
