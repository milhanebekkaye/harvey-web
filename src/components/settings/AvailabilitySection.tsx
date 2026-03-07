'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Calendar, X } from 'lucide-react'
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
  variant?: 'default' | 'card'
}

export function AvailabilitySection({
  availableTime,
  workSchedule,
  commute,
  onChange,
  variant = 'default',
}: AvailabilitySectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newBlock, setNewBlock] = useState<Partial<AvailabilityBlock>>({
    day: 'monday',
    start: '18:00',
    end: '20:00',
    type: 'work',
  })
  const [gridAddMode, setGridAddMode] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ day: string; hour: number } | null>(null)
  const [hoverCell, setHoverCell] = useState<{ day: string; hour: number } | null>(null)
  const [pendingRange, setPendingRange] = useState<{ day: string; startHour: number; endHour: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

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

  const isCellOccupiedByBlock = useCallback(
    (day: string, hour: number) =>
      displaySegments.some((s) => s.day === day && hour >= s.start && hour < s.end),
    [displaySegments]
  )

  const resetSelection = useCallback(() => {
    setSelectionStart(null)
    setHoverCell(null)
    setPendingRange(null)
  }, [])

  const exitAddMode = useCallback(() => {
    setGridAddMode(false)
    setAdding(false)
    resetSelection()
  }, [resetSelection])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitAddMode()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exitAddMode])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!selectionStart && !pendingRange) return
      if (gridRef.current?.contains(target)) return
      resetSelection()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [selectionStart, pendingRange, resetSelection])

  const handleCellClick = useCallback(
    (day: string, hour: number) => {
      if (!gridAddMode) return
      if (isCellOccupiedByBlock(day, hour)) return
      if (pendingRange) {
        setPendingRange(null)
        setSelectionStart({ day, hour })
        setHoverCell(null)
        return
      }
      if (!selectionStart) {
        setSelectionStart({ day, hour })
        return
      }
      if (selectionStart.day !== day) {
        setSelectionStart({ day, hour })
        setHoverCell(null)
        return
      }
      const startHour = Math.min(selectionStart.hour, hour)
      const endHour = Math.max(selectionStart.hour, hour) + 1
      const startStr = `${String(startHour).padStart(2, '0')}:00`
      const endStr = `${String(endHour).padStart(2, '0')}:00`
      setNewBlock((prev) => ({ ...prev, day, start: startStr, end: endStr, type: prev?.type ?? 'work' }))
      setPendingRange({ day, startHour, endHour })
      setSelectionStart(null)
      setHoverCell(null)
    },
    [gridAddMode, selectionStart, pendingRange, isCellOccupiedByBlock]
  )

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
    exitAddMode()
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

  const isCard = variant === 'card'
  const gridWrapperClass = isCard
    ? 'min-w-[600px] rounded-xl overflow-hidden border border-slate-200/60'
    : ''
  const gridClass = 'min-w-[600px] grid grid-cols-8 gap-px overflow-hidden ' + (isCard ? 'bg-[rgba(0,0,0,0.06)]' : 'bg-slate-200 rounded-lg')

  return (
    <section className={isCard ? 'rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm' : 'bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6'}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className={isCard ? 'flex items-center gap-3' : ''}>
          {isCard && (
            <div className="w-10 h-10 rounded-xl bg-[rgba(137,91,245,0.06)] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-[#895bf5]" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Availability Windows</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              {isCard ? 'When you can work on your project' : 'When you can work on this project. Shown below: work hours (grey), commute (lighter), your availability blocks (green/blue).'}
            </p>
          </div>
        </div>
        {!gridAddMode && (
          <button
            type="button"
            onClick={() => {
              setGridAddMode(true)
              setAdding(true)
            }}
            className={`shrink-0 text-sm font-medium ${isCard ? 'px-4 py-2 rounded-full bg-gradient-to-r from-[#895af6] to-[#7849d9] text-white hover:opacity-95' : 'text-[#895af6] hover:text-[#7849d9]'}`}
          >
            + Add block
          </button>
        )}
      </div>

      {adding && (
        <div className={`flex flex-wrap items-center gap-2 p-3 mb-4 ${isCard ? 'rounded-xl bg-slate-50/80 border border-slate-200/80' : 'rounded-lg bg-slate-50 border border-slate-200'}`}>
          <select
            value={newBlock.day}
            onChange={(e) => setNewBlock((b) => ({ ...b, day: e.target.value }))}
            className={`rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 ${isCard ? 'bg-white' : ''}`}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input
            type="time"
            value={newBlock.start ?? ''}
            onChange={(e) => setNewBlock((b) => ({ ...b, start: e.target.value }))}
            className={`rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm w-28 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 ${isCard ? 'bg-white' : ''}`}
          />
          <input
            type="time"
            value={newBlock.end ?? ''}
            onChange={(e) => setNewBlock((b) => ({ ...b, end: e.target.value }))}
            className={`rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm w-28 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 ${isCard ? 'bg-white' : ''}`}
          />
          <select
            value={newBlock.type ?? 'work'}
            onChange={(e) => setNewBlock((b) => ({ ...b, type: e.target.value as 'work' | 'personal' }))}
            className={`rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 ${isCard ? 'bg-white' : ''}`}
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
            onClick={exitAddMode}
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

      {gridAddMode && (
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs text-violet-500 font-medium">
            Click on the grid to select a time range, or use the form below
          </p>
          <button
            type="button"
            onClick={exitAddMode}
            className="text-xs text-slate-400 hover:text-slate-600 underline shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {selectionStart && !pendingRange && gridAddMode && (
        <p className="text-xs text-violet-500 font-medium mb-2">
          Click another slot to complete the selection
        </p>
      )}

      <div
        className={`overflow-x-auto mb-6 relative ${gridWrapperClass} ${gridAddMode ? 'ring-2 ring-violet-200/60 rounded-xl' : ''}`}
        ref={gridRef}
        onMouseLeave={() => setHoverCell(null)}
      >
        <div className={gridClass}>
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
                const occupiedByBlock = isCellOccupiedByBlock(day, hour)
                const isSelectionStart = selectionStart?.day === day && selectionStart?.hour === hour
                const isPending =
                  pendingRange?.day === day && hour >= pendingRange.startHour && hour < pendingRange.endHour
                const isHoverPreview =
                  !pendingRange &&
                  selectionStart &&
                  hoverCell?.day === selectionStart.day &&
                  day === selectionStart.day &&
                  hour >= Math.min(selectionStart.hour, hoverCell.hour) &&
                  hour <= Math.max(selectionStart.hour, hoverCell.hour)
                let bg = 'bg-white'
                if (isPending) bg = 'bg-violet-200/80'
                else if (isSelectionStart) bg = 'bg-violet-200'
                else if (isHoverPreview) bg = 'bg-violet-100/60'
                else if (work) bg = 'bg-slate-300'
                else if (comm) bg = 'bg-slate-200'
                else if (avail.length) bg = type === 'personal' ? 'bg-sky-400/40' : 'bg-emerald-400/40'
                const hasOverlap = work && avail.some(s => s.block?.type === 'work')
                return (
                  <div
                    key={`${day}-${hour}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleCellClick(day, hour)}
                    onMouseEnter={() => {
                      if (!gridAddMode || !selectionStart) return
                      setHoverCell({ day, hour })
                    }}
                    onMouseLeave={() => setHoverCell(null)}
                    className={`${bg} min-h-[20px] ${!occupiedByBlock && gridAddMode ? 'cursor-pointer' : 'cursor-default'} ${isSelectionStart ? 'border border-violet-300 ring-1 ring-violet-300/50' : ''}`}
                    style={hasOverlap && !isPending && !isSelectionStart && !isHoverPreview ? {
                      backgroundImage: 'repeating-linear-gradient(45deg, rgba(52,211,153,0.45) 0px, rgba(52,211,153,0.45) 3px, transparent 3px, transparent 8px)'
                    } : undefined}
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

      {availableTime.length === 0 && !gridAddMode && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center mb-4">
          <p className="text-slate-500 text-sm mb-3">No availability blocks yet.</p>
          <button
            type="button"
            onClick={() => {
              setGridAddMode(true)
              setAdding(true)
            }}
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
              className={`group flex items-center gap-3 p-3 rounded-lg border ${isCard ? 'bg-slate-50/60 border-slate-100 hover:border-slate-200' : 'bg-slate-50 border-slate-100'}`}
            >
              {editingId === `edit-${index}` ? (
                <>
                  <select
                    value={block.day}
                    onChange={(e) => updateBlock(index, { day: e.target.value })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>{d.slice(0, 3)}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={block.start}
                    onChange={(e) => updateBlock(index, { start: e.target.value })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm w-24 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  />
                  <input
                    type="time"
                    value={block.end}
                    onChange={(e) => updateBlock(index, { end: e.target.value })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm w-24 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                  />
                  <select
                    value={block.type ?? 'work'}
                    onChange={(e) => updateBlock(index, { type: e.target.value as 'work' | 'personal' })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
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
                  <span className="capitalize text-sm font-semibold text-slate-700 w-24">{block.day}</span>
                  <span className="text-sm text-slate-500">
                    {parseTime(block.end) <= parseTime(block.start) && parseTime(block.start) !== parseTime(block.end)
                      ? `${block.start} – ${nextDay(block.day).charAt(0).toUpperCase() + nextDay(block.day).slice(1, 3)} ${block.end} (overnight)`
                      : `${block.start}–${block.end}`}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${(block.type ?? 'work') === 'personal' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {(block.type ?? 'work') === 'personal' ? 'Personal' : 'Project'}
                  </span>
                  <div className={`ml-auto flex items-center gap-1 ${isCard ? 'opacity-0 group-hover:opacity-100 transition-opacity' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setEditingId(`edit-${index}`)}
                      className="text-slate-400 hover:text-slate-600 text-sm px-2 py-1"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(index)}
                      className="text-red-400 hover:text-red-600 p-1"
                      aria-label="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
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
