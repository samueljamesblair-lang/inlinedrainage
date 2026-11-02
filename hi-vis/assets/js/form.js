/* form.js: quote form + service/area preselect.

   There is no backend. On submit we validate, build a mailto: URL to the fixed address,
   show a confirmation panel (composed message, Copy button, tap-to-call alternatives)
   and then hand the URL to the visitor's email app.

   Safety notes:
   - every user-supplied value is passed through encodeURIComponent (line by line)
   - newlines are normalised to CRLF (%0D%0A) for the mailto body
   - the recipient is a constant; there is no cc or bcc, and nothing a visitor types can
     add one (all typed text lives inside encoded query values)
   - the mailto: link is capped at MAX_URL characters; a longer message is shortened in the link
     only (the panel says so, and Copy still copies all of it)
   - anything derived from user input is written with textContent, never innerHTML    */
(function () {
  'use strict';

  var TO = 'inlinedrainage@outlook.com';
  var MAX_URL = 1900;                       /* mail clients and browsers drop or cut mailto: links much past 2,000 */

  var form = document.getElementById('quote-form');
  var panel = document.getElementById('quote-confirm');
  var contact = document.getElementById('contact');
  var quoteBox = document.getElementById('quote');
  if (!form || !panel) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function byId(id) { return document.getElementById(id); }
  function scrollBehavior() { return reduce.matches ? 'auto' : 'smooth'; }

  var f = {
    service: byId('f-service'),
    area: byId('f-area'),
    name: byId('f-name'),
    phone: byId('f-phone'),
    email: byId('f-email'),
    message: byId('f-message')
  };
  var errBox = byId('form-errors');
  var errList = byId('form-error-list');
  var nameErr = byId('f-name-err');
  var contactErr = byId('f-contact-err');
  var live = byId('form-live');
  var subjectEl = byId('confirm-subject');
  var bodyEl = byId('confirm-body');
  var mailAgain = byId('confirm-mailto');
  var copyBtn = byId('confirm-copy');
  var copyLabel = byId('confirm-copy-label');
  var copyStatus = byId('copy-status');
  var cutNote = byId('confirm-cut');
  var editBtn = byId('confirm-edit');

  /* JS takes over validation from the browser's native `required` check. Without JS this form is hidden
     (html:not(.js) in sections.css) and the <noscript> card gives the email address and phone numbers instead */
  form.noValidate = true;

  /* ------------------------------------------------------------------
     helpers
     ------------------------------------------------------------------ */
  /* the first n characters, never ending on half a surrogate pair (encodeURIComponent throws on one) */
  function clip(s, n) {
    s = s.slice(0, n);
    var last = s.charCodeAt(s.length - 1);
    return last >= 0xD800 && last <= 0xDBFF ? s.slice(0, -1) : s;
  }
  function oneLine(s, max) {
    return clip(String(s || '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim(), max || 200);
  }
  function multiLine(s, max) {
    return clip(String(s || '')
      .replace(/\r\n?|\u2028|\u2029/g, '\n')      /* normalise every newline flavour to \n */
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(), max || 1200);
  }

  function readValues() {
    return {
      service: oneLine(f.service.value, 80),
      area: oneLine(f.area.value, 60),
      name: oneLine(f.name.value, 120),
      phone: oneLine(f.phone.value, 40),
      email: oneLine(f.email.value, 160),
      message: multiLine(f.message.value, 1200)
    };
  }

  /* ------------------------------------------------------------------
     validation: name, plus at least one of phone / email
     ------------------------------------------------------------------ */
  function validate(d) {
    var errs = [];
    if (!d.name) {
      errs.push({ key: 'name', el: f.name, msg: 'Please enter your name.' });
    }
    var digits = d.phone.replace(/\D/g, '');
    var phoneOk = /^[+()\d\s.\-]+$/.test(d.phone) && digits.length >= 7 && digits.length <= 15;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email);

    if (!d.phone && !d.email) {
      errs.push({ key: 'contact', el: f.phone, msg: 'Please add a phone number or an email address so we can reply.' });
    } else {
      if (d.phone && !phoneOk) {
        errs.push({ key: 'phone', el: f.phone, msg: 'That phone number does not look right. Check it, or clear it and use your email instead.' });
      }
      if (d.email && !emailOk) {
        errs.push({ key: 'email', el: f.email, msg: 'That email address does not look right. Check it, or clear it and use your phone number instead.' });
      }
    }
    return errs;
  }

  var shown = [];                           /* errors on screen: { key, msg, li } */

  function clearErrors() {
    shown = [];
    errBox.hidden = true;
    while (errList.firstChild) { errList.removeChild(errList.firstChild); }
    nameErr.hidden = true; nameErr.textContent = '';
    contactErr.hidden = true; contactErr.textContent = '';
    [f.name, f.phone, f.email].forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }

  function setInvalid(el, on) {
    if (on) { el.setAttribute('aria-invalid', 'true'); } else { el.removeAttribute('aria-invalid'); }
  }

  /* the summary box, the inline messages and every aria-invalid flag are drawn from `shown` */
  function paintErrors() {
    var has = function (k) { return shown.some(function (er) { return er.key === k; }); };
    var nameMsgs = shown.filter(function (er) { return er.key === 'name'; }).map(function (er) { return er.msg; });
    var contactMsgs = shown.filter(function (er) { return er.key !== 'name'; }).map(function (er) { return er.msg; });
    nameErr.textContent = nameMsgs.join(' ');
    nameErr.hidden = !nameMsgs.length;
    contactErr.textContent = contactMsgs.join(' ');
    contactErr.hidden = !contactMsgs.length;
    setInvalid(f.name, has('name'));
    setInvalid(f.phone, has('contact') || has('phone'));
    setInvalid(f.email, has('contact') || has('email'));
    errBox.hidden = !shown.length;
  }

  function showErrors(errs) {
    clearErrors();
    errs.forEach(function (er) {
      var li = document.createElement('li');
      li.textContent = er.msg;
      errList.appendChild(li);
      shown.push({ key: er.key, msg: er.msg, li: li });
    });
    paintErrors();
    errs[0].el.focus();
  }

  /* typing drops the messages the visitor has just resolved (and their summary lines). It never
     adds one, so nothing flashes red while a number is half typed; submit does the full check. */
  function pruneErrors() {
    if (!shown.length) return;
    var live = validate(readValues()).map(function (er) { return er.key; });
    var kept = shown.filter(function (er) {
      if (live.indexOf(er.key) !== -1) return true;
      errList.removeChild(er.li);
      return false;
    });
    if (kept.length === shown.length) return;
    shown = kept;
    paintErrors();
  }
  [f.name, f.phone, f.email].forEach(function (el) { el.addEventListener('input', pruneErrors); });

  /* ------------------------------------------------------------------
     compose + mailto
     ------------------------------------------------------------------ */
  function compose(d) {
    var service = d.service || 'General enquiry';
    var area = d.area || 'area not given';
    var subject = 'Quote request: ' + service + ' (' + area + ')';
    var head = [
      'Quote request for Inline Drainage',
      '',
      'Name: ' + d.name,
      'Phone: ' + (d.phone || 'not given'),
      'Email: ' + (d.email || 'not given'),
      'Area: ' + (d.area || 'not given'),
      'Service: ' + (d.service || 'not specified'),
      '',
      'Message:'
    ];
    var message = d.message || '(no message)';
    var tail = ['', 'Drafted with the Inline Drainage website quote form.'];
    var lines = head.concat(message.split('\n'), tail);
    return { subject: subject, head: head, message: message, tail: tail, lines: lines, text: lines.join('\n') };
  }

  /* the start of the message with an ellipsis after it */
  function messageStart(message, n) {
    return clip(message, n).replace(/\s+$/, '') + '…';
  }

  /* { url, cut }. Each line carries user-supplied text, so each line is encoded; lines are joined with an
     encoded CRLF, which is what mail clients expect. If the link would pass MAX_URL only the message is
     shortened (to the longest start that fits): the name, phone, email, area and service lines stay whole. */
  function mailtoUrl(msg) {
    var enc = encodeURIComponent;
    var base = 'mailto:' + TO + '?subject=' + enc(msg.subject);
    function build(message) {
      return base + '&body=' + msg.head.concat(message.split('\n'), msg.tail).map(enc).join('%0D%0A');
    }
    var url = build(msg.message);
    if (url.length <= MAX_URL) { return { url: url, cut: false }; }

    var lo = 0;
    var hi = msg.message.length;
    while (lo < hi) {                       /* the link only gets longer as more of the message is kept */
      var mid = Math.ceil((lo + hi) / 2);
      if (build(messageStart(msg.message, mid)).length <= MAX_URL) { lo = mid; } else { hi = mid - 1; }
    }
    url = build(messageStart(msg.message, lo));
    /* only a name and email made of very long multi-byte text can still be over: send the subject alone */
    if (url.length > MAX_URL) { url = base; }
    return { url: url, cut: true };
  }

  /* ------------------------------------------------------------------
     confirmation panel
     ------------------------------------------------------------------ */
  var copyText = '';
  var copyTimer = 0;

  function showConfirm(msg, link) {
    subjectEl.textContent = msg.subject;
    bodyEl.textContent = msg.text;                 /* the whole message, which is also what Copy copies */
    mailAgain.setAttribute('href', link.url);
    cutNote.hidden = !link.cut;
    copyText = 'To: ' + TO + '\nSubject: ' + msg.subject + '\n\n' + msg.text;
    copyLabel.textContent = 'Copy message';
    copyStatus.textContent = '';
    form.hidden = true;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    panel.focus({ preventScroll: true });
  }

  function showForm() {
    if (!form.hidden) return;
    panel.hidden = true;
    form.hidden = false;
  }

  function selectBody() {
    var sel = window.getSelection && window.getSelection();
    if (!sel) return;
    var range = document.createRange();
    range.selectNodeContents(bodyEl);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function legacyCopy(text) {
    var back = document.activeElement;             /* the temporary textarea takes focus; give it back afterwards */
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'vh';
    document.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (err) { /* old browsers */ }
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err2) { ok = false; }
    document.body.removeChild(ta);
    if (back && back.focus) { back.focus({ preventScroll: true }); }
    return ok;
  }

  function copyDone(ok) {
    window.clearTimeout(copyTimer);
    if (ok) {
      copyLabel.textContent = 'Copied';
      copyStatus.textContent = 'Message copied. Paste it into a new email to ' + TO + '.';
    } else {
      selectBody();
      copyLabel.textContent = 'Copy message';
      copyStatus.textContent = 'Copy did not work here. The message is selected, so press and hold or use your copy shortcut.';
    }
    copyTimer = window.setTimeout(function () { copyLabel.textContent = 'Copy message'; }, 3000);
  }

  copyBtn.addEventListener('click', function () {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(copyText).then(
        function () { copyDone(true); },
        function () { copyDone(legacyCopy(copyText)); }
      );
    } else {
      copyDone(legacyCopy(copyText));
    }
  });

  editBtn.addEventListener('click', function () {
    showForm();
    form.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    f.name.focus({ preventScroll: true });
  });

  /* ------------------------------------------------------------------
     submit
     ------------------------------------------------------------------ */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = readValues();
    var errs = validate(d);
    if (errs.length) { showErrors(errs); return; }
    clearErrors();

    var msg = compose(d);
    var link = mailtoUrl(msg);
    showConfirm(msg, link);                /* panel first, so it is there whatever the mail app does */
    window.location.href = link.url;
  });

  /* ------------------------------------------------------------------
     CTAs: data-service / data-area / data-quote
     Services and areas preselect the matching <select>, then we scroll to the form
     inside #contact. Without JS these are plain #contact links.
     ------------------------------------------------------------------ */
  function setSelect(sel, value) {
    if (!sel || !value) return false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === value || sel.options[i].text === value) {
        sel.selectedIndex = i;
        return true;
      }
    }
    return false;
  }

  function flash(sel) {
    var wrap = sel && sel.parentNode;
    if (!wrap) return;
    wrap.classList.remove('is-flash');
    void wrap.offsetWidth;                  /* restart the animation */
    wrap.classList.add('is-flash');
    window.setTimeout(function () { wrap.classList.remove('is-flash'); }, 1500);
  }

  function openQuote(a, fromKeyboard) {
    var svc = a.getAttribute('data-service');
    var area = a.getAttribute('data-area');
    var notes = [];

    showForm();
    if (svc && setSelect(f.service, svc)) { flash(f.service); notes.push('Service set to ' + svc + '.'); }
    if (area && setSelect(f.area, area)) { flash(f.area); notes.push('Area set to ' + area + '.'); }
    if (live) { live.textContent = notes.join(' '); }

    /* picking a service or area means "I want to fill this in": land on the form itself.
       The generic quote buttons land on the top of the contact block (call buttons first). */
    var target = (svc || area) && quoteBox ? quoteBox : (contact.querySelector('.contact__grid') || contact);
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    if (window.history && window.history.replaceState) { window.history.replaceState(null, '', '#contact'); }

    /* keyboard-triggered click: move focus to the control that was set. The generic
       quote buttons use the contact heading, so the next Tab carries on from there, not from the button */
    if (fromKeyboard) {
      var el = svc ? f.service : (area ? f.area : byId('contact-title'));
      if (el) { el.focus({ preventScroll: true }); }
    }
  }

  function selectedText() {
    var sel = window.getSelection && window.getSelection();
    return sel ? String(sel) : '';
  }

  /* A click anywhere on a service card acts as its CTA (the link stays the keyboard / AT target). A mouse
     click waits out the double-click window and gives way to text selection (a double-click on a word, or a
     drag), so copying a description does not throw the page down to the form. */
  var cardTimer = 0;

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!e.target.closest || !contact) return;

    var a = e.target.closest('a[data-service], a[data-area], a[data-quote]');
    if (a) {
      e.preventDefault();
      openQuote(a, e.detail === 0);          /* detail 0: the click came from the keyboard */
      return;
    }

    var card = e.target.closest('.svc');
    if (!card || e.target.closest('a, button')) return;
    var cta = card.querySelector('a[data-service]');
    window.clearTimeout(cardTimer);
    if (!cta || e.detail > 1 || selectedText()) return;
    cardTimer = window.setTimeout(function () {
      if (!selectedText()) { openQuote(cta, false); }
    }, e.pointerType === 'mouse' ? 260 : 0);
  });
})();
