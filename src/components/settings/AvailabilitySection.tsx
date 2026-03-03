'use client'

import { useState, useMemo } from 'react'
import type {
  AvailabilityBlock,
  WorkScheduleShape,
  CommuteShape,
} from '@/types/settings.types'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const DAY_NUM_TO_NAME: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h + (m ?? 0) / 60
}

function formatHour(h: number): string {
  return `${h.toString().padStart(2, '0')}:00`
}

function totalMinutes(blocks: AvailabilityBlock[]): number {
  let total = 0
  for (const b of blocks) {
    const start = parseTime(b.start)
    const end = parseTime(b.end)
    total += (end > start ? end - start : 24 - start + end) * 60
  }
  return total
}

/** Next day in calendar order (Monday → Tuesday → … → Sunday → Monday). */
function nextDay(day: string): string {
  const idx = DAYS.indexOf(day as (typeof DAYS)[number])
  return DAYS[(idx + 1) % 7]
}

/**
 * Expand a block into one or two (day, start, end) segments for grid display.
 * Overnight blocks (end <= start) become two segments: [start, 24) on block day, [0, end) on next day.
 */
function getDisplaySegments(block: AvailabilityBlock): { day: string; start: number; end: number }[] {
  const start = parseTime(block.start)
  const end = parseTime(block.end)
  if (end > start) {
    return [{ day: block.day, start, end }]
  }
  if (end === start) return []
  // Overnight
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[Availability] Overnight block detected for grid:', block.day, block.start, '-', block.end)
  }
  return [
    { day: block.day, start, end: 24 },
    { day: nextDay(block.day), start: 0, end },
  ]
}

interface AvailabilitySectionProps {
  availableTime: AvailabilityBlock[]
  workSchedule: WorkScheduleShape | null
  commute: CommuteShape | null
  onChange: (available_time: AvailabilityBlock[]) => void
}

export function AvailabilitySection({
  availableTime,
  workSchedule,
  commute,
  onChange,
}: AvailabilitySectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newBlock, setNewBlock] = useState<Partial<AvailabilityBlock>>({
    day: 'monday',
    start: '18:00',
    end: '20:00',
    type: 'work',
  })

  const totalHoursPerWeek = useMemo(() => totalMinutes(availableTime) / 60, [availableTime])

  const workBlocksByDay = useMemo(() => {
    const map: Record<string, { start: number; end: number }[]> = {}
    const ws = workSchedule
    if (!ws) return map
    if (Array.isArray(ws.blocks) && ws.blocks.length > 0) {
      for (const b of ws.blocks) {
        const days = Array.isArray(b.days) && b.days.length > 0 ? b.days : [1, 2, 3, 4, 5]
        const start = parseTime(b.startTime)
        const end = parseTime(b.endTime)
        for (const d of days) {
          const day = DAY_NUM_TO_NAME[d]
          if (day) {
            if (!map[day]) map[day] = []
            map[day].push({ start, end })
          }
        }
      }
    } else if (ws.workDays?.length && ws.startTime && ws.endTime) {
      const start = parseTime(ws.startTime)
      const end = parseTime(ws.endTime)
      for (const d of ws.workDays) {
        const day = DAY_NUM_TO_NAME[d]
        if (day) map[day] = [{ start, end }]
      }
    }
    return map
  }, [workSchedule])

  const commuteBlocksByDay = useMemo(() => {
    const map: Record<string, { start: number; end: number }[]> = {}
    for (const day of DAYS) map[day] = []
    if (commute?.morning) {
      const start = parseTime(commute.morning.startTime)
      const end = start + commute.morning.durationMinutes / 60
      for (const day of DAYS) map[day].push({ start, end })
    }
    if (commute?.evening) {
      const start = parseTime(commute.evening.startTime)
      const end = start + commute.evening.durationMinutes / 60
      for (const day of DAYS) map[day].push({ start, end })
    }
    return map
  }, [commute])

  /** All availability segments for grid (overnight blocks expanded to two segments). */
  const displaySegments = useMemo(() => {
    const out: { day: string; start: number; end: number; block: AvailabilityBlock }[] = []
    for (const block of availableTime) {
      for (const seg of getDisplaySegments(block)) {
        out.push({ ...seg, block })
      }
    }
    return out
  }, [availableTime])

  const addBlock = () => {
    const b = newBlock
    if (!b.day || !b.start || !b.end) return
    const start = parseTime(b.start)
    const end = parseTime(b.end)
    if (end === start) return // same time = invalid; end < start is overnight (valid)
    if (typeof window !== 'undefined' && end < start && process.env.NODE_ENV === 'development') {
      console.log('[Availability] Adding overnight block:', b.day, b.start, '-', b.end)
    }
    const next: AvailabilityBlock = {
      day: b.day,
      start: b.start,
      end: b.end,
      label: b.label,
      type: (b.type === 'work' || b.type === 'personal' ? b.type : undefined) as 'work' | 'personal' | undefined,
    }
    onChange([...availableTime, next])
    setNewBlock({ day: 'monday', start: '18:00', end: '20:00', type: 'work' })
    setAdding(false)
  }

  const updateBlock = (index: number, updates: Partial<AvailabilityBlock>) => {
    const next = [...availableTime]
    next[index] = { ...next[index], ...updates }
    onChange(next)
    setEditingId(null)
  }

  const removeBlock = (index: number) => {
    if (typeof window !== 'undefined' && !window.confirm('Remove this availability block?')) return
    onChange(availableTime.filter((_, i) => i !== index))
    setEditingId(null)
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h2 className="text-lg font-semibold text-slate-800">Availability Windows</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="shrink-0 text-sm font-medium text-[#895af6] hover:text-[#7849d9]"
          >
            + Add block
          </button>
        )}
      </div>
      <p className="text-slate-500 text-sm mb-4">
        When you can work on this project. Shown below: work hours (grey), commute (lighter), your availability blocks (green/blue).
      </p>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 mb-4">
          <select
            value={newBlock.day}
            onChange={(e) => setNewBlock((b) => ({ ...b, day: e.target.value }))}
            className="rounded border border-slate-200 px-2 py-1.5 text-sm"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input
            type="time"
            value={newBlock.start ?? ''}
            onChange={(e) => setNewBlock((b) => ({ ...b, start: e.target.value }))}
            className="rounded border border-slate-200 px-2 py-1.5 text-sm w-28"
          />
          <input
            type="time"
            value={newBlock.end ?? ''}
            onChange={(e) => setNewBlock((b) => ({ ...b, end: e.target.value }))}
            className="rounded border border-slate-200 px-2 py-1.5 text-sm w-28"
          />
          <select
            value={newBlock.type ?? 'work'}
            onChange={(e) => setNewBlock((b) => ({ ...b, type: e.target.value as 'work' | 'personal' }))}
            className="rounded border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="work">Project</option>
            <option value="personal">Personal</option>
          </select>
          <button
            type="button"
            onClick={addBlock}
            className="px-3 py-1.5 bg-[#895af6] text-white text-sm rounded-lg hover:bg-[#7849d9]"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="px-3 py-1.5 text-slate-600 text-sm"
          >
            Cancel
          </button>
          {newBlock.start && newBlock.end && parseTime(newBlock.start) > parseTime(newBlock.end) && (
            <p className="w-full text-xs text-slate-500 mt-1">
              This block crosses midnight and will appear on two days.
            </p>
          )}
        </div>
      )}

      <div className="mb-4 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5 mr-4">
          <span className="w-3 h-3 rounded bg-slate-300" /> Work
        </span>
        <span className="inline-flex items-center gap-1.5 mr-4">
          <span className="w-3 h-3 rounded bg-slate-200" /> Commute
        </span>
        <span className="inline-flex items-center gap-1.5 mr-4">
          <span className="w-3 h-3 rounded bg-emerald-400" /> Project
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-sky-400" /> Personal
        </span>
      </div>

      <div className="overflow-x-auto mb-6">
        <div className="min-w-[600px] grid grid-cols-8 gap-px bg-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 p-2 text-xs font-medium text-slate-500" />
          {DAYS.map((day) => (
            <div key={day} className="bg-slate-50 p-2 text-xs font-medium text-slate-600 capitalize">
              {day.slice(0, 3)}
            </div>
          ))}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="bg-slate-50 px-2 py-1 text-xs text-slate-400">
                {formatHour(hour)}
              </div>
              {DAYS.map((day) => {
                const work = workBlocksByDay[day]?.some((r) => hour >= r.start && hour < r.end)
                const comm = commuteBlocksByDay[day]?.some((r) => hour >= r.start && hour < r.end)
                const avail = displaySegments.filter(
                  (s) => s.day === day && hour >= s.start && hour < s.end
                )
                const type = (avail.find(s => s.block?.type === 'personal') ?? avail[0])?.block?.type
                let bg = 'bg-white'
                if (work) bg = 'bg-slate-300'
                else if (comm) bg = 'bg-slate-200'
                else if (avail.length) bg = type === 'personal' ? 'bg-sky-400/40' : 'bg-emerald-400/40'
                return (
                  <div
                    key={`${day}-${hour}`}
                    className={`${bg} min-h-[20px]`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-700">Blocks</span>
        <span className="text-sm text-slate-500">
          {totalHoursPerWeek.toFixed(1)} hours/week
        </span>
      </div>

      {availableTime.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center mb-4">
          <p className="text-slate-500 text-sm mb-3">No availability blocks yet.</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm font-medium text-[#895af6] hover:text-[#7849d9]"
          >
            Add your first availability block
          </button>
        </div>
      )}

      {availableTime.length > 0 && (
        <ul className="space-y-2 mb-4">
          {[...availableTime].reverse().map((block, reversedIndex) => {
            const index = availableTime.length - 1 - reversedIndex
            return (
            <li
              key={`${block.day}-${block.start}-${index}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
            >
              {editingId === `edit-${index}` ? (
                <>
                  <select
                    value={block.day}
                    onChange={(e) => updateBlock(index, { day: e.target.value })}
                    className="rounded border border-slate-200 px-2 py-1 text-sm"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>{d.slice(0, 3)}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={block.start}
                    onChange={(e) => updateBlock(index, { start: e.target.value })}
                    className="rounded border border-slate-200 px-2 py-1 text-sm w-24"
                  />
                  <input
                    type="time"
                    value={block.end}
                    onChange={(e) => updateBlock(index, { end: e.target.value })}
                    className="rounded border border-slate-200 px-2 py-1 text-sm w-24"
                  />
                  <select
                    value={block.type ?? 'work'}
                    onChange={(e) => updateBlock(index, { type: e.target.value as 'work' | 'personal' })}
                    className="rounded border border-slate-200 px-2 py-1 text-sm"
                  >
                    <option value="work">Project</option>
                    <option value="personal">Personal</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-slate-500 text-sm"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <span className="capitalize text-sm font-medium text-slate-700">{block.day}</span>
                  <span className="text-sm text-slate-500">
                    {parseTime(block.end) <= parseTime(block.start) && parseTime(block.start) !== parseTime(block.end)
                      ? `${block.start} – ${nextDay(block.day).charAt(0).toUpperCase() + nextDay(block.day).slice(1, 3)} ${block.end} (overnight)`
                      : `${block.start}–${block.end}`}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${(block.type ?? 'work') === 'personal' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {(block.type ?? 'work') === 'personal' ? 'Personal' : 'Project'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(`edit-${index}`)}
                    className="ml-auto text-slate-400 hover:text-slate-600 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(index)}
                    className="text-red-400 hover:text-red-600"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </>
              )}
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
