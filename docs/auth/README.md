# Auth (Sign-in, Signup, User Creation)

## What this feature is about
This feature handles user authentication and initial user record creation. It supports Google OAuth and email signup, with Supabase Auth for authentication and Prisma for the app’s user table.

## Files involved (and where to find them)
- `src/app/signin/page.tsx`
  - UI entry point for auth. Switches between auth options, signup, and login forms.
- `src/components/auth/AuthButtons.tsx`
  - Google OAuth and email signup entry buttons.
- `src/components/auth/EmailSignupForm.tsx`
  - Email-only signup form. Calls `signUpWithEmail()`; on success shows “Check your email” UI (same as login). User must click the verification link; then callback creates DB user and redirects to `/onboarding/welcome` (if no name) or `/onboarding`.
- `src/components/auth/EmailLoginForm.tsx`
  - Passwordless magic link login form. Before sending the link, calls `POST /api/auth/check-email`; if email does not exist, shows “No account found with this email. Sign up first.” and does not call Supabase. Otherwise sends link via Supabase.
- `src/app/auth/callback/route.ts`
  - OAuth and magic-link callback: exchanges code for session, creates DB user if missing. Redirect: if explicit `next` query param is present, redirects there; else if user has **any project** → `/dashboard`; else if user has **no name** (null or empty in DB) → `/onboarding/welcome`; else → `/onboarding`.
- `src/app/api/auth/check-email/route.ts`
  - POST with `{ email }`; returns `{ exists: true }` or `{ exists: false }` (no user data). Used by magic-link form before sending the link.
- `src/app/api/user/name/route.ts`
  - PATCH with `{ name: string }`. Auth required. Updates the current user’s name in the `users` table. Used by `/onboarding/welcome`.
- `src/app/onboarding/welcome/page.tsx`
  - First screen after auth for new users with no name. Collects first name, PATCHes `/api/user/name`, then redirects to `/onboarding`.
- `src/lib/auth/auth-service.ts`
  - Core auth service functions (Google OAuth, email signup, magic link, sign out, session/user checks).
- `src/lib/auth/supabase.ts`
  - Browser Supabase client for client components.
- `src/lib/auth/supabase-server.ts`
  - Server Supabase client for route handlers/server components.
- `src/lib/users/user-actions.ts`
  - Server actions for user DB operations (create/check exists).
- `src/lib/users/user-service.ts`
  - Prisma-backed user CRUD and existence checks.
- `src/types/auth.types.ts`
  - Auth types for responses and providers.
- `src/prisma/schema.prisma`
  - `User` model definition.

## Feature flow (end-to-end)

### Google OAuth sign-in
1. User clicks “Continue with Google” in `AuthButtons`.
2. `signInWithGoogle()` triggers `supabase.auth.signInWithOAuth` with redirect to `/auth/callback`.
3. Google redirects back to `GET /auth/callback?code=...`.
4. Callback exchanges code for session (`exchangeCodeForSession`).
5. If user not in DB, create with `createUser()`.
6. Redirect: if explicit `next` param provided → that URL; else if user has **any project** → `/dashboard`; else → `/onboarding`.

### Email signup (with email verification)
1. User enters email in `EmailSignupForm` (name is collected later on `/onboarding/welcome`).
2. `signUpWithEmail()` calls `supabase.auth.signUp` with `emailRedirectTo` set to `/auth/callback` (Supabase sends a verification email; no DB user created yet).
3. Form shows “Check your email” UI (same as login): “We sent a verification link to …”, “Click the link to verify your address and get started.”
4. User clicks the link in the email → `GET /auth/callback?code=...` → callback creates DB user (no name from metadata). Redirect: if user has a project → `/dashboard`; else if user has no name → `/onboarding/welcome`; else → `/onboarding`.

### Magic link login (existing users)
1. User enters email in `EmailLoginForm`.
2. Form calls `POST /api/auth/check-email` with `{ email }`. If `exists: false`, shows “No account found with this email. Sign up first.” and stops.
3. If `exists: true`, `signInWithMagicLink()` calls `supabase.auth.signInWithOtp` with redirect to `/auth/callback`.
4. User clicks email link; `/auth/callback` handles the session exchange and redirects (same logic as OAuth: dashboard if user has a project, else onboarding).

### Sign out
1. `signOut()` calls `supabase.auth.signOut()`.
2. UI redirects to `/signin`.

### Unauthenticated access to dashboard
- If a logged-out user opens `/dashboard`, the page fetches `/api/tasks`; on 401 the dashboard redirects to `/signin` (before handling NO_PROJECT). No middleware is used; the redirect is handled in the dashboard page.

## Function reference (what each function does)

### `src/lib/auth/auth-service.ts`
- `signInWithGoogle(options?)`
  - Starts Google OAuth flow via Supabase and redirects to `/auth/callback`.
- `signUpWithEmail(email, redirectTo?)`
  - Creates a Supabase Auth user and triggers a **verification email** (Supabase sends the link to `redirectTo` or `origin/auth/callback`). Does **not** create the app DB user here; the DB user is created in `/auth/callback` when the user clicks the link. Name is collected on `/onboarding/welcome`.
- `signInWithMagicLink(options)`
  - Sends passwordless magic link via Supabase.
- `signOut()`
  - Clears the Supabase session.
- `getSession()` / `getUser()` / `isAuthenticated()`
  - Auth state helpers for client use.

### `src/app/auth/callback/route.ts`
- `GET(request)`
  - Exchanges OAuth/magic-link code for Supabase session.
  - Creates DB user if missing.
  - Redirect: if `next` query param is present → that URL; else if user has **any project** (count > 0) → `/dashboard`; else if user has **no name** (null or empty in DB) → `/onboarding/welcome`; else → `/onboarding`.

### `src/app/api/auth/check-email/route.ts`
- `POST(request)` with body `{ email: string }`
  - Returns `{ exists: true }` or `{ exists: false }` based on `getUserByEmail`. Does not expose any user data. No auth required.

### `src/lib/users/user-actions.ts`
- `createUserAction(data)`
  - Server action wrapper for `createUser()`.
- `userExistsAction(userId)`
  - Server action wrapper for `userExists()`.

### `src/lib/users/user-service.ts`
- `createUser(data)`
  - Creates a DB `User` with Supabase Auth ID as primary key.
- `getUserById(userId)` / `getUserByEmail(email)`
  - Fetch user records.
- `updateUser(userId, data)`
  - Update profile fields.
- `userExists(userId)`
  - Returns existence check.
- `deleteUser(userId)`
  - Deletes user record and related data (dangerous).

### `src/lib/auth/supabase.ts` and `src/lib/auth/supabase-server.ts`
- `createClient()`
  - Creates Supabase client for browser or server with correct cookie handling.

## Data models used (from Prisma schema)
- `User`: stores `id`, `email`, `name`, `timezone`, availability preference JSON fields, and `has_completed_tour` for the one-time dashboard guided tour.

## Gaps / Not found in repo
- No explicit onboarding completion flag stored in the database.
- Tour completion is stored separately from onboarding completion via `User.has_completed_tour`.
- No middleware/route guard for redirecting authenticated users away from `/signin`.
