# Regional and Provincial Daily Accomplishment Monitor

Vue 3 dashboard for monitoring provincial beneficiary targets and accomplishments from a read-only Google Sheets workbook.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run build
```

The target for each province is the number of valid `Entry_id` rows in its worksheet. A row is counted as accomplished when its payment-mode field contains `Cash Card` or `E-Wallet`.
