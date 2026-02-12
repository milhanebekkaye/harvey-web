'use client'

import type { WorkScheduleShape, CommuteShape } from '@/types/settings.types'

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const

type BlockEntry = { days: number[]; startTime: string; endTime: string }

/** Normalize to blocks with per-block days. Legacy single block becomes one entry with workDays. */
function getBlocks(workSchedule: WorkScheduleShape | null): BlockEntry[] {
  if (!workSchedule) {
    return [{ days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }]
  }
  if (Array.isArray(workSchedule.blocks) && workSchedule.blocks.length > 0) {
    return workSchedule.blocks.map((b) => ({
      days: Array.isArray(b.days) && b.days.length > 0 ? b.days : [1, 2, 3, 4, 5],
      startTime: b.startTime,
      endTime: b.endTime,
    }))
  }
  const workDays = Array.isArray(workSchedule.workDays) && workSchedule.workDays.length > 0
    ? workSchedule.workDays
    : [1, 2, 3, 4, 5]
  return [
    {
      days: workDays,
      startTime: workSchedule.startTime ?? '09:00',
      endTime: workSchedule.endTime ?? '17:00',
    },
  ]
}

interface WorkScheduleSectionProps {
  workSchedule: WorkScheduleShape | null
  commute: CommuteShape | null
  onChange: (workSchedule: WorkScheduleShape | null, commute: CommuteShape | null) => void
}

export function WorkScheduleSection({
  workSchedule,
  commute,
  onChange,
}: WorkScheduleSectionProps) {
  const blocks = getBlocks(workSchedule)

  const setBlocks = (nextBlocks: BlockEntry[]) => {
    onChange({ blocks: nextBlocks }, commute)
  }

  const setBlock = (index: number, patch: Partial<BlockEntry>) => {
    const next = blocks.map((b, i) => (i === index ? { ...b, ...patch } : b))
    setBlocks(next)
  }

  const toggleBlockDay = (blockIndex: number, dayValue: number) => {
    const b = blocks[blockIndex]
    const nextDays = b.days.includes(dayValue)
      ? b.days.filter((d) => d !== dayValue)
      : [...b.days, dayValue].sort((a, c) => a - c)
    setBlock(blockIndex, { days: nextDays })
  }

  const addBlock = () => {
    setBlocks([...blocks, { days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '17:00' }])
  }

  const removeBlock = (index: number) => {
    if (blocks.length <= 1) return
    setBlocks(blocks.filter((_, i) => i !== index))
  }

  const setCommute = (updates: Partial<CommuteShape>) => {
    const next: CommuteShape = {
      morning: updates.morning ?? (commute?.morning ? { ...commute.morning } : undefined),
      evening: updates.evening ?? (commute?.evening ? { ...commute.evening } : undefined),
    }
    if (!next.morning && !next.evening) onChange(workSchedule, null)
    else onChange(workSchedule, next)
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Work Schedule</h2>
      <p className="text-slate-500 text-sm mb-5">
        When you work (job/classes). Harvey will not schedule project work during these hours. Add a block per time slot and choose which days it applies to (e.g. Monday 9–12 and 3–5, Thursday 8–13 only).
      </p>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700">Time blocks</label>
          <button
            type="button"
            onClick={addBlock}
            className="text-sm font-medium text-[#895af6] hover:text-[#7849d9]"
          >
            + Add work block
          </button>
        </div>
        <ul className="space-y-4">
          {blocks.map((block, index) => (
            <li
              key={index}
              className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-3"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-xs font-medium text-slate-500 w-full sm:w-auto">Days</span>
                {DAYS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={block.days.includes(value)}
                      onChange={() => toggleBlockDay(index, value)}
                      className="rounded border-slate-300 text-[#895af6] focus:ring-[#895af6]"
                    />
                    <span className="text-sm text-slate-700">{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="time"
                  value={block.startTime}
                  onChange={(e) => setBlock(index, { startTime: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-[120px] focus:ring-2 focus:ring-[#895af6]/30 focus:border-[#895af6]"
                />
                <span className="text-slate-400 text-sm">to</span>
                <input
                  type="time"
                  value={block.endTime}
                  onChange={(e) => setBlock(index, { endTime: e.target.value })}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm w-[120px] focus:ring-2 focus:ring-[#895af6]/30 focus:border-[#895af6]"
                />
                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBlock(index)}
                    className="text-red-400 hover:text-red-600 text-sm"
                    aria-label="Remove block"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Commute (optional)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Morning: start time</label>
            <input
              type="time"
              value={commute?.morning?.startTime ?? '08:30'}
              onChange={(e) =>
                setCommute({
                  morning: { durationMinutes: commute?.morning?.durationMinutes ?? 0, startTime: e.target.value },
                })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <label className="block text-xs text-slate-500 mt-1 mb-1">Duration (minutes)</label>
            <input
              type="number"
              min={0}
              max={120}
              value={commute?.morning?.durationMinutes ?? ''}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setCommute({
                  morning: isNaN(n) ? undefined : { durationMinutes: n, startTime: commute?.morning?.startTime ?? '08:30' },
                })
              }}
              placeholder="0"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Evening: start time</label>
            <input
              type="time"
              value={commute?.evening?.startTime ?? '17:00'}
              onChange={(e) =>
                setCommute({
                  evening: { durationMinutes: commute?.evening?.durationMinutes ?? 0, startTime: e.target.value },
                })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <label className="block text-xs text-slate-500 mt-1 mb-1">Duration (minutes)</label>
            <input
              type="number"
              min={0}
              max={120}
              value={commute?.evening?.durationMinutes ?? ''}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setCommute({
                  evening: isNaN(n) ? undefined : { durationMinutes: n, startTime: commute?.evening?.startTime ?? '17:00' },
                })
              }}
              placeholder="0"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
