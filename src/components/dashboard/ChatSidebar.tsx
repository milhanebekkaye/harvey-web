/**
 * Chat Sidebar Component — Shell for project and task conversations.
 *
 * Renders: dynamic header (Harvey AI or task title), conversations toggle,
 * optional overlay + ConversationNavPanel, and either ProjectChatView or
 * TaskChatView based on activeConversation. All project chat logic lives in
 * ProjectChatView (useChat, messages, rebuild). Step 2 will wire task chat API.
 */

'use client'

import { useState, useRef } from 'react'
import type { ChatWidget, WidgetAnswerMeta } from '@/types/api.types'
import { ProjectChatView } from './ProjectChatView'
import { TaskChatView } from './TaskChatView'
import { ConversationNavPanel, type OpenTaskChat } from './ConversationNavPanel'
import { ProjectDropdownMenu } from './ProjectDropdownMenu'

interface StoredMsg {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
  widget?: ChatWidget
  messageType?: 'check-in'
  answered?: boolean
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  widget?: ChatWidget
  messageType?: 'check-in'
  answered?: boolean
}

export interface ChatSidebarProps {
  initialMessages: StoredMsg[]
  projectTitle?: string
  projectId: string | null
  isLoading?: boolean
  onSignOut?: () => void
  onTasksChanged?: () => void
  onAppendMessage?: (
    role: 'user' | 'assistant',
    content: string,
    widget?: ChatWidget,
    widgetAnswer?: WidgetAnswerMeta
  ) => void
  appendedByParent?: Array<Omit<DisplayMessage, 'createdAt'> & { createdAt?: string }>
  streamingCheckIn?: string | null
  checkInError?: string | null
  onTestCheckIn?: (timeOfDay: 'morning' | 'afternoon' | 'evening') => void
  /** Per-task chat: current conversation ('project' or task id). */
  activeConversation?: 'project' | string
  /** Per-task chat: list of open task chats for nav panel. */
  openTaskChats?: OpenTaskChat[]
  /** Per-task chat: whether the conversation nav panel is open. */
  isPanelOpen?: boolean
  /** Per-task chat: open the nav panel. */
  onPanelOpen?: () => void
  /** Per-task chat: close the nav panel. */
  onPanelClose?: () => void
  /** Per-task chat: user selected a conversation; parent switches and closes panel. */
  onSelectConversation?: (id: 'project' | string) => void
  /** Per-task chat: switch back to project chat (e.g. from TaskChatView back link). */
  onBackToProject?: () => void
}

export function ChatSidebar({
  initialMessages,
  projectTitle,
  projectId,
  isLoading = false,
  onSignOut,
  onTasksChanged,
  onAppendMessage,
  appendedByParent = [],
  streamingCheckIn = null,
  checkInError = null,
  onTestCheckIn,
  activeConversation = 'project',
  openTaskChats = [],
  isPanelOpen = false,
  onPanelOpen,
  onPanelClose,
  onSelectConversation,
  onBackToProject,
}: ChatSidebarProps) {
  const isProject = activeConversation === 'project'
  const activeTask = !isProject
    ? openTaskChats.find((t) => t.id === activeConversation)
    : null

  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const projectPillRef = useRef<HTMLButtonElement>(null)

  // Folder always shows project name; below it we show the discussion name
  const folderLabel = projectTitle ?? 'Project'
  const discussionLabel = isProject
    ? 'Project Chat'
    : `${activeTask?.title ?? 'Task'} chat`

  return (
    <>
      <aside className="w-[40%] flex glass-sidebar z-10 relative min-w-0">
        {/* Left rail: always visible, icons only. Stylish modern strip. */}
        <div className="w-16 shrink-0 flex flex-col items-center py-5 gap-3 border-r border-slate-100 bg-gradient-to-b from-slate-50/80 to-white/50 rounded-r-2xl mr-0.5 shadow-sm">
          <button
            type="button"
            onClick={onPanelOpen ? (isPanelOpen ? onPanelClose : onPanelOpen) : undefined}
            className={`
              relative flex items-center justify-center w-11 h-11 rounded-xl
              transition-all duration-200 ease-out
              ${isPanelOpen
                ? 'bg-[#8B5CF6] text-white shadow-md shadow-[#8B5CF6]/25'
                : 'text-slate-500 hover:text-[#8B5CF6] hover:bg-[#8B5CF6]/8'
              }
            `}
            title={isPanelOpen ? 'Close conversations' : 'Conversations'}
            aria-label={isPanelOpen ? 'Close conversations' : 'Open conversations'}
          >
            {isPanelOpen && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-[#8B5CF6] rounded-r-full" aria-hidden />
            )}
            <span className="material-symbols-outlined text-[26px]">chat_bubble</span>
          </button>

          {/* Logout button */}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200 ease-out"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <span className="material-symbols-outlined text-[24px]">logout</span>
            </button>
          )}
        </div>

        {/* Main: header + content */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Dim overlay when nav panel is open — click to close */}
          {isPanelOpen && onPanelClose && (
            <button
              type="button"
              onClick={onPanelClose}
              className="absolute inset-0 bg-slate-900/10 z-20 backdrop-blur-[1px] cursor-default"
              aria-label="Close conversations panel"
            />
          )}

          {/* Unified header: same layout for project and task — Harvey AI, then purple pill, then subtitle */}
          <div className="p-6 pb-4 shrink-0 border-b border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="size-12 rounded-full bg-[#895af6] flex items-center justify-center text-white shadow-lg overflow-hidden shrink-0">
                <span className="text-2xl">&#x1F99E;</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Harvey AI
              </h1>
            </div>
            {/* Purple folder pill: always project name; click opens Project Details / User Settings (same for project or task) */}
            <div className="relative">
              <button
                ref={projectPillRef}
                type="button"
                onClick={() => projectId && setShowProjectMenu((prev) => !prev)}
                disabled={!projectId}
                className="inline-flex items-center gap-2 bg-[#895af6] text-white px-4 py-2 rounded-full text-sm font-semibold shadow-md hover:bg-[#7849d9] transition-colors disabled:opacity-70 disabled:cursor-default text-left max-w-full min-w-0"
                aria-expanded={showProjectMenu}
                aria-haspopup="true"
              >
                <span className="material-symbols-outlined text-lg shrink-0">folder</span>
                <span className="truncate">{folderLabel}</span>
              </button>
              {projectId && (
                <ProjectDropdownMenu
                  open={showProjectMenu}
                  onClose={() => setShowProjectMenu(false)}
                  projectId={projectId}
                  anchorRef={projectPillRef}
                />
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-2">
              {discussionLabel}
            </p>
          </div>

        {/* Content: ProjectChatView or TaskChatView */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {isProject ? (
            <ProjectChatView
              initialMessages={initialMessages}
              projectTitle={projectTitle}
              projectId={projectId}
              isLoading={isLoading}
              onTasksChanged={onTasksChanged}
              onAppendMessage={onAppendMessage}
              appendedByParent={appendedByParent}
              streamingCheckIn={streamingCheckIn}
              checkInError={checkInError}
              onTestCheckIn={onTestCheckIn}
            />
          ) : activeTask ? (
            <TaskChatView
              key={activeTask.id}
              taskId={activeTask.id}
              projectId={projectId}
              taskTitle={activeTask.title}
              taskLabel={activeTask.label ?? 'general'}
              initialDiscussionId={activeTask.discussionId}
              initialMessages={activeTask.initialMessages}
              onBackToProject={onBackToProject ?? (() => {})}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Task not found. Switch conversation from the panel.
            </div>
          )}
        </div>

        {/* Conversation nav panel — overlay over chat area only; rail stays visible */}
        {isPanelOpen && onSelectConversation && onPanelClose && (
          <div className="absolute inset-0 z-30 flex items-stretch justify-start pointer-events-none">
            <div className="pointer-events-auto pt-4 pb-4 pl-4">
              <ConversationNavPanel
                openTaskChats={openTaskChats}
                activeConversation={activeConversation}
                onSelectConversation={onSelectConversation}
                onClose={onPanelClose}
              />
            </div>
          </div>
        )}
        </div>
      </aside>
    </>
  )
}
