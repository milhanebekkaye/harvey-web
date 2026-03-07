'use client'

import type { LucideIcon } from 'lucide-react'
import { Bug, HelpCircle, Lightbulb, MessageSquare, MoreHorizontal, TrendingUp, X } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'

const LABELS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: 'bug', label: 'Bug', Icon: Bug },
  { value: 'improvement', label: 'Improvement', Icon: TrendingUp },
  { value: 'feature_request', label: 'Feature Request', Icon: Lightbulb },
  { value: 'question', label: 'Question', Icon: HelpCircle },
  { value: 'other', label: 'Other', Icon: MoreHorizontal },
]

export interface FeedbackButtonProps {
  externalOpen?: boolean
  onExternalOpenHandled?: () => void
}

export function FeedbackButton({
  externalOpen,
  onExternalOpenHandled,
}: FeedbackButtonProps = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    },
    []
  )

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsOpen(false)
    }
  }

  useEffect(() => {
    if (externalOpen) {
      setIsOpen(true)
      onExternalOpenHandled?.()
    }
  }, [externalOpen, onExternalOpenHandled])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
      setSubmitError(null)
      if (!isSuccess) {
        setTimeout(() => textareaRef.current?.focus(), 100)
      }
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown, isSuccess])

  const handleSubmit = async () => {
    if (!selectedLabel || !content.trim()) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: selectedLabel, content: content.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) {
          setSubmitError('Please sign in again to send feedback.')
          return
        }
        setSubmitError(data.error ?? 'Something went wrong. Please try again.')
        return
      }
      setIsSuccess(true)
      setTimeout(() => {
        setIsOpen(false)
        setSelectedLabel(null)
        setContent('')
        setIsSuccess(false)
      }, 2000)
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = selectedLabel && content.trim().length > 0 && !isSubmitting

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#8B5CF6] px-4 py-3 text-white shadow-lg hover:bg-[#7849d9] transition-colors"
        aria-label="Share feedback"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-sm font-medium">What would make Harvey better?</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
          onClick={handleBackdropClick}
        >
          <div
            ref={modalRef}
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 id="feedback-modal-title" className="text-xl font-bold text-slate-800">
                  Share your feedback
                </h2>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isSuccess ? (
                <div className="py-8 text-center">
                  <p className="text-lg font-medium text-slate-800">Thanks for your feedback! 🎉</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-500 mb-3">Category</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {LABELS.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSelectedLabel(value)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                          selectedLabel === value
                            ? 'bg-[#8B5CF6] text-white'
                            : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  <label htmlFor="feedback-content" className="block text-sm text-slate-500 mb-2">
                    Your feedback
                  </label>
                  <textarea
                    id="feedback-content"
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Tell us what's on your mind..."
                    rows={5}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-700 placeholder:text-slate-400 focus:border-[#8B5CF6] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/20 resize-y mb-4"
                  />

                  {submitError && (
                    <p className="text-sm text-red-600 mb-4">{submitError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="w-full py-3 px-4 bg-[#8B5CF6] text-white font-semibold rounded-xl hover:bg-[#7849d9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      'Send feedback'
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
