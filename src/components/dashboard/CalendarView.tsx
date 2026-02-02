/**
 * Calendar View Component
 *
 * Placeholder component for calendar view.
 * Will display tasks in a weekly calendar grid format.
 *
 * Currently shows "Coming Soon" message.
 * Calendar implementation will be added in a future iteration.
 */

'use client'

/**
 * CalendarView Component
 *
 * Placeholder for the calendar view of tasks.
 * Shows a "Coming Soon" message for now.
 *
 * @example
 * <CalendarView />
 */
export function CalendarView() {
  return (
    <div className="px-8 pb-12">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        {/* Calendar Icon */}
        <div className="w-20 h-20 bg-[#895af6]/10 rounded-2xl flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-4xl text-[#895af6]">
            calendar_month
          </span>
        </div>

        {/* Coming Soon Badge */}
        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold mb-4">
          <span className="material-symbols-outlined text-sm">construction</span>
          Coming Soon
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-slate-800 mb-2">
          Calendar View
        </h3>

        {/* Description */}
        <p className="text-sm text-slate-500 max-w-md mb-6">
          See your tasks in a weekly calendar format with hourly time slots.
          We&apos;re working on bringing you a beautiful calendar experience.
        </p>

        {/* Redirect Suggestion */}
        <div className="flex items-center gap-2 text-[#895af6] text-sm font-medium">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Use Timeline view for now
        </div>
      </div>
    </div>
  )
}
