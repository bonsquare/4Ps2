# Regional and Provincial Daily Accomplishment Monitor

Vue 3 dashboard for monitoring provincial beneficiary targets and accomplishments from a read-only Google Sheets workbook.

## Local development

```bash
npm install
npm run dev
```

## Google sign-in setup

1. Create a Supabase project and enable the Google provider under **Authentication → Providers**.
2. Add the Google OAuth client ID and secret in Supabase. Google Workspace corporate accounts are supported by the same provider.
3. Copy `.env.example` to `.env` and enter the project's URL and public anon key.
4. Add the local and deployed dashboard URLs to the Supabase redirect URL allow list.
5. Add the same two environment variables to the production deployment.

Only the public Supabase anon key belongs in the browser. Never add a service-role key to this application.

## Verification

```bash
npm test
npm run build
```

The target for each province is the number of valid `Entry_id` rows in its worksheet. A row is counted as accomplished when its payment-mode field is not empty. Every mode counts: GCash, PayMaya, PISO Plus, Visa and any other.
