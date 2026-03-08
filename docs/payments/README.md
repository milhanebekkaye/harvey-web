# Payments (Stripe integration)

Harvey uses **Stripe** for payments. This doc covers the backend and API surface added for billing.

## Step 5a

- **Package:** `stripe` npm package is installed.
- **Schema:** `User.payment_status` — `String`, default `"free"`. Valid values: `"free"` | `"paid"`. `User.subscription_start_date` — `DateTime?`, set when payment is validated (webhook).
- **Migration:** `20260307120000_add_payment_status` adds the column to `users`. Run `npx prisma migrate dev --name add_payment_status` (or `migrate deploy`) to apply.
- **API:** `GET /api/user/me` returns `payment_status` with the same pattern as `has_completed_tour`. Used by the frontend to know if the user has paid (e.g. to show or skip paywall).
- **User service:** `getUserById` / `getUserByEmail` include `payment_status` and `subscription_start_date`; `updateUser` accepts `payment_status` and `subscription_start_date` for webhook use.

## Step 5b

- **Webhook:** `POST /api/webhooks/stripe` — Stripe calls this after events (e.g. successful checkout). No auth; request is verified using the `stripe-signature` header and `STRIPE_WEBHOOK_SECRET`. Raw body is read as text for signature verification.
- **Event handled:** `checkout.session.completed`. The handler reads `client_reference_id` from the session (must be the Harvey user ID). If present, sets `User.payment_status = 'paid'` and `User.subscription_start_date` (webhook processing time) via the user service. If `client_reference_id` is missing, returns 400. On DB error returns 500. Always returns 200 with `{ received: true }` to acknowledge receipt.
- **Payment Link setup:** The dashboard opens the Payment Link with `?client_reference_id=<userId>` (Step 5c). Ensure the webhook receives this so it can attribute the payment.

## Step 5c (current)

- **Env:** `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` — Stripe Payment Link URL (test or live). Used client-side so the paywall "Unlock Harvey" button can open the link with `?client_reference_id=<userId>`.
- **GuidedTour:** Accepts `userId`. "Unlock Harvey" opens the Payment Link in a new tab with `client_reference_id` set, scrolls the dashboard to top, and dismisses the tour. "Maybe later" only scrolls and dismisses.
- **Dashboard:** Resolves `userId` from Supabase `auth.getUser()` and passes it to `GuidedTour`. Payment success is detected by a small `PaymentSuccessHandler` component wrapped in `<Suspense>` (required by Next.js for `useSearchParams()`). When the URL has `?payment=success`, it shows a success toast ("Payment successful! Harvey is fully unlocked."), cleans the URL to `/dashboard`, and auto-dismisses the toast after 5 seconds.
- **Stripe Dashboard:** Set the Payment Link’s **success URL** to your app’s dashboard with a query param, e.g. `https://your-domain.com/dashboard?payment=success`, so Stripe redirects there after payment.

## Environment

- `STRIPE_SECRET_KEY` — server-side Stripe secret key (used by the webhook).
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret from Stripe Dashboard (Listeners → your endpoint → Signing secret).
- `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` — Stripe Payment Link URL (test for dev, live for production on Vercel).

Add these to `.env.local` (and deployment env). There is no `env.d.ts` in the project for type hints.
