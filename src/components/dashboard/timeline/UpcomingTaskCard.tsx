import { formatDateForDisplay } from '@/lib/utils/date-utils'

interface UpcomingTaskCardProps {
  title: string
  scheduledDate: string | Date
  timezone?: string
}

function formatScheduledDate(scheduledDate: string | Date, timezone?: string): string {
  const parsed = new Date(scheduledDate)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return formatDateForDisplay(parsed, timezone)
    .replace(/,?\s*\d{4}$/, '')
    .trim()
}

export function UpcomingTaskCard({ title, scheduledDate, timezone }: UpcomingTaskCardProps) {
  const formattedDate = formatScheduledDate(scheduledDate, timezone)

  return (
    <div className="relative group opacity-60 hover:opacity-85 transition-opacity mb-6">
      <div className="absolute left-[-36px] top-6 -translate-x-1/2 z-10">
        <div className="h-7 w-7 rounded-full bg-white border-2 border-slate-200 shadow-sm flex items-center justify-center">
          <div className="h-2.5 w-2.5 bg-slate-400 rounded-full" />
        </div>
      </div>
      <div className="bg-white p-5 rounded-xl border border-slate-200">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-slate-900 font-medium">{title}</h3>
            <p className="text-slate-500 text-sm mt-1">Scheduled for {formattedDate}</p>
          </div>
          <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-semibold rounded uppercase tracking-wide">
            Upcoming
          </span>
        </div>
      </div>
    </div>
  )
}
