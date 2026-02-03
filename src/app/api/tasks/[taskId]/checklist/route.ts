/**
 * Update Task Checklist API Route
 *
 * PATCH /api/tasks/[taskId]/checklist
 *
 * Updates the success criteria checklist for a task.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/auth/supabase-server'
import { updateTaskChecklist } from '@/lib/tasks/task-service'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params
  console.log('[ChecklistAPI] Updating checklist for task:', taskId)

  try {
    // Authenticate
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[ChecklistAPI] Authentication failed')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse body
    const body = await request.json()
    const { checklist } = body

    if (!Array.isArray(checklist)) {
      console.error('[ChecklistAPI] Invalid checklist format')
      return NextResponse.json(
        { success: false, error: 'Checklist must be an array' },
        { status: 400 }
      )
    }

    // Update checklist
    const result = await updateTaskChecklist(taskId, user.id, checklist)

    if (!result.success) {
      console.error('[ChecklistAPI] Failed to update:', result.error?.message)
      return NextResponse.json(
        { success: false, error: result.error?.message || 'Failed to update' },
        { status: 500 }
      )
    }

    console.log('[ChecklistAPI] Checklist updated successfully')
    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[ChecklistAPI] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}