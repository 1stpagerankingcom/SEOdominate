# TASKS — SEODominate (Local SEO Audit + Review Platform)

## STATUS: v9.1 — Teable 4-table integration (shared-table multi-tenant base). See PROJECT_MANIFEST.md.

## COMPLETED
- [x] Real Google Places API (GBP profile signals, competitors, geocoding) — mock fallback
- [x] Real AI visibility checks (6 LLMs via OpenRouter/OmniRoute) — 24h cache, mock fallback
- [x] Real AEO/GEO scoring via RankNibbler on-page audit (website field, 100 req/day)
- [x] DataForSEO Google Maps grid heatmaps + Local Pack competitors — mock fallback
- [x] Teable shared-table base wired: **Agencies / Audits / Leads / Reviews** (table IDs in CONFIG + `.env.example`), runtime field-name resolution (`fieldKeyType=name` + `GET /field` cache), no hardcoded field IDs
- [x] Audits persist to the Audits table with Agency-link scoping; lead creation delegated to Teable automation "Create Lead From Completed Audit"
- [x] Reviews mirrored to the Reviews table (feeds Teable's "Moderate New Reviews" automation)
- [x] New agency registrations + brand/key updates mirrored to the Agencies table (only encrypted key ciphertext is ever sent)
- [x] `GET /api/teable/diagnose` — lists each table's resolved fields/types to verify schema mapping
- [x] **LIVE-VERIFIED (2026-07-31)**: `TEABLE_API_TOKEN` set → register/audit/review all write to Teable with correct statuses (agency `Pending`/`Unconfigured`/`Pending`, audit `Complete`, review `Approved`/published) + Agency link. Filter uses JSON `filterSet`, link fields use `{ id }`, empty unique fields stripped.
- [x] Shareable report URLs: `GET /api/report/:id` + `/report/:id` + Share button (Teable-backed fallback)
- [x] Email delivery via nodemailer (SMTP_* env)
- [x] Source badges (Live/Simulated/Demo) + loading overlay during real API calls
- [x] dotenv loading fix (env vars were never loaded before)

## COMPLETED — v8 FEATURE SET
- [x] White-label / agency mode: `BRAND_NAME`, `BRAND_LOGO_URL`, `BRAND_COLOR`, `BRAND_EMAIL`, `AI_ASSISTANT_NAME` via `GET /api/config`; CSS vars + footer/email/assistant-name text replaced client-side
- [x] Schema/OG social meta: JSON-LD (Organization/SoftwareApplication/FAQPage) + Open Graph + Twitter cards + generated `public/og-image.png`
- [x] Smart keyword suggestions: `POST /api/suggest-keywords` (LLM keywords → heuristic fallback), debounced on business/location input, merged into keyword chips
- [x] AI review-reply drafts + Google Post copy in AI Summary (server + report render)
- [x] PDF download: print-stylesheet button (`window.print()` → Save as PDF)
- [x] reCAPTCHA v3: `RECAPTCHA_SITE_KEY`/`RECAPTCHA_SECRET_KEY`; frontend token injection on audit + review forms; server `verifyRecaptcha` middleware (403 when missing/failed, auto-disabled when keys empty)
- [x] Demo audit: "Watch a Live Demo Audit" hero button → `demo:true` → pure-mock, no email/webhooks/persist, `demo-` auditId; `DEMO_MODE=1` forces it globally
- [x] Follow-up webhook: `FOLLOWUP_WEBHOOK_URL` fired on audit completion (audit_completed payload)

## COMPLETED — v9 AGENCY MULTI-TENANCY (REBRAND: SEODominate)
- [x] Rebranded assets to **SEODominate**: manifest, icon (SD monogram), og-image, footer copy, default `BRAND_NAME`/email
- [x] Agency accounts: `POST /api/agency/register` + `POST /api/agency/login` (scrypt password hashing, signed HMAC sessions via `AGENCY_SESSION_SECRET`)
- [x] Agency dashboard page `/agency` (login/register + Brand / API Keys / Webhooks / Audits panels)
- [x] Per-agency config resolution: `x-agency` header, `?agency=`, request body, or custom-domain `Host` header match against `brand.domain`
- [x] Per-agency API keys encrypted at rest (AES-256-GCM, `AGENCY_KEY_ENCRYPTION_KEY`; plaintext-prefix fallback in dev)
- [x] Every data function now takes per-request `cfg` (Google Places, DataForSEO, RankNibbler, LLM, Teable, SMTP, webhooks, reCAPTCHA)
- [x] Agency-stamped audits (`report.agencySlug`), per-agency audit history (`GET /api/agency/me/audits`), per-agency review feed scoping
- [x] White-label landing: `/a/:slug` serves the SPA; client reads slug, sends `x-agency`, applies agency brand
- [x] Agent fallback inheritance: agencies inherit platform keys for any key they haven't set
- [x] `AGENCY_KEY_ENCRYPTION_KEY` + `AGENCY_SESSION_SECRET` in `.env.example`; `agencies.json` gitignored

## VERIFIED (2026-07-31)
- `node --check` clean on `server.js`, `public/script.js`
- `node test-smoke.cjs` → **58/58 PASS** (config, suggest-keywords, demo audit, persist roundtrip, reCAPTCHA, + full agency flow: register/dup-409/login/401/me/brand/keys/encrypted-mask/custom-domain-Host/branded-audit/audit-history/platform-unaffected)

## TASK: ENABLE LIVE DATA (one-time)
"Read SYSTEM_PROTOCOL.md + PROJECT_MANIFEST.md. Add keys to `.env`: `GOOGLE_PLACES_API_KEY`, `OPENROUTER_KEY` (or `LLM_BASE_URL=http://localhost:20128/v1`), `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`. Restart and verify `/api/health` shows all `true`. Run one audit and confirm `sources` flip to `live`."

## TASK: ENABLE TEABLE PERSISTENCE
"Read SYSTEM_PROTOCOL.md + PROJECT_MANIFEST.md + TEABLE_AI_BRIEF.md. Add `TEABLE_API_TOKEN` to `.env` (the four table IDs already default to the live base). Restart, hit `GET /api/teable/diagnose`, and confirm all four tables resolve with expected fields. Run one audit + one review and confirm rows land in the Audits + Reviews tables and the Teable automations (Create Lead / Moderate Reviews / Initialize Agency / Refresh Integration Health) fire."

## TASK: ENABLE EMAIL DELIVERY
"Read SYSTEM_PROTOCOL.md + PROJECT_MANIFEST.md. Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `APP_URL` to `.env`. Run an audit with a real email and confirm the branded HTML report arrives."

## TASK: ENABLE RECAPTCHA + WHITE-LABEL
"Read SYSTEM_PROTOCOL.md + PROJECT_MANIFEST.md. Add `RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET_KEY` (Google reCAPTCHA v3 admin). Add `BRAND_NAME`/`BRAND_COLOR` etc. for agency white-label. Verify form tokens pass siteverify and unauthorized submissions get 403."

## TASK: CONNECT SERPWIN REPORTING
"Read SYSTEM_PROTOCOL.md + PROJECT_MANIFEST.md. Point `SERPWIN_WEBHOOK_URL` at the SERPwin `/api/action` (or a webhook) so completed audits seed the MCP reporting dashboard. Include the full `Audit Payload` JSON."

## TASK: DEPLOY TO PRODUCTION
"Read SYSTEM_PROTOCOL.md + PROJECT_MANIFEST.md. Deploy to Vercel via `vercel --prod`. Set all env vars in Vercel dashboard. Verify `/api/health` shows configured integrations. Test full audit flow with a real business and email."
