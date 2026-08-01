const http = require('http');
const path = require('path');

function req(port, method, pathname, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) };
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: h }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(chunks) }); } catch { resolve({ status: res.statusCode, raw: chunks }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function loadApp(env) {
  // Blank external provider keys so smoke tests run in mock/simulated mode
  ['RECAPTCHA_SITE_KEY','RECAPTCHA_SECRET_KEY','RECAPTCHA_PROJECT_ID','GOOGLE_CLOUD_API_KEY','GOOGLE_PLACES_API_KEY','OPENROUTER_KEY','DATAFORSEO_LOGIN','DATAFORSEO_PASSWORD','SMTP_HOST','SMTP_PASS','RANKNIBBLER_API_KEY','TEABLE_API_TOKEN'].forEach(k => {
    if (!(k in env)) process.env[k] = '';
  });
  Object.keys(env).forEach(k => process.env[k] = env[k]);
  delete require.cache[require.resolve('./server.js')];
  return require('./server.js');
}

(async () => {
  let failures = 0;
  const check = (name, ok, detail) => {
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (ok ? '' : ' | ' + detail));
    if (!ok) failures++;
  };

  // ===== PHASE 1: recaptcha NOT configured → pass-through, full flow =====
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'test';
  process.env.RECAPTCHA_SITE_KEY = '';
  process.env.RECAPTCHA_SECRET_KEY = '';
  process.env.RECAPTCHA_PROJECT_ID = '';
  process.env.GOOGLE_CLOUD_API_KEY = '';
  const app1 = loadApp({});
  await new Promise(res => { const s = app1.listen(0, () => res(s)); }).then(s => s);
  const server1 = app1.listen(0);
  await new Promise(res => server1.once('listening', res));
  const port1 = server1.address().port;

  let t = await req(port1, 'GET', '/api/config');
  check('/api/config 200', t.status === 200, t.status);
  check('config has brand.name', t.json && t.json.brand && t.json.brand.name === 'SEODominate', JSON.stringify(t.json && t.json.brand));
  check('config recaptchaSiteKey null when unset', t.json && t.json.recaptchaSiteKey === null, t.json && t.json.recaptchaSiteKey);

  t = await req(port1, 'POST', '/api/suggest-keywords', { business: 'Plumber', location: 'Austin TX' });
  check('/api/suggest-keywords 200', t.status === 200, t.status);
  check('keywords array returned', t.json && Array.isArray(t.json.keywords) && t.json.keywords.length > 0, JSON.stringify(t.json).slice(0, 120));
  check('keywords are local-intent', t.json && t.json.keywords.some(k => /plumb|leak|drain/i.test(k)), JSON.stringify(t.json && t.json.keywords));

  const t0 = Date.now();
  t = await req(port1, 'POST', '/api/gmb-audit', { business: 'Demo Plumbing Co.', location: 'Austin TX', email: 'demo@seoaudit.local', website: '', keywords: ['plumber austin', 'leak repair'], demo: true });
  const elapsed = Date.now() - t0;
  check('/api/gmb-audit demo 200', t.status === 200, t.status + ' in ' + elapsed + 'ms');
  check('audit < 8s (mock path)', elapsed < 8000, elapsed + 'ms');
  const r = t.json && t.json.report;
  check('report has score', r && r.gbp && typeof r.gbp.score === 'number', JSON.stringify(r && r.gbp && r.gbp.score));
  check('sources has demo', r && r.sources && Object.values(r.sources).some(v => v === 'demo'), JSON.stringify(r && r.sources));
  check('summary has reviewReplies', r && r.summary && Array.isArray(r.summary.reviewReplies) && r.summary.reviewReplies.length > 0, 'missing');
  check('summary has postCopy', r && r.summary && Array.isArray(r.summary.postCopy) && r.summary.postCopy.length > 0, 'missing');
  check('no persisted auditId for demo', !r.auditId || r.auditId.startsWith('demo-'), r && r.auditId);

  t = await req(port1, 'POST', '/api/gmb-audit', { business: 'Test Cafe', location: 'Denver CO', email: 'test@example.com', keywords: ['coffee denver'] });
  check('real audit 200', t.status === 200, t.status);
  const auditId = t.json && t.json.report && t.json.report.auditId;
  check('real audit has auditId', !!auditId, auditId);
  if (auditId) {
    const t2 = await req(port1, 'GET', '/api/report/' + auditId);
    check('/api/report/:id 200', t2.status === 200, t2.status);
    check('report roundtrip matches', t2.json && t2.json.report && t2.json.report.auditId === auditId, '');
    const t3 = await req(port1, 'GET', '/report/' + auditId);
    check('/report/:id page 200', t3.status === 200, t3.status);
  }

  t = await req(port1, 'GET', '/api/health');
  check('/api/health 200', t.status === 200, t.status);

  await new Promise(res => server1.close(res));

  // ===== PHASE 2: recaptcha configured → enforcement =====
  process.env.RECAPTCHA_PROJECT_ID = '';
  process.env.GOOGLE_CLOUD_API_KEY = '';
  const app2 = loadApp({ RECAPTCHA_SITE_KEY: '6Le-test-site', RECAPTCHA_SECRET_KEY: '6Le-test-secret' });
  const server2 = app2.listen(0);
  await new Promise(res => server2.once('listening', res));
  const port2 = server2.address().port;

  t = await req(port2, 'GET', '/api/config');
  check('config exposes recaptcha site key', t.json && t.json.recaptchaSiteKey === '6Le-test-site', t.json && t.json.recaptchaSiteKey);
  check('config does NOT leak secret', !t.json || !t.json.recaptchaSecretKey, 'secret leaked');

  t = await req(port2, 'POST', '/api/gmb-audit', { business: 'X', location: 'Y', email: 'a@b.co', demo: true });
  check('audit 403 when token missing + configured', t.status === 403, t.status);

  t = await req(port2, 'POST', '/api/reviews', { name: 'A', email: 'a@b.co', rating: 5, content: 'x' });
  check('reviews 403 when token missing + configured', t.status === 403, t.status);

  await new Promise(res => server2.close(res));

  // ===== PHASE 3: agency multi-tenancy (register → login → brand → keys → branded audit) =====
  process.env.RECAPTCHA_SITE_KEY = '';
  process.env.RECAPTCHA_SECRET_KEY = '';
  process.env.RECAPTCHA_PROJECT_ID = '';
  process.env.GOOGLE_CLOUD_API_KEY = '';
  const app3 = loadApp({ AGENCY_KEY_ENCRYPTION_KEY: 'test-master-key-123' });
  const server3 = app3.listen(0);
  await new Promise(res => server3.once('listening', res));
  const port3 = server3.address().port;
  const uid = Date.now().toString(36);
  const agEmail = 'owner-' + uid + '@acme.com';
  const agSlug = 'acme-' + uid;

  t = await req(port3, 'POST', '/api/agency/register', { name: 'Acme SEO', email: agEmail, password: 'secret123', slug: agSlug });
  check('agency register 200', t.status === 200, t.status + ' ' + JSON.stringify(t.json).slice(0, 100));
  const agencyToken = t.json && t.json.token;
  check('agency register returns token', !!agencyToken, 'missing');
  check('agency register returns slug', t.json && t.json.agency && t.json.agency.slug === agSlug, JSON.stringify(t.json && t.json.agency));

  t = await req(port3, 'POST', '/api/agency/register', { name: 'Dup', email: agEmail, password: 'secret123' });
  check('duplicate email rejected 409', t.status === 409, t.status);

  t = await req(port3, 'POST', '/api/agency/login', { email: agEmail, password: 'wrong' });
  check('wrong password rejected 401', t.status === 401, t.status);

  t = await req(port3, 'POST', '/api/agency/login', { email: agEmail, password: 'secret123' });
  check('agency login 200', t.status === 200, t.status);

  t = await req(port3, 'GET', '/api/agency/me');
  check('agency/me without token 401', t.status === 401, t.status);

  t = await req(port3, 'GET', '/api/agency/me', null, { Authorization: 'Bearer ' + agencyToken });
  check('agency/me 200', t.status === 200, t.status);
  check('agency/me returns masked (no plaintext) keys', t.json && t.json.agency && Object.keys(t.json.agency.keys).length >= 0 && !JSON.stringify(t.json).includes('AIza'), '');
  check('agency/me has brand defaults', t.json && t.json.agency && t.json.agency.brand && t.json.agency.brand.name === 'Acme SEO', JSON.stringify(t.json && t.json.agency && t.json.agency.brand));

  t = await req(port3, 'PUT', '/api/agency/me', { brand: { name: 'Acme SEO Co', color: '#ff6600', email: 'hello@acme.com', assistantName: 'Nova', domain: 'audit.acme.com' } }, { Authorization: 'Bearer ' + agencyToken });
  check('agency brand update 200', t.status === 200, t.status);

  t = await req(port3, 'PUT', '/api/agency/me/keys', { keys: { googlePlacesKey: 'AIza-abcdef123456', openrouterKey: 'sk-or-xyz789' } }, { Authorization: 'Bearer ' + agencyToken });
  check('agency keys update 200', t.status === 200, t.status);
  check('keys stored masked', t.json && t.json.keys && t.json.keys.googlePlacesKey.startsWith('••••'), JSON.stringify(t.json && t.json.keys && t.json.keys.googlePlacesKey));

  // Branded config via x-agency header
  t = await req(port3, 'GET', '/api/config', null, { 'x-agency': agSlug });
  check('config resolves agency brand', t.status === 200 && t.json.brand.name === 'Acme SEO Co' && t.json.brand.color === '#ff6600', JSON.stringify(t.json && t.json.brand));
  check('config reports agency block', t.json && t.json.agency && t.json.agency.slug === agSlug, JSON.stringify(t.json && t.json.agency));
  check('config shows agency live keys', t.json && t.json.live && t.json.live.googlePlaces === true, JSON.stringify(t.json && t.json.live));

  // Branded config via custom-domain Host header
  t = await req(port3, 'GET', '/api/config', null, { host: 'audit.acme.com' });
  check('config resolves agency by custom domain Host', t.status === 200 && t.json.brand.name === 'Acme SEO Co', JSON.stringify(t.json && t.json.brand));

  // Branded audit routed through the agency's keys
  t = await req(port3, 'POST', '/api/gmb-audit', { business: 'Acme Plumbing', location: 'Miami FL', email: 'lead@example.com', keywords: ['plumber'] }, { 'x-agency': agSlug });
  check('agency audit 200', t.status === 200, t.status);
  check('agency audit stamped with agencySlug', t.json && t.json.report && t.json.report.agencySlug === agSlug, JSON.stringify(t.json && t.json.report && t.json.report.agencySlug));

  t = await req(port3, 'GET', '/api/agency/me/audits', null, { Authorization: 'Bearer ' + agencyToken });
  check('agency audits list has the audit', t.json && Array.isArray(t.json.audits) && t.json.audits.some(a => a.business === 'Acme Plumbing'), JSON.stringify(t.json && t.json.audits && t.json.audits.length));

  // Platform (no agency) still uses default brand
  t = await req(port3, 'GET', '/api/config');
  check('platform config unaffected', t.json && t.json.brand.name === 'SEODominate', JSON.stringify(t.json && t.json.brand));
  check('platform config has no agency', !t.json.agency, JSON.stringify(t.json && t.json.agency));

  // /a/:slug and /agency pages serve the SPA
  t = await req(port3, 'GET', '/a/' + agSlug);
  check('/a/:slug page 200', t.status === 200, t.status);
  t = await req(port3, 'GET', '/agency');
  check('/agency page 200', t.status === 200, t.status);

  await new Promise(res => server3.close(res));

  console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
