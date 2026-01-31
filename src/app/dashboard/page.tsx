/**
 * Dashboard Page - Timeline & Calendar Views
 * 
 * Main app interface with chat sidebar (40%) and timeline/calendar view (60%).
 * 
 * Timeline View: Tasks organized by TODAY, TOMORROW, THIS WEEK
 * Calendar View: Weekly grid (Mon-Sun) with hourly slots (7am-11pm)
 * 
 * Features:
 * - Glass-morphism chat sidebar with Harvey AI
 * - View toggle between Timeline/Calendar
 * - Task cards with status colors
 * - Inline expansion (Timeline) or modal (Calendar)
 */

'use client'

import { useState } from 'react'

// Fake task data
const TASKS = {
  today: [
    {
      id: 1,
      title: 'Review Project Scope',
      duration: '2h',
      category: 'Management',
      status: 'urgent',
      description: 'Review and finalize the Q1 project scope with stakeholders.',
      checklist: [
        { id: 1, text: 'Review previous quarter results', done: false },
        { id: 2, text: 'Identify key deliverables', done: false },
        { id: 3, text: 'Schedule stakeholder meeting', done: false }
      ],
      harveyTip: 'Start with the high-level goals before diving into specifics. This keeps stakeholders aligned.',
      // Calendar data
      day: 'Wed',
      startTime: 10, // 10am
      endTime: 12 // 12pm
    },
    {
      id: 2,
      title: 'User Interview Analysis',
      duration: '3h',
      category: 'Research',
      status: 'focus',
      description: 'Synthesize findings from the last 5 user interviews to identify key pain points for the new dashboard navigation.',
      checklist: [
        { id: 1, text: 'Review interview recordings', done: true },
        { id: 2, text: 'Map insights to user personas', done: false },
        { id: 3, text: 'Prepare summary presentation', done: false }
      ],
      harveyTip: 'Try grouping insights by "emotional resonance" first—it helps pinpoint the features users care most about.',
      day: 'Wed',
      startTime: 13, // 1pm
      endTime: 16 // 4pm
    },
    {
      id: 3,
      title: 'Morning Standup',
      duration: '30m',
      category: 'Team',
      status: 'completed',
      description: 'Daily team sync meeting.',
      checklist: [],
      harveyTip: '',
      day: 'Wed',
      startTime: 9,
      endTime: 9.5
    }
  ],
  tomorrow: [
    {
      id: 4,
      title: 'Design Review (Rescheduled)',
      duration: '1h',
      category: 'Design',
      status: 'urgent',
      description: 'Review new dashboard mockups with design team.',
      checklist: [],
      harveyTip: '',
      day: 'Thu',
      startTime: 9,
      endTime: 10
    },
    {
      id: 5,
      title: 'Draft Content Deck',
      duration: '1.5h',
      category: 'Marketing',
      status: 'pending',
      description: 'Create content strategy presentation for Q2.',
      checklist: [],
      harveyTip: '',
      day: 'Thu',
      startTime: 14,
      endTime: 15.5
    }
  ],
  thisWeek: [
    { 
      id: 6, 
      title: 'QA Session', 
      time: 'Friday • 2:00 PM', 
      status: 'pending',
      duration: '1h',
      category: 'Team',
      description: 'Quality assurance session for latest sprint.',
      checklist: [],
      harveyTip: '',
      day: 'Fri',
      startTime: 14,
      endTime: 15
    },
    { 
      id: 7, 
      title: 'Sprint Planning', 
      time: 'Friday • 4:30 PM', 
      status: 'pending',
      duration: '2h',
      category: 'Team',
      description: 'Plan next sprint with development team.',
      checklist: [],
      harveyTip: '',
      day: 'Fri',
      startTime: 16.5,
      endTime: 18.5
    }
  ]
}

// Combine all tasks for calendar view
const ALL_TASKS = [
  ...TASKS.today,
  ...TASKS.tomorrow,
  ...TASKS.thisWeek
]

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7) // 7am to 11pm
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function DashboardPage() {
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(2)
  const [view, setView] = useState<'timeline' | 'calendar'>('timeline')
  const [modalTask, setModalTask] = useState<any>(null)

  const toggleTaskExpansion = (taskId: number) => {
    setExpandedTaskId(expandedTaskId === taskId ? null : taskId)
  }

  const openModal = (task: any) => {
    setModalTask(task)
  }

  const closeModal = () => {
    setModalTask(null)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'status-border-green'
      case 'urgent': return 'status-border-red'
      case 'focus': return 'status-border-purple'
      default: return 'status-border-grey'
    }
  }

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'urgent': return 'bg-red-500'
      case 'focus': return 'bg-purple-600'
      default: return 'bg-slate-400'
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Management': return 'bg-red-100 text-red-600'
      case 'Research': return 'bg-primary/10 text-primary'
      case 'Team': return 'bg-green-100 text-green-600'
      case 'Design': return 'bg-purple-100 text-purple-600'
      case 'Marketing': return 'bg-slate-100 text-slate-500'
      default: return 'bg-slate-100 text-slate-500'
    }
  }

  const formatHour = (hour: number) => {
    if (hour === 12) return '12 PM'
    if (hour === 0) return '12 AM'
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`
  }

  // Calculate task position in calendar grid
  const getTaskPosition = (startTime: number, endTime: number) => {
    const startHour = Math.floor(startTime)
    const startMinutes = (startTime - startHour) * 60
    const duration = endTime - startTime
    
    const top = ((startHour - 7) * 60 + startMinutes) // pixels from top
    const height = duration * 60 // 1 hour = 60px
    
    return { top, height }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAF9F6]">
      
      {/* LEFT SIDEBAR - Chat (40%) - Same for both views */}
      <aside className="w-[40%] flex flex-col glass-sidebar z-10 relative">
        
        {/* Harvey Header */}
        <div className="p-6 flex items-center gap-4">
          <div className="size-12 rounded-full bg-[#895af6] flex items-center justify-center text-white shadow-lg overflow-hidden">
            <span className="text-2xl">🦞</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Harvey</h1>
            <p className="text-sm text-[#62499c] font-medium opacity-80">AI Project Coach</p>
          </div>
          <div className="ml-auto">
            <button className="bg-primary/10 hover:bg-primary/20 text-[#895af6] p-2 rounded-lg transition-colors">
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </div>

        {/* Constraint Pill */}
        <div className="px-6 pb-4">
          <div className="inline-flex items-center gap-2 bg-[#895af6] text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-md">
            <span className="material-symbols-outlined text-sm">schedule</span>
            9-5 Work Hours Active
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          
          <div className="flex flex-col gap-2 max-w-[85%]">
            <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-white/50">
              <p className="text-sm leading-relaxed">
                Good morning! I've analyzed your project roadmap. Today looks a bit heavy on meetings. Should we reschedule the "Design Review" to tomorrow morning to protect your focus time?
              </p>
            </div>
            <span className="text-[10px] text-slate-500 ml-1 uppercase font-bold tracking-wider">
              Harvey • 8:45 AM
            </span>
          </div>

          <div className="flex flex-col gap-2 max-w-[85%] self-end items-end">
            <div className="bg-[#895af6] text-white p-4 rounded-2xl rounded-tr-none shadow-md">
              <p className="text-sm leading-relaxed">
                Yes, let's move the Design Review. Can you also tag it as "Urgent" for tomorrow?
              </p>
            </div>
            <span className="text-[10px] text-slate-500 mr-1 uppercase font-bold tracking-wider">
              You • 8:47 AM
            </span>
          </div>

          <div className="flex flex-col gap-2 max-w-[85%]">
            <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-white/50">
              <p className="text-sm leading-relaxed">
                Done. I've updated the timeline. I also noticed you have a 2-hour gap after lunch today—perfect for the "Scope Analysis" task.
              </p>
            </div>
            <span className="text-[10px] text-slate-500 ml-1 uppercase font-bold tracking-wider">
              Harvey • 8:48 AM
            </span>
          </div>

        </div>

        {/* Message Input */}
        <div className="p-6 border-t border-black/5 bg-white/20">
          <div className="relative flex items-center">
            <input 
              type="text"
              placeholder="Ask Harvey anything..."
              className="w-full bg-white border-none rounded-xl py-4 pl-4 pr-12 text-sm shadow-inner focus:ring-2 focus:ring-primary/50 focus:outline-none"
            />
            <button className="absolute right-2 bg-[#895af6] text-white p-2 rounded-lg shadow-lg hover:scale-105 transition-transform">
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>

      </aside>

      {/* RIGHT AREA - Timeline OR Calendar (60%) */}
      <main className="w-[60%] h-full overflow-y-auto flex flex-col">
        
        {/* Controls Bar */}
        <div className="sticky top-0 z-20 bg-[#FAF9F6]/95 backdrop-blur-md px-8 py-6 flex items-center justify-between border-b border-black/5">
          
          {/* View Toggle */}
          <div className="flex h-11 w-64 items-center justify-center rounded-xl bg-slate-200/50 p-1">
            <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-bold leading-normal transition-all ${view === 'timeline' ? 'bg-white shadow-sm text-[#895af6]' : 'text-slate-600'}`}>
              <span className="truncate">Timeline</span>
              <input 
                type="radio" 
                name="view-toggle" 
                value="timeline"
                checked={view === 'timeline'}
                onChange={() => setView('timeline')}
                className="invisible w-0"
              />
            </label>
            <label className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-bold leading-normal transition-all ${view === 'calendar' ? 'bg-white shadow-sm text-[#895af6]' : 'text-slate-600'}`}>
              <span className="truncate">Calendar</span>
              <input 
                type="radio" 
                name="view-toggle" 
                value="calendar"
                checked={view === 'calendar'}
                onChange={() => setView('calendar')}
                className="invisible w-0"
              />
            </label>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-sm ml-6">
            <div className="relative flex items-center w-full">
              <span className="material-symbols-outlined absolute left-3 text-slate-400">search</span>
              <input 
                type="text"
                placeholder="Search tasks..."
                className="w-full bg-slate-200/50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
              />
            </div>
          </div>

        </div>

        {/* TIMELINE VIEW */}
        {view === 'timeline' && (
          <div className="px-8 pb-12">
          
            {/* TODAY Section */}
            <section>
              <div className="flex items-center gap-3 py-6">
                <h2 className="text-sm font-black tracking-[0.15em] text-slate-400 uppercase">Today</h2>
                <div className="h-[1px] flex-1 bg-slate-200"></div>
              </div>

              <div className="space-y-4">
                {TASKS.today.map((task) => (
                  <div key={task.id}>
                    {expandedTaskId === task.id ? (
                      // EXPANDED CARD
                      <div className="bg-white rounded-xl shadow-lg border border-primary/20 status-border-purple overflow-hidden">
                        <div className="p-5">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="font-bold text-lg text-slate-800">{task.title}</h3>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-sm">timer</span>
                                  {task.duration}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getCategoryColor(task.category)}`}>
                                  {task.category}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-[#895af6] text-white rounded-full text-[10px] font-bold uppercase tracking-widest">
                                Focus Mode
                              </span>
                              <button 
                                onClick={() => toggleTaskExpansion(task.id)}
                                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                <span className="material-symbols-outlined">close</span>
                              </button>
                            </div>
                          </div>

                          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                            {task.description}
                          </p>

                          <div className="space-y-3 mb-6">
                            {task.checklist.map((item) => (
                              <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                                <input 
                                  type="checkbox" 
                                  checked={item.done}
                                  onChange={() => {}}
                                  className="rounded text-[#895af6] focus:ring-[#895af6] border-slate-300"
                                />
                                <span className={`text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                  {item.text}
                                </span>
                              </label>
                            ))}
                          </div>

                          {task.harveyTip && (
                            <div className="bg-primary/5 border-l-2 border-[#895af6] p-4 rounded-r-lg flex gap-3 items-start mb-6">
                              <span className="material-symbols-outlined text-[#895af6] text-lg">lightbulb</span>
                              <div>
                                <h4 className="text-xs font-bold text-[#895af6] uppercase tracking-wider mb-1">
                                  Harvey's Tip
                                </h4>
                                <p className="text-xs text-slate-600 italic leading-snug">
                                  "{task.harveyTip}"
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-3">
                            <button className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2.5 px-4 rounded-lg font-bold text-sm transition-colors shadow-sm">
                              ✓ Complete
                            </button>
                            <button className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 px-4 rounded-lg font-bold text-sm transition-colors shadow-sm">
                              ⏭ Skip
                            </button>
                            <button className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-sm transition-colors">
                              Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // COLLAPSED CARD
                      <div 
                        onClick={() => toggleTaskExpansion(task.id)}
                        className={`bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer ${getStatusColor(task.status)} ${task.status === 'completed' ? 'bg-white/60 opacity-80' : ''} flex items-center justify-between group`}
                      >
                        <div className="flex flex-col gap-1">
                          <h3 className={`font-bold ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                            {task.title}
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs flex items-center gap-1 ${task.status === 'completed' ? 'text-slate-400' : 'text-slate-500'}`}>
                              <span className="material-symbols-outlined text-sm">timer</span>
                              {task.duration}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getCategoryColor(task.category)}`}>
                              {task.category}
                            </span>
                          </div>
                        </div>
                        {task.status === 'completed' ? (
                          <span className="material-symbols-outlined text-green-500">check_circle</span>
                        ) : (
                          <button className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-[#895af6] transition-all">
                            <span className="material-symbols-outlined">drag_indicator</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* TOMORROW Section */}
            <section>
              <div className="flex items-center gap-3 py-6 mt-4">
                <h2 className="text-sm font-black tracking-[0.15em] text-slate-400 uppercase">Tomorrow</h2>
                <div className="h-[1px] flex-1 bg-slate-200"></div>
              </div>

              <div className="space-y-4">
                {TASKS.tomorrow.map((task) => (
                  <div 
                    key={task.id}
                    className={`bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer ${getStatusColor(task.status)} flex items-center justify-between`}
                  >
                    <div className="flex flex-col gap-1">
                      <h3 className="font-bold text-slate-800">{task.title}</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">timer</span>
                          {task.duration}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getCategoryColor(task.category)}`}>
                          {task.category}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* THIS WEEK Section */}
            <section>
              <div className="flex items-center gap-3 py-6 mt-4">
                <h2 className="text-sm font-black tracking-[0.15em] text-slate-400 uppercase">This Week</h2>
                <div className="h-[1px] flex-1 bg-slate-200"></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {TASKS.thisWeek.map((task) => (
                  <div 
                    key={task.id}
                    className={`bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer ${getStatusColor(task.status)}`}
                  >
                    <h3 className="font-bold text-slate-800 text-sm">{task.title}</h3>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">
                      {task.time}
                    </p>
                  </div>
                ))}
              </div>
            </section>

          </div>
        )}

        {/* CALENDAR VIEW */}
        {view === 'calendar' && (
          <div className="px-8 pb-12">
            
            {/* Week Header */}
            <div className="flex items-center justify-between py-6">
              <h2 className="text-lg font-bold text-slate-800">
                Week of Jan 27 - Feb 2, 2026
              </h2>
              <div className="flex items-center gap-2">
                <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <button className="px-4 py-2 bg-[#895af6] text-white rounded-lg text-sm font-bold hover:bg-[#7849d9] transition-colors">
                  Today
                </button>
                <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              
              {/* Day Headers */}
              <div className="grid grid-cols-8 border-b border-slate-200">
                <div className="p-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Time
                </div>
                {DAYS.map((day) => (
                  <div 
                    key={day}
                    className={`p-3 text-center text-xs font-bold uppercase tracking-wider ${day === 'Wed' ? 'bg-[#895af6]/10 text-[#895af6]' : 'text-slate-400'}`}
                  >
                    {day}
                    <div className="text-lg font-bold mt-1">
                      {day === 'Mon' ? '27' : day === 'Tue' ? '28' : day === 'Wed' ? '29' : day === 'Thu' ? '30' : day === 'Fri' ? '31' : day === 'Sat' ? '1' : '2'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Time Grid */}
              <div className="relative">
                {HOURS.map((hour) => (
                  <div key={hour} className="grid grid-cols-8 border-b border-slate-100">
                    {/* Hour Label */}
                    <div className="p-3 text-right text-xs text-slate-400 font-medium border-r border-slate-200">
                      {formatHour(hour)}
                    </div>
                    
                    {/* Day Columns */}
                    {DAYS.map((day) => (
                      <div 
                        key={`${day}-${hour}`}
                        className="relative border-r border-slate-100 hover:bg-slate-50 transition-colors"
                        style={{ height: '60px' }}
                      >
                        {/* Tasks for this day/hour will be positioned absolutely */}
                      </div>
                    ))}
                  </div>
                ))}

                {/* Task Blocks - Positioned Absolutely */}
                {ALL_TASKS.map((task) => {
                  const dayIndex = DAYS.indexOf(task.day)
                  if (dayIndex === -1) return null
                  
                  const { top, height } = getTaskPosition(task.startTime, task.endTime)
                  const left = `${((dayIndex + 1) / 8) * 100}%` // +1 because first column is time labels
                  const width = `${(1 / 8) * 100}%`
                  
                  return (
                    <div
                      key={task.id}
                      onClick={() => openModal(task)}
                      className={`absolute ${getStatusBgColor(task.status)} text-white px-2 py-1 rounded cursor-pointer hover:opacity-90 transition-opacity overflow-hidden`}
                      style={{
                        top: `${top}px`,
                        left: left,
                        width: width,
                        height: `${height}px`,
                        marginLeft: '2px',
                        marginRight: '2px'
                      }}
                    >
                      <div className="text-xs font-bold truncate">{task.title}</div>
                      <div className="text-[10px] opacity-90">{task.duration}</div>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* MODAL - Task Detail (Calendar View) */}
      {modalTask && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-8"
          onClick={closeModal}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              
              {/* Modal Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">{modalTask.title}</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-base">timer</span>
                      {modalTask.duration}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getCategoryColor(modalTask.category)}`}>
                      {modalTask.category}
                    </span>
                    <span className={`px-3 py-1 ${getStatusBgColor(modalTask.status)} text-white rounded-full text-xs font-bold uppercase tracking-wider`}>
                      {modalTask.status}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={closeModal}
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-2xl">close</span>
                </button>
              </div>

              {/* Description */}
              {modalTask.description && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Objective</h3>
                  <p className="text-slate-600 leading-relaxed">{modalTask.description}</p>
                </div>
              )}

              {/* Checklist */}
              {modalTask.checklist && modalTask.checklist.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Success Criteria</h3>
                  <div className="space-y-3">
                    {modalTask.checklist.map((item: any) => (
                      <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={item.done}
                          onChange={() => {}}
                          className="rounded text-[#895af6] focus:ring-[#895af6] border-slate-300"
                        />
                        <span className={`text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {item.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Harvey's Tip */}
              {modalTask.harveyTip && (
                <div className="bg-primary/5 border-l-4 border-[#895af6] p-4 rounded-r-lg flex gap-3 items-start mb-6">
                  <span className="material-symbols-outlined text-[#895af6] text-xl">lightbulb</span>
                  <div>
                    <h4 className="text-xs font-bold text-[#895af6] uppercase tracking-wider mb-1">
                      Harvey's Coaching Tip
                    </h4>
                    <p className="text-sm text-slate-600 italic leading-relaxed">
                      "{modalTask.harveyTip}"
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                <button className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 px-6 rounded-xl font-bold transition-colors shadow-sm">
                  ✓ Mark Complete
                </button>
                <button className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 px-6 rounded-xl font-bold transition-colors shadow-sm">
                  ⏭ Skip Task
                </button>
                <button className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-colors">
                  Edit
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  )
}