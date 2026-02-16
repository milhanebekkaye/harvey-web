/**
 * Project Service
 *
 * Handles all database operations for projects.
 * Follows the same pattern as user-service.ts for consistency.
 *
 * Projects are created during onboarding and store:
 * - Basic info: title, description, goals
 * - Status: active, paused, completed
 * - Relations: user, tasks, discussions
 */

import { prisma } from '../db/prisma'
import type { Prisma } from '@prisma/client'

/**
 * Data needed to create a new project
 */
export interface CreateProjectData {
  /**
   * Owner's user ID (matches Supabase Auth ID)
   */
  userId: string

  /**
   * Project title
   * Default: "Untitled Project" (set during onboarding, updated later)
   */
  title: string

  /**
   * Project description (optional)
   */
  description?: string

  /**
   * Project goals (optional)
   */
  goals?: string
}

/**
 * Data for updating project (including enrichment from extraction).
 */
export type UpdateProjectData = Partial<{
  title: string
  description: string | null
  goals: string | null
  status: string
  target_deadline: Date | null
  skill_level: string | null
  tools_and_stack: string[]
  project_type: string | null
  weekly_hours_commitment: number | null
  task_preference: string | null
  motivation: string | null
  phases: unknown
  projectNotes: unknown
}>

/**
 * Response wrapper for project operations
 * Matches the pattern from user-service.ts
 */
export interface ProjectServiceResponse {
  success: boolean
  project?: {
    id: string
    userId: string
    title: string
    description: string | null
    goals: string | null
    status: string
    createdAt: Date
    updatedAt: Date
  }
  error?: {
    message: string
    code?: string
    details?: unknown
  }
}

/**
 * Create a new project
 *
 * Called during onboarding when user sends first message.
 * Creates project with default title, which can be updated
 * after AI extracts project details from conversation.
 *
 * @param data - Project creation data
 * @returns Created project or error
 */
export async function createProject(
  data: CreateProjectData
): Promise<ProjectServiceResponse> {
  try {
    console.log('[ProjectService] Creating project for user:', data.userId)
    console.log('[ProjectService] Title:', data.title)

    const project = await prisma.project.create({
      data: {
        userId: data.userId,
        title: data.title,
        description: data.description || null,
        goals: data.goals || null,
        status: 'active',
      },
    })

    console.log('[ProjectService] Project created:', project.id)

    return {
      success: true,
      project,
    }
  } catch (error: unknown) {
    console.error('[ProjectService] Error creating project:', error)

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to create project'

    return {
      success: false,
      error: {
        message: errorMessage,
        details: error,
      },
    }
  }
}

/**
 * Get project by ID with ownership validation
 *
 * Ensures the requesting user owns the project.
 * This is important for security - users should only
 * access their own projects.
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @returns Project or null if not found/not owned
 */
export async function getProjectById(
  projectId: string,
  userId: string
): Promise<ProjectServiceResponse['project'] | null> {
  try {
    console.log('[ProjectService] Fetching project:', projectId)
    console.log('[ProjectService] For user:', userId)

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: userId, // Ensures user owns the project
      },
    })

    if (!project) {
      console.log('[ProjectService] Project not found or not owned by user')
      return null
    }

    console.log('[ProjectService] Project found:', project.title)
    return project
  } catch (error) {
    console.error('[ProjectService] Error fetching project:', error)
    return null
  }
}

/**
 * Update project details
 *
 * Used after AI extracts project info from conversation
 * to update title, description, goals, enrichment fields, etc.
 *
 * @param projectId - Project UUID
 * @param userId - User ID for ownership validation
 * @param data - Fields to update (partial)
 * @returns Updated project or error
 */
export async function updateProject(
  projectId: string,
  userId: string,
  data: UpdateProjectData
): Promise<ProjectServiceResponse> {
  try {
    console.log('[ProjectService] Updating project:', projectId)

    // First verify ownership
    const existing = await getProjectById(projectId, userId)
    if (!existing) {
      return {
        success: false,
        error: {
          message: 'Project not found or not owned by user',
          code: 'PROJECT_NOT_FOUND',
        },
      }
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...data,
        updatedAt: new Date(),
      } as Prisma.ProjectUpdateInput,
    })

    console.log('[ProjectService] Project updated')

    return {
      success: true,
      project,
    }
  } catch (error: unknown) {
    console.error('[ProjectService] Error updating project:', error)

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to update project'

    return {
      success: false,
      error: {
        message: errorMessage,
        details: error,
      },
    }
  }
}
