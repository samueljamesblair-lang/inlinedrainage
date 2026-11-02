/* contact.js: quote request -> mailto draft.
   There is no backend. On submit we validate, build a mailto: URL (every visitor-supplied
   value goes through encodeURIComponent, newlines normalised to CRLF, no cc/bcc, the whole
   URL capped at MAX_URL characters), show a confirmation panel with the composed message +
   Copy + call alternatives, and then hand the URL to the browser. Anything derived from
   user input is written with textContent. */
(function () {
  'use strict';
  var win = window, doc = document;
  var I = win.Inline = win.Inline || {};
  var form = doc.getElementById('quote-form');
  var sent = doc.getElementById('quote-sent');
  if (!form || !sent) return;

  var TO = 'inlinedrainage@outlook.com';
  var MAX_URL = 1900;                       // the whole mailto URL: keep well inside what mail clients accept
  var NOTE = '\n[message shortened by the website form: ask the sender for the full text]';   // for Ben and Patrick, who read the email
  var enc = encodeURIComponent;
  var $ = function (id) { return doc.getElementById(id); };
  var f = {
    name: $('f-name'), phone: $('f-phone'), email: $('f-email'),
    area: $('f-area'), service: $('f-service'), msg: $('f-msg')
  };
  var errBox = $('form-error');
  var subjEl = $('sent-subject'), msgEl = $('sent-msg'), noteEl = $('sent-note');
  var copyBtn = $('copy-msg'), copyLabel = $('copy-label'), copyStatus = $('copy-status');
  var composed = '', again = $('sent-mailto');

  function setErr(input, id, text) {
    var box = $(id);
    if (text) {
      input.setAttribute('aria-invalid', 'true');
      if (box) { box.textContent = text; box.hidden = false; }
    } else {
      input.removeAttribute('aria-invalid');
      if (box) { box.textContent = ''; box.hidden = true; }
    }
  }
  function clearErrors() {
    setErr(f.name, 'err-name', ''); setErr(f.phone, 'err-phone', ''); setErr(f.email, 'err-email', '');
    errBox.textContent = ''; errBox.hidden = true;
  }

  function values() {
    return {
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      email: f.email.value.trim(),
      area: f.area.value,
      service: f.service.value,
      message: f.msg.value.replace(/\r\n|\r/g, '\n').trim()
    };
  }

  function validate(v) {
    var bad = [];
    if (!v.name) bad.push([f.name, 'err-name', 'Please enter your name.']);
    var digits = v.phone.replace(/\D/g, '');
    if (v.phone && digits.length < 6) bad.push([f.phone, 'err-phone', 'That phone number looks too short.']);
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) bad.push([f.email, 'err-email', 'That email address does not look right.']);
    if (!v.phone && !v.email) {
      bad.push([f.phone, 'err-phone', 'Add a phone number or an email address.']);
      bad.push([f.email, 'err-email', '']);
    }
    return bad;
  }

  /* one line of the email: label + value, every value percent-encoded */
  function line(label, value) { return enc(label + ': ' + value); }
  var CRLF = '%0D%0A';
  function crlf(text) { return text.replace(/\r\n|\r|\n/g, '\r\n'); }

  function compose(v, message) {
    var service = v.service || 'General enquiry';
    var area = v.area || 'area not given';
    var subject = 'Quote request: ' + service + ' (' + area + ')';
    var msg = crlf(message || '(no message)');
    var plain = [
      'Quote request from the Inline Drainage website', '',
      'Name: ' + v.name,
      'Phone: ' + (v.phone || 'not given'),
      'Email: ' + (v.email || 'not given'),
      'Suburb / area: ' + (v.area || 'not given'),
      'Service: ' + (v.service || 'not specified'), '',
      'Message:', msg
    ].join('\r\n');
    var body = [
      enc('Quote request from the Inline Drainage website'), '',
      line('Name', v.name),
      line('Phone', v.phone || 'not given'),
      line('Email', v.email || 'not given'),
      line('Suburb / area', v.area || 'not given'),
      line('Service', v.service || 'not specified'), '',
      enc('Message:'), enc(msg)
    ].join(CRLF);
    var url = 'mailto:' + TO + '?subject=' + enc(subject) + '&body=' + body;
    return { subject: subject, plain: plain, url: url };
  }

  /* Over MAX_URL, only the message is shortened: to the longest start of it whose draft still fits (found by halving). It is cut on a
     whole character, because encodeURIComponent throws on half a surrogate pair (an emoji). Name, phone and email carry maxlength in the
     form, so even if every one of their characters took nine characters of URL they leave room for the note. */
  function cut(text, n) {
    var t = text.slice(0, n), last = t.charCodeAt(t.length - 1);
    return last >= 0xD800 && last <= 0xDBFF ? t.slice(0, -1) : t;
  }
  function draft(v) {
    var c = compose(v, v.message);
    if (c.url.length <= MAX_URL || !v.message) return { c: c, shortened: false };
    var lo = 0, hi = v.message.length, best = compose(v, NOTE.replace(/^\s+/, ''));
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, t = compose(v, cut(v.message, mid).replace(/\s+$/, '') + NOTE);
      if (t.url.length <= MAX_URL) { best = t; lo = mid + 1; } else hi = mid - 1;
    }
    return { c: best, shortened: true };
  }

  function showSent(subject, plain, truncated, url) {
    if (again && url) again.setAttribute('href', url);
    form.hidden = true;
    sent.hidden = false;
    subjEl.textContent = subject;
    msgEl.textContent = plain.replace(/\r\n/g, '\n');
    noteEl.hidden = !truncated;
    noteEl.textContent = truncated ? 'Your message was too long for an email link, so the email draft carries only the start of it. The full message is shown above: use Copy message to send all of it.' : '';
    copyLabel.textContent = 'Copy message';
    var title = $('sent-title');
    /* the panel is taller than a phone screen: line its TOP up under the header (html scroll-padding-top) so the heading and
       the "Nothing has been sent yet" line are what the visitor sees, not the message preview at the bottom */
    sent.scrollIntoView({ behavior: I.reduced && I.reduced() ? 'auto' : 'smooth', block: 'start' });
    if (title) title.focus({ preventScroll: true });
  }
  function showForm() {
    sent.hidden = true;
    form.hidden = false;
  }
  I.contact = { showForm: showForm };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var v = values(), bad = validate(v);
    if (bad.length) {
      bad.forEach(function (b) { setErr(b[0], b[1], b[2]); });
      errBox.textContent = !v.name ? 'Please check the highlighted fields.' : 'Please give us a phone number or an email address so we can reply.';
      errBox.hidden = false;
      bad[0][0].focus();
      return;
    }
    var d = draft(v), c = d.c;
    composed = compose(v, v.message).plain;      // the panel (and Copy) always carry the full text
    showSent(c.subject, composed, d.shortened, c.url);
    win.location.href = c.url;
  });

  /* clear a field's error as soon as the visitor edits it */
  [f.name, f.phone, f.email].forEach(function (input) {
    input.addEventListener('input', function () {
      if (input === f.name) setErr(f.name, 'err-name', '');
      else { setErr(f.phone, 'err-phone', ''); setErr(f.email, 'err-email', ''); }
      if (!errBox.hidden) { errBox.hidden = true; errBox.textContent = ''; }
    });
  });

  /* ---- copy ---- */
  function copyText(text) {
    if (navigator.clipboard && win.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr-copy';
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy') ? resolve() : reject(new Error('copy refused')); }
      catch (err) { reject(err); }
      finally { doc.body.removeChild(ta); }
    });
  }
  copyBtn.addEventListener('click', function () {
    var text = 'To: ' + TO + '\nSubject: ' + subjEl.textContent + '\n\n' + (composed || msgEl.textContent).replace(/\r\n/g, '\n');
    copyText(text).then(function () {
      copyLabel.textContent = 'Copied';
      copyStatus.textContent = 'Message copied to the clipboard.';
    }, function () {
      var range = doc.createRange(); range.selectNodeContents(msgEl);
      var sel = win.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      copyLabel.textContent = 'Press copy on your keyboard';
      copyStatus.textContent = 'Copy was blocked. The message is selected, so copy it with your keyboard.';
    });
    win.setTimeout(function () { copyLabel.textContent = 'Copy message'; }, 2600);
  });
  $('edit-msg').addEventListener('click', function () {
    showForm();
    f.name.focus({ preventScroll: true });
    form.scrollIntoView({ behavior: I.reduced && I.reduced() ? 'auto' : 'smooth', block: 'start' });   // same as showSent: top of the panel, not its foot
  });
})();
