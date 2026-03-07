'use client'

import { Pencil, X } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { formatDateForDisplay } from '@/lib/utils/date-utils'

export type EditableFieldType = 'text' | 'textarea' | 'date' | 'select' | 'tags' | 'number'

export interface SelectOption {
  value: string
  label: string
}

export interface EditableFieldProps {
  label: string
  value: string | number | string[] | null
  type: EditableFieldType
  placeholder?: string
  options?: SelectOption[]
  maxLength?: number
  min?: number
  max?: number
  step?: number
  onChange: (value: string | number | string[] | null) => void
  /** For select/date: allow clearing (null) */
  nullable?: boolean
  /** Max tags for type="tags" */
  maxTags?: number
  /** Optional timezone for date display (e.g. "Europe/Paris") */
  timezone?: string
}

const emptyDisplay = (placeholder: string) => (
  <span className="italic text-slate-400">{placeholder}</span>
)

export function EditableField({
  label,
  value,
  type,
  placeholder = `Add ${label.toLowerCase()}...`,
  options = [],
  maxLength,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  nullable = false,
  maxTags = 10,
  timezone,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(
    type === 'tags' ? '' : type === 'date' && value ? (value as string).slice(0, 10) : String(value ?? '')
  )
  const [tagList, setTagList] = useState<string[]>(
    type === 'tags' ? (Array.isArray(value) ? value : []) : []
  )
  const [tagInput, setTagInput] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  useEffect(() => {
    if (type === 'tags') {
      if (isEditing) setTagList(Array.isArray(value) ? value : [])
      else setTagList(Array.isArray(value) ? value : [])
    } else if (isEditing) {
      if (type === 'date' && value) setEditValue((value as string).slice(0, 10))
      else setEditValue(String(value ?? ''))
    }
  }, [isEditing, type, value])

  const displayValue =
    type === 'date' && value
      ? formatDateForDisplay(value as string, timezone)
      : type === 'tags'
        ? Array.isArray(value) && value.length > 0
          ? value.join(', ')
          : null
        : type === 'number'
          ? value != null && value !== ''
            ? String(value)
            : null
          : (value as string) || null

  const handleBlur = () => {
    if (type === 'tags') return
    setIsEditing(false)
    if (type === 'text' || type === 'textarea') {
      const v = editValue.trim()
      if (v !== String(value ?? '')) {
        onChange(maxLength && v.length > maxLength ? v.slice(0, maxLength) : v || null)
      }
    } else if (type === 'number') {
      const n = parseInt(editValue, 10)
      if (!Number.isNaN(n) && n >= min && n <= max && n !== (value as number)) {
        onChange(n)
      }
    } else if (type === 'date') {
      if (editValue) {
        const d = new Date(editValue + 'T12:00:00.000Z')
        if (!Number.isNaN(d.getTime())) onChange(d.toISOString().slice(0, 10))
      } else if (nullable) {
        onChange(null)
      }
    } else if (type === 'select') {
      const v = editValue || (nullable ? null : '')
      if (v !== value) onChange(v)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (type === 'text' || type === 'number')) {
      e.preventDefault()
      ;(inputRef.current as HTMLInputElement)?.blur()
    }
  }

  const addTag = (raw: string) => {
    const t = raw.trim()
    if (!t || tagList.length >= maxTags) return
    const key = t.toLowerCase()
    if (tagList.some((x) => x.toLowerCase() === key)) return
    const next = [...tagList, t].slice(0, maxTags)
    setTagList(next)
    setTagInput('')
    onChange(next)
  }

  const removeTag = (index: number) => {
    const next = tagList.filter((_, i) => i !== index)
    setTagList(next)
    onChange(next.length ? next : null)
  }

  const handleTagsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  const isEmpty =
    value === null ||
    value === '' ||
    (type === 'tags' && Array.isArray(value) && value.length === 0)

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-600">{label}</label>
      {!isEditing ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsEditing(true)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsEditing(true)}
          className={cn(
            'min-h-[40px] rounded-lg border border-transparent px-3 py-2 text-sm text-slate-800',
            'hover:bg-[#895af6]/5 hover:border-slate-200 flex items-center justify-between gap-2'
          )}
        >
          {type === 'tags' ? (
            <div className="flex flex-wrap gap-1.5">
              {tagList.length > 0
                ? tagList.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full bg-[#895af6]/15 px-2.5 py-0.5 text-xs font-medium text-[#62499c]"
                    >
                      {t}
                    </span>
                  ))
                : emptyDisplay(placeholder)}
            </div>
          ) : isEmpty ? (
            emptyDisplay(placeholder)
          ) : (
            <span className="break-words">{displayValue}</span>
          )}
          <Pencil className="w-5 h-5 text-slate-400 shrink-0" />
        </div>
      ) : (
        <div className="space-y-1">
          {type === 'text' && (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              maxLength={maxLength}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#895af6] focus:outline-none focus:ring-2 focus:ring-[#895af6]/20"
            />
          )}
          {type === 'textarea' && (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              maxLength={maxLength}
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#895af6] focus:outline-none focus:ring-2 focus:ring-[#895af6]/20 resize-y"
            />
          )}
          {type === 'date' && (
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="date"
                value={editValue || ''}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleBlur}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#895af6] focus:outline-none focus:ring-2 focus:ring-[#895af6]/20"
              />
              {nullable && (
                <button
                  type="button"
                  onClick={() => {
                    setEditValue('')
                    onChange(null)
                    setIsEditing(false)
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  No deadline
                </button>
              )}
            </div>
          )}
          {type === 'select' && (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#895af6] focus:outline-none focus:ring-2 focus:ring-[#895af6]/20"
            >
              {nullable && <option value="">—</option>}
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {type === 'number' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const current = parseInt(editValue, 10)
                  const n = Number.isNaN(current) ? min : Math.max(min, current - step)
                  setEditValue(String(n))
                  onChange(n)
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                −
              </button>
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="number"
                min={min}
                max={max}
                step={step}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm text-center focus:border-[#895af6] focus:outline-none focus:ring-2 focus:ring-[#895af6]/20"
              />
              <button
                type="button"
                onClick={() => {
                  const current = parseInt(editValue, 10)
                  const n = Number.isNaN(current) ? min : Math.min(max, current + step)
                  setEditValue(String(n))
                  onChange(n)
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                +
              </button>
            </div>
          )}
          {type === 'tags' && (
            <div className="rounded-lg border border-slate-200 px-3 py-2 focus-within:border-[#895af6] focus-within:ring-2 focus-within:ring-[#895af6]/20">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tagList.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-[#895af6]/15 px-2.5 py-0.5 text-xs font-medium text-[#62499c]"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(i)}
                      className="hover:bg-[#895af6]/30 rounded-full p-0.5"
                      aria-label={`Remove ${t}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
              {tagList.length < maxTags && (
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagsKeyDown}
                  onBlur={() => tagInput.trim() && addTag(tagInput)}
                  placeholder="Type and press Enter to add"
                  className="w-full text-sm border-0 p-0 focus:outline-none focus:ring-0 bg-transparent"
                />
              )}
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="mt-2 text-xs text-[#62499c] hover:text-[#895af6] font-medium"
              >
                Done
              </button>
            </div>
          )}
          {maxLength && (type === 'text' || type === 'textarea') && (
            <p className="text-xs text-slate-500">
              {(type === 'textarea' ? editValue : String(editValue)).length} / {maxLength}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
