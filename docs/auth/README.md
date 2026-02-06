# Auth (Sign-in, Signup, User Creation)

## What this feature is about
This feature handles user authentication and initial user record creation. It supports Google OAuth and email signup, with Supabase Auth for authentication and Prisma for the app’s user table.

## Files involved (and where to find them)
- `src/app/signin/page.tsx`
  - UI entry point for auth. Switches between auth options, signup, and login forms.
- `src/components/auth/AuthButtons.tsx`
  - Google OAuth and email signup entry buttons.
- `src/components/auth/EmailSignupForm.tsx`
  - Email + name signup form; calls auth service and redirects to onboarding on success.
- `src/components/auth/EmailLoginForm.tsx`
  - Passwordless magic link login form; sends link via Supabase.
- `src/app/auth/callback/route.ts`
  - OAuth callback handler (exchanges code for session) and creates DB user if needed.
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
6. Redirect to `/onboarding` (or `next` param if provided).

### Email signup (immediate account creation)
1. User enters name + email in `EmailSignupForm`.
2. `signUpWithEmail()` calls `supabase.auth.signUp` with a generated password.
3. `createUserAction()` runs on server, which calls `createUser()` in DB.
4. Redirect to `/onboarding` on success.

### Magic link login (existing users)
1. User enters email in `EmailLoginForm`.
2. `signInWithMagicLink()` calls `supabase.auth.signInWithOtp` with redirect to `/auth/callback`.
3. User clicks email link; `/auth/callback` handles the session exchange.

### Sign out
1. `signOut()` calls `supabase.auth.signOut()`.
2. UI redirects to `/signin`.

## Function reference (what each function does)

### `src/lib/auth/auth-service.ts`
- `signInWithGoogle(options?)`
  - Starts Google OAuth flow via Supabase and redirects to `/auth/callback`.
- `signUpWithEmail(email, name)`
  - Creates a Supabase Auth user with a random password.
  - Calls `createUserAction()` to create DB user record.
- `signInWithMagicLink(options)`
  - Sends passwordless magic link via Supabase.
- `signOut()`
  - Clears the Supabase session.
- `getSession()` / `getUser()` / `isAuthenticated()`
  - Auth state helpers for client use.

### `src/app/auth/callback/route.ts`
- `GET(request)`
  - Exchanges OAuth code for Supabase session.
  - Creates DB user if missing.
  - Redirects to onboarding (or `next` query param).

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
- `User`: stores `id`, `email`, `name`, `timezone`, and availability preference JSON fields.

## Gaps / Not found in repo
- No explicit onboarding completion flag stored in the database.
- No middleware/route guard for redirecting authenticated users away from `/signin`.
