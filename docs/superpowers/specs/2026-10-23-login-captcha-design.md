# CAPTCHA-protected Google sign-in

## Goal

Require a successful CAPTCHA verification before every Google sign-in, so automated clients cannot use the dashboard's sign-in flow. The CAPTCHA must be verified by Supabase rather than being a cosmetic browser-only gate.

## Current state

The dashboard is a Vue single-page application deployed to Vercel. It currently calls Supabase `signInWithOAuth` for Google. That redirect-oriented API does not accept a CAPTCHA token, so adding a widget before the existing button would not protect the authentication request.

## Selected approach

Replace the redirect-oriented Google entry point with Google Identity Services (GIS) token sign-in, protected by Cloudflare Turnstile:

1. The login screen renders a Turnstile widget.
2. The Google sign-in control is disabled until Turnstile returns a current token.
3. The user completes Google sign-in through GIS.
4. The browser sends the Google ID token and Turnstile token to Supabase using `signInWithIdToken`.
5. Supabase validates the Google token and the Turnstile token, then creates or restores the authenticated session.
6. The Turnstile challenge is reset after every attempted sign-in. A new login always requires a fresh verification.

This approach keeps the Turnstile secret in Supabase, not in the browser, and avoids exposing any service-role key.

## Configuration

### Cloudflare

Create a Turnstile site for the production host `4-ps2.vercel.app` and local host `127.0.0.1` if local testing is needed. Cloudflare provides:

- A public site key for the browser.
- A secret key for server-side verification.

### Supabase

In Authentication > Bot and Abuse Protection:

- Enable CAPTCHA protection.
- Select Cloudflare Turnstile.
- Store the Turnstile secret key.

In Authentication > Providers > Google:

- Retain the existing Google provider client ID and secret.

### Google Cloud

Configure the existing OAuth client for GIS by allowing these JavaScript origins:

- `https://4-ps2.vercel.app`
- `http://127.0.0.1:5173` for local development, if retained.

The existing Supabase callback URL can remain during the transition so current deployment configuration is not broken.

### Vercel

Add these production environment variables:

- `VITE_GOOGLE_CLIENT_ID` — public GIS client ID.
- `VITE_TURNSTILE_SITE_KEY` — public Turnstile site key.

No secret is added to Vercel for this feature. The Turnstile secret belongs only in Supabase.

## Application changes

### Authentication module

Extend the auth controller to expose a Google ID-token sign-in method that accepts both the GIS credential and the Turnstile token. Preserve session restoration and sign-out behavior.

### Login screen

- Load GIS only when authentication settings are present.
- Render Turnstile with accessible status text.
- Disable Google sign-in until CAPTCHA verification succeeds.
- Show a useful error if Turnstile expires, fails, or Google authentication fails.
- Reset the CAPTCHA after success, failure, or expiration.

### Scope boundary

This change does not implement the pending-user/super-admin approval workflow. That is a separate authorization subsystem and should be designed after the sign-in security upgrade is complete.

## Error handling

- Missing public configuration: show administrator setup guidance; do not show an active login control.
- CAPTCHA missing or expired: explain that verification is required and keep Google sign-in disabled.
- GIS script failure: show a retryable connection error.
- Supabase rejects either token: discard the attempted session, reset the CAPTCHA, and show a generic sign-in failure message.

## Verification

Automated tests will cover:

1. Google sign-in is disabled without a CAPTCHA token.
2. A valid CAPTCHA token and Google credential are passed to Supabase ID-token sign-in.
3. CAPTCHA is reset after attempted sign-in.
4. CAPTCHA and Google errors are displayed safely.
5. Existing session restoration and sign-out behavior remain intact.

Manual verification will confirm that the production app requires Turnstile before every Google sign-in and that the Google account selection completes successfully.
