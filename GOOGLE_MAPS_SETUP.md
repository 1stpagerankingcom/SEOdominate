# Google Maps API Key Restriction Guide

SEODominate uses the Google Places API (New) for two things:

1. **Place search** — resolving `business name + city` to a real Google Business Profile (the `searchText` method of Places API).
2. **Geocoding** — converting a `City, State` string into lat/lng for the ranking grid and competitor map.

Restricting the API key is recommended so a leaked key can't rack up charges on other APIs.

## Console steps

1. Open the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) for the project that owns the key.
2. **Credentials** → click your API key → **Edit API key**.
3. Under **API restrictions** → choose **Restrict key** → enable ONLY:
   - **Places API (New)**
   - **Geocoding API**
   - *Optionally* **Maps Static API** if you display static map images.
   - Do NOT enable billing-heavy APIs (Directions, Routes, JS Maps) unless you use them.
4. Under **Application restrictions** → **HTTP referrers** (if the key is only used from the browser) or **IP addresses** (if server-side). SEODominate calls Google **server-side** from `server.js`, so **IP restriction** is the safer choice:
   - Vercel serverless IPs change, so either use referrer restriction, or leave IP unrestricted and rely on API restriction + spend caps.
5. **Save.**

## The quick test

Run a live audit on the deployed site. If the audit returns real GBP data (not "Simulated" source badges), the key works with the current restrictions.

Alternatively verify the two endpoints directly:

```powershell
# Geocoding
Invoke-RestMethod -Uri "https://maps.googleapis.com/maps/api/geocode/json?address=Austin%2C%20TX&key=YOUR_KEY"

# Places searchText
Invoke-RestMethod -Method POST -Uri "https://places.googleapis.com/v1/places:searchText" `
  -Headers @{ 'Content-Type' = 'application/json'; 'X-Goog-Api-Key' = 'YOUR_KEY'; 'X-Goog-FieldMask' = 'places.displayName,places.formattedAddress' } `
  -Body '{"textQuery":"Mike Plumbing Austin TX"}'
```

## Known quirk

The Google Cloud console sometimes only lists **Maps Static API** under the key's "API restrictions" dropdown even though other APIs are in use. If you enable only Maps Static API there, Places/Geocoding can still work because the restriction UI may not surface all enabled APIs — verify with the live audit above. The correct end state is: **Places API (New) + Geocoding API** restricted, both working.

## Vercel env audit

Current Production environment variables on the `seodominate` project (all Encrypted):

- `APP_URL`, `GOOGLE_PLACES_API_KEY`, `RANKNIBBLER_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `OPENROUTER_KEY`
- `TEABLE_API_URL`, `TEABLE_API_TOKEN`, `TEABLE_AGENCIES_TABLE_ID`, `TEABLE_AUDITS_TABLE_ID`, `TEABLE_LEADS_TABLE_ID`, `TEABLE_REVIEWS_TABLE_ID`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `FROM_EMAIL`
- `MANAGER_TOKEN`, `AGENCY_KEY_ENCRYPTION_KEY`, `AGENCY_SESSION_SECRET`

Deliberately NOT set on Vercel (until the GCP reCAPTCHA Enterprise API + billing are enabled):

- `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_PROJECT_ID`, `GOOGLE_CLOUD_API_KEY`

When reCAPTCHA is re-enabled, add those four back (they're already in the local `.env`).

## Suggested console follow-ups (blocked on user actions)

1. Purchase/verify the `seodominate.org` domain.
2. Enable the **reCAPTCHA Enterprise API** on the GCP project and add `seodominate.org` + `localhost` to the reCAPTCHA domain allowlist.
3. Verify `seodominate.org` as a sender in the Resend account (emails will otherwise bounce).
