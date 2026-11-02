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

  function validate(d) {
    clearErrors();
    let first = null;
    const bad = (key, input, text) => { setError(key, input, text); first = first || input; };

    if (d.name.length < 2) bad('name', f.name, 'Please enter your name.');
    const digits = d.phone.replace(/\D/g, '');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email);

    if (!d.phone && !d.email) {
      bad('contact', f.phone, 'Please add a phone number or an email address so we can get back to you.');
    } else {
      if (d.phone && digits.length < 7) bad('phone', f.phone, 'That phone number looks too short.');
      if (d.email && !emailOk) bad('email', f.email, 'That email address does not look right.');
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
    const bodyEncoded = [
      enc('Quote request from the Inline Drainage website'),
      '',
      ...rows.map(([k, v]) => enc(k + ': ') + enc(v)),
      '',
      enc('Message:'),
      enc(msg),
    ].join(NL);

    const url = `mailto:${TO}?subject=${enc(subject)}&body=${bodyEncoded}`;
    return { subject, plain, url };
  }

  /* ---------- submit ---------- */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = read();
    if (!validate(d)) return;
    const mail = compose(d);

    confirmMsg.textContent = `To: ${TO}\nSubject: ${mail.subject}\n\n${mail.plain.replace(/\r\n/g, '\n')}`;
    copyStatus.textContent = '';
    form.hidden = true;
    confirm.hidden = false;
    confirm.focus({ preventScroll: true });
    confirm.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    if (formStatus) formStatus.textContent = 'Message composed. Your email app should open.';

    hooks.navigate(mail.url);
  });

  ['input', 'change'].forEach((evt) => form.addEventListener(evt, (e) => {
    const t = e.target;
    if (t && t.hasAttribute && t.hasAttribute('aria-invalid')) {
      t.removeAttribute('aria-invalid');
      t.closest('.field') && t.closest('.field').classList.remove('is-bad');
    }
    if (t === f.phone || t === f.email) { errEls.contact.hidden = true; errEls.contact.textContent = ''; }
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
    form.scrollIntoView({ block: 'nearest', behavior: 'auto' });
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

  return { preselect, focusFirst: () => f.name.focus({ preventScroll: true }) };
}
