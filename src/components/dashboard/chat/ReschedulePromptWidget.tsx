'use client'

import { useState } from 'react'
import type { WidgetAnswerMeta } from '@/types/api.types'

interface ReschedulePromptWidgetProps {
  taskId: string
  suggestedDate: string
  suggestedTime: string
  onAppendMessage: (
    role: 'user' | 'assistant',
    content: string,
    widget?: undefined,
    widgetAnswer?: WidgetAnswerMeta
  ) => void
  onTasksChanged?: () => void
}

export function ReschedulePromptWidget({
  taskId,
  suggestedDate,
  suggestedTime,
  onAppendMessage,
  onTasksChanged,
}: ReschedulePromptWidgetProps) {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleYes = async () => {
    if (submitted || loading) return
    setLoading(true)
    onAppendMessage('user', "Yes, reschedule", undefined, {
      widgetType: 'reschedule_prompt',
      taskId,
    })
    try {
      const res = await fetch(`/api/tasks/${taskId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestedDate, suggestedTime }),
      })
      const data = await res.json()
      if (data.success) {
        const dayLabel = new Date(suggestedDate + 'T12:00:00.000Z').toLocaleDateString('en-US', {
          weekday: 'long',
        })
        const [h, m] = suggestedTime.split(':').map(Number)
        const timeDate = new Date()
        timeDate.setHours(h, m, 0, 0)
        const timeStr = timeDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        onAppendMessage(
          'assistant',
          `Done! I've moved it to ${dayLabel} at ${timeStr}.`
        )
        onTasksChanged?.()
      } else {
        onAppendMessage('assistant', data.error || "Couldn't reschedule. I'll leave it skipped.")
      }
      setSubmitted(true)
    } catch (e) {
      console.error('[ReschedulePromptWidget]', e)
      onAppendMessage('assistant', "Something went wrong. I'll leave it skipped.")
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  const handleNo = () => {
    if (submitted || loading) return
    onAppendMessage('user', "No, leave it skipped", undefined, {
      widgetType: 'reschedule_prompt',
      taskId,
    })
    onAppendMessage('assistant', "Okay, I'll leave it skipped.")
    setSubmitted(true)
  }

  if (submitted) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleYes}
        disabled={loading}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        Yes, reschedule
      </button>
      <button
        type="button"
        onClick={handleNo}
        disabled={loading}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        No, leave it skipped
      </button>
    </div>
  )
}
