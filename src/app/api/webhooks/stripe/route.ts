/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook: verifies signature and handles checkout.session.completed.
 * Payment Link must pass client_reference_id = user ID so we can set payment_status = 'paid'.
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { updateUser } from '@/lib/users/user-service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
  })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id

    if (!userId) {
      console.error('[Stripe Webhook] No client_reference_id in session')
      return NextResponse.json({ error: 'No user ID' }, { status: 400 })
    }

    try {
      const result = await updateUser(userId, { payment_status: 'paid' })
      if (!result.success) {
        console.error('[Stripe Webhook] DB update failed:', result.error?.message)
        return NextResponse.json(
          { error: 'DB update failed' },
          { status: 500 }
        )
      }
      console.log('[Stripe Webhook] Payment recorded for user:', userId)
    } catch (dbError) {
      console.error('[Stripe Webhook] DB update failed:', dbError)
      return NextResponse.json(
        { error: 'DB update failed' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
