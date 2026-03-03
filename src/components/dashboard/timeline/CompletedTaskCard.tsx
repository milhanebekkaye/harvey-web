import { formatDateForDisplay } from '@/lib/utils/date-utils'

interface CompletedTaskCardProps {
  title: string
  completedAt: string | Date
  timezone?: string
}

function formatCompletedDate(completedAt: string | Date, timezone?: string): string {
  const parsed = new Date(completedAt)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  const full = formatDateForDisplay(parsed, timezone)
  return full.replace(/,?\s*\d{4}$/, '').trim()
}

export function CompletedTaskCard({ title, completedAt, timezone }: CompletedTaskCardProps) {
  const completedDate = formatCompletedDate(completedAt, timezone)

  return (
    <div className="relative group mb-6">
      <div className="absolute left-[-36px] top-6 -translate-x-1/2 z-10">
        <div className="h-8 w-8 rounded-full bg-white border-2 border-emerald-100 shadow-sm flex items-center justify-center">
          <div className="h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
            <span className="material-symbols-outlined text-[12px] font-bold leading-none">
              check
            </span>
          </div>
        </div>
      </div>
      <div className="bg-white p-5 rounded-xl border border-slate-200 opacity-70 hover:opacity-100 transition-opacity">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-slate-900 font-medium line-through decoration-slate-400">
              {title}
            </h3>
            <p className="text-slate-500 text-sm mt-1">Completed on {completedDate}</p>
          </div>
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded uppercase tracking-wide">
            Done
          </span>
        </div>
      </div>
    </div>
  )
}
