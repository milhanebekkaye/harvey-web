/**
 * POST /api/auth/check-email
 *
 * Checks whether an email exists in the app's users table (database).
 * Used by the magic-link login form to avoid sending links to non-users.
 * Does not require authentication. Returns only existence, no user data.
 *
 * Body: { email: string }
 * Response: { exists: true } | { exists: false }
 */

import { NextResponse } from 'next/server'
import { getUserByEmail } from '@/lib/users/user-service'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body?.email === 'string' ? body.email.trim() : ''

    if (!email || !email.includes('@')) {
      return NextResponse.json({ exists: false }, { status: 200 })
    }

    const user = await getUserByEmail(email)
    return NextResponse.json({ exists: !!user }, { status: 200 })
  } catch {
    return NextResponse.json({ exists: false }, { status: 200 })
  }
}
