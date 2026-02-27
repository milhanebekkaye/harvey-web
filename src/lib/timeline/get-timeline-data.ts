import { prisma } from '@/lib/db/prisma'
import { getDateStringInTimezone, getHourDecimalInTimezone } from '@/lib/timezone'
import { normalizeTaskLabel, parseSuccessCriteria } from '@/types/task.types'
import type {
  TimelineActiveTask,
  TimelineData,
  TimelineDependencyTask,
  TimelineSkippedTask,
} from '@/types/timeline.types'

/** Task shape used for chronological comparison (active candidate + upcoming sort). */
interface TaskForSort {
  id: string
  scheduledDate: Date | null
  scheduledStartTime: Date | null
  is_flexible: boolean
  createdAt: Date
  depends_on: string[]
  estimatedDuration: number
  window_start: string | null
  window_end: string | null
}

/** Parse "HH:MM" to decimal hours for ordering (e.g. "09:00" → 9, "14:30" → 14.5). */
function parseTimeStringToHours(timeStr: string | null | undefined): number {
  if (!timeStr || typeof timeStr !== 'string') return 0
  const [h, m] = timeStr.split(':').map(Number)
  if (Number.isNaN(h)) return 0
  return h + (Number.isNaN(m) ? 0 : m) / 60
}

function getEffectiveStartHours(task: TaskForSort, userTimezone: string): number {
  if (task.is_flexible === true && task.window_start) {
    return parseTimeStringToHours(task.window_start)
  }
  if (task.scheduledStartTime) {
    return getHourDecimalInTimezone(task.scheduledStartTime, userTimezone)
  }
  return Number.POSITIVE_INFINITY
}

function getEarliestFixedStartOnDay(
  dateStr: string,
  tasks: TaskForSort[],
  userTimezone: string
): number {
  let earliest = Number.POSITIVE_INFINITY
  for (const t of tasks) {
    const tDateStr = t.scheduledDate ? getDateStringInTimezone(t.scheduledDate, userTimezone) : ''
    if (tDateStr !== dateStr || t.is_flexible === true) continue
    const start = getEffectiveStartHours(t, userTimezone)
    if (start < earliest) earliest = start
  }
  return earliest
}

/**
 * Compare two tasks chronologically for timeline order.
 * Base rule: sort by effective start time (fixed = scheduledStartTime, flexible = window_start as decimal hours).
 * Same day: flexible vs fixed uses gap = earliestFixedStart - flexibleStart; if gap >= flexible duration then flexible first, else fixed first.
 * Among flexible: dependency order then createdAt. Among fixed: scheduledStartTime asc. Legacy: is_flexible ?? false → fixed.
 */
function compareTasksChronologically(
  a: TaskForSort,
  b: TaskForSort,
  userTimezone: string,
  allTasks?: TaskForSort[]
): number {
  const aDateStr = a.scheduledDate ? getDateStringInTimezone(a.scheduledDate, userTimezone) : ''
  const bDateStr = b.scheduledDate ? getDateStringInTimezone(b.scheduledDate, userTimezone) : ''
  const dateCompare = aDateStr.localeCompare(bDateStr)
  if (dateCompare !== 0) return dateCompare

  const aIsFlexible = a.is_flexible === true
  const bIsFlexible = b.is_flexible === true

  if (aIsFlexible && bIsFlexible) {
    if ((b.depends_on ?? []).includes(a.id)) return -1
    if ((a.depends_on ?? []).includes(b.id)) return 1
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  }

  if (!aIsFlexible && !bIsFlexible) {
    const aStart = getEffectiveStartHours(a, userTimezone)
    const bStart = getEffectiveStartHours(b, userTimezone)
    return aStart - bStart
  }

  const flexTask = aIsFlexible ? a : b
  const fixedTask = aIsFlexible ? b : a
  const flexStart = getEffectiveStartHours(flexTask, userTimezone)
  const flexDurationHours = (flexTask.estimatedDuration ?? 0) / 60
  const earliestFixed =
    allTasks && allTasks.length > 0
      ? getEarliestFixedStartOnDay(aDateStr, allTasks, userTimezone)
      : getEffectiveStartHours(fixedTask, userTimezone)
  const gap = earliestFixed - flexStart

  if (gap >= flexDurationHours) {
    return aIsFlexible ? -1 : 1
  }
  return aIsFlexible ? 1 : -1
}

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

  const activeTaskCandidates = await prisma.task.findMany({
    where: {
      projectId,
      userId,
      status: 'pending',
      scheduledDate: { not: null },
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
      createdAt: true,
      estimatedDuration: true,
      window_start: true,
      window_end: true,
    },
  })

/** Minimal raw shape needed to build TaskForSort (all three fetches provide this). */
function toTaskForSort(t: {
  id: string
  scheduledDate: Date | null
  scheduledStartTime: Date | null
  is_flexible?: boolean | null
  createdAt: Date
  depends_on?: string[]
  estimatedDuration?: number
  window_start?: string | null
  window_end?: string | null
}): TaskForSort {
  return {
    id: t.id,
    scheduledDate: t.scheduledDate,
    scheduledStartTime: t.scheduledStartTime,
    is_flexible: t.is_flexible ?? false,
    createdAt: t.createdAt,
    depends_on: t.depends_on ?? [],
    estimatedDuration: t.estimatedDuration ?? 0,
    window_start: t.window_start ?? null,
    window_end: t.window_end ?? null,
  }
}

  const sortedCandidates = [...activeTaskCandidates].sort((a, b) =>
    compareTasksChronologically(
      toTaskForSort(a),
      toTaskForSort(b),
      userTimezone,
      activeTaskCandidates.map(toTaskForSort)
    )
  )
  const activeTaskCandidate = sortedCandidates[0] ?? null

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
          createdAt: true,
          estimatedDuration: true,
          window_start: true,
          window_end: true,
        },
      })
      const unmetForSort = unmetTasksFull.map(toTaskForSort)
      unmetTasksFull.sort((a, b) =>
        compareTasksChronologically(
          toTaskForSort(a),
          toTaskForSort(b),
          userTimezone,
          unmetForSort
        )
      )
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
    select: {
      id: true,
      title: true,
      scheduledDate: true,
      scheduledStartTime: true,
      scheduledEndTime: true,
      is_flexible: true,
      depends_on: true,
      createdAt: true,
      estimatedDuration: true,
      window_start: true,
      window_end: true,
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
  const remainingForSort = remainingFromNow.map(toTaskForSort)
  remainingFromNow.sort((a, b) =>
    compareTasksChronologically(
      toTaskForSort(a),
      toTaskForSort(b),
      userTimezone,
      remainingForSort
    )
  )

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
