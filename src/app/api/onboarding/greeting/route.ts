/**
 * GET /api/onboarding/greeting
 *
 * Returns a short personalized greeting for the onboarding chat.
 * Uses Haiku with the user's profile (name + onboarding questions) to generate 2-3 sentences.
 * Auth required; 404 if user not in DB. On error returns fallback greeting with 200.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { buildUserProfile } from '@/lib/ai/prompts'
import { anthropic } from '@/lib/ai/claude-client'
import { MODELS } from '@/lib/ai/models'
import { logApiUsage } from '@/lib/ai/usage-logger'

const FALLBACK_GREETING =
  "Hey! I'm Harvey, your AI project coach. What are you working on?"

const SYSTEM_PROMPT = `You are Harvey, an AI project coach. Generate a single short greeting message (2-3 sentences max) for a new user starting their onboarding conversation.

Rules:
- Address the user by their first name only
- Acknowledge what they're working on or why they're here (from the profile)
- End with ONE precise open question that will give you the most valuable context to help them. Tailor the question to their situation: if they're building a product, ask about the problem they're solving and who it's for; if they're learning something, ask what's driving that goal and what success looks like; if they struggle to finish things, ask what stopped them last time; if they're juggling too many things, ask what the one thing is they most need to move forward
- Match tone to their coaching preference if available: direct = no fluff, encouraging = warmer opener, push hard = challenge them immediately
- Do not introduce yourself as Harvey — they already know
- Plain text only, no markdown, no bullet points`

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    })
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userProfile = buildUserProfile(dbUser as unknown as Record<string, unknown>)
    console.log(
      '[greeting] Generating for user:',
      user.id,
      '| profile fields:',
      userProfile ? userProfile.split('\n').length + ' fields' : 'empty'
    )

    const userMessage = `User name: ${dbUser.name ?? 'there'}
${userProfile || 'No profile information available yet.'}`

    const response = await anthropic.messages.create({
      model: MODELS.ONBOARDING_EXTRACTION,
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    logApiUsage({
      userId: user.id,
      feature: 'onboarding_greeting',
      model: MODELS.ONBOARDING_EXTRACTION,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }).catch(() => {})

    const textBlock = response.content.find((block) => block.type === 'text')
    const greetingText =
      textBlock && textBlock.type === 'text'
        ? textBlock.text.trim()
        : FALLBACK_GREETING
    console.log('[greeting] Generated:', greetingText.slice(0, 100) + (greetingText.length > 100 ? '...' : ''))

    return NextResponse.json({ greeting: greetingText })
  } catch (error) {
    console.error('[greeting] Failed:', error)
    return NextResponse.json(
      { greeting: FALLBACK_GREETING },
      { status: 200 }
    )
  }
}

