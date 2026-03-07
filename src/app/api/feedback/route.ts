/**
 * POST /api/feedback
 *
 * Submit user feedback (bug, improvement, feature_request, question, other).
 * Auth required; uses DB user name or fallback to email / "Anonymous".
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { getUserById } from '@/lib/users/user-service'
import { prisma } from '@/lib/db/prisma'

const VALID_LABELS = ['bug', 'improvement', 'feature_request', 'question', 'other'] as const

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    const content = typeof body.content === 'string' ? body.content.trim() : ''

    if (!VALID_LABELS.includes(label as (typeof VALID_LABELS)[number])) {
      return NextResponse.json(
        { error: `label must be one of: ${VALID_LABELS.join(', ')}` },
        { status: 400 }
      )
    }

    if (content === '') {
      return NextResponse.json({ error: 'content is required and cannot be empty' }, { status: 400 })
    }

    const dbUser = await getUserById(user.id)
    const userName =
      (dbUser?.name && dbUser.name.trim()) || (user.email ?? '').trim() || 'Anonymous'

    await prisma.feedback.create({
      data: {
        userId: user.id,
        userName,
        label,
        content,
        status: 'new',
      },
    })

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('[FeedbackAPI] POST error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
