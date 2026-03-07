/**
 * POST /api/features/[featureId]/vote
 *
 * Toggle vote on a feature: if user has already voted, remove vote; otherwise add vote.
 * Auth required. Returns 404 if feature does not exist.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ featureId: string }> }
) {
  try {
    const { featureId } = await params

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const feature = await prisma.feature.findUnique({
      where: { id: featureId },
    })

    if (!feature) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 })
    }

    const existingVote = await prisma.featureVote.findUnique({
      where: {
        featureId_userId: { featureId, userId: user.id },
      },
    })

    if (existingVote) {
      await prisma.featureVote.delete({
        where: { id: existingVote.id },
      })
      return NextResponse.json({ voted: false }, { status: 200 })
    }

    await prisma.featureVote.create({
      data: {
        featureId,
        userId: user.id,
      },
    })

    return NextResponse.json({ voted: true }, { status: 201 })
  } catch (error) {
    console.error('[FeatureVoteAPI] POST error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
