/* contact.js: quote request -> mailto draft.
   There is no backend. On submit we validate, build a mailto: URL (every visitor-supplied
   value goes through encodeURIComponent, newlines normalised to CRLF, no cc/bcc), show a
   confirmation panel with the composed message + Copy + call alternatives, and then hand
   the URL to the browser. Anything derived from user input is written with textContent. */
(function () {
  'use strict';
  var win = window, doc = document;
  var I = win.Inline = win.Inline || {};
  var form = doc.getElementById('quote-form');
  var sent = doc.getElementById('quote-sent');
  if (!form || !sent) return;

  var TO = 'inlinedrainage@outlook.com';
  var MAX_URL = 1900;                       // keep well inside what mail clients accept
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

  function showSent(subject, plain, truncated, url) {
    if (again && url) again.setAttribute('href', url);
    form.hidden = true;
    sent.hidden = false;
    subjEl.textContent = subject;
    msgEl.textContent = plain.replace(/\r\n/g, '\n');
    noteEl.hidden = !truncated;
    noteEl.textContent = truncated ? 'Your message was long, so the email draft carries a shortened version. Use Copy message to send the whole thing.' : '';
    copyLabel.textContent = 'Copy message';
    var title = $('sent-title');
    sent.scrollIntoView({ behavior: I.reduced && I.reduced() ? 'auto' : 'smooth', block: 'nearest' });
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
    var truncated = false, c = compose(v, v.message);
    if (c.url.length > MAX_URL && v.message) {
      truncated = true;
      var m = v.message;
      while (m.length > 40 && c.url.length > MAX_URL) {
        m = m.slice(0, Math.floor(m.length * 0.85));
        c = compose(v, m + '\n[message shortened, see the full text in the confirmation panel]');
      }
    }
    composed = compose(v, v.message).plain;      // the panel (and Copy) always carry the full text
    showSent(c.subject, composed, truncated, c.url);
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
    form.scrollIntoView({ behavior: I.reduced && I.reduced() ? 'auto' : 'smooth', block: 'nearest' });
  });
})();
