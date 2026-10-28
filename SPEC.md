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
2. **Regional Overview** — Regional Target, Accomplishment to Date, Remaining Target, Completion Rate, Completed Today; Provincial Performance (target vs. actual accomplishments), Regional Daily Output, Mode of Payment reporting, and Regional Enrollment Overview by province.
3. **Provincial Overview** — same metrics for one province, municipality and barangay drill-down, Mode of Payment reporting, Provincial Enrollment Overview by municipality, beneficiary review list with filters, record detail dialog.
4. **Reports & Printing** — Report Center: target vs. actual, payment-mode and enrollment-status reports by region / province / municipality, date coverage, printable (browser print dialog, white background).
5. **ESSI Community Support** — concerns backed by its own Google Sheet.
6. **User management** — approvals queue (Super Administrator only).

### Dashboard controls and municipality table

- Dashboard filters use a centered, responsive control group. Regional Overview keeps its single reporting-period control compact and aligned to the right; Provincial Overview keeps Province, Municipality and Reporting Period controls centered as a group.
- Reporting Period remains **Today / This week / This month**. A separate Coverage Month control selects the month shown in the daily-output chart, including previous months. For the current month, days after today are omitted rather than displayed as zero accomplishments.
- Filter labels and selected values are centered. Select fields use a consistent custom disclosure chevron. Refresh Data is an icon-only control with an accessible label and tooltip, separated from the filters by a vertical divider.
- In Provincial Overview, the municipality payment table has a compact vertical scroll area with a frozen header. The `DUNOT` row is ordered first and remains pinned below the header while the other municipalities scroll.

### Mode of Payment dashboard card

- On wide screens, a large payment-share donut stays on the left and the province/municipality data stays on the right. On narrower screens they stack so no chart label or table value is clipped.
- Donut labels remain inside the chart canvas and always show two decimal places. The legend and table are generated from the payment modes found in validated records, so newly introduced modes appear automatically.
- The table includes Target, each payment mode, Validated, and a wrapped **For Validation** heading. Validated rows show the accomplishment rate; For Validation is target minus validated.
- A **Live Summary** below the table fills the remaining desktop space with the leading payment mode, highest accomplishment, largest validation backlog, and overall validation progress. The backlog insight uses red warning styling.
- Summary values come from the same computed report as the table and donut; the card does not maintain a separate data source.

### Enrollment overview card

- Regional Overview groups enrollment by province; Provincial Overview groups the selected province by municipality. The provincial table keeps its header frozen and provides compact up/down controls when the municipality list scrolls.
- Enrollment monitoring uses **validated beneficiaries as its denominator**, not only beneficiaries that already have an enrollment tag.
- The donut shows three mutually exclusive groups: **Enrolled**, **Not Enrolled**, and **Not Yet Tagged**. Its center shows the validated total. On narrow screens the donut shrinks slightly and wraps edge-aligned labels so names and counts are not clipped.
- The table shows Province/Municipality, Validated, Enrollment Status, and Not Yet Tagged. Enrollment Status contains separate progress bars, counts and percentages for Enrolled and Not Enrolled.
- **Not Yet Tagged** is the variance `Validated − Enrolled − Not Enrolled`; it is the number of validated beneficiaries still missing either recognized enrollment status.
- The Live Summary shows all four totals: Validated, Enrolled, Not Enrolled, and Not Yet Tagged. The overall progress bar uses Enrolled ÷ Validated.
- The same report calculation supplies the donut, table and Live Summary so their totals always reconcile.
- Reports & Printing offers the same enrollment calculation as a folio-ready report at regional, provincial or municipal level. It includes four summary totals, a detailed status/rate table, date coverage based on validation dates, and optional beneficiary names with normalized enrollment labels.

## Data

### Source
Google Sheets workbook `SPREADSHEET_ID` in `src/sheets.ts`, read as CSV, one worksheet per province (Davao Oriental, Davao de Oro, Davao del Norte, Davao City, Davao del Sur, Davao Occidental; ids and gids in `WORKSHEETS`). Read-only: the app never writes to the sheets. Concerns sheet: `src/concerns.ts`.

Worksheet fields are resolved from normalized **header titles**, not fixed spreadsheet letters. Moving a supported column therefore does not change which field the app reads. Header matching ignores capitalization, repeated whitespace and line breaks; the enrollment header also treats `Enrolled / Not Enrolled` and `Enrolled/Not Enrolled` as equivalent.

### Definitions
- **Target** = number of rows with a valid `Entry_id` in a province worksheet.
- **Accomplished / validated** = row has a non-empty value in the **Mode of Payment** column (S). Confirmed by the program office: every mode counts (GCash, PayMaya, PISO Plus, Visa and any other).
- Payment-mode names are matched without regard to case or extra spaces, displayed using the first encountered spelling, and ordered by validated beneficiary count.
- **Remaining** = max(target − accomplished, 0). **Completion rate** = accomplished ÷ target, one decimal.
- **Enrollment status** comes from the `Enrolled / Not Enrolled` header. Values are trimmed and matched case-insensitively as `Enrolled` or `Not Enrolled`.
- **Enrollment reporting population** = validated rows only. An enrollment value on a row that is not validated does not enter the enrollment report.
- **Enrolled rate** = enrolled ÷ validated, one decimal. **Not Enrolled rate** = not enrolled ÷ validated, one decimal.
- **Not Yet Tagged** = max(validated − enrolled − not enrolled, 0). Blank and unrecognized enrollment values on validated rows belong to this group.
- **Validation date** = the day the system **first saw** the row as accomplished (stored in `accomplishment_log.first_seen`, Asia/Manila date). The sheet has no validation date.
- **Column T** ("Date Claimed/Account Opened (LBP servicing Branch)") is the date the bank account was opened, **not** a validation date. It must not drive daily counts, Completed Today or the validation date. It is only shown in record details as "Date claimed / account opened".
- **Completed Today** and **Regional Daily Output** count accomplished rows by validation date.

### Storage (Supabase, Postgres with Row Level Security)
- `user_profiles` — one row per user (name, position, province/office, status `pending|approved|denied`, super-admin flag). Migration `20261023063000_user_approval.sql`.
- `user_invitations` — server-created invitation records for Super Administrators. Invitations are email-specific, expire with the Supabase Auth invite link, and never approve access by themselves. Migration `20261026090000_user_invitations.sql`.
- `accomplishment_log` — `entry_key` (`Province|Entry_id`) and `first_seen`; rows are added once and never overwritten. Migration `20261023120000_accomplishment_log.sql`.
- `accomplishment_log.first_seen_at` — server timestamp for the first detection of each accomplished record, shown as the small time beneath Date validated. Migration `20261026110000_accomplishment_log_timestamp.sql`.

### API (Vercel serverless, `api/`)
- `GET /sheet-data` → `api/sheets.ts`: requires an approved user's bearer token, fetches the sheets, applies first-seen dates, returns the snapshot. 15 s per-instance cache, content-hash ETag (304 on unchanged polls), `?fresh=1` bypasses the cache, serves the last good snapshot if Google fails.
- `GET /concerns-data` → `api/concerns.ts`: same auth, returns concerns.
- `POST /api/invitations` → `api/invitations.ts`: Super Administrator-only manual registration invitation. It sends a Supabase Auth invite to the normalized email and records the pending invitation.
- `POST /api/profile` → `api/profile.ts`: verifies the signed-in Google user, creates the pending profile, and accepts a matching invitation without granting access until approval.
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
| `SUPABASE_SERVICE_ROLE_KEY` | server-only Vercel API routes for sending invitations and creating verified profiles; never expose to the browser |
| `SITE_URL` | server-only invitation redirect URL, normally `https://4-ps2.vercel.app` |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in button |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile |

Copy `.env.example` to `.env` for local work. Also add the local and deployed URLs to Supabase's redirect allow list. Without these variables the login page shows "Administrator setup is required".

## Security

- Data endpoints require an approved user's token (`src/serverAuth.ts`); the database enforces the same with Row Level Security. Dashboard data and the service worker never cache private responses. No secret keys are in the repo or the browser (only the public anon key). `npm audit` reported 0 vulnerabilities on 2026-10-23.
- `vercel.json` sends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, an **enforced** Content-Security-Policy limited to `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`, and a full **report-only** policy for scripts and connections (Google sign-in, Cloudflare Turnstile, Supabase). The red "Content Security Policy" lines in the console on the login page (`normal?lang=auto`, hosts like `hagen.challenges.cloudflare.com`) come from Cloudflare Turnstile's own sandboxed frame and its own policy, not from ours. Ours are the console lines prefixed `[Report Only]`: on 2026-10-23 there was exactly one, "Executing inline event handler violates script-src", raised from the app bundle and not yet traced. Trace it, then enforce the script rules. To check, filter the console for `Report Only` on the login page and on every dashboard page.
- `supabase/migrations/20261023200000_harden_accomplishment_log.sql` stops approved users from setting `first_seen` themselves; run it in the Supabase SQL editor.
- Still a trade-off: an approved user could add extra `accomplishment_log` keys through the public API (they cannot choose dates). A full fix is to write the log from the server with a service-role key kept only in Vercel's environment.

## Non-goals
- Editing sheet data from the app, province-restricted access, and multi-language UI are not implemented.

## Known gaps
- `npm run dev` does not read the Supabase log, so every accomplished row shows today as its validation date locally.
