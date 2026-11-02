/* boot.js: runs before first paint (tiny, render-blocking on purpose).
   1. Marks the document as JS-capable so progressive-enhancement states
      (collapsed plates, misaligned logo halves, reveal-on-scroll) exist ONLY
      when scripting works. Without it the page is the finished, fully visible state.
   2. Failsafe: if the app module never reports "ready" (blocked, offline, syntax error),
      drop back to the plain no-JS presentation after a few seconds. That presentation hides the quote form,
      and a browser that runs scripts never renders <noscript>, so the contact panel inside it is shown here instead. */
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  window.setTimeout(function () {
    if (root.classList.contains('ready')) return;
    root.classList.remove('js');
    var ns = document.querySelector('#formWrap noscript');
    if (ns) {
      var panel = document.createElement('div');
      panel.innerHTML = ns.textContent;      // our own static markup, kept in the page as text while scripts are on
      ns.parentNode.insertBefore(panel, ns);
    }
  }, 6000);
})();
