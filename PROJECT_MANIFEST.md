# PROJECT MANIFEST — SEODominate (Local SEO Audit + Review Platform)

## STATUS — NEXT RESTART
- **Current Goal:** v9 — full agency multi-tenancy + rebrand to SEODominate (was SEOAudit). Remaining: add platform API keys, set `AGENCY_KEY_ENCRYPTION_KEY`, deploy.
- **Last Session Date:** 2026-07-31
- **Project Root:** `F:\Mike d drive\Mike Webs\mAIstermind.com\projects\seoaudit-landing`
- **Active Modules:** GBP Audit, AEO Report, GEO Report, Smart Review Platform, Agency Multi-Tenancy
- **Server:** `node server.js` → `http://localhost:3000`
- **Manager Dashboard:** `http://localhost:3000/manager` (token: `seoaudit-manager-2026`)
- **Agency Dashboard:** `http://localhost:3000/agency`
- **Agency White-label Landing:** `http://localhost:3000/a/:slug`
- **Lead Capture:** Make webhook active + followup webhook optional
- **Version:** 4.0-live (v9 feature set) — real data layer + multi-tenant, fail-to-mock fallback

## WHAT'S BUILT — 4 COMPLETE SYSTEMS

### 1. GBP Local SEO Audit (6 features)
| Feature | Status | Notes |
|---------|--------|-------|
| Optimization Score 0-100% | Live (real via Google Places, fallback mock) | 10 pass/fail checks, animated ring, live/estimated sources |
| Revenue Opportunity | Live (mock formula) | Dollar estimate, animated counters |
| Top 3 Competitors | Live (DataForSEO Maps → Google Places Nearby → mock) | Cards + Leaflet map with markers |
| AI Visibility Check | Live (6 LLMs via OpenRouter/OmniRoute, fallback mock) | ChatGPT, Claude, Gemini, Grok, Llama, Perplexity + rank |
| Keyword Heatmaps | Live (DataForSEO 3x3 geo-grid, fallback mock) | Leaflet map, avg rank, #1 multiplier |
| AI Summary & Fixes | Live (LLM narrative, fallback template) | Executive summary + ranked blockers + priority fixes |

### 2. AEO (Answer Engine Optimization) Report
- **Live via RankNibbler on-page audit** when a website is provided (optional form field)
- Scores content readiness: Question Match Rate, Answer Clarity, Featured Snippet Potential, Voice Search Readiness, PAA Coverage, FAQ Schema
- Falls back to mock when no website or no key

### 3. GEO (Generative Engine Optimization) Report
- **Live via RankNibbler on-page audit** when a website is provided
- Scores: Entity Clarity, Knowledge Graph, LLM Recommendation, Contextual Authority, Structured Data, Citation Consistency
- Falls back to mock

### 4. Smart Review Platform
| Feature | Status | Notes |
|---------|--------|-------|
| Public submission form | Live | Star selector, name+email+content |
| 4-5 star auto-approve | Live | Published immediately to public API |
| 1-3 star held for manager | Live | Goes to pending queue |
| Manager dashboard | Live | Filter by status, approve/reject, add notes |
| Public reviews feed | Live | Shows only approved reviews |
| Auth protection | Live | Bearer token on manager endpoints |
| Honeypot spam protection | Live | Hidden field catches bots |
| Rate limiting | Live | 5 audits/hr, 3 reviews/hr |

## REAL DATA LAYER (v4.0)
- **Google Places API (New)** — `findPlace()`: Text Search + Place Details for real GBP signals (rating, review count, photos, categories, business status, website). `safeGeocode()` for real lat/lng. `fetchCompetitorsNearby()`: Nearby Search for real competitor cards.
- **DataForSEO** — `fetchCompetitors()`: `serp/google/maps/live/advanced` for real Local Pack. `fetchRankings()`: 3x3 geographic grid at 5km spacing → real keyword heatmaps (matched by place_id/business name).
- **LLM (OpenRouter / OmniRoute)** — `fetchAIVisibility()`: 6 platform-specific models in parallel (`openai/gpt-4o-mini`, `anthropic/claude-3.5-haiku`, `google/gemini-2.5-flash`, `x-ai/grok-2-mini`, `meta-llama/llama-3.3-70b-instruct`, `perplexity/sonar`), 24h cache. `fetchAISummary()`: LLM-written executive summary + blockers + fixes.
- **RankNibbler** — `fetchOnPageAudit()`: `/api/v1/audit` (100 req/day) → real AEO/GEO scorecards from website on-page signals.
- **Every live call fails safe to mock** — `sources` map in the report labels each section `live` or `simulated`; frontend renders source badges.

## PERSISTENCE & DELIVERY (v4.0 + v9.1 Teable 4-table)
- **Teable** — shared-table multi-tenant base: `Agencies` (tbl5b86wLW5laiJvoQM), `Audits` (tblhzAPtGU4aiVYuQiV), `Leads` (tblFlNBFVeISLbGWDS8), `Reviews` (tbllV46BlD4t6NmfYKl). Audits + reviews + agencies mirror to their tables (Agency-link scoped); lead creation + review moderation + integration health handled by Teable automations. Table IDs in CONFIG + `.env.example`, env-overridable. **LIVE-VERIFIED** with `TEABLE_API_TOKEN` set.
- **Field-name resolution** — records written with `fieldKeyType=name`; real field names resolved at runtime via `GET /table/{id}/field` (cached), so no hardcoded field IDs. Filters use JSON `filterSet` objects; link fields use `{ id }`; empty unique fields are stripped before write. Verify mapping with `GET /api/teable/diagnose`.
- **Local store** — `audits.json` / `reviews.json` / `agencies.json` fallbacks so shareable URLs + auth work without Teable.
- **Shareable reports** — `GET /api/report/:auditId` + frontend route `/report/:auditId` (auto-loads + renders). "Share Report" button copies the link.
- **Email** — nodemailer branded HTML report sent on completion when `SMTP_*` env set.
- **Webhooks** — Make.com lead capture payload (existing) + optional `SERPWIN_WEBHOOK_URL` for the full audit payload.

## RISK MITIGATIONS IMPLEMENTED
- **Rate limiting**: `express-rate-limit` — 5 audits/hr, 3 review submissions/hr
- **Honeypot field**: Hidden `_hp` field traps automated bots silently
- **Auth**: Manager dashboard protected by Bearer token (env `MANAGER_TOKEN`)
- **Environment**: All API keys via `process.env` (dotenv loaded at boot)
- **Input validation**: All endpoints validate required fields and types
- **Resilience**: Every external API call is wrapped (timeout + try/catch + mock fallback); `Promise.allSettled` isolates failures
- **LLM caching**: 24h in-memory cache for AI visibility results per business+location

## STILL TO DO
- [ ] Google Places API key — enable real GBP/competitor/geocode data (`.env`)
- [ ] OPENROUTER_KEY (or LLM_BASE_URL to OmniRoute) — enable real AI visibility + AI summaries
- [ ] DATAFORSEO_LOGIN/PASSWORD — enable real heatmaps + Local Pack competitors
- [ ] TEABLE_API_TOKEN — set (live-verified); confirm Teable automations fire (Create Lead / Moderate Reviews / Initialize Agency / Refresh Integration Health) on the next real audit+review
- [ ] SMTP — email delivery of audit reports
- [ ] RECAPTCHA_SITE_KEY + SECRET — enforce v3 on audit/review forms
- [ ] `AGENCY_KEY_ENCRYPTION_KEY` + `AGENCY_SESSION_SECRET` — set in production (encrypts agency keys, stable sessions)
- [ ] Exercise Teable automations live (register → Initialize Agency; audit → Create Lead; review → Moderate) once token is set
- [ ] Deploy to Vercel with all env vars set + durable storage (Teable) replacing JSON in-memory/caches

## v8 FEATURE SET (all built, mocked → live when keys added)
- **White-label** — `GET /api/config` serves `BRAND_NAME`/`BRAND_LOGO_URL`/`BRAND_COLOR`/`BRAND_EMAIL`/`AI_ASSISTANT_NAME`; client swaps CSS vars, footer brand, contact email, and every "Aria" mention. Agency-resellable.
- **Schema/OG** — JSON-LD (Organization/SoftwareApplication/FAQPage), Open Graph + Twitter cards, generated `public/og-image.png`.
- **Smart keywords** — `POST /api/suggest-keywords`: LLM keyword list (OpenRouter/OmniRoute) with heuristic fallback; debounced on business/location input; merged into chip selector.
- **AI reply/post copy** — AI summary now returns `reviewReplies` (sentiment-labeled) + `postCopy` (Google Post ideas); rendered as cards in report + included in email.
- **PDF** — Print stylesheet + "Download PDF" button (`window.print()`); hides nav/hero/upsell, keeps report sections.
- **reCAPTCHA v3** — optional; site key served via `/api/config`, token injected on audit + review forms, `verifyRecaptcha` middleware (403 on fail, pass-through when unconfigured). Secret never exposed.
- **Demo audit** — "Watch a Live Demo Audit" hero button → `demo:true` → instant pure-mock report, no email/webhooks/persist, `demo-` auditId. `DEMO_MODE=1` forces all audits to demo.
- **Followup webhook** — `FOLLOWUP_WEBHOOK_URL` fired on audit completion so CRMs/nurture sequences trigger.

## v9 — AGENCY MULTI-TENANCY (REBRAND: SEODominate)
- **Agency accounts** — `POST /api/agency/register` + `/api/agency/login`; scrypt password hashing; stateless signed session tokens (HMAC, `AGENCY_SESSION_SECRET`).
- **Agency dashboard** — `/agency`: Brand / API Keys / Webhooks / Audits panels; masked key status (never returns plaintext).
- **Per-agency config** — resolved from `x-agency` header, `?agency=`, request body, or custom-domain `Host` header (agency sets `brand.domain` + CNAME). Merges with platform CONFIG (agency key wins, platform inherits).
- **Encrypted keys at rest** — AES-256-GCM with `AGENCY_KEY_ENCRYPTION_KEY`; `plain:` prefix fallback in dev. Keys stored in `agencies.json` (gitignored).
- **Agency-stamped data** — reports carry `agencySlug`; `GET /api/agency/me/audits` lists them; review feed is scoped per agency.
- **White-label landing** — `/a/:slug` serves the SPA; client sends `x-agency`, applies agency brand instantly. Share links to `/report/:id` re-apply the agency brand from the stored report.
- **Architecture** — every data function takes a per-request `cfg` (Google Places, DataForSEO, RankNibbler, LLM, Teable, SMTP, webhooks, reCAPTCHA), so audits route through the right agency's keys.

## v9.1 — TEABLE 4-TABLE INTEGRATION
- **Shared-table base** — `Agencies` / `Audits` / `Leads` / `Reviews` tables (IDs above); every record scoped to an agency via the Agency link field. Lead creation, integration-health refresh, new-agency defaults, and review moderation are Teable automations, not server code.
- **Teable connector** — `teableFields()` (cached `GET /field`), `teableResolveField()` (fuzzy name match), `teableMapFields()`, `teableCreate()`/`teableUpdate()`/`teableList()` all using `fieldKeyType=name`.
- **Audits** — `saveAuditToTeable()` writes the audit row + Agency link to the Audits table; `getAudit()` reads it back via `Audit ID` filter for shareable reports. Leads are created by the Teable automation (server no longer double-writes Leads).
- **Reviews** — `mirrorReviewToTeable()` pushes new reviews to the Reviews table so "Moderate New Reviews" auto-publishes 4–5★ / queues 1–3★.
- **Agencies** — `syncAgencyToTeable()` upserts agency records (slug/email/brand + status Pending, integration health Unconfigured); encrypted key ciphertext is the ONLY secret material ever sent (`AGENCY_KEY_ENCRYPTION_KEY` required, else the field is skipped).
- **Diagnose** — `GET /api/teable/diagnose` returns each table's field names + types to validate mapping before enabling writes.

## TEST RESULTS (v4.0 + v8 + v9)
- `node test-smoke.cjs` → **ALL SMOKE TESTS PASSED** (47 assertions): platform (config, suggest-keywords, demo audit, persist roundtrip, health, reCAPTCHA enforcement) + full agency flow (register, dup-409, login, wrong-pw-401, me-401/200, brand update, keys update + masked storage, config-by-x-agency, config-by-custom-domain-Host, branded audit stamped with agencySlug, agency audit history, platform config unaffected, `/a/:slug` + `/agency` pages).
- Mock audit: full report in <1s, all sections render, sources all `simulated`/`demo`
- RankNibbler live: website audit → AEO/GEO flip to `live` with real on-page scores
- Report lookup: `GET /api/report/:id` returns saved report; unknown id → 404
- Routes: `/`, `/manager`, `/agency`, `/a/:slug`, `/report/:id`, `/manifest.json`, `/sw.js`, `/icons/icon.svg` all 200

## SYSTEM STATE
- **Backend**: Node.js/Express (`server.js`), Vercel-ready
- **Frontend**: Vanilla HTML/CSS/JS + Leaflet.js maps
- **Data**: Real API layer with mock fallback; source badges (`Live`/`Simulated`/`Demo`) in report header
- **Review storage**: JSON file (`reviews.json`) + mirrored to Teable Reviews table
- **Audit storage**: `audits.json` + Teable Audits table (Agency-link scoped)
- **Agency storage**: `agencies.json` (keys encrypted at rest) + mirrored to Teable Agencies table — migration path to make Teable the source of truth
- **Manager token**: Default `seoaudit-manager-2026`, override via env
- **Agency sessions**: Stateless HMAC tokens (`AGENCY_SESSION_SECRET`; random at boot if unset → logs agencies out on restart)
- **White-label**: Brand config served at `/api/config` per agency (header/Host resolution), applied client-side

## FILES
| File | Purpose |
|------|---------|
| `server.js` | All endpoints: audit engine (GBP/AEO/GEO) + real data layer + agency multi-tenancy (register/login/settings/keys/audits), reviews CRUD, report lookup, health, config, suggest-keywords, reCAPTCHA, managers + Teable 4-table connector + `/api/teable/diagnose` |
| `public/index.html` | Landing page + report area + review submission + share/PDF/demo buttons + JSON-LD/OG meta; `/a/:slug` white-label aware |
| `public/style.css` | Full styling: reviews, AEO/GEO cards, star selector, source badges, reply/post cards, print styles, all animations |
| `public/script.js` | All frontend logic: audit, reviews, maps, animations, share links, /report/:id loading, agency slug header, white-label apply, reCAPTCHA, keyword suggestions, PDF |
| `public/agency.html` | Agency dashboard (self-contained: register/login + brand + API keys + webhooks + audits) |
| `public/dashboard.html` | Review manager dashboard (self-contained, auth-gated) |
| `public/og-image.png` | Generated 1200×630 social share image (SEODominate) |
| `public/icons/icon.svg` | SD monogram PWA icon |
| `test-smoke.cjs` | Smoke test suite — **ALL PASS** (47 assertions; platform + agency multi-tenancy) |
| `TEABLE_AI_BRIEF.md` | Teable base spec + Prompts 1–8 (tables, views, automations, multi-tenant separation) |
| `reviews.json` | Review data store (created at runtime, gitignored) + Teable Reviews mirror |
| `audits.json` | Audit data store (created at runtime, gitignored) + Teable Audits mirror |
| `agencies.json` | Agency accounts + encrypted keys (created at runtime, gitignored) + Teable Agencies mirror |

