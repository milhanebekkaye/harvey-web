/**
 * Assignment Post-Processor
 *
 * Enforces scheduling constraints on an already-assigned list of scheduled tasks
 * by reordering slot data (date/time). Runs after slot assignment and before DB write.
 * Does not modify scheduling algorithms or task generation.
 */

import type { ScheduledTaskAssignment } from './task-scheduler'
import type { ParsedTask } from '../../types/api.types'

/** Slot data we can swap between assignments (date/time placement only). */
interface SlotData {
  date: Date
  startTime: Date
  endTime: Date
  timeBlock: string
  isFlexible?: boolean
  windowStart?: string
  windowEnd?: string
}

function copySlotData(a: ScheduledTaskAssignment): SlotData {
  return {
    date: new Date(a.date),
    startTime: new Date(a.startTime),
    endTime: new Date(a.endTime),
    timeBlock: a.timeBlock,
    isFlexible: a.isFlexible,
    windowStart: a.windowStart,
    windowEnd: a.windowEnd,
  }
}

function applySlotData(dest: ScheduledTaskAssignment, slot: SlotData): void {
  dest.date = slot.date
  dest.startTime = slot.startTime
  dest.endTime = slot.endTime
  dest.timeBlock = slot.timeBlock
  dest.isFlexible = slot.isFlexible
  dest.windowStart = slot.windowStart
  dest.windowEnd = slot.windowEnd
}

/** Swap slot data between two assignments. Identity (taskIndex, partNumber, etc.) stays with each assignment. */
function swapSlotData(a: ScheduledTaskAssignment, b: ScheduledTaskAssignment): void {
  const slotA = copySlotData(a)
  const slotB = copySlotData(b)
  applySlotData(a, slotB)
  applySlotData(b, slotA)
}

function getStartMs(a: ScheduledTaskAssignment): number {
  return a.startTime.getTime()
}

function getEndMs(a: ScheduledTaskAssignment): number {
  return a.endTime.getTime()
}

/** Earliest start time (ms) among a task's assignments. */
function earliestStartMs(assignments: ScheduledTaskAssignment[]): number {
  if (assignments.length === 0) return 0
  return Math.min(...assignments.map(getStartMs))
}

/** Latest end time (ms) among a task's assignments. */
function latestEndMs(assignments: ScheduledTaskAssignment[]): number {
  if (assignments.length === 0) return 0
  return Math.max(...assignments.map(getEndMs))
}

/** Assignments for a given task index, sorted by part number then start time (preserve part order). */
function getAssignmentsForTask(
  assignments: ScheduledTaskAssignment[],
  taskIndex: number
): ScheduledTaskAssignment[] {
  return assignments
    .filter((a) => a.taskIndex === taskIndex)
    .sort((a, b) => {
      const pA = a.partNumber ?? 1
      const pB = b.partNumber ?? 1
      if (pA !== pB) return pA - pB
      return getStartMs(a) - getStartMs(b)
    })
}

/** Topological order of task indices (dependencies first). Invalid/cycle refs appended at end. */
function topologicalOrder(tasks: ParsedTask[]): number[] {
  const n = tasks.length
  const inDegree = new Array(n).fill(0)
  for (let j = 0; j < n; j++) {
    const deps = tasks[j].depends_on ?? []
    for (const oneBased of deps) {
      const i = oneBased - 1
      if (i >= 0 && i < n && i !== j) inDegree[j]++
    }
  }
  const queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i)
  }
  const order: number[] = []
  while (queue.length > 0) {
    const i = queue.shift()!
    order.push(i)
    for (let j = 0; j < n; j++) {
      const deps = tasks[j].depends_on ?? []
      if (deps.includes(i + 1)) {
        inDegree[j]--
        if (inDegree[j] === 0) queue.push(j)
      }
    }
  }
  const seen = new Set(order)
  for (let i = 0; i < n; i++) {
    if (!seen.has(i)) order.push(i)
  }
  return order
}

// --- Step 1: Enforce part consecutiveness ---

/**
 * Check if split parts of the same task are consecutive in chronological order.
 * Returns the first (chronological) assignment that is Part N+1 with an interleave before it.
 */
function findInterleavedPart(
  assignments: ScheduledTaskAssignment[],
  chronological: ScheduledTaskAssignment[]
): { part: ScheduledTaskAssignment; interleaved: ScheduledTaskAssignment } | null {
  const byTask = new Map<number, ScheduledTaskAssignment[]>()
  for (const a of assignments) {
    if (!byTask.has(a.taskIndex)) byTask.set(a.taskIndex, [])
    byTask.get(a.taskIndex)!.push(a)
  }
  for (const a of chronological) {
    const parts = byTask.get(a.taskIndex) ?? []
    if (parts.length <= 1) continue
    const sortedParts = [...parts].sort((x, y) => (x.partNumber ?? 1) - (y.partNumber ?? 1))
    const partIndex = sortedParts.findIndex((p) => p === a)
    if (partIndex <= 0) continue
    const prevPart = sortedParts[partIndex - 1]
    const prevEndMs = getEndMs(prevPart)
    const thisStartMs = getStartMs(a)
    for (const other of chronological) {
      if (other.taskIndex === a.taskIndex) continue
      const otherStart = getStartMs(other)
      const otherEnd = getEndMs(other)
      if (otherStart < thisStartMs && otherEnd > prevEndMs) {
        return { part: a, interleaved: other }
      }
    }
  }
  return null
}

function enforcePartConsecutiveness(assignments: ScheduledTaskAssignment[]): void {
  const chronological = [...assignments].sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime()
    if (d !== 0) return d
    return getStartMs(a) - getStartMs(b)
  })
  let iter = 0
  const maxIter = assignments.length * 2
  while (iter < maxIter) {
    const violation = findInterleavedPart(assignments, chronological)
    if (!violation) break
    swapSlotData(violation.part, violation.interleaved)
    chronological.sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime()
      if (d !== 0) return d
      return getStartMs(a) - getStartMs(b)
    })
    iter++
  }
  if (iter >= maxIter) {
    console.warn(
      '[PostProcessor] Part consecutiveness: could not resolve all interleaves after max iterations; leaving remaining violations in place.'
    )
  }
}

// --- Step 2: Enforce dependency ordering (multi-part block move) ---

/**
 * Reassign slots so that all of the dependency's parts come before all of the dependent's parts.
 * Preserves relative order between parts of the same task. Mutates assignments in place.
 * Returns true if applied, false if reverted (validation failed).
 */
function moveDependentAfterDependency(
  assignments: ScheduledTaskAssignment[],
  dependentIdx: number,
  depIdx: number,
  tasks: ParsedTask[],
  getAssignmentsForTaskFn: (
    assignments: ScheduledTaskAssignment[],
    taskIndex: number
  ) => ScheduledTaskAssignment[]
): boolean {
  const assignmentsA = getAssignmentsForTaskFn(assignments, dependentIdx)
  const assignmentsB = getAssignmentsForTaskFn(assignments, depIdx)
  if (assignmentsA.length === 0 || assignmentsB.length === 0) return false

  const combined = [...assignmentsA, ...assignmentsB].sort((a, b) => getStartMs(a) - getStartMs(b))
  const slots = combined.map(copySlotData)

  const saved = new Map<ScheduledTaskAssignment, SlotData>()
  for (let i = 0; i < combined.length; i++) saved.set(combined[i], copySlotData(combined[i]))

  const nB = assignmentsB.length
  for (let i = 0; i < nB; i++) applySlotData(assignmentsB[i], slots[i])
  for (let i = 0; i < assignmentsA.length; i++) applySlotData(assignmentsA[i], slots[nB + i])

  const depsOfB = tasks[depIdx].depends_on ?? []
  const depLatestEnd = (oneBased: number) => {
    const idx = oneBased - 1
    if (idx < 0 || idx >= tasks.length) return 0
    const list = getAssignmentsForTaskFn(assignments, idx)
    return latestEndMs(list)
  }
  const BNewEarliest = earliestStartMs(assignmentsB)
  for (const oneBased of depsOfB) {
    if (oneBased - 1 === dependentIdx) continue
    if (BNewEarliest <= depLatestEnd(oneBased)) {
      for (const a of combined) applySlotData(a, saved.get(a)!)
      return false
    }
  }
  return true
}

function enforceDependencyOrdering(
  assignments: ScheduledTaskAssignment[],
  tasks: ParsedTask[],
  _userTimezone: string
): void {
  const order = topologicalOrder(tasks)
  const getForTask = getAssignmentsForTask
  for (const taskIndex of order) {
    const deps = tasks[taskIndex].depends_on ?? []
    const taskAssignments = getForTask(assignments, taskIndex)
    if (taskAssignments.length === 0) continue
    const depIndices = deps.map((d) => d - 1).filter((i) => i >= 0 && i < tasks.length && i !== taskIndex)
    for (const depIdx of depIndices) {
      const depAssignments = getForTask(assignments, depIdx)
      if (depAssignments.length === 0) continue
      const earliestStart = earliestStartMs(taskAssignments)
      const depLatestEnd = latestEndMs(depAssignments)
      if (earliestStart <= depLatestEnd) {
        const applied = moveDependentAfterDependency(
          assignments,
          taskIndex,
          depIdx,
          tasks,
          getForTask
        )
        if (applied) {
          console.log(`[PostProcessor] Fixed: task ${taskIndex} moved after dependency ${depIdx}`)
        } else {
          console.warn(
            `[PostProcessor] Dependency: could not move task ${taskIndex} ("${tasks[taskIndex]?.title ?? '?'}") after dependency ${depIdx} ("${tasks[depIdx]?.title ?? '?'}") without violating dependency's own constraints; leaving in place.`
          )
        }
      }
    }
  }
}

// --- Step 3: Final validation log ---

function logRemainingViolations(
  assignments: ScheduledTaskAssignment[],
  tasks: ParsedTask[],
  userTimezone: string
): void {
  const chronological = [...assignments].sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime()
    if (d !== 0) return d
    return getStartMs(a) - getStartMs(b)
  })
  const byTask = new Map<number, ScheduledTaskAssignment[]>()
  for (const a of assignments) {
    if (!byTask.has(a.taskIndex)) byTask.set(a.taskIndex, [])
    byTask.get(a.taskIndex)!.push(a)
  }

  for (const a of chronological) {
    const parts = byTask.get(a.taskIndex) ?? []
    if (parts.length <= 1) continue
    const sortedParts = [...parts].sort((x, y) => (x.partNumber ?? 1) - (y.partNumber ?? 1))
    const partIndex = sortedParts.findIndex((p) => p === a)
    if (partIndex <= 0) continue
    const prevPart = sortedParts[partIndex - 1]
    const prevEndMs = getEndMs(prevPart)
    const thisStartMs = getStartMs(a)
    for (const other of chronological) {
      if (other.taskIndex === a.taskIndex) continue
      const otherStart = getStartMs(other)
      const otherEnd = getEndMs(other)
      if (otherStart < thisStartMs && otherEnd > prevEndMs) {
        console.warn(
          `[PostProcessor] Part consecutiveness: taskIndex ${a.taskIndex} has Part ${a.partNumber ?? '?'} after an interleaved assignment (taskIndex ${other.taskIndex}) in chronological order.`
        )
        break
      }
    }
  }

  for (const taskIndex of topologicalOrder(tasks)) {
    const deps = tasks[taskIndex].depends_on ?? []
    const taskAssignments = getAssignmentsForTask(assignments, taskIndex)
    if (taskAssignments.length === 0) continue
    for (const oneBased of deps) {
      const depIdx = oneBased - 1
      if (depIdx < 0 || depIdx >= tasks.length || depIdx === taskIndex) continue
      const depAssignments = getAssignmentsForTask(assignments, depIdx)
      if (depAssignments.length === 0) continue
      const earliestStart = earliestStartMs(taskAssignments)
      const depLatestEnd = latestEndMs(depAssignments)
      if (earliestStart <= depLatestEnd) {
        console.warn(
          `[PostProcessor] Dependency: taskIndex ${taskIndex} ("${tasks[taskIndex]?.title ?? '?'}") scheduled at or before dependency taskIndex ${depIdx} ("${tasks[depIdx]?.title ?? '?'}").`
        )
      }
    }
  }
}

/**
 * Enforce scheduling constraints on the given assignments:
 * 1) Part consecutiveness (split parts of the same task are in consecutive slots).
 * 2) Dependency ordering (each task starts after all its dependencies end).
 * 3) Final validation log of any remaining violations.
 *
 * Mutates the assignments array in place (slot data only). If the schedule is already
 * correct, assignments are unchanged. Returns the same array reference.
 */
export function enforceSchedulingConstraints(
  assignments: ScheduledTaskAssignment[],
  tasks: ParsedTask[],
  userTimezone: string
): ScheduledTaskAssignment[] {
  if (assignments.length === 0) return assignments

  console.log(`[PostProcessor] Starting enforcement on ${assignments.length} assignments`)
  enforcePartConsecutiveness(assignments)
  enforceDependencyOrdering(assignments, tasks, userTimezone)
  logRemainingViolations(assignments, tasks, userTimezone)

  return assignments
}
