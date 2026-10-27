import { onRequestPost, onRequestGet } from '../functions/api/quote.js';
let calls = [], resendMode = 'ok';
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('siteverify')) return new Response(JSON.stringify({ success: init.body.get('response') === 'good-token', action: 'quote' }));
  if (resendMode === 'ok') return new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 });
  if (resendMode === '500') return new Response('{}', { status: 500 });
  if (resendMode === 'noid') return new Response('{}', { status: 200 });
  throw new TypeError('network');
};
const ENV = { RESEND_API_KEY: 'k', QUOTE_TO_EMAIL: 'dispatch@example.test', QUOTE_FROM_EMAIL: 'JLC <quotes@example.test>' };
const good = { name: 'Pat Driver', company: 'Acme Haul', email: 'pat@acme.test', phone: '(570) 555-0100', service: 'High-Pole Escort',
  date: '', origin: 'Scranton, PA', destination: 'Albany, NY', height: '15 ft 6 in', width: '14 ft', length: '110 ft', weight: '120,000 lb',
  details: 'Transformer move, two escorts plus high pole.', hp_field: '', elapsedMs: 9000 };
const req = (body, headers = {}) => new Request('https://jlc.example/api/quote', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://jlc.example', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const run = async (name, body, env, expectStatus, check, headers) => {
  calls = [];
  const r = await onRequestPost({ request: req(body, headers), env });
  const j = await r.json();
  const pass = r.status === expectStatus && (!check || check(j));
  console.log(pass ? 'PASS' : 'FAIL', String(r.status).padEnd(4), name, pass ? '' : JSON.stringify(j));
  if (!pass) process.exitCode = 1;
  return j;
};
await run('missing env -> 503 not_configured', good, {}, 503, j => j.code === 'not_configured' && !j.ok);
await run('valid -> 200 ok only after provider id', good, ENV, 200, j => j.ok === true && calls.length === 1);
const sent = JSON.parse(calls[0]?.init.body || '{}');
console.log(sent.reply_to === 'pat@acme.test' && sent.text.includes('Height: 15 ft 6 in') && !('html' in sent) ? 'PASS' : 'FAIL', '     email payload: plain text, reply_to set, dimensions included');
console.log('      subject =', sent.subject);
await run('honeypot -> 400, no fake success', { ...good, hp_field: 'spam' }, ENV, 400, j => j.ok === false && calls.length === 0);
await run('too fast -> 400', { ...good, elapsedMs: 500 }, ENV, 400, j => j.code === 'too_fast');
await run('bad service -> 422', { ...good, service: 'Hack' }, ENV, 422, j => j.fields.service);
await run('bad email -> 422', { ...good, email: 'x@y' }, ENV, 422, j => j.fields.email);
await run('header-injection email -> 422', { ...good, email: 'a@b.com\r\nBcc: x@y.com' }, ENV, 422, j => j.fields.email);
await run('bad phone -> 422', { ...good, phone: 'call me maybe' }, ENV, 422, j => j.fields.phone);
await run('past date -> 422', { ...good, date: '2020-01-01' }, ENV, 422, j => j.fields.date);
await run('missing required -> 422 w/ fields', { email: 'a@b.co', elapsedMs: 9000 }, ENV, 422, j => ['name','service','origin','destination','details'].every(k => j.fields[k]));
await run('non-string field -> 422', { ...good, name: { $gt: '' } }, ENV, 422, j => j.fields.name);
await run('overlong details -> 422', { ...good, details: 'x'.repeat(3001) }, ENV, 422, j => j.fields.details);
await run('oversize body -> 413', { ...good, pad: 'x'.repeat(20000) }, ENV, 413);
await run('malformed JSON -> 400', '{nope', ENV, 400);
await run('array body -> 400', '[1,2]', ENV, 400);
await run('wrong content-type -> 415', good, ENV, 415, null, { 'Content-Type': 'text/plain' });
await run('cross-origin -> 403', good, ENV, 403, null, { Origin: 'https://evil.test' });
await run('control chars stripped', { ...good, name: 'Pat\u0000\u001bDriver\nX' }, ENV, 200, () => !/[\u0000-\u001f]/.test(JSON.parse(calls[0].init.body).subject));
resendMode = '500'; await run('provider 500 -> 502 delivery_failed', good, ENV, 502, j => j.code === 'delivery_failed');
resendMode = 'noid'; await run('provider 200 w/o id -> 502 (not confirmed)', good, ENV, 502);
resendMode = 'throw'; await run('provider network error -> 502', good, ENV, 502);
resendMode = 'ok';
const TENV = { ...ENV, TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' };
await run('turnstile: no token -> 403', good, TENV, 403, j => j.code === 'verification_failed');
await run('turnstile: bad token -> 403', { ...good, turnstileToken: 'bad' }, TENV, 403);
await run('turnstile: good token -> 200', { ...good, turnstileToken: 'good-token' }, TENV, 200, j => j.ok);
await run('turnstile site key w/o secret -> 503', good, { ...ENV, TURNSTILE_SITE_KEY: 'site' }, 503);
const g = await (await onRequestGet({ env: TENV })).json();
console.log(g.turnstileSiteKey === 'site' ? 'PASS' : 'FAIL', '     GET exposes only public site key:', JSON.stringify(g));
