/**
 * Cloudflare Pages Function: /api/quote
 *
 * GET  -> public form configuration ({ turnstileSiteKey }) so no key is hardcoded in HTML.
 * POST -> validates a quote request and emails it to dispatch through Resend.
 *
 * Environment (Pages > Settings > Variables and Secrets):
 *   RESEND_API_KEY        secret   Resend API key
 *   QUOTE_TO_EMAIL        plain    Dispatch inbox that receives requests
 *   QUOTE_FROM_EMAIL      plain    Sender on a domain verified in Resend, e.g. "JLC Quotes <quotes@your-domain>"
 *   TURNSTILE_SITE_KEY    plain    optional; enables the Turnstile widget
 *   TURNSTILE_SECRET_KEY  secret   optional; required whenever TURNSTILE_SITE_KEY is set
 *
 * The function never reports success unless Resend accepted the message.
 */

const MAX_BODY_BYTES = 16 * 1024;
const MIN_FILL_MS = 3000;
const PROVIDER_TIMEOUT_MS = 10000;

const SERVICES = [
  'Lead Escort', 'Chase Escort', 'Lead & Chase Escort',
  'High-Pole Escort', 'Route Survey', 'Oversize-Load Coordination',
];

// name: [required, maxLength, label]
const FIELDS = {
  name:        [true, 100, 'Contact name'],
  company:     [false, 120, 'Company'],
  email:       [true, 160, 'Email'],
  phone:       [false, 30, 'Phone'],
  service:     [true, 40, 'Service'],
  date:        [false, 10, 'Preferred move date'],
  origin:      [true, 120, 'Origin'],
  destination: [true, 120, 'Destination'],
  height:      [false, 20, 'Height'],
  width:       [false, 20, 'Width'],
  length:      [false, 20, 'Length'],
  weight:      [false, 20, 'Gross weight'],
  details:     [true, 3000, 'Load and project details'],
};

const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHONE_RE = /^[0-9+().\-\s]{7,30}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Strip control characters. Single-line fields lose newlines too; multi-line keeps \n only. */
function clean(value, multiline) {
  let s = String(value).normalize('NFC').replace(/\r\n?/g, '\n');
  s = multiline
    ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F\u2028\u2029]/g, '')
    : s.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, ' ');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients; other controls still apply
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function readBody(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return { error: 'too_large' };
  const reader = request.body && request.body.getReader();
  if (!reader) return { error: 'empty' };
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { try { await reader.cancel(); } catch {} return { error: 'too_large' }; }
    chunks.push(value);
  }
  const buf = new Uint8Array(size); let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  try { return { data: JSON.parse(new TextDecoder().decode(buf)) }; } catch { return { error: 'bad_json' }; }
}

function validate(raw) {
  const out = {}; const fields = {};
  for (const [key, [required, max, label]] of Object.entries(FIELDS)) {
    const v = raw[key];
    if (v !== undefined && v !== null && typeof v !== 'string') { fields[key] = `${label} is invalid.`; continue; }
    const s = clean(v || '', key === 'details');
    if (required && !s) { fields[key] = `Enter the ${label.toLowerCase()}.`; continue; }
    if (s.length > max) { fields[key] = `${label} must be ${max} characters or fewer.`; continue; }
    out[key] = s;
  }
  if (out.email && !EMAIL_RE.test(out.email)) fields.email = 'Enter a valid email address.';
  if (out.phone && !PHONE_RE.test(out.phone)) fields.phone = 'Use digits, spaces, + ( ) and - only.';
  if (out.service && !SERVICES.includes(out.service)) fields.service = 'Choose a service from the list.';
  if (out.details && out.details.length < 10) fields.details = 'Add a little more detail about the load.';
  if (out.date) {
    const t = DATE_RE.test(out.date) ? Date.parse(out.date + 'T00:00:00Z') : NaN;
    const now = Date.now(), day = 86400000;
    if (Number.isNaN(t) || t < now - 2 * day || t > now + 730 * day) fields.date = 'Choose a date between today and two years from now.';
  }
  return { out, fields };
}

async function verifyTurnstile(token, secret, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const res = await r.json();
    return res.success === true && (!res.action || res.action === 'quote');
  } catch (e) {
    console.error('turnstile_verify_error', e && e.name);
    return false;
  }
}

function buildEmail(d, meta) {
  const line = (label, v) => `${label}: ${v || '—'}`;
  return [
    'New pilot escort request from the website.',
    '',
    line('Service', d.service),
    line('Preferred move date', d.date),
    line('Origin', d.origin),
    line('Destination', d.destination),
    '',
    'LOAD DIMENSIONS',
    line('Height', d.height), line('Width', d.width), line('Length', d.length), line('Gross weight', d.weight),
    '',
    'DETAILS',
    d.details,
    '',
    'CONTACT',
    line('Name', d.name), line('Company', d.company), line('Email', d.email), line('Phone', d.phone),
    '',
    `Received ${meta.received} UTC${meta.country ? ' · request country ' + meta.country : ''}.`,
    'Reply to this email to respond to the requester. This request is not a booking.',
  ].join('\n');
}

export async function onRequestGet({ env }) {
  return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
}

export async function onRequestPost({ request, env }) {
  // 1. Configuration — fail closed and say so.
  if (!env.RESEND_API_KEY || !env.QUOTE_TO_EMAIL || !env.QUOTE_FROM_EMAIL) {
    console.error('quote_not_configured');
    return json({ ok: false, code: 'not_configured', error: 'Online requests are not being accepted yet.' }, 503);
  }
  if (env.TURNSTILE_SITE_KEY && !env.TURNSTILE_SECRET_KEY) {
    console.error('turnstile_secret_missing');
    return json({ ok: false, code: 'not_configured', error: 'Online requests are not being accepted yet.' }, 503);
  }

  // 2. Transport checks.
  if (!sameOrigin(request)) return json({ ok: false, code: 'forbidden', error: 'Request rejected.' }, 403);
  const ctype = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!ctype.startsWith('application/json')) return json({ ok: false, code: 'bad_request', error: 'Unsupported request format.' }, 415);
  const { data, error } = await readBody(request);
  if (error === 'too_large') return json({ ok: false, code: 'bad_request', error: 'Request is too large. Shorten the details and try again.' }, 413);
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return json({ ok: false, code: 'bad_request', error: 'Invalid request.' }, 400);

  // 3. Anti-spam: honeypot and minimum fill time. Bots get an error, never a fake success.
  if (typeof data.hp_field === 'string' && data.hp_field.trim() !== '') {
    return json({ ok: false, code: 'verification_failed', error: 'Submission could not be verified.' }, 400);
  }
  const elapsed = Number(data.elapsedMs);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS) {
    return json({ ok: false, code: 'too_fast', error: 'Submission was sent too quickly.' }, 400);
  }

  // 4. Field validation (whitelist; unknown keys ignored).
  const { out, fields } = validate(data);
  if (Object.keys(fields).length) return json({ ok: false, code: 'invalid', error: 'Some fields need attention.', fields }, 422);

  // 5. Turnstile, server-side, when configured.
  if (env.TURNSTILE_SECRET_KEY) {
    const ok = await verifyTurnstile(data.turnstileToken, env.TURNSTILE_SECRET_KEY, request.headers.get('CF-Connecting-IP'));
    if (!ok) return json({ ok: false, code: 'verification_failed', error: 'Spam check failed.' }, 403);
  }

  // 6. Deliver. Plain text only; subject built from whitelisted values.
  const subjectName = out.name.slice(0, 60);
  const payload = {
    from: env.QUOTE_FROM_EMAIL,
    to: env.QUOTE_TO_EMAIL.split(',').map(s => s.trim()).filter(Boolean),
    reply_to: out.email,
    subject: `Escort request: ${out.service} – ${subjectName}`,
    text: buildEmail(out, {
      received: new Date().toISOString().replace('T', ' ').slice(0, 16),
      country: request.cf && typeof request.cf.country === 'string' ? request.cf.country : '',
    }),
  };

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (r.status === 429) { console.error('resend_rate_limited'); return json({ ok: false, code: 'delivery_failed', error: 'Delivery is busy. Try again shortly.' }, 503); }
    if (!r.ok) { console.error('resend_error', r.status); return json({ ok: false, code: 'delivery_failed', error: 'Delivery failed.' }, 502); }
    const res = await r.json().catch(() => ({}));
    if (!res || !res.id) { console.error('resend_no_id'); return json({ ok: false, code: 'delivery_failed', error: 'Delivery not confirmed.' }, 502); }
    return json({ ok: true });
  } catch (e) {
    console.error('resend_exception', e && e.name);
    return json({ ok: false, code: 'delivery_failed', error: 'Delivery failed.' }, 502);
  }
}
