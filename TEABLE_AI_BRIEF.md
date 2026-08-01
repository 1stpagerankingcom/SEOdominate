# TEABLE AI BRIEF — SEOAudit (Local SEO Audit + Review Lead Magnet)

Paste **PART A** into Teable AI as full project context, then run the **PART B** prompts one at a time.

---

## PART A — PROJECT SYNOPSIS

```
# PROJECT: Local SEO Audit + Review Lead Magnet ("SEOAudit")

## WHAT WE ARE BUILDING
A production local-SEO "lead magnet" web tool that lets any local business
instantly audit their Google Business Profile (GBP) for free, modeled after
Merchynt. It generates a shareable, professional audit report, captures the
lead (name, email, business, location, keywords), and hands off to the
agency's CRM/nurture system. It also ships a built-in review platform and a
manager dashboard.

## WHO IT'S FOR (target audience)
1. PRIMARY — Local marketing agencies & SEO freelancers who want a
   resellable, white-label audit tool to generate leads for their own
   pipeline. They deploy it under THEIR brand (brand name, color, logo,
   AI assistant name all configurable).
2. END USERS — Small-to-mid local businesses (plumbers, dentists, lawyers,
   restaurants, HVAC, salons, etc.) who get a free 60-second audit.
   Conversion mechanism: they see a low optimization score + a revenue
   opportunity figure ("you're leaving $X/mo on the table") + a clear fix
   list, and get emailed the full report + AI assistant upsell.
3. SECONDARY — Franchises / multi-location operators who need per-location
   audits and a review management console.

## CORE FEATURES (6 in the main audit)
1. Optimization Score 0-100% — 10 pass/fail checks (NAP consistency, photos,
   categories, reviews, posts, Q&A, services, business description,
   proximity signals, website) with letter grade.
2. Revenue Opportunity — monthly local searches x avg customer value x
   conversion share = estimated dollars "at stake", plus competitor revenue.
3. Top 3 Competitors — nearest rivals with ratings, review counts, and a
   Leaflet map with markers.
4. AI Visibility Check — checks whether the business is "seen" by 6 AI
   platforms: ChatGPT, Claude, Gemini, Grok, Llama, Perplexity. Returns
   found/not-found + a rank, plus a suggested prompt to improve presence.
5. Keyword Heatmaps — 3x3 geographic grid around the business showing local
   ranking strength per keyword on a Leaflet map.
6. AI Summary & Fixes — LLM-written executive summary, ranked rank-blockers,
   priority fixes, PLUS draft review replies and Google Post copy ideas.

## SECONDARY REPORTS
- AEO (Answer Engine Optimization) report — content readiness for answer
  engines: question match rate, answer clarity, featured snippet potential,
  voice search readiness, People-Also-Ask coverage, FAQ schema.
- GEO (Generative Engine Optimization) report — entity clarity, knowledge
  graph presence, LLM recommendation score, contextual authority,
  structured entity data, citation consistency.

## REVIEW PLATFORM
- Public submission form (star rating 1-5, name, email, content).
- 4-5 star reviews auto-approve and publish instantly to a public feed.
- 1-3 star reviews go to a pending queue for the manager.
- Manager dashboard (auth-gated, bearer token) with approve/reject/notes.

## DATA ARCHITECTURE — live-first, fail-safe to mock
Every external API call is wrapped (timeout + try/catch) and falls back to a
realistic seeded mock. Each report carries a `sources` map labeling each
section as live / simulated / demo so the UI can badge "Live" vs "Simulated".
Data providers:
- Google Places API (New) — real GBP profile signals, competitor search,
  geocoding.
- DataForSEO — Google Maps Local Pack + 3x3 geo-grid keyword rankings.
- RankNibbler — real on-page SEO audit feeding the AEO/GEO scorecards.
- OpenRouter (or local OmniRoute router) — LLM calls for the 6-platform AI
  visibility check, the AI summary, and smart keyword suggestions.
  24h in-memory cache for AI visibility per business+location.

## KEY ENDPOINTS
- POST /api/gmb-audit — creates an audit (rate-limited 5/hr, honeypot +
  optional reCAPTCHA v3). Accepts business, location, email, keywords,
  website, demo flag.
- GET /api/report/:auditId and GET /report/:auditId — shareable report.
- GET /api/config — public white-label config (brand name/logo/color/email,
  assistant name, reCAPTCHA site key).
- POST /api/suggest-keywords — LLM keyword suggestions (debounced from the
  form input).
- POST /api/reviews, GET /api/reviews/public — review platform.
- GET /api/health — per-integration status.
- GET /manager — review manager dashboard.

## REPORT DATA SHAPE (audit record)
{
  auditId, business, location, email, website, lat, lng, timestamp,
  gbp: { score, grade, checks[], revenue{ atStake, monthlySearches,
         avgCustomerValue, competitorRevenue }, competitors[], aiVisibility[],
         heatmaps{} },
  aeo: { score, checks[] },
  geo: { score, checks[] },
  summary: { execSummary, rankBlockers[], fixes[], reviewReplies[],
             postCopy[] },
  sources: { gbp, revenue, competitors, ai, heatmaps, aeo, geo, summary }
}

## DELIVERY / AUTOMATION
- Email: branded HTML report via SMTP on completion.
- Make.com webhook: lead capture (existing, CRM/GHL).
- SERPwin webhook: full audit payload for the reporting dashboard.
- Follow-up webhook: fires on audit completion so CRMs trigger nurture.
- White-label: brand fields served by /api/config and applied client-side
  (CSS accent color, footer brand, contact email, AI assistant name swap).

## ADDITIONAL FEATURES (v8, all built)
- White-label / agency resale mode (BRAND_NAME, BRAND_LOGO_URL, BRAND_COLOR,
  BRAND_EMAIL, AI_ASSISTANT_NAME).
- Schema.org JSON-LD + Open Graph / Twitter social meta + OG image.
- Smart keyword suggestions merged into the keyword-chip selector.
- AI-drafted review replies + Google Post copy in the summary + email.
- PDF download via print stylesheet.
- reCAPTCHA v3 on audit + review forms (auto-disabled when unconfigured).
- Instant demo audit (hero button; DEMO_MODE=1 forces it globally).
- Honeypot + rate limiting (5 audits/hr, 3 reviews/hr).

## TECH STACK
- Backend: Node.js + Express, Vercel-ready (serverless + static).
- Frontend: vanilla HTML/CSS/JS PWA (no framework) + Leaflet.js maps.
- Storage: Teable (primary, optional) + local JSON fallback (audits.json,
  reviews.json).
- Env-driven config (dotenv), all keys optional with graceful fallback.

## YOUR ROLE (Teable)
You are the persistence + automation brain: store audit records and leads,
power shareable report lookups, and coordinate CRM/review automation.

## AGENCY MULTI-TENANCY (v9 — current)
The platform is now multi-tenant under the brand SEODominate
(seodominate.org). SEO agencies register accounts, bring their OWN API keys
and branding, and resell the tool under their own brand:
- Agency accounts (register/login, scrypt hashed passwords, HMAC sessions).
- Agency dashboard at /agency (brand, API keys, webhooks, audit history).
- Each audit is stamped with `agencySlug` and routed through that agency's
  keys (Google Places, DataForSEO, RankNibbler, LLM/OpenRouter, SMTP, Teable,
  reCAPTCHA, webhooks). Unset keys inherit the platform's config.
- White-label landing at /a/:slug and custom-domain resolution (CNAME) via
  the agency's brand.domain.
- Agency API keys are AES-256-GCM encrypted at rest (AGENCY_KEY_ENCRYPTION_KEY).
- Agencies are stored in agencies.json (gitignored) and mirrored to Teable's
  "Agencies" table (only encrypted key ciphertext is ever sent). The shared
  Audits/Leads/Reviews tables are Agency-link scoped per Teable base
  (tbl5b86wLW5laiJvoQM / tblhzAPtGU4aiVYuQiV / tblFlNBFVeISLbGWDS8 /
  tbllV46BlD4t6NmfYKl). Field names resolve at runtime via fieldKeyType=name.
```

---

## PART B — PROMPTS TO RUN IN TEABLE AI

### Prompt 1 — table schema
```
Based on the project synopsis above, design the exact schema for an "Audits"
table and a "Leads" table. Include field name, type, and purpose. Audits must
store: auditId (unique), business name, location, email, website, optimization
score, grade, revenue opportunity (at stake), AEO score, GEO score, AI
visibility summary (long text), full audit payload (long text JSON), sources
flag, created date, status. Leads must store: name, email, business, location,
website, keywords, score, source, status (new/nurturing/lost/client), created
date, last contacted. Also suggest whether a third "Reviews" table is needed
and its schema.
```

### Prompt 2 — shareable report lookup
```
I need GET /api/report/:auditId to work against Teable in production. Show me
the exact flow: how the server should query a row by auditId, what the
Teable API endpoints are (list records, get record), and the request/response
JSON shape including auth header (Bearer token) and the base URL
https://app.teable.io. Provide the exact fetch() code a Node/Express server
should use to retrieve and return the audit record, and how it should handle
row-not-found.
```

### Prompt 3 — audit storage
```
Show me how to INSERT a new audit record into the Audits table from Node.js
after POST /api/gmb-audit completes. Provide exact fetch() code for creating
a Teable record, mapping my report fields into the table fields, and how to
handle the insert being non-blocking (fire-and-forget with error logging).
Also show the equivalent for writing a lead row to Leads.
```

### Prompt 4 — automation
```
Design automations for this project: (1) when a new audit is created, send
the lead to a nurture sequence (external webhook) — include how to trigger on
a record-created event; (2) auto-approve 4-5 star reviews and hold 1-3 star
reviews for manager review, showing status field logic; (3) re-send or
re-mark audit records when their email delivery failed. Give concrete Teable
automation steps or the API events to poll/observe.
```

### Prompt 5 — manager views
```
Suggest Teable views/dashboards for the agency manager: pending reviews queue,
recent audits with low scores (hot leads), leads by status, revenue
opportunity totals per lead, and a per-business history view. For each,
describe the filter/group/sort config in Teable terms (grid vs kanban vs
calendar), and which fields to surface as columns.
```

### Prompt 6 — lead scoring (optional advanced)
```
Create a formula field or automation that scores a lead based on: optimization
score (lower = more opportunity), revenue opportunity amount, whether they
provided a website, number of negative checks, and engagement (reported
metrics only). Output a 0-100 lead score the agency can sort by.
```

### Prompt 7 — Agencies table + per-agency separation (v9 multi-tenancy)
```
I have a multi-tenant platform (SEODominate) where SEO agencies register and
bring their own API keys + branding. Today agencies live in agencies.json with
their keys AES-256-GCM encrypted. Design an "Agencies" table in Teable with:
slug (unique), name, email, password hash, brand fields (name, logoUrl, color,
email, assistantName, domain), encrypted API keys (long text), webhook URLs,
created date. Give exact field name/type for each. Then show how to (1) create
an agency record, (2) fetch an agency by slug OR by brand.domain for request
routing, (3) update a single key field without touching others, and (4) how to
scope the existing Audits/Leads tables per agency — should each agency get its
own table, or a single table with an Agency field filter? Recommend one and
explain why. Include exact fetch() code against https://app.teable.io for each
operation and how to list all audits for one agency (records filter by agency
field).
```

### Prompt 8 — agency dashboard + CRUD (optional)
```
Design the Teable automations/views an agency dashboard needs: (1) on agency
register, auto-create their brand fields + a welcome status; (2) enforce
unique slug on insert; (3) surface per-agency audit counts and recent audits
as a view the platform admin can monitor; (4) flag agencies whose stored keys
are missing/masked (integration health column showing which providers are
configured per agency).
```

---

## NOTES
- Run Prompts 1-3 first (they unblock the Teable integration in `server.js`).
- Prompt 4-6 are for after the DB is live.
- Prompt 7-8 are for the v9 agency multi-tenancy phase (agencies currently live in `agencies.json`; Teable is the production upgrade path).
- Teable is optional today — the app already falls back to `audits.json` + `agencies.json`.
