/**
 * Task Reorder API Route
 *
 * POST /api/tasks/reorder
 *
 * Updates a task's position and optionally date/window after drag-and-drop.
 * Used by the list view (TimelineView) for same-day and cross-day reordering.
 *
 * Request body:
 * - taskId: string
 * - newDate: string (YYYY-MM-DD)
 * - isFlexible: boolean
 * - windowStart: string | null (e.g. "10:00")
 * - windowEnd: string | null (e.g. "18:00")
 * - destinationSiblingsOrder: string[] (all task IDs on destination day in new order)
 * - sourceSiblingsOrder: string[] (all task IDs on source day after removal; empty if same day)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { prisma } from '@/lib/db/prisma'
import { toNoonUTC } from '@/lib/utils/date-utils'

interface ReorderBody {
  taskId: string
  newDate: string
  isFlexible: boolean
  windowStart: string | null
  windowEnd: string | null
  destinationSiblingsOrder: string[]
  sourceSiblingsOrder: string[]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      )
    }

    let body: ReorderBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const {
      taskId,
      newDate,
      isFlexible,
      windowStart,
      windowEnd,
      destinationSiblingsOrder,
      sourceSiblingsOrder,
    } = body

    console.log('[ReorderAPI] payload received:', JSON.stringify(body, null, 2))

    if (!taskId || !newDate || typeof isFlexible !== 'boolean' || !Array.isArray(destinationSiblingsOrder)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid fields', code: 'INVALID_BODY' },
        { status: 400 }
      )
    }

    const existing = await prisma.task.findFirst({
      where: { id: taskId, userId: user.id },
      select: { id: true, projectId: true },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Task not found', code: 'TASK_NOT_FOUND' },
        { status: 404 }
      )
    }

    const scheduledDate = toNoonUTC(newDate)
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid newDate', code: 'INVALID_DATE' },
        { status: 400 }
      )
    }

    const newPosition =
      destinationSiblingsOrder.indexOf(taskId) >= 0
        ? destinationSiblingsOrder.indexOf(taskId) + 1
        : destinationSiblingsOrder.length + 1

    await prisma.task.update({
      where: { id: taskId },
      data: {
        position: newPosition,
        scheduledDate,
        is_flexible: isFlexible,
        window_start: windowStart,
        window_end: windowEnd,
        ...(isFlexible ? { scheduledStartTime: null, scheduledEndTime: null } : {}),
        updatedAt: new Date(),
      },
    })

    await Promise.all(
      destinationSiblingsOrder.map((id, index) =>
        prisma.task.updateMany({
          where: {
            id,
            userId: user.id,
            projectId: existing.projectId ?? undefined,
          },
          data: { position: index + 1, updatedAt: new Date() },
        })
      )
    )

    if (Array.isArray(sourceSiblingsOrder) && sourceSiblingsOrder.length > 0) {
      await Promise.all(
        sourceSiblingsOrder.map((id, index) =>
          prisma.task.updateMany({
            where: {
              id,
              userId: user.id,
              projectId: existing.projectId ?? undefined,
            },
            data: { position: index + 1, updatedAt: new Date() },
          })
        )
      )
    }

    // Debug: verify final DB state after reorder
    const draggedAfter = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, scheduledDate: true, position: true, is_flexible: true },
    })
    const destAfter = await Promise.all(
      destinationSiblingsOrder.map((id) =>
        prisma.task.findUnique({
          where: { id },
          select: { id: true, title: true, scheduledDate: true, position: true },
        })
      )
    )
    const sourceAfter = await Promise.all(
      (sourceSiblingsOrder ?? []).map((id) =>
        prisma.task.findUnique({
          where: { id },
          select: { id: true, title: true, scheduledDate: true, position: true },
        })
      )
    )
    console.log('[ReorderAPI] dragged task after update:', JSON.stringify(draggedAfter, null, 2))
    console.log('[ReorderAPI] destination tasks after update:', JSON.stringify(destAfter, null, 2))
    console.log('[ReorderAPI] source tasks after update:', JSON.stringify(sourceAfter, null, 2))

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[TasksReorderAPI] Error:', message)
    return NextResponse.json(
      { success: false, error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
