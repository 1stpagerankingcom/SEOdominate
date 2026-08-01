# SEODominate — Free GMB / Local SEO Audit Platform

A white-label, agency-ready Google Business Profile audit engine. Users get a free 60-second audit of their local SEO health: optimization score, revenue at stake, competitor benchmark, AI platform visibility, keyword ranking heatmaps, and AI-written prioritized fixes.

**Live demo:** https://seodominate.vercel.app

## Features

- **Free audit in 60 seconds** — enter business name, city & state, and email.
- **Live data** (optional, all fail-safe): Google Places API (New) for real GBP profile signals, DataForSEO for Google Maps local-pack grid rankings, RankNibbler for on-page AEO/GEO scoring, OpenRouter for 6-platform AI visibility + AI summary.
- **Simulation mode** — with no API keys set, the engine produces fully deterministic mock audits so the tool always works.
- **Email delivery** — audit report email + review-request follow-up via nodemailer (Resend-compatible SMTP).
- **Shareable reports** — `/report/:id` pages, persisted in Teable.
- **Branded PDF download** — `GET /api/report/:id/pdf` renders a color-branded PDF report (pdfkit).
- **Re-audits + ranking-change alerts** — `POST /api/reaudit` diffs score / keyword ranks / AI visibility vs the previous audit and emails changes.
- **Public city leaderboard** — `/leaderboard` shows top-scoring audited businesses by city.
- **Embeddable widget** — drop `widget-embed.js` on any site to embed the audit as an iframe (`/widget.html`).
- **Agency multi-tenancy** — `/agency` dashboard; agencies register, bring their own API keys (encrypted at rest), branding, and get white-label `/a/:slug` pages.
- **Manager dashboard** — `/manager` with review moderation, audit/review/lead listings (auth via `MANAGER_TOKEN`).
- **Security** — rate limiting, reCAPTCHA (classic or Enterprise), honeypot, CSRF origin guard, brute-force lockout on agency login, scrypt password hashing, AES-256-GCM key encryption.

## Architecture

Single Express server (`server.js`) deployed to Vercel as a serverless function; static assets in `public/`. All state persists to a shared **Teable** base (Agencies / Audits / Leads / Reviews tables) so multiple agencies share one database with row-level scoping. Local JSON mirrors (`agencies.json`, `audits.json`) act as an offline cache/fallback only — Teable is the source of truth.

```
vercel.json ──routes──> server.js  (serverless, maxDuration 60)
                        │
                        ├─ /api/gmb-audit        run audit (5/hr limit)
                        ├─ /api/report/:id       fetch report (Teable-backed)
                        ├─ /api/report/:id/pdf   branded PDF download
                        ├─ /api/reaudit          re-audit + diff email
                        ├─ /api/reaudit/cron     scheduled re-audits (?key=MANAGER_TOKEN)
                        ├─ /api/leaderboard      city leaderboard data
                        ├─ /api/agency/*         agency register/login/me/keys/audits
                        ├─ /api/reviews*         public reviews + moderation
                        └─ public/               SPA + widget + leaderboard
```

## Getting Started (local)

```bash
npm install
cp .env.example .env      # fill in at least PORT + APP_URL
npm start                 # http://localhost:3000
```

With no keys set, the tool runs in Simulation mode (instant, mock, no email/persist).

## Deploy to Vercel

```bash
npm install
vercel --prod --yes
```

Set every key from `.env.example` as a Vercel environment variable (Production). **Never commit `.env`.**

## Environment Variables

See `.env.example` for the full documented list. Highlights:

| Var | Purpose |
| --- | --- |
| `APP_URL` | Base URL for shareable links & email CTAs |
| `GOOGLE_PLACES_API_KEY` | Real GBP profile + geocoding (Places API New) |
| `RANKNIBBLER_API_KEY` | On-page AEO/GEO audit, 100 req/day free |
| `DATAFORSEO_LOGIN` / `PASSWORD` | Maps local-pack grid rankings |
| `OPENROUTER_KEY` / `LLM_BASE_URL` | AI visibility + summaries (LLM routing) |
| `TEABLE_API_TOKEN` | Persistence (table IDs default to the live base) |
| `SMTP_HOST/PORT/USER/PASS`, `FROM_EMAIL` | Email delivery (Resend SMTP) |
| `MANAGER_TOKEN` | Manager dashboard + cron auth |
| `RECAPTCHA_SITE_KEY` / `SECRET_KEY` or `PROJECT_ID` + `GOOGLE_CLOUD_API_KEY` | Bot protection |
| `AGENCY_KEY_ENCRYPTION_KEY` | AES-256-GCM key for agency API keys (set in prod) |
| `AGENCY_SESSION_SECRET` | HMAC session signing (set in prod) |

## Scheduling Re-Audits

`GET /api/reaudit/cron?key=<MANAGER_TOKEN>&days=7&max=1` re-audits the oldest due real audits and emails ranking-change alerts. Vercel cron jobs require the **Pro** plan; on Hobby use any external scheduler (cron-job.org, Make, GitHub Actions) to hit the endpoint daily.

## Smoke Tests

```bash
node test-smoke.cjs
```

Covers recaptcha pass-through, demo + real audit flow, report roundtrip, agency auth (register/login/me/keys), scoped audits, CSRF guard, and page routing. The runner blanks all provider keys (including `TEABLE_API_TOKEN`) so runs are offline and never pollute the shared database.

## Scripts

- `npm start` / `npm run dev` — local server
- `node test-smoke.cjs` — smoke suite
- `node --check server.js` — syntax check

## Notes

- Resend only accepts `From` addresses on domains verified in your Resend account — verify your domain before emails will deliver.
- reCAPTCHA Enterprise requires the API enabled + billing on the GCP project; when the keys are empty the check passes through.
- `agencies.json` / `audits.json` are runtime mirrors and gitignored; Teable is the system of record.
