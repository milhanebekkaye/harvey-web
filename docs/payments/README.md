# Payments (Stripe integration)

Harvey uses **Stripe** for payments. This doc covers the backend and API surface added for billing.

## Step 5a (current)

- **Package:** `stripe` npm package is installed.
- **Schema:** `User.payment_status` — `String`, default `"free"`. Valid values: `"free"` | `"paid"`.
- **Migration:** `20260307120000_add_payment_status` adds the column to `users`. Run `npx prisma migrate dev --name add_payment_status` (or `migrate deploy`) to apply.
- **API:** `GET /api/user/me` returns `payment_status` with the same pattern as `has_completed_tour`. Used by the frontend to know if the user has paid (e.g. to show or skip paywall).
- **User service:** `getUserById` / `getUserByEmail` include `payment_status`; `updateUser` accepts `payment_status` for future webhook use.

No Stripe API routes (checkout, webhooks) exist yet; those are the next step.

## Environment (for future steps)

When adding Stripe API routes you will need:

- `STRIPE_SECRET_KEY` — server-side Stripe secret key.
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret to verify Stripe events.

There is no `env.d.ts` in the project; add these to `.env.example` and your deployment env when implementing webhooks/checkout.
