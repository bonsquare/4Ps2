# Super-admin approval design

## Goal

Allow people to authenticate with Google, submit their name, position, and province, and use the dashboard only after approval. The approval queue must exist in the application, not in a spreadsheet. All approved users receive the same full dashboard access. Province is stored for identification only.

The Google account `bonie.office@gmail.com` is the initial and only super administrator.

## User flow

1. A person completes Turnstile and Google sign-in.
2. The app checks the person's profile in Supabase.
3. A first-time person completes a required form with full name, position, and province.
4. The app stores the request with a `pending` status and shows a waiting-for-approval screen.
5. The super administrator opens the built-in approval page, reviews the request, and approves or denies it.
6. An approved person can access the full dashboard on their next session check. A denied person sees a clear access-denied message.

## Data model and security

A Supabase `user_profiles` table will contain the authenticated user's ID, email, name, position, province, approval status, super-admin flag, timestamps, and decision metadata.

Row Level Security will ensure that:

- A person can read and create or update only their own profile while it is pending.
- Only a super administrator can list profiles or change an approval decision.
- The super administrator designation is based on the authenticated email and is seeded for `bonie.office@gmail.com` by the database migration.

The browser uses only the existing public Supabase key. No service-role key is placed in the app or Vercel. The database policies, rather than a hidden button, protect the approval queue.

## Application screens

### Pending profile form

Shown after Google sign-in when no profile exists. It contains exactly three user-entered fields:

- Full name
- Position
- Province

Submitting creates a pending request and replaces the form with a waiting screen.

### Waiting and denied states

Pending people cannot navigate to or view dashboard pages. Denied people receive an access-denied explanation and can sign out.

### Super-admin approvals

Only the seeded super administrator sees an `Approvals` item in the app navigation. The page lists pending requests with name, email, position, province, and submission time. Each request has Approve and Deny actions. Decisions take effect immediately for future session checks.

## Scope boundaries

- There is no spreadsheet-based approval process.
- There are no provincial or regional permission levels in this feature; every approved person receives the same dashboard access.
- Super-admin creation and delegation are excluded. The initial super administrator is the requested email only.
- This feature gates application access. The current public Google Sheets endpoint is not converted into a protected server API in this scope.

## Error handling and verification

- Profile lookup or save failures show a retryable message and keep the dashboard unavailable.
- Failed approval decisions leave the request visible and show an error to the super administrator.
- Automated tests cover status routing, profile creation, and approval actions.
- Manual verification covers first sign-in, pending blocking, super-admin-only navigation, approval, denied access, and ordinary approved access.
