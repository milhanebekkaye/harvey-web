'use client'

import { useState } from 'react'
import type { ChatWidget, WidgetAnswerMeta } from '@/types/api.types'

const SKIP_REASONS = [
  { value: 'too_tired' as const, label: 'Too tired' },
  { value: 'ran_out_time' as const, label: 'Ran out of time' },
  { value: 'task_unclear' as const, label: 'Task unclear' },
  { value: 'not_priority' as const, label: 'Not a priority' },
  { value: 'other' as const, label: 'Other' },
] as const

interface SkipFeedbackWidgetProps {
  taskId: string
  projectId: string
  onAppendMessage: (
    role: 'user' | 'assistant',
    content: string,
    widget?: ChatWidget,
    widgetAnswer?: WidgetAnswerMeta
  ) => void
  onTasksChanged?: () => void
}

export function SkipFeedbackWidget({
  taskId,
  projectId,
  onAppendMessage,
}: SkipFeedbackWidgetProps) {
  const [submitted, setSubmitted] = useState(false)
  const [showOtherNotes, setShowOtherNotes] = useState(false)
  const [otherNotes, setOtherNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const submitReason = async (
    reason: typeof SKIP_REASONS[number]['value'],
    notes?: string
  ) => {
    if (submitted || loading) return
    const labels: Record<string, string> = {
      too_tired: "I'm too tired.",
      ran_out_time: 'I ran out of time.',
      task_unclear: 'The task was unclear.',
      not_priority: "It's not a priority right now.",
      other: notes?.trim() ? `Other: ${notes.trim()}` : 'Other reason.',
    }
    onAppendMessage('user', labels[reason] || 'Skipping.', undefined, {
      widgetType: 'skip_feedback',
      taskId,
    })
    setSubmitted(true)
    setLoading(true)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skipReason: reason,
          ...(notes != null && notes.trim() ? { skipNotes: notes.trim() } : {}),
        }),
      })

      // Show Harvey's reply after a short delay so the conversation reads user → then Harvey
      const sendAssistant = (content: string, widget?: ChatWidget) => {
        const ASSISTANT_DELAY_MS = 400
        setTimeout(() => onAppendMessage('assistant', content, widget), ASSISTANT_DELAY_MS)
      }

      if (reason === 'not_priority') {
        sendAssistant("Okay, I'll leave it skipped for now.")
        return
      }

      const suggestionRes = await fetch(
        `/api/tasks/${taskId}/suggestion?skipReason=${encodeURIComponent(reason)}`
      )
      if (!suggestionRes.ok) {
        sendAssistant("Okay, I'll leave it skipped for now.")
        return
      }
      const suggestionJson = await suggestionRes.json()
      if (!suggestionJson.success || !suggestionJson.suggestion) {
        sendAssistant("Okay, I'll leave it skipped for now.")
        return
      }
      const s = suggestionJson.suggestion
      sendAssistant(s.suggestionText, {
        type: 'reschedule_prompt',
        data: {
          taskId,
          suggestedDate: s.suggestedDate,
          suggestedTime: s.suggestedTime,
        },
      })
    } catch (e) {
      console.error('[SkipFeedbackWidget]', e)
    } finally {
      setLoading(false)
    }
  }

  const handleOtherClick = () => {
    setShowOtherNotes(true)
  }

  const handleOtherSubmit = () => {
    submitReason('other', otherNotes)
    setOtherNotes('')
    setShowOtherNotes(false)
  }

  const handleOtherSkip = () => {
    submitReason('other')
    setShowOtherNotes(false)
  }

  if (submitted && !showOtherNotes) return null

  if (showOtherNotes) {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs text-slate-500">Want to tell me more? (optional)</p>
        <textarea
          value={otherNotes}
          onChange={(e) => setOtherNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#895af6]/50 focus:outline-none focus:ring-1 focus:ring-[#895af6]/30"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleOtherSubmit}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={handleOtherSkip}
            disabled={loading}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {SKIP_REASONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={value === 'other' ? handleOtherClick : () => submitReason(value)}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
