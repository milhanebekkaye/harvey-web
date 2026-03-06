'use client'

import { useState } from 'react'
import { ChatAvatar } from './ChatAvatar'

export type DatePickerField = 'deadline' | 'start_date'

export interface DatePickerWidgetProps {
  field: DatePickerField
  label: string
  minDate: string
  onSelect: (date: string) => void
  onDismiss?: () => void
  answered?: boolean
}

export function DatePickerWidget({
  field,
  label,
  minDate,
  onSelect,
  onDismiss,
  answered = false,
}: DatePickerWidgetProps) {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = () => {
    const value = selectedDate.trim()
    if (!value) return
    setConfirmed(true)
    onSelect(value)
  }

  const isDisabled = answered || confirmed

  return (
    <div className="flex items-end gap-4 p-2">
      <ChatAvatar role="assistant" />
      <div className="flex flex-1 flex-col gap-1.5 items-start">
        <p className="text-[#8B5CF6] text-[13px] font-bold leading-normal ml-1">
          Harvey
        </p>
        <div
          className={`text-base font-medium leading-relaxed flex flex-col gap-3 max-w-[85%] rounded-2xl rounded-bl-none px-6 py-4 bg-white text-[#110d1c] shadow-md ${
            isDisabled ? 'opacity-75' : ''
          }`}
        >
          <p className="text-[#110d1c]">{label}</p>
          {isDisabled && selectedDate ? (
            <p className="text-sm text-slate-600">
              Selected: {selectedDate}
            </p>
          ) : (
            <>
              <input
                type="date"
                min={minDate}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={isDisabled}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#8B5CF6] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/20 disabled:bg-slate-50 disabled:text-slate-500"
              />
              <div className="flex gap-2 self-start mt-1">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isDisabled || !selectedDate}
                  className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-sm font-medium text-white hover:bg-[#7C4FDB] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
                {onDismiss && (
                  <button
                    type="button"
                    onClick={onDismiss}
                    disabled={isDisabled}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Not relevant to the question
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
