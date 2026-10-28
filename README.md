# Regional and Provincial Daily Accomplishment Monitor

Vue 3 dashboard for monitoring provincial beneficiary targets and accomplishments from a read-only Google Sheets workbook.

## Dashboard reporting

- Regional and provincial views summarize targets, validated beneficiaries, payment modes and daily accomplishments.
- The daily-output chart keeps **Today / This week / This month** reporting periods and adds a coverage-month selector for reviewing previous months. Future days are hidden for the current month.
- Enrollment monitoring is based on validated beneficiaries. It shows Validated, Enrolled, Not Enrolled and Not Yet Tagged totals by province or municipality.
- Reports & Printing includes a printable Enrollment Status report for regional, provincial and municipal levels, with date coverage and optional beneficiary names.
- **Enrollment rate** = Enrolled ÷ Validated. **Not Yet Tagged** = Validated − Enrolled − Not Enrolled.
- Sheet fields are found by their header titles rather than fixed spreadsheet letters, so moving a column does not change which data is read.

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

The enrollment field accepts the header `Enrolled / Not Enrolled` with or without spaces around `/`. Only validated rows are included in enrollment reporting; blank or unrecognized enrollment values are counted as Not Yet Tagged.
