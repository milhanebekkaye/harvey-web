'use client'

import {
  ChevronUp,
  Crown,
  LayoutDashboard,
  FolderOpen,
  LogOut,
  Menu,
  MessageSquareHeart,
  Pin,
  Settings,
  Star,
  X,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

/**
 * Category dot hex colors for conversation/task items (same as ConversationNavPanel).
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

function truncateTitle(title: string, maxLen: number): string {
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen) + '...'
}

function displayPlanLabel(plan: string): string {
  if (['active', 'pro', 'paid'].includes(plan)) return 'Pro Plan'
  return 'Free Plan'
}

export interface DashboardSidebarProps {
  isOpen: boolean
  onToggle: () => void
  openTaskChats: Array<{ id: string; title: string; label: string }>
  activeConversation: 'project' | string
  onSelectConversation: (id: 'project' | string) => void
  /** Id of the soonest non-completed, non-skipped task. Only this task chat gets a green dot; no dots for Project Chat or other tasks. */
  currentTaskId?: string | null
  projectId: string | null
  projectTitle: string | null
  userName: string | null
  userPlan: string
  onSignOut: () => void
  onOpenFeedback: () => void
}

export function DashboardSidebar({
  isOpen,
  onToggle,
  openTaskChats,
  activeConversation,
  onSelectConversation,
  currentTaskId = null,
  projectId,
  userName,
  userPlan,
  onSignOut,
  onOpenFeedback,
}: DashboardSidebarProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isUserMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (userMenuRef.current?.contains(target)) return
      setIsUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isUserMenuOpen])

  const avatarLetter = userName ? userName.trim().charAt(0).toUpperCase() : '?'
  const hasProPlan = ['active', 'pro', 'paid'].includes(userPlan)

  return (
    <aside
      className={`h-full flex flex-col bg-white border-r border-slate-200 z-40 relative overflow-hidden transition-all duration-300 ease-in-out ${
        isOpen ? 'w-64' : 'w-12'
      }`}
      aria-label="Dashboard sidebar"
    >
      {!isOpen ? (
        /* Closed: thin strip */
        <div className="h-full flex flex-col items-center py-4 border-r border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:text-violet-600 hover:bg-violet-50 transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
        </div>
      ) : (
        /* Open: full panel */
        <>
          {/* A. Header */}
          <div className="shrink-0 flex items-center justify-between p-4 border-b border-slate-200">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/harvey/penguin-hat.png"
                alt="Harvey"
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
              <span className="font-semibold text-lg text-slate-900 truncate">
                Harvey AI
              </span>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* B. Navigation — Dashboard (active) */}
          <div className="shrink-0 p-3 border-b border-slate-100">
            <div className="rounded-lg py-2 px-3 bg-violet-100 text-violet-700 font-medium text-sm cursor-default flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </div>
          </div>

          {/* C. Recent chats */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            <h3 className="text-xs uppercase text-slate-500 tracking-wider mb-2 font-semibold">
              Recent chats
            </h3>
            {/* Pinned: Project Chat always first */}
            <p className="text-[11px] uppercase text-slate-400 tracking-wider mb-1.5 px-1 font-medium">
              Pinned
            </p>
            <button
              type="button"
              onClick={() => onSelectConversation('project')}
              className={`flex items-center gap-2 rounded-lg py-2 px-3 text-sm text-left cursor-pointer transition-colors ${
                activeConversation === 'project'
                  ? 'bg-violet-50 text-violet-700'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Pin className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
              <span className="truncate">Project Chat</span>
            </button>
            {/* Task chats: only the current task (soonest pending) gets a green dot; no dots for others */}
            {openTaskChats.length > 0 && (
              <>
                <p className="text-[11px] uppercase text-slate-400 tracking-wider mb-1.5 mt-3 px-1 font-medium">
                  Tasks
                </p>
                <div className="flex flex-col gap-0.5">
                  {openTaskChats.map((item) => {
                    const isActiveConversation = activeConversation === item.id
                    const isCurrentTask = currentTaskId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectConversation(item.id)}
                        className={`flex items-center gap-2 rounded-lg py-2 px-3 text-sm text-left cursor-pointer transition-colors ${
                          isActiveConversation ? 'bg-violet-50 text-violet-700' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        {isCurrentTask ? (
                          <span className="size-2 rounded-full shrink-0 bg-green-500" aria-hidden />
                        ) : (
                          <span className="size-2 shrink-0" aria-hidden />
                        )}
                        <span className="truncate">{truncateTitle(item.title, 30)}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* D. Links */}
          <div className="shrink-0 p-3 border-t border-slate-100">
            <div className="flex flex-col gap-0.5">
              {projectId ? (
                <Link
                  href={`/dashboard/project/${projectId}`}
                  className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-slate-600" />
                  Project Details
                </Link>
              ) : (
                <span className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-slate-400 cursor-not-allowed">
                  <FolderOpen className="w-4 h-4" />
                  Project Details
                </span>
              )}
              <Link
                href="/dashboard/roadmap"
                className="flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <Star className="w-4 h-4 text-slate-600" />
                Vote for next features
              </Link>
            </div>
          </div>

          {/* E. User section + menu */}
          <div className="shrink-0 border-t border-slate-200 p-3 relative" ref={userMenuRef}>
            {isUserMenuOpen && (
              <div
                className="absolute bottom-full left-3 right-3 mb-2 z-50 bg-white rounded-xl border border-slate-100 shadow-lg py-1"
                role="menu"
                aria-label="User menu"
              >
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg mx-1 cursor-pointer"
                  role="menuitem"
                >
                  <Settings className="w-4 h-4 text-slate-600" />
                  Settings
                </Link>
                <Link
                  href="/dashboard/roadmap"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg mx-1 cursor-pointer"
                  role="menuitem"
                >
                  <Star className="w-4 h-4 text-slate-600" />
                  Vote for next features
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    onOpenFeedback()
                    setIsUserMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg mx-1 cursor-pointer text-left"
                  role="menuitem"
                >
                  <MessageSquareHeart className="w-4 h-4 text-slate-600" />
                  What would make Harvey better?
                </button>
                <div className="border-t border-slate-100 my-1" />
                {hasProPlan ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 cursor-default rounded-lg mx-1">
                    <Crown className="w-4 h-4" />
                    Upgrade Plan
                  </div>
                ) : (
                  <Link
                    href={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? '/dashboard/settings'}
                    onClick={() => setIsUserMenuOpen(false)}
                    target={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ? '_blank' : undefined}
                    rel={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ? 'noopener noreferrer' : undefined}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg mx-1 cursor-pointer"
                    role="menuitem"
                  >
                    <Crown className="w-4 h-4 text-slate-600" />
                    Upgrade Plan
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onSignOut()
                    setIsUserMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg mx-1 cursor-pointer text-left"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
              aria-expanded={isUserMenuOpen}
              aria-haspopup="true"
              aria-label="User menu"
            >
              <div className="size-8 rounded-full bg-violet-100 text-violet-700 font-semibold text-sm flex items-center justify-center shrink-0">
                {avatarLetter}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-800 truncate">
                  {userName ?? 'User'}
                </p>
                <p className="text-xs text-slate-400">{displayPlanLabel(userPlan)}</p>
              </div>
              <ChevronUp
                className={`w-4 h-4 text-slate-600 shrink-0 transition-transform ${isUserMenuOpen ? 'rotate-0' : ''}`}
              />
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
