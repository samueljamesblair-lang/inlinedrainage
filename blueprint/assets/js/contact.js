/* contact.js: the quote request form.
   There is no backend, so submitting builds a mailto: link. The page says so plainly, shows the
   composed message with a Copy button and tap-to-call fallbacks (webmail users get nothing from mailto),
   and only ever writes user-supplied text into the DOM with textContent. */

const TO = 'inlinedrainage@outlook.com';
const AREAS = ['Wellington', 'Lower Hutt', 'Upper Hutt', 'Porirua', 'Kāpiti Coast', 'Wairarapa'];
const SERVICES = [
  'Development Siteworks', 'Stormwater Drainage', 'Wastewater & Sewage', 'Residential Drainage',
  'Watermain Connections', 'Drain Clearing', 'Digger & Truck Hire',
];
const enc = encodeURIComponent;
const MAX_URL = 1900;                                       // the longest mailto: link we hand over; some browsers and mail apps drop longer ones
const CUT = '\u2026 [message shortened]';                    // marks where a long message was cut, so the person reading the draft knows

/** the one place that leaves the page; kept as a tiny seam so tests can observe the composed link */
export const hooks = {
  navigate(url) { window.location.href = url; },
};

// strip control characters (keeps tab / line breaks), trim, normalise every newline to CRLF
const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
const crlf = (s) => s.replace(/\r\n|\r|\n/g, '\r\n');
const oneLine = (s) => clean(s).replace(/\s+/g, ' ');

export function initContact({ root }) {
  const form = root.querySelector('#quoteForm');
  if (!form) return null;
  const f = {
    name: form.elements.name,
    phone: form.elements.phone,
    email: form.elements.email,
    area: form.elements.area,
    service: form.elements.service,
    message: form.elements.message,
  };
  const errEls = {
    name: root.querySelector('#e-name'),
    phone: root.querySelector('#e-phone'),
    email: root.querySelector('#e-email'),
    contact: root.querySelector('#e-contact'),
  };
  const confirm = root.querySelector('#confirm');
  const confirmMsg = root.querySelector('#confirmMsg');
  const copyBtn = root.querySelector('#copyBtn');
  const editBtn = root.querySelector('#editBtn');
  const confirmShort = root.querySelector('#confirmShort');
  const copyStatus = root.querySelector('#copyStatus');
  const formStatus = root.querySelector('#formStatus');

  /* ---------- validation ---------- */
  function setError(key, input, text) {
    const el = errEls[key];
    el.textContent = text;
    el.hidden = false;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.closest('.field') && input.closest('.field').classList.add('is-bad');
    }
  }
  function clearErrors() {
    Object.values(errEls).forEach((el) => { el.textContent = ''; el.hidden = true; });
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    form.querySelectorAll('.is-bad').forEach((e) => e.classList.remove('is-bad'));
  }

  function read() {
    const area = clean(f.area.value);
    const service = clean(f.service.value);
    return {
      name: oneLine(f.name.value),
      phone: oneLine(f.phone.value),
      email: oneLine(f.email.value),
      area: AREAS.includes(area) ? area : '',
      service: SERVICES.includes(service) ? service : '',
      message: crlf(clean(f.message.value)),
    };
  }

  // one rule per field: its message, or '' when the value is fine (phone and email are optional, but must look right if given).
  // Used by submit and by the live check further down, so a message goes away under the same rule that raised it.
  const RULES = {
    name: (d) => (d.name.length < 2 ? 'Please enter your name.' : ''),
    phone: (d) => (d.phone && d.phone.replace(/\D/g, '').length < 7 ? 'That phone number looks too short.' : ''),
    email: (d) => (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) ? 'That email address does not look right.' : ''),
  };

  function validate(d) {
    clearErrors();
    let first = null;
    const bad = (key, input, text) => { setError(key, input, text); first = first || input; };
    const check = (key) => { const text = RULES[key](d); if (text) bad(key, f[key], text); };

    check('name');
    if (!d.phone && !d.email) {
      bad('contact', f.phone, 'Please add a phone number or an email address so we can get back to you.');
    } else {
      check('phone');
      check('email');
    }
    if (first) first.focus();
    return !first;
  }

  /* ---------- compose ---------- */
  function compose(d) {
    const area = d.area || 'Area not specified';
    const service = d.service || 'Service not specified';
    const subject = `Quote request: ${service} (${area})`;

    // [label, user-supplied value]; each value is encoded individually below
    const rows = [
      ['Name', d.name],
      ['Phone', d.phone || '-'],
      ['Email', d.email || '-'],
      ['Area', area],
      ['Service', service],
    ];
    const msg = d.message || '-';

    const plain = [
      'Quote request from the Inline Drainage website',
      '',
      ...rows.map(([k, v]) => `${k}: ${v}`),
      '',
      'Message:',
      msg,
    ].join('\r\n');

    const NL = enc('\r\n');
    const head = `mailto:${TO}?subject=${enc(subject)}&body=` + [
      enc('Quote request from the Inline Drainage website'),
      '',
      ...rows.map(([k, v]) => enc(k + ': ') + enc(v)),
      '',
      enc('Message:'),
    ].join(NL) + NL;
    const build = (m) => head + enc(m);

    // The link is capped at MAX_URL and only the message gives way (a multi-byte character costs up to 12 characters once encoded).
    // Cut on whole characters, never half an emoji, at the longest length that still fits; `plain` (shown, and copied) stays complete.
    let url = build(msg);
    const shortened = url.length > MAX_URL;
    if (shortened) {
      const chars = Array.from(msg);
      let lo = 0;
      let hi = chars.length;
      while (lo < hi) {                                      // the link only grows with the prefix, so a binary search finds the longest fit
        const mid = (lo + hi + 1) >> 1;
        if (build(chars.slice(0, mid).join('') + CUT).length <= MAX_URL) lo = mid; else hi = mid - 1;
      }
      url = build(chars.slice(0, lo).join('').trimEnd() + CUT);
    }
    return { subject, plain, url, shortened };
  }

  /* ---------- submit ---------- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = read();
    if (!validate(d)) return;
    const mail = compose(d);

    confirmMsg.textContent = `To: ${TO}\nSubject: ${mail.subject}\n\n${mail.plain.replace(/\r\n/g, '\n')}`;
    copyStatus.textContent = '';
    confirmShort.hidden = !mail.shortened;
    form.hidden = true;
    confirm.hidden = false;
    confirm.focus({ preventScroll: true });
    confirm.scrollIntoView({ block: 'start', behavior: 'auto' });      // 'start' honours scroll-padding-top; 'nearest' does nothing for a panel taller than the screen
    if (formStatus) formStatus.textContent = 'Message composed. Your email app should open.';

    hooks.navigate(mail.url);
  });

  // a message (with its red border and aria-invalid) goes away as the visitor fixes the field, so nothing stale stays on screen or in the
  // accessible description; while the value is still wrong it stays until the next submit or the next fix
  function dismiss(key) {
    const input = key === 'contact' ? f.phone : f[key];
    errEls[key].textContent = '';
    errEls[key].hidden = true;
    input.removeAttribute('aria-invalid');
    input.closest('.field').classList.remove('is-bad');
  }
  ['input', 'change'].forEach((evt) => form.addEventListener(evt, (e) => {
    const key = ['name', 'phone', 'email'].find((k) => e.target === f[k]);
    if (!key) return;
    if (key !== 'name' && !errEls.contact.hidden) dismiss('contact');          // typing in either answers "add a phone or an email"
    if (!errEls[key].hidden && !RULES[key](read())) dismiss(key);
  }));

  /* ---------- confirmation actions ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) { /* fall through to the legacy path */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'sr';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }

  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(confirmMsg.textContent);
    copyStatus.textContent = ok ? 'Copied. Paste it into an email to ' + TO : 'Could not copy automatically. Select the text above and copy it.';
    if (!ok) {
      const range = document.createRange();
      range.selectNodeContents(confirmMsg);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  editBtn.addEventListener('click', () => {
    confirm.hidden = true;
    form.hidden = false;
    f.name.focus({ preventScroll: true });
    form.scrollIntoView({ block: 'start', behavior: 'auto' });         // the first field sits just below the form's top edge
  });

  /* ---------- preselect API (used by the data-service / data-area CTAs) ---------- */
  function preselect({ service, area }) {
    if (confirm && !confirm.hidden) { confirm.hidden = true; form.hidden = false; }
    const notes = [];
    if (service && SERVICES.includes(service)) { f.service.value = service; flash(f.service); notes.push(`Service set to ${service}`); }
    if (area && AREAS.includes(area)) { f.area.value = area; flash(f.area); notes.push(`Area set to ${area}`); }
    if (formStatus && notes.length) formStatus.textContent = notes.join('. ') + '.';
  }
  function flash(el) {
    const field = el.closest('.field') || el;
    field.classList.remove('is-pre');
    void field.offsetWidth;
    field.classList.add('is-pre');
    window.setTimeout(() => field.classList.remove('is-pre'), 1800);
  }

  return {
    preselect,
    focusFirst: () => f.name.focus({ preventScroll: true }),
    focusForm: () => form.focus({ preventScroll: true }),       // for touch: moves focus to the form without raising the on-screen keyboard
  };
}
