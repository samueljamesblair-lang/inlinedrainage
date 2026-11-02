// "Back to the website": return to the page the visitor came from (for example a design option),
// otherwise fall through to the link's normal href. Progressive enhancement; the links work without JS.
(function () {
  var links = document.querySelectorAll('[data-back]');
  if (!links.length || !document.referrer) return;
  try {
    var ref = new URL(document.referrer);
    if (ref.origin !== location.origin || ref.pathname === location.pathname) return;
  } catch (e) { return; }
  links.forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); history.back(); });
  });
})();
