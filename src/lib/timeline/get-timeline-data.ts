import { prisma } from '@/lib/db/prisma'
import { getDateStringInTimezone } from '@/lib/timezone'
import { normalizeTaskLabel, parseSuccessCriteria } from '@/types/task.types'
import type {
  TimelineActiveTask,
  TimelineData,
  TimelineDependencyTask,
  TimelineSkippedTask,
} from '@/types/timeline.types'

function toDependencyStatus(
  status: string
): TimelineDependencyTask['status'] {
  if (status === 'completed' || status === 'in_progress' || status === 'skipped') {
    return status
  }

  return 'pending'
}

export async function getTimelineData(
  projectId: string,
  userId: string
): Promise<TimelineData> {
  const now = new Date()
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })
  const userTimezone = dbUser?.timezone || 'Europe/Paris'
  const nowDateStr = getDateStringInTimezone(now, userTimezone)

  const lastCompleted = await prisma.task.findFirst({
    where: {
      projectId,
      userId,
      status: 'completed',
    },
    orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      completedAt: true,
    },
  })

  const activeTaskCandidate = await prisma.task.findFirst({
    where: {
      projectId,
      userId,
      status: 'pending',
      scheduledDate: { not: null },
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledStartTime: 'asc' }],
    select: {
      id: true,
      title: true,
      label: true,
      description: true,
      scheduledDate: true,
      scheduledStartTime: true,
      scheduledEndTime: true,
      is_flexible: true,
      successCriteria: true,
      depends_on: true,
    },
  })

  let selectedActiveRaw: typeof activeTaskCandidate = activeTaskCandidate
  let activeSelectionReason: 'direct' | 'unmet-dependency' = 'direct'

  if (activeTaskCandidate && activeTaskCandidate.depends_on.length > 0) {
    const candidateDepTasks = await prisma.task.findMany({
      where: {
        id: { in: activeTaskCandidate.depends_on },
        projectId,
        userId,
      },
      select: { id: true, title: true, status: true },
    })
    const unmetPendingDepIds = candidateDepTasks
      .filter((t) => t.status === 'pending')
      .map((t) => t.id)
    if (unmetPendingDepIds.length > 0) {
      const unmetTasksFull = await prisma.task.findMany({
        where: {
          id: { in: unmetPendingDepIds },
          projectId,
          userId,
          status: 'pending',
        },
        select: {
          id: true,
          title: true,
          label: true,
          description: true,
          scheduledDate: true,
          scheduledStartTime: true,
          scheduledEndTime: true,
          is_flexible: true,
          successCriteria: true,
          depends_on: true,
        },
      })
      unmetTasksFull.sort((a, b) => {
        const aDate = a.scheduledDate?.getTime() ?? 0
        const bDate = b.scheduledDate?.getTime() ?? 0
        if (aDate !== bDate) return aDate - bDate
        const aStart = a.scheduledStartTime?.getTime() ?? -1
        const bStart = b.scheduledStartTime?.getTime() ?? -1
        return aStart - bStart
      })
      selectedActiveRaw = unmetTasksFull[0] ?? activeTaskCandidate
      activeSelectionReason = 'unmet-dependency'
    }
  }

  if (selectedActiveRaw) {
    console.log('[TIMELINE] Active task selected:', {
      id: selectedActiveRaw.id,
      title: selectedActiveRaw.title,
      reason: activeSelectionReason,
    })
  }

  let dependencies: TimelineDependencyTask[] = []
  let dependentTasks: TimelineDependencyTask[] = []
  let upcomingTasksRaw: Array<{
    id: string
    title: string
    scheduledDate: Date | null
    scheduledStartTime: Date | null
    scheduledEndTime: Date | null
    is_flexible: boolean
    depends_on: string[]
  }> = []

  const activeTask: TimelineActiveTask | null = selectedActiveRaw
    ? {
        id: selectedActiveRaw.id,
        title: selectedActiveRaw.title,
        label: normalizeTaskLabel(selectedActiveRaw.label),
        description: selectedActiveRaw.description ?? '',
        scheduledDate: selectedActiveRaw.scheduledDate ?? new Date(),
        successCriteria: parseSuccessCriteria(selectedActiveRaw.successCriteria),
        depends_on: selectedActiveRaw.depends_on,
      }
    : null

  if (selectedActiveRaw && selectedActiveRaw.depends_on.length > 0) {
    const dependencyTasksRaw = await prisma.task.findMany({
      where: {
        id: { in: selectedActiveRaw.depends_on },
        projectId,
        userId,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    })

    const orderedDependencies = new Map(
      dependencyTasksRaw.map((task) => [
        task.id,
        {
          id: task.id,
          title: task.title,
          status: toDependencyStatus(task.status),
        } satisfies TimelineDependencyTask,
      ])
    )

    dependencies = selectedActiveRaw.depends_on
      .map((dependencyId) => orderedDependencies.get(dependencyId))
      .filter((task): task is TimelineDependencyTask => task != null)
  }

  if (selectedActiveRaw) {
    const dependentTasksRaw = await prisma.task.findMany({
      where: {
        projectId,
        userId,
        depends_on: { has: selectedActiveRaw.id },
      },
      orderBy: {
        scheduledDate: 'asc',
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    })

    dependentTasks = dependentTasksRaw.map((task) => ({
      id: task.id,
      title: task.title,
      status: toDependencyStatus(task.status),
    }))
  }

  const skippedTasksRaw = await prisma.task.findMany({
    where: {
      projectId,
      userId,
      status: 'skipped',
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledStartTime: 'asc' }],
    select: {
      id: true,
      title: true,
      label: true,
      scheduledDate: true,
      scheduledStartTime: true,
      scheduledEndTime: true,
    },
  })

  const skippedTasks: TimelineSkippedTask[] = skippedTasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    label: normalizeTaskLabel(t.label),
    scheduledDate: t.scheduledDate,
    scheduledStartTime: t.scheduledStartTime,
    scheduledEndTime: t.scheduledEndTime,
  }))

  const pendingCandidates = await prisma.task.findMany({
    where: {
      projectId,
      userId,
      status: 'pending',
      scheduledDate: { not: null },
      ...(selectedActiveRaw ? { id: { not: selectedActiveRaw.id } } : {}),
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledStartTime: 'asc' }],
    select: {
      id: true,
      title: true,
      scheduledDate: true,
      scheduledStartTime: true,
      scheduledEndTime: true,
      is_flexible: true,
      depends_on: true,
    },
  })

  const remainingFromNow = pendingCandidates
    .filter((task) => {
      if (!task.scheduledDate) return false

      const taskDateStr = getDateStringInTimezone(task.scheduledDate, userTimezone)

      if (taskDateStr > nowDateStr) {
        return true
      }

      if (taskDateStr < nowDateStr) {
        return false
      }

      if (!task.scheduledStartTime) {
        return true
      }

      return task.scheduledStartTime.getTime() > now.getTime()
    })
    .sort((a, b) => {
      if (!a.scheduledDate || !b.scheduledDate) return 0

      const aDateStr = getDateStringInTimezone(a.scheduledDate, userTimezone)
      const bDateStr = getDateStringInTimezone(b.scheduledDate, userTimezone)
      const dateCompare = aDateStr.localeCompare(bDateStr)
      if (dateCompare !== 0) return dateCompare

      const aStart = a.scheduledStartTime?.getTime() ?? Number.POSITIVE_INFINITY
      const bStart = b.scheduledStartTime?.getTime() ?? Number.POSITIVE_INFINITY
      return aStart - bStart
    })

  const idToDependsOn = new Map(remainingFromNow.map((t) => [t.id, t.depends_on ?? []]))
  let reordered = [...remainingFromNow]
  let moved: boolean
  do {
    moved = false
    for (let i = 0; i < reordered.length; i++) {
      const task = reordered[i]
      const depIds = idToDependsOn.get(task.id) ?? []
      for (const depId of depIds) {
        const j = reordered.findIndex((t) => t.id === depId)
        if (j !== -1 && j > i) {
          const [dep] = reordered.splice(j, 1)
          reordered.splice(i, 0, dep)
          moved = true
          break
        }
      }
      if (moved) break
    }
  } while (moved)

  console.log('[TIMELINE] Tasks after sort:', reordered.map((t) => ({
    id: t.id,
    title: t.title,
    scheduled_start_time: t.scheduledStartTime?.toISOString() ?? null,
  })))

  upcomingTasksRaw = reordered.slice(0, 2)

  const tasksFetched: Array<{
    id: string
    title: string
    scheduled_start_time: string | null
    scheduled_end_time: string | null
    time_preference: string | null
    depends_on: string[]
  }> = []
  if (lastCompleted?.completedAt) {
    tasksFetched.push({
      id: lastCompleted.id,
      title: lastCompleted.title,
      scheduled_start_time: null,
      scheduled_end_time: null,
      time_preference: null,
      depends_on: [],
    })
  }
  if (selectedActiveRaw) {
    tasksFetched.push({
      id: selectedActiveRaw.id,
      title: selectedActiveRaw.title,
      scheduled_start_time: selectedActiveRaw.scheduledStartTime?.toISOString() ?? null,
      scheduled_end_time: selectedActiveRaw.scheduledEndTime?.toISOString() ?? null,
      time_preference: selectedActiveRaw.is_flexible ? 'flexible' : 'fixed',
      depends_on: selectedActiveRaw.depends_on,
    })
  }
  for (const t of upcomingTasksRaw) {
    tasksFetched.push({
      id: t.id,
      title: t.title,
      scheduled_start_time: t.scheduledStartTime?.toISOString() ?? null,
      scheduled_end_time: t.scheduledEndTime?.toISOString() ?? null,
      time_preference: t.is_flexible ? 'flexible' : 'fixed',
      depends_on: t.depends_on ?? [],
    })
  }
  console.log('[TIMELINE] Tasks fetched:', JSON.stringify(tasksFetched))

  return {
    lastCompletedTask: lastCompleted?.completedAt
      ? {
          id: lastCompleted.id,
          title: lastCompleted.title,
          completedAt: lastCompleted.completedAt,
        }
      : null,
    activeTask,
    upcomingTasks: upcomingTasksRaw.map((task) => ({
      id: task.id,
      title: task.title,
      scheduledDate: task.scheduledDate ?? new Date(),
    })),
    skippedTasks,
    dependencies,
    dependentTasks,
  }
}
