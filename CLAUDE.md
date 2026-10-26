# CLAUDE.md

Vue 3 + TypeScript + Vite dashboard for the DSWD 4Ps ESSI program (Davao Region). Product rules and data definitions live in [SPEC.md](SPEC.md); read it before changing counting, dates, auth or reports.

## Commands

```bash
npm install
npm run dev     # Vite on http://localhost:5173 (skips Google sign-in on localhost)
npm test        # vitest run (47 tests)
npm run build   # vue-tsc -b && vite build
npx vue-tsc -b  # type-check only
```

Run `npm test` and `npx vue-tsc -b` before every commit.

## Layout

- `src/App.vue` — the whole UI (login, registration form, approval states, dashboard, reports). Template is near the bottom of the file.
- `api/invitations.ts` and `api/profile.ts` — server-only invitation and profile-submission endpoints. They require `SUPABASE_SERVICE_ROLE_KEY`; never move that key into `VITE_` variables.
- Manual registration: Super Administrators invite users from User Management. Recipients must sign in with Google using the invited email, submit a profile, and remain pending until approval. Invitation delivery also requires `SITE_URL` in Vercel.
- `src/sheets.ts` — Google Sheets CSV parsing, `WORKSHEETS`, `applyFirstSeen`, record summaries.
- `src/reports.ts`, `src/domain.ts`, `src/access.ts`, `src/auth.ts`, `src/concerns.ts` — report building, aggregation, approval states, Supabase/Google/Turnstile setup, concerns sheet.
- `api/sheets.ts`, `api/concerns.ts`, `src/serverAuth.ts` — Vercel functions (approved users only). `vercel.json` rewrites `/sheet-data` and `/concerns-data`.
- `supabase/migrations/` — `user_profiles`, `user_invitations`, `accomplishment_log`, and `accomplishment_log.first_seen_at` (apply in the Supabase SQL editor). The invitation migration enables Super Administrator manual registration; the timestamp migration enables the small validation time shown beneath each validation date.
- Styles: `style.css` (base) → `refresh.css` → `auth-pages.css` (login, registration, status screens) → `reports.css`, `concerns.css` → `mobile.css` (phone layout, up to 760px wide). Later files override earlier ones, so phone fixes go in `mobile.css`; `refresh.css` re-styles the topbar, cards and heading and would otherwise undo rules added in `style.css`.
- `public/` — `logo.png`, `login-bg.webp` (login picture).

## Rules that are easy to get wrong

- **Column T (Date Claimed/Account Opened) is not a validation date.** Do not use it for daily counts, Completed Today or validation dates. Validation date = first-seen date from `accomplishment_log`.
- Counting happens in `applyFirstSeen` (`src/sheets.ts`); the daily maps there are rebuilt from first-seen dates only.
- Never put a Supabase service-role key in the app. Only the public anon key is used.
- Province/office on a profile is a label only; it does not scope data.
- Keep user-facing labels in Title Case as in the sidebar and cards (e.g. "Provincial Overview", "Accomplished to Date", "Remaining Target", "Completion Rate", "Completed Today", "Reports & Printing", "Refresh Data"). "Regional Overview", "Regional Target" and "Provincial Performance" are fixed.
- Mode of Payment card: keep the donut large and on the left at desktop widths, with the table and Live Summary on the right. Preserve two-decimal donut shares and keep outside labels within the chart canvas. The payment columns and legend must remain data-driven so new modes appear without code changes.
- Dashboard controls: keep filter labels and selected values centered, use the shared custom select disclosure chevron, and keep Refresh Data icon-only with an accessible label, tooltip and divider. Regional filters stay compact and right-aligned; provincial filters remain centered as a group. The provincial municipality payment table must keep its header frozen and keep the `DUNOT` row pinned first while its rows scroll.
- Payment insight calculations belong in `buildPaymentInsights` (`src/reports.ts`), not duplicated in the Vue template. The largest-backlog insight uses the red warning palette in `src/refresh.css`.
- Login page: picture panel on the left, sign-in on the right (`order: -1` on `.login-context`). The picture (`public/login-bg.webp`) is the whole panel background via `.login-context::before`. Do not add blur, fade, tint, gradient or other color layers over it, and keep the text off any solid card. The program name "Pantawid Pamilyang Pilipino Program" must stay the largest text on the picture panel.

## PWA

- `public/sw.js` must never cache or answer `/sheet-data`, `/concerns-data`, `/api/*` or any non-GET / cross-origin request (data is private). It must also not answer the app's own `fetch('/', { cache: 'no-store' })` new-version check from the cache.
- It is registered only in production (`src/main.ts`). Test it on the deployed site or `npm run build` + a static server, not `npm run dev`.
- After changing what the worker caches, bump `CACHE` in `sw.js`.

## Local development notes

- `npm run dev` needs a `.env` (see `.env.example`) for real sign-in. On localhost the app bypasses sign-in; use `?preview=login`, `?preview=profile`, `?preview=pending` or `?preview=denied` to see those screens.
- The dev server passes an empty first-seen map (`vite.config.ts`), so accomplished rows show today as their validation date locally.
- Use the built-in browser pane or a real browser to check responsive visuals at the actual dashboard width.

## Git and deploy

- `main` auto-deploys to Vercel (project `bonieoffice-1324/4-ps2`, about 25 s per build). Pushing is deploying, so only push when asked.
- Leave the untracked `.claude/` folder out of commits.
- Commit messages are short imperative sentences describing the change.
