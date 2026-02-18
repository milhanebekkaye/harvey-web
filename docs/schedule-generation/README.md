# Schedule Generation

This document focuses on Harvey's slot-assignment pipeline (task scheduling after tasks are generated). For the full end-to-end build flow, see [task-generation/README.md](../task-generation/README.md).

## Current scheduling flow

1. **Build slot map (unchanged)**
   - `buildAvailabilityMap()` converts `available_time` into typed slot capacity by day.
   - Fixed windows are reduced by user work/commute blocks.
   - Flexible windows use `flexible_hours` as capacity.

2. **Serialize scheduler inputs for Claude**
   - Tasks are flattened into JSON: `taskIndex`, `title`, `estimatedHours`, `priority`, `energyRequired`, `preferredSlotType`, `dependsOn` (0-based), `label`.
   - Slots are flattened into chronological JSON: `date`, `day`, `startTime`, `endTime`, `slotType`, `capacityHours`, `isFlexible`, `windowStart`, `windowEnd`.

3. **Claude slot assignment**
   - `assignTasksWithClaude()` calls Claude Haiku (`max_tokens: 4000`) with project context + task list + slot list.
   - Claude returns JSON assignments (`taskIndex` + array of slot parts).

4. **Hard-constraint validation (algorithmic)**
   - Validate all `taskIndex` values reference real tasks.
   - Validate all slot references (`date + startTime`) exist in the original slot map.
   - Validate no overlaps / slot conflicts.
   - Validate dependency ordering: task earliest start must be strictly after every dependency latest end.
   - Validate split sequencing: part numbers are contiguous and use consecutive slots.
   - Validate duration integrity at **task level**: sum of `hoursAssigned` across a task's slots must match the task estimate (within tolerance).
   - Partial slot usage is valid: `hoursAssigned` is the claimed effort in that slot and may be less than slot capacity.

5. **Retry on validation failure**
   - A second Claude call receives the previous response + explicit violation list.
   - Claude must return a corrected full JSON array.

6. **Deterministic fallback on second failure**
   - If retry still fails (or request fails), scheduler logs violations and falls back to `assignTasksToSchedule()`.
   - This keeps schedule generation resilient and guarantees output for downstream DB writes.

## Key files

- `src/lib/schedule/task-scheduler.ts`
  - `assignTasksWithClaude(...)` (primary path)
  - `assignTasksToSchedule(...)` (deterministic fallback)
  - `buildAvailabilityMap(...)` (slot map builder, unchanged)
- `src/app/api/schedule/generate-schedule/route.ts`
  - Calls `assignTasksWithClaude(...)`; DB write flow remains unchanged.
