# SPEC — 4Ps Enhanced Support Services Intervention (ESSI) Monitor

Dashboard for the DSWD Pantawid Pamilyang Pilipino Program (4Ps), Regional Program Management Office, Davao Region. It reads the provincial Google Sheets workbook and shows targets vs. accomplishments, validation records, printable reports and community concerns.

Live site: https://4-ps2.vercel.app · Repo: https://github.com/bonsquare/4Ps2 (`main` auto-deploys to Vercel Production).

## Users and access

| Who | Access |
|---|---|
| Super Administrator | Everything, plus **User management** (approve / deny requests) |
| Approved user | Dashboard, reports, ESSI Community Support |
| Pending / denied / unregistered | Sign-in, registration form, waiting or denied screen only |

- Sign-in is Google only (Google Identity button), gated by a Cloudflare Turnstile check, with sessions held by Supabase Auth.
- A first-time user fills in **full name, position, province or office** ("Regional Program Management Office" or one of the six provinces). The request is stored as `pending` in `user_profiles` until the Super Administrator approves it.
- The province/office value is a label on the profile. It does **not** restrict which data a user can see (the app currently treats every approved user as regional).
- Design notes: `docs/superpowers/specs/` (`login-captcha`, `super-admin-approval`).

## Screens

All screens work on phones (verified on Android). On screens up to 760px wide the top bar is compact (logo, short title, clock, a "Live" dot, avatar), the metric cards sit two per row with an odd last card spanning the row, and the sidebar becomes a slide-in menu. Phone styles live in `src/mobile.css`.

1. **Login / Register** — picture panel on the left, sign-in card on the right with a **Sign in | Register** switch. Register uses the same Turnstile + Google flow, then the profile form. The left panel is one crisp picture (4Ps social worker in a red vest with a mother and child) with no blur, fade or color overlay. Three lines sit on its sky: "Pantawid Pamilyang Pilipino Program" (largest), "Enhanced Support Services Intervention", and "Regional Program Management Office Monitoring" (outlined badge).
2. **Regional Overview** — Regional Target, Accomplished to Date, Remaining Target, Completion Rate, Completed Today; Provincial Performance (target vs. actual accomplishments) and Regional Daily Output charts.
3. **Provincial Overview** — same metrics for one province, municipality and barangay drill-down, beneficiary review list with filters, record detail dialog.
4. **Reports & Printing** — Report Center: target vs. actual and payment-mode reports by region / province / municipality, date coverage, printable (browser print dialog, white background).
5. **ESSI Community Support** — concerns backed by its own Google Sheet.
6. **User management** — approvals queue (Super Administrator only).

## Data

### Source
Google Sheets workbook `SPREADSHEET_ID` in `src/sheets.ts`, read as CSV, one worksheet per province (Davao Oriental, Davao de Oro, Davao del Norte, Davao City, Davao del Sur, Davao Occidental; ids and gids in `WORKSHEETS`). Read-only: the app never writes to the sheets. Concerns sheet: `src/concerns.ts`.

### Definitions
- **Target** = number of rows with a valid `Entry_id` in a province worksheet.
- **Accomplished / validated** = row has a non-empty value in the **Mode of Payment** column (S). Confirmed by the program office: every mode counts (GCash, PayMaya, PISO Plus, Visa and any other).
- **Remaining** = max(target − accomplished, 0). **Completion rate** = accomplished ÷ target, one decimal.
- **Validation date** = the day the system **first saw** the row as accomplished (stored in `accomplishment_log.first_seen`, Asia/Manila date). The sheet has no validation date.
- **Column T** ("Date Claimed/Account Opened (LBP servicing Branch)") is the date the bank account was opened, **not** a validation date. It must not drive daily counts, Completed Today or the validation date. It is only shown in record details as "Date claimed / account opened".
- **Completed Today** and **Regional Daily Output** count accomplished rows by validation date.

### Storage (Supabase, Postgres with Row Level Security)
- `user_profiles` — one row per user (name, position, province/office, status `pending|approved|denied`, super-admin flag). Migration `20261023063000_user_approval.sql`.
- `accomplishment_log` — `entry_key` (`Province|Entry_id`) and `first_seen`; rows are added once and never overwritten. Migration `20261023120000_accomplishment_log.sql`.

### API (Vercel serverless, `api/`)
- `GET /sheet-data` → `api/sheets.ts`: requires an approved user's bearer token, fetches the sheets, applies first-seen dates, returns the snapshot. 15 s per-instance cache, content-hash ETag (304 on unchanged polls), `?fresh=1` bypasses the cache, serves the last good snapshot if Google fails.
- `GET /concerns-data` → `api/concerns.ts`: same auth, returns concerns.
- Rewrites are in `vercel.json`.

## Installable app (PWA)

- `public/manifest.webmanifest` (name "4Ps Enhanced Support Services Intervention", short name "4Ps ESSI", standalone, theme `#4338ca`) and icons `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (made from `logo.png`). Browsers offer "Install app"; on iPhone use Share → Add to Home Screen.
- `public/sw.js` is registered from `src/main.ts` in production only. It caches the app shell (page, built `/assets/*` files, logo, icons) and shows `public/offline.html` when there is no connection.
- **Private data is never cached:** `/sheet-data`, `/concerns-data`, `/api/*` and all non-GET or cross-origin requests (Google, Supabase, Turnstile) bypass the service worker. The dashboard still needs a connection to show data.
- Pages are fetched network first, so a new deploy shows up immediately and the "new version" prompt keeps working. Bump `CACHE` in `sw.js` if cached files ever need to be forced out.

## Configuration

| Variable | Used by |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser and API (public anon key only, never a service-role key) |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in button |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile |

Copy `.env.example` to `.env` for local work. Also add the local and deployed URLs to Supabase's redirect allow list. Without these variables the login page shows "Administrator setup is required".

## Non-goals
- Editing sheet data from the app, province-restricted access, and multi-language UI are not implemented.

## Known gaps
- `npm run dev` does not read the Supabase log, so every accomplished row shows today as its validation date locally.
