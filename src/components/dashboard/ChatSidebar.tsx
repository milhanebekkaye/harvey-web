/**
 * Chat Sidebar Component — Shell for project and task conversations.
 *
 * Renders: header (Harvey AI + discussion label) and either ProjectChatView or
 * TaskChatView based on activeConversation. Conversation switching is handled
 * by DashboardSidebar. All project chat logic lives in ProjectChatView.
 */

'use client'

import React from 'react'
import type { ChatWidget, WidgetAnswerMeta } from '@/types/api.types'
import { ProjectChatView } from './ProjectChatView'
import { TaskChatView } from './TaskChatView'
import type { OpenTaskChat } from './ConversationNavPanel'

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
  /** Per-task chat: switch back to project chat (e.g. from TaskChatView back link). */
  onBackToProject?: () => void
}

export function ChatSidebar({
  initialMessages,
  projectTitle,
  projectId,
  isLoading = false,
  onTasksChanged,
  onAppendMessage,
  appendedByParent = [],
  streamingCheckIn = null,
  checkInError = null,
  onTestCheckIn,
  activeConversation = 'project',
  openTaskChats = [],
  onBackToProject,
}: ChatSidebarProps) {
  const isProject = activeConversation === 'project'
  const activeTask = !isProject
    ? openTaskChats.find((t) => t.id === activeConversation)
    : null

  const discussionLabel = isProject
    ? 'Project Chat'
    : `${activeTask?.title ?? 'Task'} chat`

  return (
    <aside data-tour="chat-sidebar" className="flex-[4] min-w-0 flex flex-col glass-sidebar z-10 relative">
      {/* Header: Harvey AI + discussion label */}
      <div className="p-6 pb-4 shrink-0 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-2">
          <div className="size-12 rounded-full bg-[rgba(255,255,255,0.45)] flex items-center justify-center overflow-hidden shrink-0 p-0.5">
            <img
              src="/harvey/penguin-hat.png"
              alt="Harvey"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Harvey AI
          </h1>
        </div>
        <p className="text-xs text-slate-500 font-medium">
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
              Task not found. Switch conversation from the sidebar.
            </div>
          )}
        </div>
    </aside>
  )
}
