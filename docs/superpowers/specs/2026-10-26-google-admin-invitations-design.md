# Google Admin Invitations Design

## Goal

Allow an approved Super Administrator to invite a specific email address to register for the ESSI dashboard. The recipient completes the existing profile form and signs in with Google using that same email. Dashboard access still requires Super Administrator approval.

## Security boundaries

- The browser never receives or uses a Supabase service-role key.
- Only an approved Super Administrator may create, resend, or cancel an invitation.
- Invitation creation is handled by a Vercel API endpoint that validates the caller's bearer token through Supabase and uses the service-role client only on the server.
- The invite recipient must authenticate with Google and the verified Google email must match the normalized invited email.
- An invitation does not approve a user and does not grant dashboard access by itself.
- Turnstile remains required for Google sign-in.
- Invitation tokens are not accepted as dashboard credentials and are never stored in the browser.

## Data model

Add `public.user_invitations` through a Supabase migration:

- `id` UUID primary key
- `email` normalized lowercase email, unique while active
- `invited_by` UUID referencing `auth.users`
- `status` `pending|accepted|revoked|expired`
- `expires_at`, `accepted_at`, `created_at`, `updated_at`
- RLS allows only approved Super Administrators to read or mutate invitations; `service_role` has full access.

The existing `user_profiles` table remains the source of approval status. On profile submission, the server checks the authenticated user's email against a pending invitation when one exists, marks it accepted, and the profile remains `pending` until the administrator approves it.

## Request flow

1. Super Administrator opens User Management and enters an email, full name, position, and province/office.
2. The client sends the current bearer token and invitation fields to `POST /api/invitations`.
3. The endpoint verifies the token and Super Administrator status, validates the email and fields, rejects active duplicates, creates or refreshes the invitation, and calls Supabase Admin Auth to send the invite email with the application URL.
4. The recipient follows the Supabase email, signs in with Google, and completes the existing profile form.
5. The profile submission endpoint checks that the Google email matches the pending invitation, then creates the pending profile and marks the invitation accepted.
6. Existing pending, approved, and denied access states continue unchanged.

## Failure handling

- Missing or invalid authorization returns 401/403 without revealing invitation data.
- Invalid email or required profile fields return 400 with field-level feedback.
- Active duplicate invitations return a safe conflict message and offer resend behavior to the administrator.
- Google email mismatch prevents profile submission and leaves the invitation pending.
- Expired or revoked invitations prevent profile submission.
- Supabase email delivery failures are returned as a retryable server error without exposing service-role details.

## UI changes

- Add an invitation form to the existing User Management view.
- Show invitation status and expiration alongside profiles.
- Add resend and revoke actions for pending invitations.
- Keep the existing self-registration path for users who are not pre-invited, unless the administrator later chooses to disable it.

## Configuration

Add server-only `SUPABASE_SERVICE_ROLE_KEY` to Vercel and local server environments. Do not prefix it with `VITE_`. The endpoint uses the existing `VITE_SUPABASE_URL` server-side.

## Verification

- Unit tests cover email normalization, validation, duplicate handling, expiration, and Google-email matching.
- API tests cover unauthorized callers, non-admin callers, valid admin invitations, and safe error responses.
- Existing `npm test`, `npx vue-tsc -b`, and `npm run build` remain green.
- Manual verification covers an invited Google account, a mismatched Google account, an expired invitation, and the existing uninvited registration path.
