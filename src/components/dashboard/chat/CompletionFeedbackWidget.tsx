'use client'

import { useState } from 'react'
import type { ChatWidget, WidgetAnswerMeta } from '@/types/api.types'
import { getDateStringInTimezone } from '@/lib/timezone'

interface CompletionFeedbackWidgetProps {
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

export function CompletionFeedbackWidget({
  taskId,
  projectId,
  onAppendMessage,
  onTasksChanged,
}: CompletionFeedbackWidgetProps) {
  const [submitted, setSubmitted] = useState(false)
  const [showMinutesInput, setShowMinutesInput] = useState<'less' | 'more' | null>(null)
  const [minutes, setMinutes] = useState('')
  const [loading, setLoading] = useState(false)

  const submitDurationAccuracy = async (
    durationAccuracy: 'less' | 'same' | 'more',
    actualMinutes?: number
  ) => {
    if (submitted || loading) return
    const userMessages: Record<'less' | 'same' | 'more', string> = {
      less: 'The task took me less time than planned.',
      same: 'The task took me about the right time you scheduled.',
      more: 'The task took me longer than planned.',
    }
    // Show user message in chat immediately (DB persist runs in background via parent)
    onAppendMessage('user', userMessages[durationAccuracy], undefined, {
      widgetType: 'completion_feedback',
      taskId,
    })
    setSubmitted(true)
    setLoading(true)
    try {
      // Single PATCH returns task + optional progressToday (avoids separate GET /api/progress/today)
      const patchRes = await fetch(
        `/api/tasks/${taskId}?returnProgressToday=true`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            durationAccuracy,
            ...(actualMinutes != null ? { actualDuration: actualMinutes } : {}),
          }),
        }
      )
      if (!patchRes.ok) {
        setLoading(false)
        return
      }
      const patchJson = await patchRes.json()
      const completedTaskScheduledDate: string | undefined =
        patchJson?.task?.scheduledDate

      // Use progress from PATCH response when present; otherwise fallback to GET (e.g. older API)
      let d = patchJson?.progressToday
      if (!d) {
        const progressRes = await fetch('/api/progress/today')
        if (!progressRes.ok) return
        const progressJson = await progressRes.json()
        if (!progressJson.success || !progressJson.data) return
        d = progressJson.data
      }
      const userTimezone = d.userTimezone || 'Europe/Paris'
      const todayStr = getDateStringInTimezone(new Date(), userTimezone)
      const taskDateStr =
        completedTaskScheduledDate &&
        getDateStringInTimezone(new Date(completedTaskScheduledDate), userTimezone)

      const nextUpSuffix = d.nextTask
        ? (() => {
            const timePart = d.nextTask.startTime
              ? new Date(d.nextTask.startTime).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })
              : ''
            return ` Next up: ${d.nextTask.title}${timePart ? ` at ${timePart}` : ''}.`
          })()
        : " You're all clear for now."

      let ack: string
      if (taskDateStr == null || taskDateStr === todayStr) {
        ack = `Got it! That's ${d.completed}/${d.total} tasks done today.` + nextUpSuffix
      } else if (taskDateStr < todayStr) {
        ack = "You're catching up — good job finishing that one." + nextUpSuffix
      } else {
        ack = "You're ahead of schedule — nice work." + nextUpSuffix
      }
      // Show Harvey's reply after a short delay so the conversation reads user → then Harvey
      const ASSISTANT_DELAY_MS = 400
      setTimeout(() => {
        onAppendMessage('assistant', ack)
        onTasksChanged?.()
      }, ASSISTANT_DELAY_MS)
    } catch (e) {
      console.error('[CompletionFeedbackWidget]', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSame = () => submitDurationAccuracy('same')
  const handleLess = () => setShowMinutesInput('less')
  const handleMore = () => setShowMinutesInput('more')

  const submitWithMinutes = () => {
    if (showMinutesInput === null) return
    const n = parseInt(minutes, 10)
    if (Number.isNaN(n) || n < 0) {
      submitDurationAccuracy(showMinutesInput)
    } else {
      submitDurationAccuracy(showMinutesInput, n)
    }
    setShowMinutesInput(null)
    setMinutes('')
  }

  const skipMinutes = () => {
    if (showMinutesInput === null) return
    submitDurationAccuracy(showMinutesInput)
    setShowMinutesInput(null)
    setMinutes('')
  }

  if (submitted) return null

  if (showMinutesInput) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          placeholder="Minutes"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#895af6]/50 focus:outline-none focus:ring-1 focus:ring-[#895af6]/30"
        />
        <button
          type="button"
          onClick={submitWithMinutes}
          disabled={loading}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={skipMinutes}
          disabled={loading}
          className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
        >
          Skip
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={handleLess}
        disabled={loading}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        Less than planned
      </button>
      <button
        type="button"
        onClick={handleSame}
        disabled={loading}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        About right
      </button>
      <button
        type="button"
        onClick={handleMore}
        disabled={loading}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        Took longer
      </button>
    </div>
  )
}
