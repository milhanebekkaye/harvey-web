import type { ChecklistItem } from '@/types/task.types'

interface SuccessCriteriaListProps {
  criteria: ChecklistItem[]
  onChange: (criteria: ChecklistItem[]) => void
}

export function SuccessCriteriaList({ criteria, onChange }: SuccessCriteriaListProps) {
  const handleToggle = (criterionId: string) => {
    const nextCriteria = criteria.map((criterion) =>
      criterion.id === criterionId ? { ...criterion, done: !criterion.done } : criterion
    )

    onChange(nextCriteria)
  }

  if (criteria.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No success criteria yet.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {criteria.map((criterion) => (
        <li key={criterion.id}>
          <button
            type="button"
            onClick={() => handleToggle(criterion.id)}
            className="w-full flex items-start gap-2 text-left text-sm text-slate-600"
          >
            <span className="material-symbols-outlined text-[18px] text-slate-300">
              {criterion.done ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <span className={criterion.done ? 'line-through text-slate-400' : ''}>
              {criterion.text}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
