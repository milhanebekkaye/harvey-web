/**
 * ConversationNavPanel — Overlay panel for switching between project and task chats.
 *
 * UI only (Step 1): No API or DB. State is managed by parent (dashboard).
 * Renders: Pinned "Project Chat", TASKS list from openTaskChats, and static user row.
 * No History / "Previous 7 Days" section. Step 2 will wire real conversation data.
 */

'use client'

/**
 * Category dot hex colors for nav task items (spec: Coding, Research, Design, etc.)
 */
const CATEGORY_DOT_COLORS: Record<string, string> = {
  Coding: '#3B82F6',
  Research: '#22C55E',
  Design: '#8B5CF6',
  Marketing: '#F97316',
  Personal: '#6B7280',
  Planning: '#EC4899',
  Communication: '#EAB308',
}

export interface OpenTaskChat {
  id: string
  title: string
  label: string
  /** Set when task discussion exists (from POST create or list); internal only, not shown in UI. */
  discussionId?: string
  /** When we just created the discussion via POST, pass messages so the opening message shows immediately. */
  initialMessages?: Array<{ role: string; content: string; timestamp: string }>
}

interface ConversationNavPanelProps {
  /** List of open task chats; panel displays these under TASKS. */
  openTaskChats: OpenTaskChat[]
  /** Current active conversation: 'project' or a task id. */
  activeConversation: 'project' | string
  /** Called when user selects a conversation; then parent should close panel and switch content. */
  onSelectConversation: (id: 'project' | string) => void
  /** Close the panel (e.g. X button or overlay click). */
  onClose: () => void
}

function truncateTitle(title: string, maxLen: number): string {
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen) + '...'
}

export function ConversationNavPanel({
  openTaskChats,
  activeConversation,
  onSelectConversation,
  onClose,
}: ConversationNavPanelProps) {
  const isProjectActive = activeConversation === 'project'

  return (
    <div
      className="absolute inset-y-4 left-4 w-[320px] bg-white rounded-xl shadow-2xl border border-slate-100 flex flex-col z-30 animate-in slide-in-from-left-4 duration-300"
      role="dialog"
      aria-label="Conversations"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">Conversations</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-6 min-h-0">
        {/* Pinned: Project Chat */}
        <div>
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Pinned
          </h3>
          <button
            type="button"
            onClick={() => {
              onSelectConversation('project')
              onClose()
            }}
            className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left border-l-[3px] ${
              isProjectActive
                ? 'bg-[rgba(139,92,246,0.05)] border-[#8B5CF6]'
                : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="size-7 rounded-md bg-[#8B5CF6]/10 flex items-center justify-center text-[#8B5CF6]">
              <span className="material-symbols-outlined text-[18px]">forum</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm truncate block ${isProjectActive ? 'font-semibold text-[#8B5CF6]' : 'font-medium text-slate-700'}`}
                >
                  Project Chat
                </span>
                {/* Static green dot for future unread indicator */}
                <span
                  className="size-1.5 rounded-full bg-green-500 shrink-0"
                  aria-hidden
                />
              </div>
              <p className="text-xs text-slate-500 truncate">
                General discussion and updates
              </p>
            </div>
          </button>
        </div>

        {/* TASKS */}
        <div>
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            TASKS
          </h3>
          <div className="flex flex-col gap-1">
            {openTaskChats.map((item) => {
              const isActive = activeConversation === item.id
              const dotColor =
                CATEGORY_DOT_COLORS[item.label] ?? CATEGORY_DOT_COLORS.Planning
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectConversation(item.id)
                    onClose()
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left border-l-[3px] ${
                    isActive
                      ? 'bg-[rgba(139,92,246,0.05)] border-[#8B5CF6]'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div
                    className="size-7 rounded-md shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: `${dotColor}20` }}
                  >
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm truncate block ${isActive ? 'font-semibold text-[#8B5CF6]' : 'font-medium text-slate-700'}`}
                    >
                      {truncateTitle(item.title, 25)}
                    </span>
                    <p className="text-xs text-slate-500 truncate">
                      {item.label} Phase • Active now
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* User row (static placeholder) */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
        <div className="flex items-center gap-3 p-2 rounded-lg">
          <div className="size-8 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-slate-500 text-sm font-medium">
            U
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              User
            </p>
            <p className="text-xs text-slate-500">Pro Plan</p>
          </div>
        </div>
      </div>
    </div>
  )
}
