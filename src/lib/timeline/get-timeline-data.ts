import { prisma } from '@/lib/db/prisma'
import { getDateStringInTimezone } from '@/lib/timezone'
import { normalizeTaskLabel, parseSuccessCriteria } from '@/types/task.types'
import type {
  TimelineActiveTask,
  TimelineData,
  TimelineDependencyTask,
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

  const activeTaskRaw = await prisma.task.findFirst({
    where: {
      projectId,
      userId,
      status: { in: ['pending', 'skipped'] },
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
      successCriteria: true,
      depends_on: true,
    },
  })

  let dependencies: TimelineDependencyTask[] = []
  let dependentTasks: TimelineDependencyTask[] = []
  let upcomingTasksRaw: Array<{
    id: string
    title: string
    scheduledDate: Date | null
    scheduledStartTime: Date | null
  }> = []

  const activeTask: TimelineActiveTask | null = activeTaskRaw
    ? {
        id: activeTaskRaw.id,
        title: activeTaskRaw.title,
        label: normalizeTaskLabel(activeTaskRaw.label),
        description: activeTaskRaw.description ?? '',
        scheduledDate: activeTaskRaw.scheduledDate ?? new Date(),
        successCriteria: parseSuccessCriteria(activeTaskRaw.successCriteria),
        depends_on: activeTaskRaw.depends_on,
      }
    : null

  if (activeTaskRaw && activeTaskRaw.depends_on.length > 0) {
    const dependencyTasksRaw = await prisma.task.findMany({
      where: {
        id: { in: activeTaskRaw.depends_on },
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

    dependencies = activeTaskRaw.depends_on
      .map((dependencyId) => orderedDependencies.get(dependencyId))
      .filter((task): task is TimelineDependencyTask => task != null)
  }

  if (activeTaskRaw) {
    const dependentTasksRaw = await prisma.task.findMany({
      where: {
        projectId,
        userId,
        depends_on: { has: activeTaskRaw.id },
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

  const pendingCandidates = await prisma.task.findMany({
    where: {
      projectId,
      userId,
      status: 'pending',
      scheduledDate: { not: null },
      ...(activeTaskRaw ? { id: { not: activeTaskRaw.id } } : {}),
    },
    orderBy: [{ scheduledDate: 'asc' }, { scheduledStartTime: 'asc' }],
    select: {
      id: true,
      title: true,
      scheduledDate: true,
      scheduledStartTime: true,
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

  upcomingTasksRaw = remainingFromNow.slice(0, 2)

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
    dependencies,
    dependentTasks,
  }
}
