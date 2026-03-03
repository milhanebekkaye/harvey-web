'use client'

interface StickyUnsavedBarProps {
  hasChanges: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

export function StickyUnsavedBar({ hasChanges, saving, onSave, onDiscard }: StickyUnsavedBarProps) {
  if (!hasChanges) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-white border-t border-slate-200 shadow-lg px-6 py-3 flex items-center justify-between">
      <p className="text-sm text-slate-600 font-medium">
        You have unsaved changes
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 bg-[#895af6] text-white text-sm rounded-xl font-medium hover:bg-[#7849d9] disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
