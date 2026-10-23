# CLAUDE.md

Vue 3 + TypeScript + Vite dashboard for the DSWD 4Ps ESSI program (Davao Region). Product rules and data definitions live in [SPEC.md](SPEC.md); read it before changing counting, dates, auth or reports.

## Commands

```bash
npm install
npm run dev     # Vite on http://localhost:5173 (skips Google sign-in on localhost)
npm test        # vitest run (42 tests)
npm run build   # vue-tsc -b && vite build
npx vue-tsc -b  # type-check only
```

Run `npm test` and `npx vue-tsc -b` before every commit.

## Layout

- `src/App.vue` — the whole UI (login, registration form, approval states, dashboard, reports). Template is near the bottom of the file.
- `src/sheets.ts` — Google Sheets CSV parsing, `WORKSHEETS`, `applyFirstSeen`, record summaries.
- `src/reports.ts`, `src/domain.ts`, `src/access.ts`, `src/auth.ts`, `src/concerns.ts` — report building, aggregation, approval states, Supabase/Google/Turnstile setup, concerns sheet.
- `api/sheets.ts`, `api/concerns.ts`, `src/serverAuth.ts` — Vercel functions (approved users only). `vercel.json` rewrites `/sheet-data` and `/concerns-data`.
- `supabase/migrations/` — `user_profiles`, `accomplishment_log` (apply in the Supabase SQL editor).
- Styles: `style.css` (base) → `refresh.css` → `auth-pages.css` (login, registration, status screens) → `reports.css`, `concerns.css`. Later files override earlier ones.
- `public/` — `logo.png`, `login-bg.webp` (login picture).

## Rules that are easy to get wrong

- **Column T (Date Claimed/Account Opened) is not a validation date.** Do not use it for daily counts, Completed Today or validation dates. Validation date = first-seen date from `accomplishment_log`.
- Counting happens in `applyFirstSeen` (`src/sheets.ts`); the daily maps there are rebuilt from first-seen dates only.
- Never put a Supabase service-role key in the app. Only the public anon key is used.
- Province/office on a profile is a label only; it does not scope data.
- Keep user-facing labels in Title Case as in the sidebar and cards (e.g. "Provincial Overview", "Accomplished to Date", "Remaining Target", "Completion Rate", "Completed Today", "Reports & Printing", "Refresh Data"). "Regional Overview", "Regional Target" and "Provincial Performance" are fixed.
- Login page: picture panel on the left, sign-in on the right (`order: -1` on `.login-context`). The picture (`public/login-bg.webp`) is the whole panel background via `.login-context::before`. Do not add blur, fade, tint, gradient or other color layers over it, and keep the text off any solid card. The program name "Pantawid Pamilyang Pilipino Program" must stay the largest text on the picture panel.

## PWA

- `public/sw.js` must never cache or answer `/sheet-data`, `/concerns-data`, `/api/*` or any non-GET / cross-origin request (data is private). It must also not answer the app's own `fetch('/', { cache: 'no-store' })` new-version check from the cache.
- It is registered only in production (`src/main.ts`). Test it on the deployed site or `npm run build` + a static server, not `npm run dev`.
- After changing what the worker caches, bump `CACHE` in `sw.js`.

## Local development notes

- `npm run dev` needs a `.env` (see `.env.example`) for real sign-in. On localhost the app bypasses sign-in; use `?preview=login`, `?preview=profile`, `?preview=pending` or `?preview=denied` to see those screens.
- The dev server passes an empty first-seen map (`vite.config.ts`), so accomplished rows show today as their validation date locally.
- The built-in browser pane may refuse localhost; use the real browser or a static mock to check visuals.

## Git and deploy

- `main` auto-deploys to Vercel (project `bonieoffice-1324/4-ps2`, about 25 s per build). Pushing is deploying, so only push when asked.
- Leave the untracked `.claude/` folder out of commits.
- Commit messages are short imperative sentences describing the change.
