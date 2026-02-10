'use client'

import { useState } from 'react'
import type { ChatWidget } from '@/types/api.types'

interface CompletionFeedbackWidgetProps {
  taskId: string
  projectId: string
  onAppendMessage: (role: 'user' | 'assistant', content: string, widget?: ChatWidget) => void
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
    setLoading(true)
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationAccuracy,
          ...(actualMinutes != null ? { actualDuration: actualMinutes } : {}),
        }),
      })
      const userMessages: Record<'less' | 'same' | 'more', string> = {
        less: 'The task took me less time than planned.',
        same: 'The task took me about the right time you scheduled.',
        more: 'The task took me longer than planned.',
      }
      onAppendMessage('user', userMessages[durationAccuracy])
      setSubmitted(true)

      const progressRes = await fetch('/api/progress/today')
      if (!progressRes.ok) return
      const progressJson = await progressRes.json()
      if (!progressJson.success || !progressJson.data) return
      const d = progressJson.data
      let ack = `Got it! That's ${d.completed}/${d.total} tasks done today.`
      if (d.nextTask) {
        const timePart = d.nextTask.startTime
          ? new Date(d.nextTask.startTime).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          : ''
        ack += ` Next up: ${d.nextTask.title}${timePart ? ` at ${timePart}` : ''}.`
      } else if (d.pending > 0) {
        ack += ' Keep it up!'
      } else {
        ack += ' All done for today!'
      }
      onAppendMessage('assistant', ack)
      onTasksChanged?.()
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
