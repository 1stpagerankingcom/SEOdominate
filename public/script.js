document.getElementById('footer-year').textContent = new Date().getFullYear();

// ===== AGENCY MULTI-TENANCY (white-label slug from URL /a/:slug) =====
const AGENCY_SLUG = (location.pathname.match(/^\/a\/([a-z0-9-]+)/) || [])[1] || null;

async function api(path, options = {}) {
  const opts = { ...options };
  opts.headers = { ...(options.headers || {}) };
  const slug = window.__agencySlug || AGENCY_SLUG;
  if (slug) opts.headers['x-agency'] = slug;
  const res = await fetch(path, opts);
  return res;
}

const suggestedKeywords = {
  default: ['plumber', 'electrician', 'hvac', 'pizza', 'dentist', 'lawyer', 'roofer', 'painter', 'landscaper', 'cleaner', 'mechanic', 'chiropractor', 'therapist', 'photographer', 'contractor']
};

let selectedKeywords = [];
let lastReport = null;
let heatmapMap = null;
let competitorMap = null;

// ===== KEYWORD CHIPS =====
const chipsContainer = document.getElementById('keyword-chips');
const customInput = document.getElementById('keyword-custom');

function renderChips() {
  const keywords = suggestedKeywords.default.slice(0, 8);
  chipsContainer.innerHTML = keywords.map(k =>
    `<span class="keyword-chip${selectedKeywords.includes(k) ? ' selected' : ''}" data-kw="${k}">${k}</span>`
  ).join('');
  chipsContainer.querySelectorAll('.keyword-chip').forEach(el => {
    el.addEventListener('click', () => toggleKeyword(el.dataset.kw));
  });
}

function toggleKeyword(kw) {
  const idx = selectedKeywords.indexOf(kw);
  if (idx > -1) selectedKeywords.splice(idx, 1);
  else if (selectedKeywords.length < 3) selectedKeywords.push(kw);
  renderChips();
  customInput.value = '';
}

customInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = customInput.value.trim().toLowerCase();
    if (val && selectedKeywords.length < 3 && !selectedKeywords.includes(val)) {
      selectedKeywords.push(val);
      renderChips();
      customInput.value = '';
    }
  }
});

// ===== STAR SELECT =====
document.querySelectorAll('.star-opt').forEach(el => {
  el.addEventListener('click', () => {
    const val = parseInt(el.dataset.val);
    document.getElementById('rev-rating').value = val;
    document.querySelectorAll('.star-opt').forEach((s, i) => s.classList.toggle('active', i < val));
  });
});
document.querySelectorAll('.star-opt')[4].classList.add('active');

// ===== REVIEW SUBMISSION =====
document.getElementById('review-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('rev-name').value.trim();
  const email = document.getElementById('rev-email').value.trim();
  const rating = parseInt(document.getElementById('rev-rating').value);
  const content = document.getElementById('rev-content').value.trim();
  const msg = document.getElementById('rev-message');
  const btn = document.getElementById('rev-submit');

  if (!name || !content) { msg.textContent = 'Name and review are required.'; msg.className = 'review-message error'; return; }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const recaptchaToken = await getRecaptchaToken('review');
    const res = await api('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, rating, content, businessName: document.getElementById('report-business-name').textContent || '', recaptchaToken, recaptchaAction: 'review' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    msg.textContent = data.review.message;
    msg.className = 'review-message success';
    document.getElementById('review-form').reset();
    document.querySelectorAll('.star-opt')[4].classList.add('active');
    loadPublicReviews();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'review-message error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Review';
  }
});

async function loadPublicReviews() {
  try {
    const res = await api('/api/reviews/public');
    const data = await res.json();
    const list = document.getElementById('reviews-list');
    if (!data.reviews || !data.reviews.length) {
      list.innerHTML = '<p style="text-align:center;color:var(--text2);font-size:0.85rem;">No reviews yet. Be the first!</p>';
      return;
    }
    list.innerHTML = data.reviews.map(r => `
      <div class="public-review-card">
        <div class="pub-name">${esc(r.name)}</div>
        <div class="pub-rating">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
        <div class="pub-content">${esc(r.content)}</div>
      </div>
    `).join('');
  } catch {}
}

// ===== LOADING ANIMATION =====
let stepTimer = null;
let stepIdx = 0;

function startLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay.hidden = false;
  const steps = overlay.querySelectorAll('.load-step');
  steps.forEach(s => { s.className = 'load-step'; });
  stepIdx = 0;
  clearInterval(stepTimer);
  stepTimer = setInterval(() => {
    steps.forEach(s => s.classList.remove('active'));
    if (stepIdx < steps.length) {
      steps[stepIdx].classList.add('active');
      stepIdx++;
    }
  }, 700);
}

function stopLoading() {
  clearInterval(stepTimer);
  document.getElementById('loading-overlay').hidden = true;
}

// ===== FORM SUBMIT =====
const form = document.getElementById('audit-form');
const submitBtn = document.getElementById('submit-btn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const resultsSection = document.getElementById('results-section');
let forceDemo = false;

document.getElementById('demo-btn').addEventListener('click', () => {
  document.getElementById('business').value = 'Demo Plumbing Co.';
  document.getElementById('location').value = 'Austin, TX';
  document.getElementById('email').value = 'demo@seodominate.org';
  document.getElementById('website').value = '';
  forceDemo = true;
  form.requestSubmit();
});

document.getElementById('pdf-btn').addEventListener('click', () => {
  window.print();
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  const business = document.getElementById('business').value.trim();
  const location = document.getElementById('location').value.trim();
  const email = document.getElementById('email').value.trim();
  const website = document.getElementById('website').value.trim();
  if (!business || !location || !email) return;

  submitBtn.disabled = true;
  btnText.hidden = true;
  btnLoading.hidden = false;
  resultsSection.hidden = true;
  document.getElementById('hero').scrollIntoView({ behavior: 'smooth' });
  startLoading();

  try {
    const recaptchaToken = await getRecaptchaToken('audit');
    const res = await api('/api/gmb-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business, location, email, keywords: selectedKeywords, website, demo: forceDemo || undefined, recaptchaToken, recaptchaAction: 'audit' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    stopLoading();
    renderReport(data.report, business, location);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    stopLoading();
    alert('Something went wrong: ' + err.message);
  } finally {
    forceDemo = false;
    submitBtn.disabled = false;
    btnText.hidden = false;
    btnLoading.hidden = true;
  }
});

// ===== SHAREABLE REPORT URLS =====
const shareBtn = document.getElementById('share-btn');
shareBtn.addEventListener('click', async () => {
  if (!lastReport) return;
  const url = `${location.origin}/report/${lastReport.auditId}`;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
    else throw new Error('clipboard unavailable');
    shareBtn.textContent = 'Link Copied!';
    setTimeout(() => { shareBtn.innerHTML = '&#128279; Share Report'; }, 2000);
  } catch {
    prompt('Copy your report link:', url);
  }
});

function renderSources(sources) {
  const el = document.getElementById('source-badges');
  if (!sources) { el.innerHTML = ''; return; }
  const order = [['gbp', 'GBP'], ['competitors', 'Competitors'], ['ai', 'AI Check'], ['heatmaps', 'Heatmaps'], ['aeo', 'AEO'], ['geo', 'GEO'], ['summary', 'AI Summary']];
  el.innerHTML = order
    .filter(([k]) => sources[k])
    .map(([k, label]) => {
      const cls = sources[k] === 'live' ? 'live' : 'sim';
      const txt = sources[k] === 'live' ? 'Live' : sources[k] === 'demo' ? 'Demo' : 'Simulated';
      return `<span class="source-badge ${cls}"><i></i>${label}: ${txt}</span>`;
    })
    .join('');
}

async function loadReportByUrl(id) {
  try {
    const res = await api('/api/report/' + encodeURIComponent(id));
    const data = await res.json();
    if (!res.ok || !data.report) throw new Error(data.error || 'Report not found');
    const r = data.report;
    if (r.agencySlug && !AGENCY_SLUG) {
      window.__agencySlug = r.agencySlug;
      loadConfig();
    }
    document.getElementById('business').value = r.business || '';
    document.getElementById('location').value = r.location || '';
    if (r.website) document.getElementById('website').value = r.website;
    renderReport(r, r.business, r.location);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.warn('Could not load shared report:', err.message);
  }
}

function renderReport(r, business, location) {
  lastReport = r;
  const now = new Date();
  document.getElementById('report-business-name').textContent = business;
  document.getElementById('report-location').textContent = location;
  document.getElementById('report-id').textContent = r.auditId;
  document.getElementById('report-date').textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

  renderSources(r.sources);

  const gbp = r.gbp || {};
  renderScore(gbp);
  renderRevenue(gbp);
  renderCompetitors(gbp, r.lat, r.lng);
  renderAIVisibility(gbp);
  renderHeatmaps(gbp, r.lat, r.lng);
  renderAeo(r.aeo);
  renderGeo(r.geo);
  renderSummary(r.summary);
}

// ===== SCORE =====
function renderScore(gbp) {
  const score = Math.round(gbp.score || 0);
  const ring = document.getElementById('score-ring');
  const circumference = 326.73;
  ring.style.strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  ring.style.stroke = color;
  animateNumber('score-num', score);

  const gradeEl = document.getElementById('score-grade');
  let grade, summary;
  if (score >= 80) { grade = 'Excellent!'; summary = 'Your GBP is well-optimized. Maintain with regular posts and review responses.'; }
  else if (score >= 60) { grade = 'Good'; summary = 'Solid fundamentals. Clear opportunities to improve rankings and attract more customers.'; }
  else if (score >= 40) { grade = 'Needs Work'; summary = 'Missing several key optimization factors. Fixing these will significantly improve local visibility.'; }
  else { grade = 'Poor'; summary = 'Significant optimization needed. Start with the basics — complete every field, add photos, respond to reviews.'; }
  gradeEl.textContent = grade;
  gradeEl.style.color = color;
  document.getElementById('score-summary').textContent = summary;

  const container = document.getElementById('gbp-checks');
  const checks = gbp.checks || [];
  container.innerHTML = checks.map(c => `
    <div class="gbp-check ${c.pass ? 'pass' : 'fail'}">
      <span class="check-status">${c.pass ? '&#10003;' : '&#10007;'}</span>
      <span class="check-label">${c.label}</span>
      ${c.value ? `<span class="check-value">${c.value}</span>` : ''}
    </div>
  `).join('');
}

// ===== REVENUE =====
function renderRevenue(gbp) {
  const rev = gbp.revenue || {};
  animateCurrency('rev-at-stake', rev.atStake || 0);
  animateNumber('rev-searches', rev.monthlySearches || 0);
  animateCurrency('rev-acv', rev.avgCustomerValue || 0);
  animateCurrency('rev-competitor', rev.competitorRevenue || 0);
}

// ===== COMPETITORS =====
function renderCompetitors(gbp, lat, lng) {
  const competitors = gbp.competitors || [];
  const list = document.getElementById('competitor-list');
  list.innerHTML = competitors.map((c, i) => `
    <div class="competitor-card">
      <div class="comp-rank">#${i + 1}</div>
      <div class="comp-info">
        <div class="comp-name">${esc(c.name)}</div>
        <div class="comp-addr">${esc(c.address)}</div>
        <div class="comp-stats"><span class="star">&#9733; ${c.rating}</span><span>${c.reviews} reviews</span></div>
      </div>
    </div>
  `).join('');

  if (competitorMap) competitorMap.remove();
  competitorMap = L.map('competitor-map').setView([lat || 34.02, lng || -118.48], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 18 }).addTo(competitorMap);

  competitors.forEach((c, i) => {
    const color = ['#6c5ce7', '#f59e0b', '#ef4444'][i];
    L.circleMarker([c.lat, c.lng], { radius: 10, color, fillColor: color, fillOpacity: 0.3, weight: 2 })
      .addTo(competitorMap).bindPopup(`<b>#${i+1} ${esc(c.name)}</b><br>&#9733; ${c.rating} (${c.reviews} reviews)`);
  });
  L.circleMarker([lat, lng], { radius: 14, color: '#10b981', fillColor: '#10b981', fillOpacity: 0.2, weight: 3 })
    .addTo(competitorMap).bindPopup('<b>Your Business</b>');
  setTimeout(() => competitorMap.invalidateSize(), 500);
}

// ===== AI VISIBILITY =====
function renderAIVisibility(gbp) {
  const ai = gbp.aiVisibility || [];
  const grid = document.getElementById('ai-grid');
  grid.innerHTML = ai.map(a => `
    <div class="ai-item ${a.found ? 'found' : 'not-found'}">
      <div class="ai-name">${a.platform}</div>
      <div class="ai-status">${a.found ? 'Found &#10003;' : 'Not Found &#10007;'}${a.rank ? `<span class="ai-rank">#${a.rank}</span>` : ''}${a.error ? ' <span class="ai-error">(unavailable)</span>' : ''}</div>
    </div>
  `).join('');
}

// ===== HEATMAPS =====
function renderHeatmaps(gbp, lat, lng) {
  const heatmaps = gbp.heatmaps || [];
  const tabs = document.getElementById('heatmap-tabs');
  const statsEl = document.getElementById('heatmap-stats');
  const section = document.querySelector('.heatmap-section');

  if (!heatmaps.length) { section.hidden = true; return; }
  section.hidden = false;

  tabs.innerHTML = heatmaps.map((h, i) =>
    `<span class="heatmap-tab${i === 0 ? ' active' : ''}" data-idx="${i}">${h.keyword}</span>`
  ).join('');
  tabs.querySelectorAll('.heatmap-tab').forEach(el => {
    el.addEventListener('click', () => {
      tabs.querySelectorAll('.heatmap-tab').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      drawHeatmap(heatmaps[parseInt(el.dataset.idx)], lat, lng);
    });
  });
  if (heatmaps.length) drawHeatmap(heatmaps[0], lat, lng);

  function drawHeatmap(h, lat, lng) {
    if (heatmapMap) heatmapMap.remove();
    const center = [lat || 34.02, lng || -118.48];
    heatmapMap = L.map('heatmap-map').setView(center, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 18 }).addTo(heatmapMap);
    L.circleMarker(center, { radius: 10, color: '#6c5ce7', fillColor: '#6c5ce7', fillOpacity: 0.4, weight: 2 })
      .addTo(heatmapMap).bindPopup('<b>Your Business</b>');

    (h.grid || []).forEach(g => {
      let color = '#ef4444';
      if (g.rank <= 3) color = '#10b981';
      else if (g.rank <= 5) color = '#22c55e';
      else if (g.rank <= 8) color = '#f59e0b';
      else if (g.rank <= 12) color = '#f97316';
      L.circleMarker([g.lat, g.lng], { radius: 7, color, fillColor: color, fillOpacity: 0.5, weight: 1 })
        .addTo(heatmapMap).bindPopup(`Rank: #${g.rank}`);
    });

    statsEl.innerHTML = `
      <div class="heatmap-stat"><div class="heatmap-stat-label">Avg Ranking</div><div class="heatmap-stat-value">#${h.averageRank || '?'}</div></div>
      <div class="heatmap-stat"><div class="heatmap-stat-label">Keyword</div><div class="heatmap-stat-value" style="font-size:0.95rem;text-transform:capitalize;">${h.keyword}</div></div>
      <div class="heatmap-stat"><div class="heatmap-stat-label">#1 Multiplier</div><div class="heatmap-stat-value">${h.multiplier || 1}x</div></div>
    `;
    setTimeout(() => heatmapMap.invalidateSize(), 500);
  }
}

// ===== AEO =====
function renderAeo(aeo) {
  if (!aeo) { document.querySelector('.aeo-section').hidden = true; return; }
  document.querySelector('.aeo-section').hidden = false;
  const score = Math.round(aeo.score || 0);
  const ring = document.getElementById('aeo-ring');
  const c = 326.73;
  ring.style.strokeDashoffset = c - (score / 100) * c;
  ring.style.stroke = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
  animateNumber('aeo-num', score);
  document.getElementById('aeo-summary').textContent = aeo.summary || '';

  const container = document.getElementById('aeo-checks');
  container.innerHTML = (aeo.checks || []).map(ch => `
    <div class="gbp-check ${ch.pass ? 'pass' : 'fail'}">
      <span class="check-status">${ch.pass ? '&#10003;' : '&#10007;'}</span>
      <span class="check-label">${ch.label}</span>
      <span class="check-value">${ch.score}/100</span>
    </div>
  `).join('');
}

// ===== GEO =====
function renderGeo(geo) {
  if (!geo) { document.querySelector('.geo-section').hidden = true; return; }
  document.querySelector('.geo-section').hidden = false;
  const score = Math.round(geo.score || 0);
  const ring = document.getElementById('geo-ring');
  const c = 326.73;
  ring.style.strokeDashoffset = c - (score / 100) * c;
  ring.style.stroke = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
  animateNumber('geo-num', score);
  document.getElementById('geo-summary').textContent = geo.summary || '';

  const container = document.getElementById('geo-checks');
  container.innerHTML = (geo.checks || []).map(ch => `
    <div class="gbp-check ${ch.pass ? 'pass' : 'fail'}">
      <span class="check-status">${ch.pass ? '&#10003;' : '&#10007;'}</span>
      <span class="check-label">${ch.label}</span>
      <span class="check-value">${ch.score}/100</span>
    </div>
  `).join('');
}

// ===== AI SUMMARY =====
function renderSummary(s) {
  if (!s) { document.querySelector('.summary-section').hidden = true; return; }
  document.querySelector('.summary-section').hidden = false;
  const container = document.getElementById('summary-content');
  const fixes = s.fixes || [];
  container.innerHTML = `
    <p>${s.executiveSummary || ''}</p>
    ${(s.rankBlockers || []).length ? `
      <h4>Top Ranking Blockers</h4>
      <ul style="margin-bottom:1rem;padding-left:1.2rem;">
        ${s.rankBlockers.map(b => `<li style="font-size:0.85rem;color:var(--text2);margin-bottom:0.25rem;">${esc(b)}</li>`).join('')}
      </ul>
    ` : ''}
    ${fixes.length ? `
      <h4>Priority Fixes</h4>
      ${fixes.map((f, i) => `
        <div class="summary-fix">
          <div class="fix-priority" style="color:${i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#10b981'};">${f.priority || 'Medium'} Priority</div>
          <div class="fix-text">${esc(f.text || f)}</div>
        </div>
      `).join('')}
    ` : ''}
    ${(s.reviewReplies || []).length ? `
      <h4>Draft Review Replies</h4>
      ${s.reviewReplies.map((rr, i) => `
        <div class="reply-card">
          <div class="reply-sentiment ${String(rr.sentiment || '').toLowerCase() === 'constructive' ? 'warn' : 'pos'}">${esc(rr.sentiment || 'Reply ' + (i + 1))}</div>
          <div class="reply-text">${esc(rr.text)}</div>
        </div>
      `).join('')}
    ` : ''}
    ${(s.postCopy || []).length ? `
      <h4>Google Business Post Ideas</h4>
      ${s.postCopy.map((p, i) => `
        <div class="post-card">
          <div class="post-idea">${esc(p.idea || 'Post ' + (i + 1))}</div>
          <div class="post-text">${esc(p.text)}</div>
        </div>
      `).join('')}
    ` : ''}
  `;
}

// ===== ANIMATION HELPERS =====
function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const d = 1000, start = performance.now();
  function u(now) { const p = Math.min((now - start) / d, 1); el.textContent = Math.round(0 + (target - 0) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(u); }
  requestAnimationFrame(u);
}

function animateCurrency(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const d = 1000, start = performance.now();
  function u(now) { const p = Math.min((now - start) / d, 1); el.textContent = '$' + Math.round(0 + (target - 0) * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(u); }
  requestAnimationFrame(u);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ===== SITE CONFIG (white-label + reCAPTCHA) =====
const CONFIG_STATE = { brand: null, recaptchaSiteKey: null, recaptchaEnterprise: false };

function lightenHex(hex, amount) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const num = parseInt(full, 16);
  const r = Math.min(255, (num >> 16) + amount), g = Math.min(255, ((num >> 8) & 0xff) + amount), b = Math.min(255, (num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function replaceTextDeep(root, from, to) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.nodeValue.includes(from) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => { n.nodeValue = n.nodeValue.split(from).join(to); });
}

async function loadConfig() {
  try {
    const res = await api('/api/config');
    if (!res.ok) return;
    const data = await res.json();
    CONFIG_STATE.brand = data.brand || null;
    CONFIG_STATE.recaptchaSiteKey = data.recaptchaSiteKey || null;
    CONFIG_STATE.recaptchaEnterprise = !!data.recaptchaEnterprise;
    if (CONFIG_STATE.brand) applyBrand(CONFIG_STATE.brand);
  } catch {}
}

function applyBrand(b) {
  const root = document.documentElement;
  root.style.setProperty('--accent', b.color);
  root.style.setProperty('--accent2', lightenHex(b.color, 40));
  const foot = document.getElementById('brand-name-footer');
  if (foot && b.name) foot.textContent = b.name;
  const email = document.getElementById('brand-email');
  if (email && b.email) { email.textContent = b.email; email.setAttribute('href', 'mailto:' + b.email); }
  if (b.assistantName && b.assistantName !== 'Aria') {
    replaceTextDeep(document.body, 'Aria', b.assistantName);
    replaceTextDeep(document.body, 'ARIA', b.assistantName.toUpperCase());
  }
  if (b.logoUrl) {
    const navLogo = document.querySelector('.brand-logo');
    if (navLogo) navLogo.src = b.logoUrl;
  }
  document.title = (b.name || 'SEODominate') + ' — ' + (document.title.includes('—') ? document.title.split('—')[1].trim() : document.title);
}

// ===== RECAPTCHA (optional — activates only when site key configured) =====
let recaptchaReady = null;
function ensureRecaptcha() {
  if (!CONFIG_STATE.recaptchaSiteKey || window.grecaptcha) return Promise.resolve(window.grecaptcha || null);
  if (recaptchaReady) return recaptchaReady;
  recaptchaReady = new Promise(resolve => {
    window.__onSeoauditRecaptcha = () => resolve(window.grecaptcha);
    const s = document.createElement('script');
    const apiFile = CONFIG_STATE.recaptchaEnterprise ? 'enterprise.js' : 'api.js';
    s.src = `https://www.google.com/recaptcha/${apiFile}?render=${CONFIG_STATE.recaptchaSiteKey}`;
    s.async = true;
    s.onload = () => window.__onSeoauditRecaptcha();
    document.head.appendChild(s);
  });
  return recaptchaReady;
}

async function getRecaptchaToken(action) {
  if (!CONFIG_STATE.recaptchaSiteKey) return null;
  try {
    const g = await ensureRecaptcha();
    if (!g) return null;
    const exec = CONFIG_STATE.recaptchaEnterprise ? g.enterprise.execute : g.execute;
    return await exec(CONFIG_STATE.recaptchaSiteKey, { action });
  } catch { return null; }
}

// ===== KEYWORD SUGGESTIONS (smart, from server) =====
let suggestTimer = null;
async function refreshSuggestions() {
  const b = document.getElementById('business').value.trim();
  const l = document.getElementById('location').value.trim();
  if (b.length < 2) return;
  try {
    const res = await api('/api/suggest-keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business: b, location: l }),
    });
    const data = await res.json();
    if (!res.ok || !data.keywords || !data.keywords.length) return;
    const prev = selectedKeywords.slice();
    suggestedKeywords.default = data.keywords;
    selectedKeywords = prev.filter(k => data.keywords.includes(k));
    renderChips();
  } catch {}
}
document.getElementById('business').addEventListener('input', () => {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(refreshSuggestions, 650);
});
document.getElementById('location').addEventListener('input', () => {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(refreshSuggestions, 650);
});

// ===== INIT =====
renderChips();
loadPublicReviews();
loadConfig();

// Shared report URL: /report/:auditId
(function () {
  const m = location.pathname.match(/^\/report\/(.+)$/);
  if (m) loadReportByUrl(decodeURIComponent(m[1]));
})();
