/**
 * Tool: update_project_notes
 *
 * Store an important insight about the user or their project.
 * Harvey calls this when learning something genuinely new
 * about preferences, work patterns, or project direction.
 *
 * Notes are plain text, timestamped, and capped at 2000 characters.
 */

import { prisma } from '../../db/prisma'
import type { Prisma } from '@prisma/client'
import type { UpdateProjectNotesResult } from '../types'

interface UpdateProjectNotesParams {
  note: string
  action?: 'append' | 'replace'
}

/**
 * Execute the update_project_notes tool.
 *
 * Appends or replaces project notes with a timestamped entry.
 * Caps total length at 2000 characters, trimming oldest entries if needed.
 *
 * @param params - Tool parameters from Claude
 * @param projectId - The project UUID
 * @param userId - The authenticated user UUID
 * @returns Success result
 */
export async function executeUpdateProjectNotes(
  params: UpdateProjectNotesParams,
  projectId: string,
  userId: string
): Promise<UpdateProjectNotesResult> {
  try {
    const { note, action = 'append' } = params
    const MAX_NOTES_LENGTH = 2000

    // Fetch project
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    })

    if (!project) {
      return { success: false, message: 'Project not found.' }
    }

    const existingNotes = (project as Record<string, unknown>).projectNotes as string | null

    let updatedNotes: string

    if (action === 'replace') {
      updatedNotes = note
    } else {
      // Append with timestamp
      const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      const newEntry = `[${timestamp}] ${note}`

      if (existingNotes) {
        updatedNotes = existingNotes + '\n' + newEntry
      } else {
        updatedNotes = newEntry
      }
    }

    // Cap at MAX_NOTES_LENGTH — trim oldest entries (from the beginning) if needed
    if (updatedNotes.length > MAX_NOTES_LENGTH) {
      const lines = updatedNotes.split('\n')
      while (lines.join('\n').length > MAX_NOTES_LENGTH && lines.length > 1) {
        lines.shift() // Remove oldest entry
      }
      updatedNotes = lines.join('\n')

      // If single entry is still too long, truncate it
      if (updatedNotes.length > MAX_NOTES_LENGTH) {
        updatedNotes = updatedNotes.substring(updatedNotes.length - MAX_NOTES_LENGTH)
      }
    }

    // Save to DB
    await prisma.project.update({
      where: { id: projectId },
      data: { projectNotes: updatedNotes } as unknown as Prisma.ProjectUncheckedUpdateInput,
    })

    return {
      success: true,
      message: 'Note saved.',
    }
  } catch (error) {
    console.error('[updateProjectNotes] Error:', error)
    return {
      success: false,
      message: `Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
