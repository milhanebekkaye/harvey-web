/**
 * API usage logging for cost tracking.
 * Writes to ApiUsageLog (per-call) and UserUsageSummary (per-user, per-period).
 * Failures are logged but never thrown — logging must not crash API routes.
 */

import { addDays, differenceInDays } from 'date-fns'
import { prisma } from '@/lib/db/prisma'
import { computeCostUsd } from './models'

export type LogApiUsageParams = {
  userId: string
  feature: string
  model: string
  inputTokens: number
  outputTokens: number
}

/**
 * Logs one API call to ApiUsageLog and upserts the user's usage summary for the current 30-day period.
 * Uses subscription_start_date (or user createdAt) as anchor for period boundaries.
 * Never throws; on failure logs to console.error only.
 */
export async function logApiUsage(params: LogApiUsageParams): Promise<void> {
  const { userId, feature, model, inputTokens, outputTokens } = params

  try {
    const costUsd = computeCostUsd(model, inputTokens, outputTokens)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscription_start_date: true, createdAt: true },
    })
    if (!user) {
      console.error('[usage-logger] User not found:', userId)
      return
    }

    const anchorDate = user.subscription_start_date ?? user.createdAt
    const now = new Date()
    const daysSinceStart = differenceInDays(now, anchorDate)
    const periodsElapsed = Math.floor(daysSinceStart / 30)
    const periodStart = addDays(anchorDate, periodsElapsed * 30)

    await Promise.all([
      prisma.apiUsageLog.create({
        data: {
          userId,
          feature,
          model,
          inputTokens,
          outputTokens,
          costUsd,
        },
      }),
      prisma.userUsageSummary.upsert({
        where: {
          userId_periodStart: { userId, periodStart },
        },
        create: {
          userId,
          periodStart,
          totalCostUsd: costUsd,
          totalInputTokens: inputTokens,
          totalOutputTokens: outputTokens,
          callCount: 1,
        },
        update: {
          totalCostUsd: { increment: costUsd },
          totalInputTokens: { increment: inputTokens },
          totalOutputTokens: { increment: outputTokens },
          callCount: { increment: 1 },
        },
      }),
    ])
  } catch (err) {
    console.error('[usage-logger] Failed to log API usage:', err)
  }
}
