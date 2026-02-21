/**
 * TaskChatView — Sidebar content when a task chat is active.
 *
 * Header (Harvey AI + purple pill with task name + "Task Chat") is in ChatSidebar.
 * UI only (Step 1): One hardcoded Harvey message; input is disabled with tooltip.
 */

'use client'

interface TaskChatViewProps {
  taskTitle: string
  taskLabel: string
  onBackToProject: () => void
}

export function TaskChatView({
  taskTitle: _taskTitle,
  taskLabel: _taskLabel,
  onBackToProject: _onBackToProject,
}: TaskChatViewProps) {
  return (
    <>
      {/* Chat area: single hardcoded message */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        <div className="flex flex-col gap-2 max-w-[85%]">
          <div className="p-4 rounded-2xl bg-white rounded-tl-none border border-white/50 shadow-sm">
            <p className="text-sm leading-relaxed">
              I&apos;m ready to help you with this task. What would you like to
              work through?
            </p>
          </div>
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider ml-1">
            Harvey
          </span>
        </div>
      </div>

      {/* Disabled input with tooltip */}
      <div className="p-6 border-t border-black/5 bg-white/20">
        <div
          className="relative flex items-end gap-2"
          title="Task chat coming soon"
        >
          <textarea
            readOnly
            disabled
            placeholder="Ask Harvey about this task..."
            rows={1}
            className="flex-1 bg-white/50 border border-white/30 rounded-xl py-3 pl-4 pr-3 text-sm shadow-inner resize-none opacity-60 cursor-not-allowed"
            style={{ maxHeight: '120px' }}
          />
          <button
            type="button"
            disabled
            className="bg-slate-200 text-slate-400 p-3 rounded-xl cursor-not-allowed shrink-0"
            title="Task chat coming soon"
          >
            <span className="material-symbols-outlined text-lg">send</span>
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 px-1">
          Task chat coming soon
        </p>
      </div>
    </>
  )
}
