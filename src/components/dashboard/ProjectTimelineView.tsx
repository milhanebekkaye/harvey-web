/**
 * Project Timeline View Component
 *
 * Vertical timeline visualization of project tasks.
 * Shows completed, active, and upcoming tasks on a rail.
 *
 * Step 2: Hardcoded UI shell with static data.
 */

'use client'

// Hardcoded data for Step 2
const HARDCODED_TASKS = {
  completed: [
    {
      id: 'task-1',
      title: 'Initial Client Briefing',
      completedDate: 'Oct 12',
    },
  ],
  active: {
    id: 'task-2',
    title: 'Research Competitors',
    dueDate: 'Oct 25',
    label: 'Research',
    icon: 'search',
    description:
      'Identify and analyze top 3-5 competitors in the fintech space. Focus on their pricing tiers, key feature differentiators, and go-to-market strategies. Compile findings into a comparison matrix.',
    successCriteria: [
      'List of top 5 competitors finalized',
      'Pricing model analysis complete',
      'Comparison matrix drafted',
    ],
    dependencies: {
      dependsOn: ['Initial Client Briefing'],
      dependentTasks: ['Internal Review', 'Client Presentation'],
    },
    harveyTip:
      "Focus on Stripe's new Connect architecture for the enterprise matrix; it's a major differentiator for platform-based clients.",
  },
  upcoming: [
    {
      id: 'task-3',
      title: 'Internal Review',
      scheduledDate: 'Oct 26',
    },
    {
      id: 'task-4',
      title: 'Client Presentation',
      scheduledDate: 'Oct 30',
    },
  ],
}

export function ProjectTimelineView() {
  const { completed, active, upcoming } = HARDCODED_TASKS

  return (
    <section className="relative bg-[#FAF9F6] px-8 pb-12">
      {/* Background glow */}
      <div className="absolute -top-20 right-0 w-[500px] h-[500px] bg-[#895af6]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-5xl mx-auto pt-8">
        {/* Timeline rail + cards */}
        <div className="relative pl-14 pb-20">
          <div className="absolute left-5 top-5 bottom-6 w-[2px] bg-gradient-to-b from-emerald-200 via-[#895af6]/40 to-slate-300" />

          {/* Completed Tasks */}
          {completed.map((task) => (
            <div key={task.id} className="relative group mb-6">
              {/* Completed marker */}
              <div className="absolute left-[-36px] top-6 -translate-x-1/2 z-10">
                <div className="h-8 w-8 rounded-full bg-white border-2 border-emerald-100 shadow-sm flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-[12px] font-bold leading-none">
                      check
                    </span>
                  </div>
                </div>
              </div>
              {/* Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 opacity-70 hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-slate-900 font-medium line-through decoration-slate-400">
                      {task.title}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1">Completed on {task.completedDate}</p>
                  </div>
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded uppercase tracking-wide">
                    Done
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Active Task */}
          <div className="relative mb-6">
            {/* Active marker */}
            <div className="absolute left-[-36px] top-8 -translate-x-1/2 z-10">
              <div className="h-8 w-8 rounded-full bg-white border-2 border-[#895af6]/30 shadow-[0_0_0_6px_rgba(137,90,246,0.12)] flex items-center justify-center">
                <div className="h-3.5 w-3.5 rounded-full bg-[#895af6]" />
              </div>
            </div>
            {/* Expanded Card */}
            <div className="bg-white rounded-2xl shadow-xl shadow-[#895af6]/5 border-2 border-[#895af6]/20 overflow-hidden ring-1 ring-[#895af6]/10 shadow-2xl shadow-[#895af6]/10 border-l-[6px] border-l-[#895af6]">
              {/* Card Header */}
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                <div className="flex gap-4">
                  <div className="bg-[#895af6]/10 p-3 rounded-lg text-[#895af6] h-fit">
                    <span className="material-symbols-outlined text-2xl">{active.icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-bold text-slate-900">{active.title}</h3>
                      <span className="px-2.5 py-1 bg-[#895af6]/10 text-[#895af6] text-xs font-bold rounded-full uppercase tracking-wide">
                        Active
                      </span>
                      <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full uppercase tracking-wide">
                        {active.label}
                      </span>
                    </div>
                    <p className="text-slate-500 text-sm mt-1">
                      Due {active.dueDate} • Assigned to{' '}
                      <span className="font-medium text-slate-700">You</span>
                    </p>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-[#895af6] transition-colors">
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>
              </div>

              {/* Card Content */}
              <div className="p-6 flex flex-col gap-6">
                {/* Description */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Description
                  </h4>
                  <p className="text-slate-700 text-sm leading-relaxed">{active.description}</p>
                </div>

                {/* Two Column Grid */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Success Criteria */}
                  <div className="col-span-2 sm:col-span-1">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Success Criteria
                    </h4>
                    <ul className="space-y-2">
                      {active.successCriteria.map((criterion, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-sm text-slate-600"
                        >
                          <span className="material-symbols-outlined text-slate-300 text-[18px]">
                            radio_button_unchecked
                          </span>
                          <span>{criterion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Dependencies */}
                  <div className="col-span-2 sm:col-span-1">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Dependencies
                    </h4>
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          This Task Depends On
                        </p>
                        <ul className="space-y-1.5">
                          {active.dependencies.dependsOn.map((task, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                              <span className="material-symbols-outlined text-[15px] text-slate-400">
                                arrow_circle_up
                              </span>
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          Tasks Depending On This
                        </p>
                        <ul className="space-y-1.5">
                          {active.dependencies.dependentTasks.map((task, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                              <span className="material-symbols-outlined text-[15px] text-slate-400">
                                arrow_circle_down
                              </span>
                              <span>{task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Harvey's Tip */}
                <div className="bg-slate-50 p-4 rounded-xl flex gap-3 mb-4">
                  <div className="size-8 rounded-full bg-gradient-to-tr from-[#895af6] to-purple-400 flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5">
                    H
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-[#895af6] uppercase tracking-wider mb-1">
                        Harvey&apos;s Tip
                      </h5>
                      <button className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5 transition-colors">
                        <span className="material-symbols-outlined text-[12px]">refresh</span>
                        Refresh
                      </button>
                    </div>
                    <p className="text-slate-600 text-xs leading-relaxed">{active.harveyTip}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                    View Full Details
                  </button>
                  <button className="px-4 py-2 bg-[#895af6]/10 text-[#895af6] hover:bg-[#895af6]/20 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">smart_toy</span>
                    Ask Harvey
                  </button>
                  <button className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors">
                    Skip
                  </button>
                  <button className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg shadow-sm hover:opacity-90 transition-opacity">
                    Mark as Complete
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Tasks */}
          {upcoming.map((task) => (
            <div key={task.id} className="relative group opacity-60 hover:opacity-85 transition-opacity mb-6">
              {/* Upcoming marker */}
              <div className="absolute left-[-36px] top-6 -translate-x-1/2 z-10">
                <div className="h-7 w-7 rounded-full bg-white border-2 border-slate-200 shadow-sm flex items-center justify-center">
                  <div className="h-2.5 w-2.5 bg-slate-400 rounded-full" />
                </div>
              </div>
              {/* Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-slate-900 font-medium">{task.title}</h3>
                    <p className="text-slate-500 text-sm mt-1">Scheduled for {task.scheduledDate}</p>
                  </div>
                  <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-semibold rounded uppercase tracking-wide">
                    Upcoming
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
