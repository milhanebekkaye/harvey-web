/**
 * Tool: delete_task
 *
 * Permanently delete a task. Cleans dependents' depends_on; task discussions
 * cascade-delete via DB. Used from project chat when the user confirms deletion.
 */

import { deleteTask as deleteTaskService } from '@/lib/tasks/task-service'

interface DeleteTaskParams {
  task_id: string
}

interface DeleteTaskToolResult {
  success: boolean
  message: string
  deletedTaskId?: string
  deletedTaskTitle?: string
  cleanedDependents?: Array<{ id: string; title: string }>
}

export async function executeDeleteTask(
  params: DeleteTaskParams,
  projectId: string,
  userId: string
): Promise<DeleteTaskToolResult> {
  console.log('[executeDeleteTask] Called with params:', params, 'projectId:', projectId, 'userId:', userId)

  try {
    const result = await deleteTaskService(params.task_id, userId)

    console.log(
      `[executeDeleteTask] Successfully deleted task "${result.deletedTaskTitle}" ` +
        `(${result.deletedTaskId}). Cleaned ${result.cleanedDependents.length} ` +
        `dependent(s):`,
      result.cleanedDependents
    )

    return {
      success: true,
      message:
        result.cleanedDependents.length > 0
          ? `Task "${result.deletedTaskTitle}" deleted. Removed dependency from: ` +
            result.cleanedDependents.map((d) => `"${d.title}"`).join(', ') +
            '.'
          : `Task "${result.deletedTaskTitle}" deleted successfully.`,
      deletedTaskId: result.deletedTaskId,
      deletedTaskTitle: result.deletedTaskTitle,
      cleanedDependents: result.cleanedDependents,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[executeDeleteTask] Failed:', message)

    return {
      success: false,
      message: message.includes('not found or unauthorized')
        ? "I couldn't find that task, or you don't have permission to delete it."
        : `Failed to delete task: ${message}`,
    }
  }
}
