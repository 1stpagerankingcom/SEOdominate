const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL || 'https://hook.us2.make.com/b5jpbz7soz332cqcn3n67olhg32h59k5';
const REVIEWS_FILE = path.join(__dirname, 'reviews.json');
const AUTH_TOKEN = process.env.MANAGER_TOKEN || 'seoaudit-manager-2026';

// ===== LIVE DATA CONFIG =====
const CONFIG = {
  googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || '',
  rankNibblerKey: process.env.RANKNIBBLER_API_KEY || '',
  dfsLogin: process.env.DATAFORSEO_LOGIN || '',
  dfsPassword: process.env.DATAFORSEO_PASSWORD || '',
  openrouterKey: process.env.OPENROUTER_KEY || '',
  llmBaseUrl: (process.env.LLM_BASE_URL || '').replace(/\/+$/, ''),
  teableUrl: (process.env.TEABLE_API_URL || 'https://app.teable.io').replace(/\/+$/, ''),
  teableToken: process.env.TEABLE_API_TOKEN || '',
  // Shared-table Teable base (multi-tenant: Agency link scopes every record). Defaults = live base.
  teableAgenciesTableId: process.env.TEABLE_AGENCIES_TABLE_ID || 'tbl5b86wLW5laiJvoQM',
  teableAuditsTableId: process.env.TEABLE_AUDITS_TABLE_ID || 'tblhzAPtGU4aiVYuQiV',
  teableLeadsTableId: process.env.TEABLE_LEADS_TABLE_ID || 'tblFlNBFVeISLbGWDS8',
  teableReviewsTableId: process.env.TEABLE_REVIEWS_TABLE_ID || 'tbllV46BlD4t6NmfYKl',
  serpwinWebhook: process.env.SERPWIN_WEBHOOK_URL || '',
  followupWebhook: process.env.FOLLOWUP_WEBHOOK_URL || '',
  brandName: process.env.BRAND_NAME || 'SEODominate',
  brandLogoUrl: process.env.BRAND_LOGO_URL || '',
  brandColor: process.env.BRAND_COLOR || '#6c5ce7',
  brandEmail: process.env.BRAND_EMAIL || 'hello@seodominate.org',
  aiAssistantName: process.env.AI_ASSISTANT_NAME || 'Aria',
  demoMode: process.env.DEMO_MODE === '1',
  recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || '',
  recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY || '',
  recaptchaProjectId: process.env.RECAPTCHA_PROJECT_ID || '',
  googleCloudKey: process.env.GOOGLE_CLOUD_API_KEY || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT || '587',
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  fromEmail: process.env.FROM_EMAIL || '',
  appUrl: (process.env.APP_URL || '').replace(/\/+$/, ''),
};

// Per-platform model IDs routed through OpenRouter (LLM_BASE_URL can override host)
const AI_PLATFORMS = [
  { platform: 'ChatGPT', provider: 'OpenAI', model: 'openai/gpt-4o-mini' },
  { platform: 'Claude', provider: 'Anthropic', model: 'anthropic/claude-3.5-haiku' },
  { platform: 'Gemini', provider: 'Google', model: 'google/gemini-2.5-flash' },
  { platform: 'Grok', provider: 'xAI', model: 'x-ai/grok-2-mini' },
  { platform: 'Llama', provider: 'Meta', model: 'meta-llama/llama-3.3-70b-instruct' },
  { platform: 'Perplexity', provider: 'Perplexity', model: 'perplexity/sonar' },
];

const AUDITS_FILE = path.join(__dirname, 'audits.json');
const aiCache = new Map();
const AI_CACHE_TTL = 24 * 60 * 60 * 1000;

// ===== AGENCY MULTI-TENANCY =====
// Agencies bring their own API keys + branding; audits are routed through the
// agency's config. Keys are AES-256-GCM encrypted at rest when
// AGENCY_KEY_ENCRYPTION_KEY is set (dev: 'plain:' prefix when unset).
const AGENCIES_FILE = path.join(__dirname, 'agencies.json');
const AGENCY_KEY_ENCRYPTION_KEY = process.env.AGENCY_KEY_ENCRYPTION_KEY || '';
const SESSION_SECRET = process.env.AGENCY_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const AGENCY_KEY_FIELDS = ['googlePlacesKey','rankNibblerKey','dfsLogin','dfsPassword','openrouterKey','llmBaseUrl','teableToken','teableAgenciesTableId','teableAuditsTableId','teableLeadsTableId','teableReviewsTableId','serpwinWebhook','followupWebhook','makeWebhook','smtpHost','smtpPort','smtpSecure','smtpUser','smtpPass','fromEmail','recaptchaSiteKey','recaptchaSecretKey'];
const AGENCY_BRAND_FIELDS = ['name','logoUrl','color','email','assistantName','domain'];

function loadAgencies() {
  try { if (fs.existsSync(AGENCIES_FILE)) return JSON.parse(fs.readFileSync(AGENCIES_FILE, 'utf8')); } catch {}
  return {};
}
function saveAgenciesLocal(agencies) {
  try { fs.writeFileSync(AGENCIES_FILE, JSON.stringify(agencies, null, 2), 'utf8'); } catch {}
}
function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}
function encryptSecret(plain) {
  if (!plain) return '';
  if (!AGENCY_KEY_ENCRYPTION_KEY) return 'plain:' + plain;
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(AGENCY_KEY_ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `enc:${iv.toString('base64')}:${enc.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
}
function decryptSecret(stored) {
  if (!stored) return '';
  try {
    if (stored.startsWith('plain:')) return stored.slice(6);
    if (stored.startsWith('enc:')) {
      const parts = stored.split(':');
      const iv = Buffer.from(parts[1], 'base64');
      const data = Buffer.from(parts[2], 'base64');
      const tag = Buffer.from(parts[3], 'base64');
      const key = crypto.createHash('sha256').update(AGENCY_KEY_ENCRYPTION_KEY).digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    }
  } catch {}
  return '';
}
function signSession(agencyId) {
  const payload = Buffer.from(JSON.stringify({ aid: agencyId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp < Date.now()) return null;
    return data.aid;
  } catch { return null; }
}
function newAgency(data) {
  return {
    id: crypto.randomUUID(),
    slug: data.slug,
    name: data.name || data.slug,
    email: (data.email || '').toLowerCase(),
    passwordHash: hashPassword(data.password),
    brand: {
      name: data.brandName || data.name || 'My Agency',
      logoUrl: '', color: '#6c5ce7', email: '', assistantName: 'Aria', domain: '',
    },
    keys: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
function resolveAgency(req) {
  const agencies = loadAgencies();
  if (!Object.keys(agencies).length) return null;
  const candidates = [];
  if (req.headers['x-agency']) candidates.push(req.headers['x-agency']);
  if (req.query.agency) candidates.push(req.query.agency);
  if (req.body && req.body.agency) candidates.push(req.body.agency);
  const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  for (const a of Object.values(agencies)) {
    if (a.brand && a.brand.domain && a.brand.domain.toLowerCase().replace(/:\d+$/, '') === host) { candidates.push(a.slug); break; }
  }
  for (const c of candidates) {
    if (!c) continue;
    const key = String(c).toLowerCase();
    const a = agencies[key] || Object.values(agencies).find(x => x.slug === key || x.id === String(c));
    if (a) return a;
  }
  return null;
}
function cfgFor(req, agency) {
  if (!agency) return { cfg: CONFIG, agencySlug: null };
  const keys = {};
  for (const f of AGENCY_KEY_FIELDS) keys[f] = decryptSecret(agency.keys && agency.keys[f]) || CONFIG[f];
  return {
    cfg: {
      ...CONFIG, ...keys,
      brandName: agency.brand.name || CONFIG.brandName,
      brandLogoUrl: agency.brand.logoUrl || CONFIG.brandLogoUrl,
      brandColor: agency.brand.color || CONFIG.brandColor,
      brandEmail: agency.brand.email || CONFIG.brandEmail,
      aiAssistantName: agency.brand.assistantName || CONFIG.aiAssistantName,
      // Report/email links point at the agency's own custom domain when set
      appUrl: (agency.brand.domain && agency.brand.domain.trim()) ? `https://${agency.brand.domain.trim()}` : CONFIG.appUrl,
    },
    agencySlug: agency.slug,
  };
}
function resolveAgencyMiddleware(req, res, next) {
  const agency = resolveAgency(req);
  req.agency = agency;
  Object.assign(req, cfgFor(req, agency));
  next();
}
function requireAgency(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const aid = verifySession(token);
  if (!aid) return res.status(401).json({ error: 'Please log in to your agency dashboard.' });
  const agency = loadAgencies()[aid];
  if (!agency) return res.status(401).json({ error: 'Agency not found.' });
  req.agencyAuth = agency;
  next();
}
function maskedKeys(agency) {
  const out = {};
  for (const f of AGENCY_KEY_FIELDS) {
    const v = decryptSecret(agency.keys && agency.keys[f]);
    out[f] = v ? (v.length > 4 ? '••••' + v.slice(-4) : '••••') : '';
  }
  return out;
}

function loadAudits() {
  try { if (fs.existsSync(AUDITS_FILE)) return JSON.parse(fs.readFileSync(AUDITS_FILE, 'utf8')); } catch {}
  return {};
}
function saveAuditsLocal(audits) {
  try { fs.writeFileSync(AUDITS_FILE, JSON.stringify(audits, null, 2), 'utf8'); } catch {}
}
function cacheGet(key) { const v = aiCache.get(key); if (v && Date.now() - v.ts < AI_CACHE_TTL) return v.val; aiCache.delete(key); return null; }
function cacheSet(key, val) { aiCache.set(key, { ts: Date.now(), val }); }
function llmConfigured(cfg = CONFIG) { return !!(cfg.openrouterKey || cfg.llmBaseUrl); }
function llmBaseUrl(cfg = CONFIG) { return cfg.llmBaseUrl || 'https://openrouter.ai/api/v1'; }
function llmHeaders(cfg = CONFIG) {
  const h = { 'Content-Type': 'application/json' };
  if (llmBaseUrl(cfg).includes('openrouter.ai') && cfg.openrouterKey) h['Authorization'] = `Bearer ${cfg.openrouterKey}`;
  return h;
}
function authHeadersBasic(login, password) {
  return { 'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'), 'Content-Type': 'application/json' };
}
function clampScore(n) { return Math.max(0, Math.min(100, Math.round(n))); }
function scoreGrade(score) { return score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D'; }

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(resolveAgencyMiddleware);

const auditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many audits. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many review submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function honeypotCheck(req, res, next) {
  if (req.body && req.body._hp && req.body._hp !== '') {
    return res.status(200).json({ success: true, fake: true });
  }
  next();
}

async function verifyRecaptcha(req, res, next) {
  const cfg = (req.cfg && typeof req.cfg === 'object') ? req.cfg : CONFIG;
  const enterprise = !!(cfg.recaptchaProjectId && cfg.googleCloudKey);
  const secret = cfg.recaptchaSecretKey || CONFIG.recaptchaSecretKey;
  if (!enterprise && !secret) return next(); // not configured → pass

  const token = req.body?.recaptchaToken;
  if (!token) return res.status(403).json({ error: 'Security check failed. Please reload and try again.' });

  // reCAPTCHA Enterprise (RECAPTCHA_PROJECT_ID + GOOGLE_CLOUD_API_KEY) verifies via assessments endpoint
  if (enterprise) {
    try {
      const data = await fetchJson(`https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(cfg.recaptchaProjectId)}/assessments?key=${encodeURIComponent(cfg.googleCloudKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            token,
            siteKey: cfg.recaptchaSiteKey,
            expectedAction: (req.body && req.body.recaptchaAction) || 'submit',
          },
        }),
      }, 8000);
      if (data.tokenProperties && data.tokenProperties.valid === true) return next();
      return res.status(403).json({ error: 'Security check failed. Please reload and try again.' });
    } catch {
      return res.status(403).json({ error: 'Security check unavailable. Please reload and try again.' });
    }
  }

  // Classic v2/v3 (RECAPTCHA_SECRET_KEY) via siteverify
  try {
    const data = await fetchJson('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    }, 8000);
    if (data.success !== true) return res.status(403).json({ error: 'Security check failed. Please reload and try again.' });
    next();
  } catch {
    return res.status(403).json({ error: 'Security check unavailable. Please reload and try again.' });
  }
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ===== REVIEWS STORAGE =====
function loadReviews() {
  try {
    if (fs.existsSync(REVIEWS_FILE)) return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  } catch {}
  return [];
}

function saveReviews(reviews) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2), 'utf8');
}

// ===== GBP AUDIT ENGINE (same as before) =====
const CATEGORY_PROFILES = {
  plumber: { avgCustomerValue: 350, monthlySearches: 1200, competitors: 8, weight: 1.2, bizTypes: ['Plumbing', 'Drain Cleaning', 'Water Heater Repair'] },
  electrician: { avgCustomerValue: 400, monthlySearches: 980, competitors: 7, weight: 1.1, bizTypes: ['Electrical', 'Rewiring', 'Panel Installation'] },
  hvac: { avgCustomerValue: 500, monthlySearches: 1400, competitors: 9, weight: 1.3, bizTypes: ['HVAC', 'AC Repair', 'Heating Installation'] },
  pizza: { avgCustomerValue: 25, monthlySearches: 3600, competitors: 15, weight: 0.8, bizTypes: ['Pizza', 'Italian Food', 'Takeout'] },
  dentist: { avgCustomerValue: 250, monthlySearches: 850, competitors: 12, weight: 1.0, bizTypes: ['Dentist', 'Cosmetic Dentistry', 'Orthodontics'] },
  lawyer: { avgCustomerValue: 1500, monthlySearches: 620, competitors: 18, weight: 1.5, bizTypes: ['Lawyer', 'Attorney', 'Legal Services'] },
  roofer: { avgCustomerValue: 800, monthlySearches: 720, competitors: 6, weight: 1.4, bizTypes: ['Roofing', 'Roof Repair', 'Roof Installation'] },
  painter: { avgCustomerValue: 300, monthlySearches: 560, competitors: 10, weight: 0.9, bizTypes: ['Painter', 'House Painting', 'Commercial Painting'] },
  landscaper: { avgCustomerValue: 200, monthlySearches: 680, competitors: 11, weight: 0.9, bizTypes: ['Landscaping', 'Lawn Care', 'Garden Design'] },
  cleaner: { avgCustomerValue: 150, monthlySearches: 1100, competitors: 14, weight: 0.7, bizTypes: ['Cleaning', 'House Cleaning', 'Commercial Cleaning'] },
  mechanic: { avgCustomerValue: 450, monthlySearches: 900, competitors: 9, weight: 1.1, bizTypes: ['Auto Repair', 'Car Mechanic', 'Oil Change'] },
  chiropractor: { avgCustomerValue: 80, monthlySearches: 500, competitors: 7, weight: 0.8, bizTypes: ['Chiropractor', 'Spinal Adjustment', 'Pain Management'] },
  therapist: { avgCustomerValue: 120, monthlySearches: 780, competitors: 13, weight: 0.8, bizTypes: ['Therapist', 'Counseling', 'Mental Health'] },
  photographer: { avgCustomerValue: 250, monthlySearches: 450, competitors: 16, weight: 0.7, bizTypes: ['Photographer', 'Wedding Photography', 'Portrait Photography'] },
  contractor: { avgCustomerValue: 600, monthlySearches: 1200, competitors: 10, weight: 1.3, bizTypes: ['Contractor', 'Home Renovation', 'General Contracting'] },
  default: { avgCustomerValue: 200, monthlySearches: 800, competitors: 10, weight: 1.0, bizTypes: ['Service Business', 'Local Services', 'Professional Services'] },
};

function getProfile(keywords) {
  for (const kw of keywords) for (const [key, p] of Object.entries(CATEGORY_PROFILES)) if (kw.toLowerCase().includes(key)) return p;
  return CATEGORY_PROFILES.default;
}

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h) + seed.charCodeAt(i); h |= 0; }
  return function () { h = Math.imul(h, 16807) | 0; return (h & 0x7fffffff) / 0x80000000; };
}

function generateChecks(rand) {
  return [
    { label: 'Business Description', pass: rand() > 0.25 },
    { label: 'Primary Category', pass: rand() > 0.15 },
    { label: 'Review Rating', pass: rand() > 0.3, value: (4.0 + rand()).toFixed(1) + ' stars' },
    { label: 'Review Count', pass: rand() > 0.35, value: Math.floor(10 + rand() * 90) + ' reviews' },
    { label: 'Review Reply Rate', pass: rand() > 0.4, value: Math.floor(40 + rand() * 60) + '%' },
    { label: 'Photo Count', pass: rand() > 0.3, value: Math.floor(5 + rand() * 45) + ' photos' },
    { label: 'Post Frequency', pass: rand() > 0.5 },
    { label: 'Services Listed', pass: rand() > 0.2, value: Math.floor(2 + rand() * 6) + ' services' },
    { label: 'Service Area Set', pass: rand() > 0.2 },
    { label: 'Q&A Answered', pass: rand() > 0.45 },
  ];
}

function generateAIVisibility(rand) {
  return [
    { platform: 'ChatGPT', provider: 'OpenAI', found: rand() > 0.45 },
    { platform: 'Claude', provider: 'Anthropic', found: rand() > 0.45 },
    { platform: 'Gemini', provider: 'Google', found: rand() > 0.4 },
    { platform: 'Grok', provider: 'xAI', found: rand() > 0.55 },
    { platform: 'Llama', provider: 'Meta', found: rand() > 0.5 },
    { platform: 'Perplexity', provider: 'Perplexity', found: rand() > 0.45 },
  ];
}

function generateCompetitors(rand, lat, lng, business) {
  const names = [`${business} Pro`, `A+ ${business}`, `${business} Experts`, `Premier ${business}`, `${business} Masters`, `${business} Pros`, `${business} Solutions`, `${business} Team`, `${business} Co`].sort(() => rand() - 0.5);
  return names.slice(0, 3).map(n => ({
    name: n, address: `${100 + Math.floor(rand() * 900)} Main St`,
    rating: parseFloat((3.5 + rand() * 1.5).toFixed(1)),
    reviews: Math.floor(20 + rand() * 200),
    lat: lat + (rand() - 0.5) * 0.04,
    lng: lng + (rand() - 0.5) * 0.04,
  })).sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
}

function generateHeatmapGrid(rand, lat, lng, keywords) {
  return keywords.map(kw => {
    const grid = [];
    let tr = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const rank = Math.min(1 + Math.floor(rand() * 15) + Math.abs(r - 2) + Math.abs(c - 2), 20);
      tr += rank;
      grid.push({ lat: lat - 0.04 + r * 0.02, lng: lng - 0.04 + c * 0.02, rank });
    }
    const avg = parseFloat((tr / grid.length).toFixed(1));
    return { keyword: kw, grid, averageRank: avg, multiplier: parseFloat((20 / Math.max(avg, 1)).toFixed(1)) };
  });
}

function generateAeoReport(rand, profile) {
  const checks = [
    { label: 'Question Match Rate', pass: rand() > 0.3, score: Math.floor(40 + rand() * 60) },
    { label: 'Answer Clarity', pass: rand() > 0.25, score: Math.floor(50 + rand() * 50) },
    { label: 'Featured Snippet Potential', pass: rand() > 0.4, score: Math.floor(30 + rand() * 60) },
    { label: 'Voice Search Readiness', pass: rand() > 0.35, score: Math.floor(40 + rand() * 50) },
    { label: '"People Also Ask" Coverage', pass: rand() > 0.45, score: Math.floor(20 + rand() * 60) },
    { label: 'FAQ Structured Data', pass: rand() > 0.5, score: Math.floor(10 + rand() * 70) },
  ];
  const score = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
  return { score, checks, summary: score >= 70 ? 'Your content answers questions well. Optimize for voice and "People Also Ask" boxes.' : score >= 45 ? 'Moderate answer engine readiness. Add FAQ schema and direct-answer paragraphs.' : 'Your content rarely appears in answer boxes. Restructure content with clear question-answer pairs.' };
}

function generateGeoReport(rand, profile) {
  const checks = [
    { label: 'Entity Clarity', pass: rand() > 0.25, score: Math.floor(50 + rand() * 50) },
    { label: 'Knowledge Graph Presence', pass: rand() > 0.35, score: Math.floor(30 + rand() * 60) },
    { label: 'LLM Recommendation Score', pass: rand() > 0.4, score: Math.floor(20 + rand() * 70) },
    { label: 'Contextual Authority', pass: rand() > 0.3, score: Math.floor(40 + rand() * 55) },
    { label: 'Structured Entity Data', pass: rand() > 0.2, score: Math.floor(40 + rand() * 55) },
    { label: 'Citation Consistency', pass: rand() > 0.4, score: Math.floor(25 + rand() * 65) },
  ];
  const score = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
  return { score, checks, summary: score >= 70 ? 'Generative engines clearly understand your business entity. Maintain citation consistency across directories.' : score >= 45 ? 'Moderate generative engine optimization. Strengthen your Knowledge Graph entity and citation profile.' : 'AI platforms struggle to understand your business. Build structured entity data and consistent NAP citations.' };
}

function generateSummary(gbpScore, gbpChecks, revenue, competitors, aiVisibility, heatmaps, profile, aeo, geo) {
  const fc = gbpChecks.filter(c => !c.pass);
  const blockers = [];
  if (fc.find(c => c.label === 'Business Description' && !c.pass)) blockers.push('Business description lacks keyword optimization.');
  if (fc.find(c => c.label === 'Review Reply Rate' && !c.pass)) blockers.push('Review reply rate is too low. Aim for 80%+.');
  if (fc.find(c => c.label === 'Photo Count' && !c.pass)) blockers.push('Too few photos. 20+ photos get 30% more direction requests.');
  if (fc.find(c => c.label === 'Post Frequency' && !c.pass)) blockers.push('Infrequent posts. Weekly posting improves ranking signals.');
  const am = aiVisibility.filter(a => !a.found);
  if (am.length) blockers.push(`Not found on ${am.length} AI platform(s): ${am.map(a => a.platform).join(', ')}.`);
  if (aeo.score < 50) blockers.push(`Low AEO score (${aeo.score}/100). Your content isn't optimized for answer engines.`);
  if (geo.score < 50) blockers.push(`Low GEO score (${geo.score}/100). AI/generative engines can't clearly identify your business.`);
  if (!blockers.length) blockers.push('Minor refinements can still improve your edge.');

  const m = revenue;
  const sum = gbpScore >= 80
    ? `Strong overall performance (GBP: ${gbpScore}, AEO: ${aeo.score}, GEO: ${geo.score}). $${m.atStake.toLocaleString()} monthly revenue at stake. Focus on ${blockers.length} remaining gaps.`
    : gbpScore >= 50
    ? `Solid foundation with room to grow. $${m.atStake.toLocaleString()} monthly opportunity. Your ${blockers.length} priority areas span GBP, AEO, and GEO — fixing them will compound your visibility.`
    : `Significant upside potential. $${m.atStake.toLocaleString()} is flowing to competitors. Start with the ${blockers.length} flagged items — each fix directly improves local ranking and AI discoverability.`;

  return {
    executiveSummary: sum,
    rankBlockers: blockers,
    fixes: [
      { priority: 'High', text: `Optimize GBP description for "${profile.bizTypes[0].toLowerCase()}" + city name.` },
      { priority: 'High', text: `Respond to all reviews within 24-48h. Use templates for consistency.` },
      { priority: 'Medium', text: `Post weekly Google Updates related to ${profile.bizTypes[0]}.` },
      { priority: 'Medium', text: `Add FAQ schema and direct-answer paragraphs for AEO (score: ${aeo.score}/100).` },
      { priority: 'Medium', text: `Build consistent NAP citations across directories for GEO (score: ${geo.score}/100).` },
      { priority: 'Low', text: `Add ${profile.bizTypes.slice(1).join(' + ')} as services with detailed descriptions.` },
    ],
    reviewReplies: [
      { sentiment: 'Positive', text: 'Thank you for the 5-star review! We truly appreciate your business and look forward to serving you again.' },
      { sentiment: 'Constructive', text: 'We appreciate your honest feedback and apologize for the experience. Our team is addressing it right now — please reach out so we can make it right.' },
    ],
    postCopy: [
      { idea: 'Promote an offer', text: `Local customers, mention this post and get a special offer on your next ${profile.bizTypes[0].toLowerCase()} visit. Tap to learn more.` },
      { idea: 'Share social proof', text: `With dozens of 5-star reviews and a growing local fanbase, we're the trusted choice for ${profile.bizTypes[0].toLowerCase()} in your area.` },
      { idea: 'Urgency', text: `Need help now? We're booking ${profile.bizTypes[0].toLowerCase()} appointments this week — call or visit our site to lock in your slot.` },
    ],
  };
}

function generateAuditReport(business, location, email, keywords) {
  const seed = `${business}:${location}:${email}:${Date.now()}`;
  const rand = seededRandom(seed);
  const aid = 'AUDIT-' + crypto.createHash('md5').update(seed).digest('hex').substring(0, 8).toUpperCase();
  const kw = keywords.length ? keywords : [business.toLowerCase().split(/\s+/)[0]];
  const profile = getProfile(kw);
  const lat = 34.02 + (parseInt(crypto.createHash('md5').update(business).digest('hex').substring(0, 4), 16) / 65536 - 0.5) * 0.3;
  const lng = -118.48 + (parseInt(crypto.createHash('md5').update(location).digest('hex').substring(0, 4), 16) / 65536 - 0.5) * 0.3;

  const gbpChecks = generateChecks(rand);
  const gbpScore = Math.round(gbpChecks.filter(c => c.pass).length / gbpChecks.length * 100);
  const searches = Math.round(profile.monthlySearches * (0.8 + rand() * 0.4));
  const acv = Math.round(profile.avgCustomerValue * (0.85 + rand() * 0.3));
  const ms = 0.05 + rand() * 0.15;
  const atStake = Math.round(searches * acv * ms * (gbpScore < 60 ? 1.5 : gbpScore < 80 ? 1.2 : 0.8));
  const competitors = generateCompetitors(rand, lat, lng, business);
  const aiVisibility = generateAIVisibility(rand);
  const heatmaps = generateHeatmapGrid(rand, lat, lng, kw);
  const aeo = generateAeoReport(rand, profile);
  const geo = generateGeoReport(rand, profile);
  const summary = generateSummary(gbpScore, gbpChecks, { atStake, monthlySearches: searches, avgCustomerValue: acv, competitorRevenue: Math.round(searches * acv * 0.12) }, competitors, aiVisibility, heatmaps, profile, aeo, geo);

  return {
    auditId: aid, business, location, email,
    lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)),
    timestamp: new Date().toISOString(),
    gbp: { score: gbpScore, grade: gbpScore >= 80 ? 'A' : gbpScore >= 60 ? 'B' : gbpScore >= 40 ? 'C' : 'D', checks: gbpChecks, revenue: { atStake, monthlySearches: searches, avgCustomerValue: acv, competitorRevenue: Math.round(searches * acv * 0.12) }, competitors, aiVisibility, heatmaps },
    aeo,
    geo,
    summary,
  };
}

// ===== REAL DATA LAYER (all functions fail-safe to null so callers fall back to mock) =====
async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    return json;
  } finally { clearTimeout(t); }
}

async function safeGeocode(location, cfg = CONFIG) {
  if (!cfg.googlePlacesKey) return null;
  try {
    const data = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${cfg.googlePlacesKey}`);
    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) return data.results[0].geometry.location;
  } catch (e) { console.warn('[geocode]', e.message); }
  return null;
}

const PLACES_FIELDS = ['places.id','places.displayName','places.formattedAddress','places.location','places.rating','places.userRatingCount','places.types','places.businessStatus','places.websiteUri','places.formattedPhoneNumber','places.photos','places.openingHours','places.editorialSummary'];

async function findPlace(business, location, cfg = CONFIG) {
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cfg.googlePlacesKey, 'X-Goog-FieldMask': PLACES_FIELDS.join(',') };
  const res = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', headers,
    body: JSON.stringify({ textQuery: `${business} ${location}`, languageCode: 'en' }),
  }, 12000);
  const place = res.places?.[0];
  if (!place) return null;
  let details = {};
  try {
    details = await fetchJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(place.id)}`, { method: 'GET', headers }, 10000);
  } catch (e) { console.warn('[place details]', e.message); }
  return { ...place, ...details };
}

function categoryGoogleType(kw) {
  const k = kw.toLowerCase();
  const map = {
    plumber: 'plumber', electrician: 'electrician', hvac: 'hvac_contractor', 'ac repair': 'hvac_contractor',
    pizza: 'restaurant', dentist: 'dentist', lawyer: 'lawyer', roofer: 'roofing_contractor', painter: 'painter',
    landscaper: 'landscape_contractor', cleaner: 'cleaning_service', mechanic: 'auto_repair',
    chiropractor: 'chiropractor', photographer: 'photographer', contractor: 'general_contractor', therapist: 'psychologist',
    'auto repair': 'auto_repair', 'car repair': 'auto_repair', 'lawn care': 'landscape_contractor',
  };
  for (const [key, val] of Object.entries(map)) if (k.includes(key)) return val;
  return null;
}

async function fetchCompetitorsNearby(kw, lat, lng, cfg = CONFIG) {
  const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cfg.googlePlacesKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount' };
  const type = categoryGoogleType(kw);
  const body = {
    maxResultCount: 12, languageCode: 'en',
    locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 8000 } },
    rankPreference: 'POPULARITY',
    ...(type ? { includedTypes: [type] } : {}),
  };
  const res = await fetchJson('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers, body }, 12000);
  const places = res.places || [];
  if (!places.length) return null;
  return places.map(p => ({
    name: p.displayName?.text || 'Unknown',
    address: p.formattedAddress || '',
    rating: p.rating || 0,
    reviews: p.userRatingCount || 0,
    lat: p.location?.latitude || lat,
    lng: p.location?.longitude || lng,
    source: 'live',
  })).sort((a, b) => b.rating - a.rating || b.reviews - a.reviews).slice(0, 3);
}

async function fetchCompetitors(kw, lat, lng, cfg = CONFIG) {
  // DataForSEO Google Maps Local Pack — most accurate
  if (cfg.dfsLogin && cfg.dfsPassword) {
    try {
      const data = await fetchJson('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
        method: 'POST',
        headers: authHeadersBasic(cfg.dfsLogin, cfg.dfsPassword),
        body: JSON.stringify([{ keyword: kw, location_coordinate: `${lat},${lng}`, language_name: 'English', limit: 10 }]),
      }, 15000);
      const task = data?.tasks?.[0];
      if (task?.status_code === 20000 && task.result?.[0]?.items?.length) {
        return task.result[0].items
          .filter(i => i.title)
          .slice(0, 3)
          .map(i => ({
            name: i.title, address: i.address || '',
            rating: i.rating?.rating_type === 'Max5' ? (i.rating.value || 0) : 0,
            reviews: i.rating?.votes_count || 0,
            lat: i.latitude || lat, lng: i.longitude || lng, source: 'live',
          }));
      }
    } catch (e) { console.warn('[dfs maps competitors]', e.message); }
  }
  if (cfg.googlePlacesKey) {
    try {
      const comps = await fetchCompetitorsNearby(kw, lat, lng, cfg);
      if (comps) return comps;
    } catch (e) { console.warn('[places competitors]', e.message); }
  }
  return null;
}

function deriveSignals(place, profile) {
  const types = (place.types || []).map(t => t.replace(/_/g, ' ').toLowerCase());
  const categoryMatch = profile.bizTypes.some(bt => types.some(t => t.includes(bt.split(' ')[0].toLowerCase())));
  const count = place.userRatingCount || 0;
  return {
    types,
    categoryMatch,
    photos: place.photos?.length || 0,
    rating: place.rating || 0,
    count,
    hasWebsite: !!place.websiteUri,
    description: place.editorialSummary?.text || '',
    replyRate: Math.min(95, Math.round(count / (count + 20) * 100) + 15),
    businessStatus: place.businessStatus || 'OPERATIONAL',
  };
}

function buildGbpChecks(s, profile) {
  const operational = s.businessStatus === 'OPERATIONAL';
  return [
    { label: 'Business Description', pass: operational && (s.hasWebsite || s.description.length > 40), value: s.description ? s.description.slice(0, 60) + '…' : (s.hasWebsite ? 'Website linked' : 'No description found'), source: 'estimated' },
    { label: 'Primary Category', pass: s.categoryMatch, value: s.types.slice(0, 3).join(', ') || profile.bizTypes[0], source: 'live' },
    { label: 'Review Rating', pass: s.rating >= 4.2, value: s.rating ? `${s.rating.toFixed(1)} stars` : 'No rating yet', source: 'live' },
    { label: 'Review Count', pass: s.count >= 25, value: `${s.count} reviews`, source: 'live' },
    { label: 'Review Reply Rate', pass: s.replyRate >= 70, value: `${s.replyRate}% (est.)`, source: 'estimated' },
    { label: 'Photo Count', pass: s.photos >= 10, value: `${s.photos} photos`, source: 'live' },
    { label: 'Post Frequency', pass: s.hasWebsite && s.rating >= 4, value: s.hasWebsite ? 'Profile active' : 'No website linked', source: 'estimated' },
    { label: 'Services Listed', pass: s.types.length >= 2, value: `${s.types.length} category tags`, source: 'live' },
    { label: 'Service Area Set', pass: s.description.toLowerCase().includes('serv') || s.types.some(t => t.includes('contractor') || t.includes('service')), value: s.description.toLowerCase().includes('serv') ? 'Service area mentioned' : 'Not confirmed', source: 'estimated' },
    { label: 'Q&A Answered', pass: s.count > 0 && s.rating >= 3.8, value: `${s.count} reviews drive Q&A visibility`, source: 'estimated' },
  ];
}

function queryLLM(model, prompt, timeoutMs = 15000, cfg = CONFIG) {
  return fetchJson(`${llmBaseUrl(cfg)}/chat/completions`, {
    method: 'POST',
    headers: llmHeaders(cfg),
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 350 }),
  }, timeoutMs).then(d => d?.choices?.[0]?.message?.content || '');
}

function aiModelFor(base, platformModel) {
  // OmniRoute / generic OpenAI-compatible routers use their own model combo names
  return base.includes('localhost') ? 'auto/best-free' : platformModel;
}

async function fetchAIVisibility(business, category, location, cfg = CONFIG) {
  if (!llmConfigured(cfg)) return null;
  const cacheKey = `${cfg.brandName}|${business.toLowerCase()}|${location.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const base = llmBaseUrl(cfg);
  const prompt = (platform) => `You are an AI search engine. A user asks: "What are the top 5 recommended ${category} businesses in ${location}?" We are checking whether a business named "${business}" (in ${location}) is recommended by ${platform}.\nIf "${business}" would appear in your recommendations (top 5) for ${category} in ${location}, respond with JSON: {"found": true, "rank": <1-5 or null>}. Otherwise respond: {"found": false, "rank": null}.\nReply with ONLY a single JSON object.`;
  const settled = await Promise.allSettled(AI_PLATFORMS.map(p =>
    queryLLM(aiModelFor(base, p.model), prompt(p.platform), 15000, cfg).then(raw => {
      const m = raw.match(/\{[^{}]*\}/);
      const parsed = m ? JSON.parse(m[0]) : { found: false, rank: null };
      return { platform: p.platform, provider: p.provider, found: !!parsed.found, rank: parsed.rank ?? null };
    })
  ));
  const visibility = settled.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { platform: AI_PLATFORMS[i].platform, provider: AI_PLATFORMS[i].provider, found: false, rank: null, error: true });
  cacheSet(cacheKey, visibility);
  return visibility;
}

function gridNodes(lat, lng, radiusKm = 5) {
  const dLat = radiusKm / 111.0;
  const dLng = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));
  const nodes = [];
  for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) nodes.push({ lat: +(lat + r * dLat).toFixed(6), lng: +(lng + c * dLng).toFixed(6) });
  return nodes;
}

async function fetchRankings(business, kw, lat, lng, cfg = CONFIG) {
  if (!cfg.dfsLogin || !cfg.dfsPassword) return null;
  const bizKey = (business || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const grid = [];
  for (const node of gridNodes(lat, lng)) {
    let rank = 20;
    try {
      const data = await fetchJson('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
        method: 'POST',
        headers: authHeadersBasic(cfg.dfsLogin, cfg.dfsPassword),
        body: JSON.stringify([{ keyword: kw, location_coordinate: `${node.lat},${node.lng}`, language_name: 'English', limit: 20 }]),
      }, 20000);
      const items = data?.tasks?.[0]?.result?.[0]?.items || [];
      const hit = items.findIndex(i => {
        const title = (i.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return bizKey.length >= 4 && title.includes(bizKey.slice(0, 12));
      });
      rank = hit >= 0 ? Math.min(hit + 1, 20) : 20;
    } catch (e) { console.warn('[dfs maps rank]', e.message); }
    grid.push({ lat: node.lat, lng: node.lng, rank });
  }
  const avg = parseFloat((grid.reduce((s, g) => s + g.rank, 0) / grid.length).toFixed(1));
  return [{ keyword: kw, grid, averageRank: avg, multiplier: parseFloat((20 / Math.max(avg, 1)).toFixed(1)), source: 'live' }];
}

async function fetchOnPageAudit(website, cfg = CONFIG) {
  if (!cfg.rankNibblerKey || !website) return null;
  try {
    const data = await fetchJson(`https://www.ranknibbler.com/api/v1/audit?url=${encodeURIComponent(website)}`, { headers: { 'X-API-Key': cfg.rankNibblerKey } }, 20000);
    if (!data || typeof data.score !== 'number') return null;
    return data;
  } catch (e) { console.warn('[ranknibbler]', e.message); return null; }
}

function buildAeoFromOnPage(audit, profile) {
  const c = audit.checks || {};
  const content = c.content || {};
  const kw = c.keywords || {};
  const read = c.readability || content.readability || {};
  const words = kw.totalWords || content.wordCount || 0;
  const hasSchema = !!(c.structuredData?.jsonLd || (Array.isArray(c.structuredData) && c.structuredData.length));
  const densityTop = Array.isArray(kw.top) ? kw.top.map(t => typeof t === 'string' ? t : (t.word || t.text || String(t))).filter(Boolean) : [];
  const densityPass = densityTop.length >= 3;
  const h1 = !!((c.headings?.h1 || []).length);
  const flesch = read.fleschReadingEase ?? read.flesch ?? 60;
  const checks = [
    { label: 'Question Match Rate', pass: words >= 300, score: clampScore(40 + words / 25) },
    { label: 'Answer Clarity', pass: words >= 500, score: clampScore(50 + words / 30) },
    { label: 'Featured Snippet Potential', pass: h1 && words >= 400, score: clampScore((h1 ? 60 : 30) + (words >= 400 ? 15 : 0)) },
    { label: 'Voice Search Readiness', pass: flesch >= 60, score: clampScore(flesch) },
    { label: 'PAA Coverage', pass: densityPass, score: densityPass ? 75 : 40 },
    { label: 'FAQ Schema', pass: hasSchema, score: hasSchema ? 90 : 20 },
  ];
  const score = Math.round(checks.reduce((s, ch) => s + ch.score, 0) / checks.length);
  return { score, checks, summary: score >= 70 ? 'Your content answers questions well. Optimize for voice and "People Also Ask" boxes.' : score >= 45 ? 'Moderate answer engine readiness. Add FAQ schema and direct-answer paragraphs.' : 'Your content rarely appears in answer boxes. Restructure content with clear question-answer pairs.', onPageScore: audit.score };
}

function buildGeoFromOnPage(audit, profile) {
  const c = audit.checks || {};
  const content = c.content || {};
  const kw = c.keywords || {};
  const words = kw.totalWords || content.wordCount || 0;
  const hasSchema = !!(c.structuredData?.jsonLd || (Array.isArray(c.structuredData) && c.structuredData.length));
  const internalLinks = c.links?.internal?.length || 0;
  const checks = [
    { label: 'Entity Clarity', pass: words >= 300, score: clampScore(50 + words / 40) },
    { label: 'Knowledge Graph Presence', pass: hasSchema, score: hasSchema ? 85 : 35 },
    { label: 'LLM Recommendation Score', pass: audit.score >= 70, score: clampScore(audit.score || 50) },
    { label: 'Contextual Authority', pass: audit.score >= 60 && words >= 600, score: clampScore((audit.score || 50) - 5) },
    { label: 'Structured Entity Data', pass: hasSchema, score: hasSchema ? 80 : 30 },
    { label: 'Citation Consistency', pass: internalLinks >= 3, score: clampScore(40 + internalLinks * 8) },
  ];
  const score = Math.round(checks.reduce((s, ch) => s + ch.score, 0) / checks.length);
  return { score, checks, summary: score >= 70 ? 'Generative engines clearly understand your business entity. Maintain citation consistency across directories.' : score >= 45 ? 'Moderate generative engine optimization. Strengthen your Knowledge Graph entity and citation profile.' : 'AI platforms struggle to understand your business. Build structured entity data and consistent NAP citations.', onPageScore: audit.score };
}

async function fetchAISummary(payload, cfg = CONFIG) {
  if (!llmConfigured(cfg)) return null;
  const { business, location, gbpScore, revenue, competitors, aiVisibility, aeo, geo } = payload;
  const found = aiVisibility.filter(a => a.found).map(a => a.platform);
  const prompt = `Write a plain-English local SEO audit summary for "${business}" in ${location}. Facts:\n` +
    `- GBP optimization score: ${gbpScore}/100\n` +
    `- Estimated monthly revenue at stake: $${revenue.atStake.toLocaleString()}\n` +
    `- Top competitors: ${(competitors || []).slice(0, 3).map(c => `${c.name} (${c.rating}★, ${c.reviews} reviews)`).join('; ') || 'none identified'}\n` +
    `- AI platform presence: ${found.length ? 'Found on ' + found.join(', ') : 'Not found on any of the 6 AI platforms'}\n` +
    `- AEO score: ${aeo.score}/100, GEO score: ${geo.score}/100\n` +
    `Respond with EXACTLY this JSON (no markdown, no code fences):\n` +
    `{"executiveSummary": "2-3 sentences, plain English, honest but encouraging", "rankBlockers": ["top 3-4 blockers, short"], "fixes": [{"priority": "High|Medium|Low", "text": "specific actionable fix"}], "reviewReplies": [{"sentiment": "Positive|Constructive", "text": "short draft reply a business owner could post to a Google review"}], "postCopy": [{"idea": "short label", "text": "a Google Business Profile post with a call to action"}]}`;
  try {
    const raw = await queryLLM(aiModelFor(llmBaseUrl(cfg), 'openai/gpt-4o-mini'), prompt, 25000, cfg);
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed || !parsed.executiveSummary) return null;
    return {
      executiveSummary: parsed.executiveSummary,
      rankBlockers: Array.isArray(parsed.rankBlockers) ? parsed.rankBlockers : [],
      fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
      reviewReplies: Array.isArray(parsed.reviewReplies) ? parsed.reviewReplies.slice(0, 2) : [],
      postCopy: Array.isArray(parsed.postCopy) ? parsed.postCopy.slice(0, 3) : [],
    };
  } catch (e) { console.warn('[ai summary]', e.message); return null; }
}

// ===== TEABLE CONNECTOR (fieldKeyType=name + runtime field-name resolution) =====
// Teable's shared-table base names fields by display name; we resolve real field
// names at runtime via GET /field (cached) so no hardcoded field IDs are needed.
const TEABLE_FIELD_CACHE = new Map();
function teableNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
async function teableFields(cfg, tableId) {
  if (!cfg.teableToken || !tableId) return [];
  const key = `${cfg.teableToken}:${tableId}`;
  if (TEABLE_FIELD_CACHE.has(key)) return TEABLE_FIELD_CACHE.get(key);
  try {
    const headers = { 'Authorization': `Bearer ${cfg.teableToken}` };
    const data = await fetchJson(`${cfg.teableUrl}/api/table/${tableId}/field`, { headers }, 10000);
    const fields = Array.isArray(data) ? data : (data.fields || []);
    TEABLE_FIELD_CACHE.set(key, fields);
    return fields;
  } catch (e) { console.warn('[teable fields]', e.message); return []; }
}
async function teableResolveField(cfg, tableId, candidates) {
  const fields = await teableFields(cfg, tableId);
  const wants = (Array.isArray(candidates) ? candidates : [candidates]).map(teableNorm);
  let hit = fields.find(f => wants.includes(teableNorm(f.name)));
  if (!hit) hit = fields.find(f => wants.some(w => teableNorm(f.name).includes(w) || w.includes(teableNorm(f.name))));
  return hit ? hit.name : null;
}
async function teableMapFields(cfg, tableId, map, src) {
  const out = {};
  for (const [logical, value] of Object.entries(map)) {
    if (src[logical] === undefined || src[logical] === null) continue;
    const name = await teableResolveField(cfg, tableId, value);
    if (name) out[name] = src[logical];
  }
  return out;
}
async function teableCreate(cfg, tableId, fields) {
  const headers = { 'Authorization': `Bearer ${cfg.teableToken}`, 'Content-Type': 'application/json' };
  const data = await fetchJson(`${cfg.teableUrl}/api/table/${tableId}/record?fieldKeyType=name`, { method: 'POST', headers, body: JSON.stringify({ records: [{ fields }] }) }, 12000);
  return data.records?.[0] || null;
}
async function teableUpdate(cfg, tableId, recordId, fields) {
  const headers = { 'Authorization': `Bearer ${cfg.teableToken}`, 'Content-Type': 'application/json' };
  return fetchJson(`${cfg.teableUrl}/api/table/${tableId}/record/${recordId}?fieldKeyType=name`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) }, 12000);
}
async function teableList(cfg, tableId, filterExpr) {
  const headers = { 'Authorization': `Bearer ${cfg.teableToken}` };
  let url = `${cfg.teableUrl}/api/table/${tableId}/record?fieldKeyType=name&pageSize=200`;
  if (filterExpr) url += `&filter=${encodeURIComponent(JSON.stringify(filterExpr))}`;
  const data = await fetchJson(url, { headers }, 12000);
  return data.records || [];
}
async function teableFilterEq(cfg, tableId, fieldName, value) {
  const fields = await teableFields(cfg, tableId);
  const f = fields.find(x => x.name === fieldName);
  if (!f) return null;
  return { conjunction: 'and', filterSet: [{ fieldId: f.id, operator: 'is', value: String(value) }] };
}

// Field-name aliases per logical field (first exact / partial match wins)
const TEABLE_AUDIT_MAP = {
  auditId: ['Audit ID', 'AuditId', 'audit_id'],
  business: ['Business Name', 'Business'],
  contactName: ['Contact Name'],
  email: ['Email'],
  location: ['Location', 'City'],
  website: ['Website', 'URL'],
  keywords: ['Keywords'],
  latitude: ['Latitude'],
  longitude: ['Longitude'],
  score: ['Optimization Score', 'Score'],
  grade: ['Grade'],
  atStake: ['Revenue Opportunity', 'At Stake'],
  monthlySearches: ['Monthly Searches'],
  avgCustomerValue: ['Average Customer Value'],
  competitorRevenue: ['Competitor Revenue'],
  negativeChecks: ['Negative Checks'],
  aeoScore: ['AEO Score'],
  geoScore: ['GEO Score'],
  aiVisibility: ['AI Visibility Summary', 'AI Visibility'],
  payload: ['Full Audit Payload', 'Audit Payload', 'Payload'],
  sourcesJson: ['Sources JSON', 'Sources'],
  dataMode: ['Data Mode'],
  reportUrl: ['Report URL'],
  emailDelivery: ['Email Delivery'],
  status: ['Status'],
  agency: ['Agency', 'Agency Link'],
  createdAt: ['Created At', 'CreatedAt', 'Timestamp'],
};
const TEABLE_REVIEW_MAP = {
  reviewId: ['Review ID', 'ReviewId', 'ID'],
  name: ['Reviewer Name', 'Name', 'Author'],
  email: ['Reviewer Email', 'Email'],
  rating: ['Rating'],
  content: ['Review', 'Content', 'Message'],
  businessName: ['Business Name', 'Business'],
  status: ['Moderation Status', 'Status'],
  published: ['Published'],
  managerNotes: ['Manager Notes', 'Notes'],
  agency: ['Agency', 'Agency Link'],
  createdAt: ['Submitted At', 'Created At', 'CreatedAt', 'Timestamp'],
};
const TEABLE_AGENCY_MAP = {
  slug: ['Slug', 'Agency Slug'],
  name: ['Agency Name', 'Name'],
  email: ['Owner Email', 'Email'],
  passwordHash: ['Password Hash'],
  status: ['Account Status', 'Status'],
  brandName: ['Brand Name'],
  brandLogoUrl: ['Brand Logo URL', 'Logo URL'],
  brandColor: ['Brand Color', 'Color'],
  brandEmail: ['Brand Email'],
  assistantName: ['Assistant Name'],
  domain: ['Custom Domain', 'Domain'],
  encryptedKeys: ['Encrypted API Keys', 'API Credentials'],
  integrationHealth: ['Integration Health'],
  welcomeStatus: ['Welcome Status'],
  nurtureWebhook: ['Nurture Webhook URL'],
  serpwinWebhook: ['SERPwin Webhook URL'],
  followupWebhook: ['Follow-up Webhook URL'],
  notes: ['Notes'],
};

function auditDataMode(sources) {
  const v = Object.values(sources || {});
  if (!v.length) return 'Simulated';
  if (v.every(s => s === 'demo')) return 'Demo';
  if (v.every(s => s === 'live')) return 'Live';
  if (v.some(s => s === 'live')) return 'Mixed';
  return 'Simulated';
}

async function teableFindAgencyBySlug(cfg, slug) {
  if (!cfg.teableToken || !cfg.teableAgenciesTableId || !slug) return null;
  const slugField = await teableResolveField(cfg, cfg.teableAgenciesTableId, TEABLE_AGENCY_MAP.slug);
  if (!slugField) return null;
  const filter = await teableFilterEq(cfg, cfg.teableAgenciesTableId, slugField, slug);
  if (!filter) return null;
  const recs = await teableList(cfg, cfg.teableAgenciesTableId, filter);
  return recs[0] || null;
}
async function teableStripEmptyUnique(cfg, tableId, fields) {
  const schema = await teableFields(cfg, tableId);
  const uniqueNames = schema.filter(f => f.unique || f.isPrimary).map(f => f.name);
  for (const u of uniqueNames) {
    if (fields[u] === '' || fields[u] == null) delete fields[u];
  }
  return fields;
}

async function saveAuditToTeable(report, cfg = CONFIG) {
  if (!cfg.teableToken || !cfg.teableAuditsTableId) return null;
  try {
    const gbp = report.gbp || {};
    const negativeChecks = Array.isArray(gbp.checks) ? gbp.checks.filter(c => !c.pass).length : 0;
    const fields = await teableMapFields(cfg, cfg.teableAuditsTableId, TEABLE_AUDIT_MAP, {
      auditId: report.auditId,
      business: report.business,
      location: report.location,
      email: report.email,
      website: report.website || '',
      keywords: Array.isArray(report.keywords) ? report.keywords.join(', ') : (report.keywords || ''),
      latitude: report.lat,
      longitude: report.lng,
      score: gbp.score,
      grade: gbp.grade,
      atStake: gbp.revenue && gbp.revenue.atStake,
      monthlySearches: gbp.revenue && gbp.revenue.monthlySearches,
      avgCustomerValue: gbp.revenue && gbp.revenue.avgCustomerValue,
      competitorRevenue: gbp.revenue && gbp.revenue.competitorRevenue,
      negativeChecks,
      aeoScore: report.aeo && report.aeo.score,
      geoScore: report.geo && report.geo.score,
      aiVisibility: JSON.stringify(gbp.aiVisibility || []),
      payload: JSON.stringify(report),
      sourcesJson: JSON.stringify(report.sources || {}),
      dataMode: auditDataMode(report.sources),
      reportUrl: `${(cfg.appUrl || 'https://seodominate.org')}/report/${report.auditId}`,
      emailDelivery: cfg.smtpHost ? 'Pending' : 'Not Requested',
      status: 'Complete',
      createdAt: new Date().toISOString(),
    });
    // Scope the record to the agency via the Agency link field
    if (report.agencySlug && report.agencySlug !== 'platform') {
      const agencyRec = await teableFindAgencyBySlug(cfg, report.agencySlug);
      if (agencyRec) {
        const agencyField = await teableResolveField(cfg, cfg.teableAuditsTableId, TEABLE_AUDIT_MAP.agency);
        if (agencyField) fields[agencyField] = { id: agencyRec.id };
      }
    }
    await teableStripEmptyUnique(cfg, cfg.teableAuditsTableId, fields);
    return await teableCreate(cfg, cfg.teableAuditsTableId, fields);
  } catch (e) { console.warn('[teable persist]', e.message); return null; }
}

async function mirrorReviewToTeable(review, cfg = CONFIG) {
  if (!cfg.teableToken || !cfg.teableReviewsTableId || !review) return null;
  try {
    const status = review.status === 'approved' ? 'Approved' : review.status === 'pending' ? 'Pending' : (review.status || 'Pending');
    const fields = await teableMapFields(cfg, cfg.teableReviewsTableId, TEABLE_REVIEW_MAP, {
      reviewId: review.id,
      name: review.name,
      email: review.email,
      rating: review.rating,
      content: review.content,
      businessName: review.businessName,
      status,
      published: status === 'Approved',
      managerNotes: review.managerNotes || '',
      createdAt: review.createdAt,
    });
    if (review.agencySlug && review.agencySlug !== 'platform') {
      const agencyRec = await teableFindAgencyBySlug(cfg, review.agencySlug);
      if (agencyRec) {
        const agencyField = await teableResolveField(cfg, cfg.teableReviewsTableId, TEABLE_REVIEW_MAP.agency);
        if (agencyField) fields[agencyField] = { id: agencyRec.id };
      }
    }
    await teableStripEmptyUnique(cfg, cfg.teableReviewsTableId, fields);
    return await teableCreate(cfg, cfg.teableReviewsTableId, fields);
  } catch (e) { console.warn('[teable review]', e.message); return null; }
}

async function syncAgencyToTeable(agency, cfg = CONFIG) {
  if (!cfg.teableToken || !cfg.teableAgenciesTableId || !agency) return null;
  try {
    const fields = await teableMapFields(cfg, cfg.teableAgenciesTableId, TEABLE_AGENCY_MAP, {
      slug: agency.slug,
      name: agency.name,
      email: agency.email,
      passwordHash: agency.passwordHash,
      brandName: agency.brand.name,
      brandLogoUrl: agency.brand.logoUrl,
      brandColor: agency.brand.color,
      brandEmail: agency.brand.email,
      assistantName: agency.brand.assistantName,
      domain: agency.brand.domain,
      status: 'Pending',
      integrationHealth: 'Unconfigured',
      welcomeStatus: 'Pending',
      nurtureWebhook: agency.keys.followupWebhook ? decryptSecret(agency.keys.followupWebhook) : '',
      serpwinWebhook: agency.keys.serpwinWebhook ? decryptSecret(agency.keys.serpwinWebhook) : '',
      followupWebhook: agency.keys.followupWebhook ? decryptSecret(agency.keys.followupWebhook) : '',
      notes: '',
    });
    // Only ever send encrypted key material (ciphertext, never plaintext)
    if (AGENCY_KEY_ENCRYPTION_KEY) {
      const encField = await teableResolveField(cfg, cfg.teableAgenciesTableId, TEABLE_AGENCY_MAP.encryptedKeys);
      if (encField) fields[encField] = encryptSecret(JSON.stringify(agency.keys));
    }
    await teableStripEmptyUnique(cfg, cfg.teableAgenciesTableId, fields);
    const existing = await teableFindAgencyBySlug(cfg, agency.slug);
    if (existing) {
      await teableUpdate(cfg, cfg.teableAgenciesTableId, existing.id, fields);
      return existing;
    }
    return await teableCreate(cfg, cfg.teableAgenciesTableId, fields);
  } catch (e) { console.warn('[teable agency]', e.message); return null; }
}

function persistAudit(report, cfg = CONFIG) {
  const audits = loadAudits();
  audits[report.auditId] = report;
  saveAuditsLocal(audits);
  return saveAuditToTeable(report, cfg);
}

async function getAudit(id, cfg = CONFIG) {
  const local = loadAudits();
  if (local[id]) return local[id];
  if (cfg.teableToken && cfg.teableAuditsTableId) {
    try {
      const auditIdField = await teableResolveField(cfg, cfg.teableAuditsTableId, TEABLE_AUDIT_MAP.auditId);
      const payloadField = await teableResolveField(cfg, cfg.teableAuditsTableId, TEABLE_AUDIT_MAP.payload);
      if (!auditIdField || !payloadField) return null;
      const filter = await teableFilterEq(cfg, cfg.teableAuditsTableId, auditIdField, id);
      if (!filter) return null;
      const recs = await teableList(cfg, cfg.teableAuditsTableId, filter);
      const rec = recs[0];
      if (rec?.fields?.[payloadField]) {
        let raw = rec.fields[payloadField];
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
        if (raw) {
          local[id] = raw;
          saveAuditsLocal(local);
          return raw;
        }
      }
    } catch (e) { console.warn('[teable fetch]', e.message); }
  }
  return null;
}

async function sendAuditEmail(report, cfg = CONFIG) {
  if (!cfg.smtpHost) return;
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: parseInt(cfg.smtpPort || '587'),
    secure: cfg.smtpSecure === true || cfg.smtpSecure === 'true',
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
  const link = `${cfg.appUrl || 'https://seodominate.org'}/report/${report.auditId}`;
  const gbp = report.gbp;
  const aiFound = (gbp.aiVisibility || []).filter(a => a.found).length;
  const brand = cfg.brandName;
  const accent = cfg.brandColor;
  const logo = cfg.brandLogoUrl;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f6f5ff;padding:24px;">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e6e2ff;">
      ${logo ? `<img src="${logo}" alt="${brand}" style="max-height:44px;margin-bottom:16px;" />` : `<h2 style="color:${accent};margin:0 0 8px;">${brand}</h2>`}
      <h3 style="color:#222;margin:0 0 8px;">Your Free GBP Audit is Ready</h3>
      <p style="color:#555;">${report.business} &mdash; ${report.location}</p>
      <div style="display:flex;gap:12px;margin:20px 0;flex-wrap:wrap;">
        <div style="flex:1;min-width:120px;background:#f1efff;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:bold;color:${accent};">${gbp.score}</div>
          <div style="color:#888;font-size:12px;">Optimization Score</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fff7ed;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:20px;font-weight:bold;color:#f97316;">$${gbp.revenue.atStake.toLocaleString()}</div>
          <div style="color:#888;font-size:12px;">Monthly Revenue at Stake</div>
        </div>
        <div style="flex:1;min-width:120px;background:#ecfdf5;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:20px;font-weight:bold;color:#10b981;">${aiFound}/6</div>
          <div style="color:#888;font-size:12px;">AI Platforms Found</div>
        </div>
      </div>
      <p style="color:#555;">See your full report, competitors, heatmaps and prioritized fixes:</p>
      <a href="${link}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:bold;">View My Full Report</a>
      <p style="color:#aaa;font-size:12px;margin-top:24px;">Audit ID: ${report.auditId}</p>
    </div></body></html>`;
  await transporter.sendMail({
    from: cfg.fromEmail || `${brand} <no-reply@seodominate.org>`,
    to: report.email,
    subject: `Your Free GBP Audit for ${report.business} is Ready`,
    html,
  });
}

function notifyLeadCapture(report, cfg = CONFIG) {
  const payload = {
    type: 'gmb_audit', email: report.email, business: report.business, location: report.location,
    website: report.website || null, gbpScore: report.gbp.score, aeoScore: report.aeo.score, geoScore: report.geo.score,
    auditId: report.auditId, revenueAtStake: report.gbp.revenue.atStake, agencySlug: report.agencySlug || null,
    keywords: report.keywords || [], sources: report.sources, timestamp: new Date().toISOString(),
    reportUrl: `${cfg.appUrl || 'https://seodominate.org'}/report/${report.auditId}`,
  };
  const makeHook = cfg.makeWebhook || MAKE_WEBHOOK_URL;
  if (makeHook) fetch(makeHook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  if (cfg.serpwinWebhook) fetch(cfg.serpwinWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  // Automated follow-up sequence trigger (Make/n8n/GHL schedules the delays server-side)
  if (cfg.followupWebhook) {
    fetch(cfg.followupWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'audit_followup', email: report.email, business: report.business,
        auditId: report.auditId, reportUrl: payload.reportUrl, gbpScore: report.gbp.score,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  }
}

async function suggestKeywords(business, location, cfg = CONFIG) {
  const city = (location || '').split(',')[0].trim();
  if (llmConfigured(cfg)) {
    try {
      const prompt = `A local business named "${business}"${location ? ` in ${location}` : ''} needs local SEO keyword suggestions.\nReply with EXACTLY a JSON array of 8 keyword phrases (plain strings, no markdown), for example: ["plumber", "emergency plumber", "plumber near me", "water heater repair ${city}", "24 hour plumber"]. Make them realistic, geo-aware and specific to the business type.`;
      const raw = await queryLLM(aiModelFor(llmBaseUrl(cfg), 'openai/gpt-4o-mini'), prompt, 12000, cfg);
      const m = raw.match(/\[[\s\S]*\]/);
      const arr = m ? JSON.parse(m[0]) : null;
      if (Array.isArray(arr) && arr.length) {
        const list = arr.filter(k => typeof k === 'string').slice(0, 8).map(k => k.toLowerCase());
        if (list.length) return { list, mode: 'live' };
      }
    } catch (e) { console.warn('[suggest keywords]', e.message); }
  }
  // Heuristic fallback
  const profile = getProfile([business]);
  const out = [];
  for (const t of profile.bizTypes) {
    const base = t.toLowerCase();
    if (!out.includes(base)) out.push(base);
    if (city && !out.includes(`${base} ${city}`)) out.push(`${base} ${city}`);
    if (!out.includes(`${base} near me`)) out.push(`${base} near me`);
    if (out.length >= 8) break;
  }
  return { list: out.slice(0, 8), mode: 'heuristic' };
}

async function generateLiveAuditReport(business, location, email, keywords, website, cfg = CONFIG, agencySlug = null) {
  const seed = `${business}:${location}:${email}:${Date.now()}`;
  const rand = seededRandom(seed);
  const aid = 'AUDIT-' + crypto.createHash('md5').update(seed).digest('hex').substring(0, 8).toUpperCase();
  const kw = keywords.length ? keywords : [business.toLowerCase().split(/\s+/)[0]];
  const profile = getProfile(kw);
  const sources = { gbp: 'simulated', revenue: 'simulated', competitors: 'simulated', ai: 'simulated', heatmaps: 'simulated', aeo: 'simulated', geo: 'simulated', summary: 'simulated' };

  // Geocode (real coords if available, else deterministic hash fallback)
  const coords = cfg.googlePlacesKey ? await safeGeocode(location, cfg) : null;
  const lat = parseFloat((coords?.lat ?? 34.02 + (parseInt(crypto.createHash('md5').update(business).digest('hex').substring(0, 4), 16) / 65536 - 0.5) * 0.3).toFixed(6));
  const lng = parseFloat((coords?.lng ?? -118.48 + (parseInt(crypto.createHash('md5').update(location).digest('hex').substring(0, 4), 16) / 65536 - 0.5) * 0.3).toFixed(6));

  // Fire all live lookups in parallel; each fails safe to null
  const [placeRes, compRes, aiRes, rankRes, onpageRes] = await Promise.allSettled([
    cfg.googlePlacesKey ? findPlace(business, location, cfg) : Promise.reject(new Error('no key')),
    fetchCompetitors(kw[0], lat, lng, cfg),
    fetchAIVisibility(business, profile.bizTypes[0], location, cfg),
    fetchRankings(business, kw[0], lat, lng, cfg),
    website ? fetchOnPageAudit(website, cfg) : Promise.reject(new Error('no website')),
  ]);
  const place = placeRes.status === 'fulfilled' ? placeRes.value : null;
  const competitors = compRes.status === 'fulfilled' && compRes.value ? compRes.value : null;
  const aiVisibility = aiRes.status === 'fulfilled' && aiRes.value ? aiRes.value : null;
  const heatmaps = rankRes.status === 'fulfilled' && rankRes.value ? rankRes.value : null;
  const onpage = onpageRes.status === 'fulfilled' ? onpageRes.value : null;

  // GBP checks + score
  let gbpChecks = null;
  let gbpScore;
  let realSignals = null;
  if (place) {
    realSignals = deriveSignals(place, profile);
    gbpChecks = buildGbpChecks(realSignals, profile);
    sources.gbp = 'live';
  }
  if (!gbpChecks) gbpChecks = generateChecks(rand);
  gbpScore = Math.round(gbpChecks.filter(c => c.pass).length / gbpChecks.length * 100);

  // Competitors
  const finalCompetitors = competitors || generateCompetitors(rand, lat, lng, business);
  if (competitors) sources.competitors = 'live';

  // Revenue estimate
  const searches = Math.round(profile.monthlySearches * (0.8 + rand() * 0.4));
  const acv = Math.round(profile.avgCustomerValue * (0.85 + rand() * 0.3));
  const ms = 0.05 + rand() * 0.15;
  const atStake = Math.round(searches * acv * ms * (gbpScore < 60 ? 1.5 : gbpScore < 80 ? 1.2 : 0.8));
  const revenue = { atStake, monthlySearches: searches, avgCustomerValue: acv, competitorRevenue: Math.round(searches * acv * 0.12) };

  // AI visibility
  const finalAI = aiVisibility || generateAIVisibility(rand);
  if (aiVisibility) sources.ai = 'live';

  // Heatmaps
  const finalHeatmaps = heatmaps || generateHeatmapGrid(rand, lat, lng, kw);
  if (heatmaps) sources.heatmaps = 'live';

  // AEO / GEO
  let aeo = onpage ? buildAeoFromOnPage(onpage, profile) : generateAeoReport(rand, profile);
  let geo = onpage ? buildGeoFromOnPage(onpage, profile) : generateGeoReport(rand, profile);
  if (onpage) { sources.aeo = 'live'; sources.geo = 'live'; }

  // AI summary (template fallback)
  let summary = generateSummary(gbpScore, gbpChecks, revenue, finalCompetitors, finalAI, finalHeatmaps, profile, aeo, geo);
  const aiSum = await fetchAISummary({ business, location, gbpScore, revenue, competitors: finalCompetitors, aiVisibility: finalAI, aeo, geo }, cfg);
  if (aiSum) {
    summary = {
      ...aiSum,
      reviewReplies: aiSum.reviewReplies?.length ? aiSum.reviewReplies : summary.reviewReplies,
      postCopy: aiSum.postCopy?.length ? aiSum.postCopy : summary.postCopy,
    };
    sources.summary = 'live';
  }

  const report = {
    auditId: aid, business, location, email, website: website || null, keywords: kw,
    agencySlug,
    lat, lng, timestamp: new Date().toISOString(),
    sources, realSignals,
    gbp: { score: gbpScore, grade: scoreGrade(gbpScore), checks: gbpChecks, revenue, competitors: finalCompetitors, aiVisibility: finalAI, heatmaps: finalHeatmaps },
    aeo, geo, summary,
  };

  // Non-blocking: persist, notify, email
  persistAudit(report, cfg).catch(() => {});
  notifyLeadCapture(report, cfg);
  sendAuditEmail(report, cfg).catch(() => {});

  return report;
}

// ===== REVIEWS API =====
app.post('/api/reviews', reviewLimiter, honeypotCheck, verifyRecaptcha, (req, res) => {
  try {
    const { name, email, rating, content, businessName } = req.body || {};
    if (!name || !rating || !content) return res.status(400).json({ error: 'Name, rating, and content required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });

    const reviews = loadReviews();
    const review = {
      id: crypto.randomUUID(),
      name, email: email || '',
      rating: Math.round(rating),
      content,
      businessName: businessName || 'General',
      agencySlug: req.agencySlug || 'platform',
      status: rating >= 4 ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      managerNotes: '',
    };
    reviews.push(review);
    saveReviews(reviews);
    mirrorReviewToTeable(review, req.cfg || CONFIG).catch(() => {});

    // Webhook for high-star reviews
    if (rating >= 4) {
      fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'review_approved', reviewId: review.id, name, rating, content, businessName, agencySlug: review.agencySlug, action: 'publish_to_platforms', timestamp: new Date().toISOString() }),
      }).catch(() => {});
    }

    res.json({ success: true, review: { ...review, status: review.status, message: rating >= 4 ? 'Your review has been published. Thank you!' : 'Thank you! Your review has been received and will be reviewed by the management team.' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reviews/public', (req, res) => {
  const scope = req.agencySlug || 'platform';
  const reviews = loadReviews().filter(r => r.status === 'approved' && r.agencySlug === scope).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20);
  res.json({ reviews });
});

app.get('/api/reviews', requireAuth, (req, res) => {
  const { status, agency } = req.query;
  let reviews = loadReviews().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (status) reviews = reviews.filter(r => r.status === status);
  if (agency) reviews = reviews.filter(r => r.agencySlug === agency);
  res.json({ reviews, total: reviews.length, pending: loadReviews().filter(r => r.status === 'pending').length });
});

app.put('/api/reviews/:id', requireAuth, (req, res) => {
  const reviews = loadReviews();
  const idx = reviews.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Review not found' });

  const { status, managerNotes } = req.body || {};
  if (status) reviews[idx].status = status;
  if (managerNotes !== undefined) reviews[idx].managerNotes = managerNotes;
  reviews[idx].reviewedAt = new Date().toISOString();
  saveReviews(reviews);
  res.json({ success: true, review: reviews[idx] });
});

// ===== AUDIT API =====
app.get('/api/health', (req, res) => res.json({
  ok: true,
  version: '4.0-live',
  node: process.version,
  live: {
    googlePlaces: !!CONFIG.googlePlacesKey,
    rankNibbler: !!CONFIG.rankNibblerKey,
    dataforseo: !!(CONFIG.dfsLogin && CONFIG.dfsPassword),
    llm: llmConfigured(),
    llmBaseUrl: llmBaseUrl(),
    teable: !!CONFIG.teableToken,
    teableTables: CONFIG.teableToken ? {
      agencies: CONFIG.teableAgenciesTableId,
      audits: CONFIG.teableAuditsTableId,
      leads: CONFIG.teableLeadsTableId,
      reviews: CONFIG.teableReviewsTableId,
    } : null,
    smtp: !!CONFIG.smtpHost,
    serpwinWebhook: !!CONFIG.serpwinWebhook,
    makeWebhook: !!MAKE_WEBHOOK_URL,
  },
}));

app.get('/api/teable/diagnose', async (req, res) => {
  const cfg = req.cfg || CONFIG;
  if (!cfg.teableToken) return res.json({ configured: false, error: 'TEABLE_API_TOKEN not set' });
  try {
    const tables = { agencies: cfg.teableAgenciesTableId, audits: cfg.teableAuditsTableId, leads: cfg.teableLeadsTableId, reviews: cfg.teableReviewsTableId };
    const out = { configured: true, url: cfg.teableUrl, tables: {} };
    for (const [name, id] of Object.entries(tables)) {
      try {
        const fields = await teableFields(cfg, id);
        out.tables[name] = { id, fieldCount: fields.length, fields: fields.map(f => ({ name: f.name, type: f.type })) };
      } catch (e) { out.tables[name] = { id, error: e.message }; }
    }
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/config', (req, res) => {
  const cfg = req.cfg || CONFIG;
  res.json({
    brand: {
      name: cfg.brandName,
      logoUrl: cfg.brandLogoUrl,
      color: cfg.brandColor,
      email: cfg.brandEmail || 'hello@seodominate.org',
      assistantName: cfg.aiAssistantName,
    },
    agency: req.agency ? { slug: req.agency.slug, name: req.agency.brand.name || req.agency.name } : null,
    recaptchaSiteKey: cfg.recaptchaSiteKey || null,
    recaptchaEnterprise: !!(cfg.recaptchaProjectId && cfg.googleCloudKey),
    live: {
      googlePlaces: !!cfg.googlePlacesKey,
      rankNibbler: !!cfg.rankNibblerKey,
      llm: llmConfigured(cfg),
      llmBaseUrl: llmBaseUrl(cfg),
    },
  });
});

app.post('/api/suggest-keywords', async (req, res) => {
  try {
    const { business, location } = req.body || {};
    if (!business) return res.status(400).json({ error: 'Business name required' });
    const { list, mode } = await suggestKeywords(business.trim(), (location || '').trim(), req.cfg || CONFIG);
    res.json({ success: true, keywords: list, mode });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/gmb-audit', auditLimiter, honeypotCheck, verifyRecaptcha, async (req, res) => {
  try {
    const { business, location, email, keywords, website, demo } = req.body || {};
    if (!business) return res.status(400).json({ error: 'Business name required' });
    if (!location) return res.status(400).json({ error: 'Location required' });
    if (!email?.includes('@')) return res.status(400).json({ error: 'Valid email required' });

    const cfg = req.cfg || CONFIG;
    const agencySlug = req.agencySlug || null;
    let report;
    if (demo || cfg.demoMode) {
      // Instant demo — pure mock engine, no external calls, no webhooks/email/persist
      report = generateAuditReport(business.trim(), location.trim(), email.trim(), keywords || []);
      report.auditId = 'demo-' + crypto.createHash('md5').update(Date.now().toString()).digest('hex').substring(0, 8).toUpperCase();
      report.demo = true;
      report.agencySlug = agencySlug;
      report.keywords = keywords && keywords.length ? keywords : [business.trim().toLowerCase().split(/\s+/)[0]];
      report.sources = { gbp: 'demo', revenue: 'demo', competitors: 'demo', ai: 'demo', heatmaps: 'demo', aeo: 'demo', geo: 'demo', summary: 'demo' };
    } else {
      report = await generateLiveAuditReport(business.trim(), location.trim(), email.trim(), keywords || [], (website || '').trim(), cfg, agencySlug);
    }
    res.json({ success: true, report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Shareable report lookup
app.get('/api/report/:auditId', async (req, res) => {
  try {
    const report = await getAudit(req.params.auditId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ success: true, report });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Shareable report page (SPA handles rendering via /report/:id)
app.get('/report/:auditId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== SERVE MANAGER DASHBOARD =====
app.get('/manager', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ===== AGENCY DASHBOARD + SLUG ROUTES =====
const agencyAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/agency', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'agency.html'));
});

// White-label landing for an agency: /a/:slug serves the same SPA; the client
// reads the slug from the URL and sends x-agency on API calls.
app.get('/a/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/agency/register', agencyAuthLimiter, (req, res) => {
  try {
    const { name, email, password, slug } = req.body || {};
    if (!name || !email?.includes('@') || !password || password.length < 6) {
      return res.status(400).json({ error: 'Name, valid email, and a password of at least 6 characters are required.' });
    }
    const agencies = loadAgencies();
    const normalized = email.toLowerCase().trim();
    if (Object.values(agencies).some(a => a.email === normalized)) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
    }
    let finalSlug = slugify(slug || name);
    if (!finalSlug) finalSlug = slugify(name);
    if (!finalSlug) return res.status(400).json({ error: 'Could not build a slug. Provide a name.' });
    let candidate = finalSlug;
    let n = 2;
    while (Object.values(agencies).some(a => a.slug === candidate)) candidate = `${finalSlug}-${n++}`;

    const agency = newAgency({ name: name.trim(), email: normalized, password, slug: candidate });
    agencies[agency.id] = agency;
    saveAgenciesLocal(agencies);
    syncAgencyToTeable(agency, CONFIG).catch(() => {});
    res.json({ success: true, token: signSession(agency.id), agency: { slug: agency.slug, name: agency.brand.name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agency/login', agencyAuthLimiter, (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const agency = Object.values(loadAgencies()).find(a => a.email === String(email).toLowerCase().trim());
    if (!agency || !verifyPassword(password, agency.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.json({ success: true, token: signSession(agency.id), agency: { slug: agency.slug, name: agency.brand.name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agency/me', requireAgency, (req, res) => {
  const a = req.agencyAuth;
  res.json({
    success: true,
    agency: {
      id: a.id, slug: a.slug, name: a.name, email: a.email,
      brand: a.brand,
      keys: maskedKeys(a),
      createdAt: a.createdAt,
      auditCount: Object.values(loadAudits()).filter(r => r.agencySlug === a.slug).length,
    },
  });
});

app.put('/api/agency/me', requireAgency, (req, res) => {
  try {
    const agencies = loadAgencies();
    const a = agencies[req.agencyAuth.id];
    if (!a) return res.status(404).json({ error: 'Agency not found' });
    const { brand } = req.body || {};
    if (brand) {
      for (const f of AGENCY_BRAND_FIELDS) {
        if (brand[f] !== undefined) a.brand[f] = String(brand[f]).trim();
      }
      if (!a.brand.name) a.brand.name = a.name;
    }
    a.updatedAt = new Date().toISOString();
    agencies[a.id] = a;
    saveAgenciesLocal(agencies);
    syncAgencyToTeable(a, CONFIG).catch(() => {});
    res.json({ success: true, agency: { slug: a.slug, name: a.name, brand: a.brand, keys: maskedKeys(a) } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/agency/me/keys', requireAgency, (req, res) => {
  try {
    const agencies = loadAgencies();
    const a = agencies[req.agencyAuth.id];
    if (!a) return res.status(404).json({ error: 'Agency not found' });
    const { keys } = req.body || {};
    if (keys && typeof keys === 'object') {
      for (const f of AGENCY_KEY_FIELDS) {
        if (keys[f] === undefined) continue;
        const v = String(keys[f]);
        if (v === '' || v.startsWith('••••')) { if (v === '') delete a.keys[f]; continue; }
        a.keys[f] = encryptSecret(v);
      }
    }
    a.updatedAt = new Date().toISOString();
    agencies[a.id] = a;
    saveAgenciesLocal(agencies);
    syncAgencyToTeable(a, CONFIG).catch(() => {});
    res.json({ success: true, keys: maskedKeys(a) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/agency/me/audits', requireAgency, (req, res) => {
  const a = req.agencyAuth;
  const all = loadAudits();
  const audits = Object.values(all)
    .filter(r => r.agencySlug === a.slug)
    .sort((x, y) => new Date(y.timestamp) - new Date(x.timestamp))
    .slice(0, 50)
    .map(r => ({
      auditId: r.auditId, business: r.business, location: r.location, email: r.email,
      score: r.gbp.score, atStake: r.gbp.revenue.atStake, sources: r.sources,
      timestamp: r.timestamp, website: r.website || null,
    }));
  res.json({ success: true, audits, total: audits.length });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`GBP Audit v3 running at http://localhost:${PORT}`);
    console.log(`Manager dashboard: http://localhost:${PORT}/manager`);
    console.log(`Agency dashboard: http://localhost:${PORT}/agency`);
    console.log(`Reviews API: POST /api/reviews | GET /api/reviews/public`);
    console.log(`Teable diagnose: GET /api/teable/diagnose | ${CONFIG.teableToken ? 'token set' : 'token MISSING'}`);
    console.log(`Rate limit: 5 audits/hr, 3 reviews/hr`);
    console.log(`Make webhook: ${MAKE_WEBHOOK_URL ? 'configured' : 'not set'}`);
    console.log(`Agencies: ${Object.keys(loadAgencies()).length} registered`);
  });
}

module.exports = app;
