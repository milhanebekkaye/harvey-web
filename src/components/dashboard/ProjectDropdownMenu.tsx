'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'

interface ProjectDropdownMenuProps {
  open: boolean
  onClose: () => void
  projectId: string | null
  anchorRef: React.RefObject<HTMLElement | null>
}

/**
 * Dropdown menu shown below the purple project pill.
 * Options: Project Details, User Settings; placeholders for Archive / Switch Project.
 */
export function ProjectDropdownMenu({
  open,
  onClose,
  projectId,
  anchorRef,
}: ProjectDropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        menuRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return
      }
      onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      className="absolute left-6 top-full z-50 mt-1 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
      style={{ marginTop: '4px' }}
    >
      <Link
        href={projectId ? `/dashboard/project/${projectId}` : '/dashboard'}
        onClick={onClose}
        className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <span className="material-symbols-outlined text-lg text-slate-500">
          folder
        </span>
        Project Details
      </Link>
      <Link
        href="/dashboard/roadmap"
        onClick={onClose}
        className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <span className="material-symbols-outlined text-lg text-slate-500">
          map
        </span>
        Roadmap
      </Link>
      <Link
        href="/dashboard/settings"
        onClick={onClose}
        className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <span className="material-symbols-outlined text-lg text-slate-500">
          settings
        </span>
        User Settings
      </Link>
      <div className="my-1 border-t border-slate-100" />
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-400"
      >
        <span className="material-symbols-outlined text-lg">archive</span>
        Archive Project
      </button>
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-400"
      >
        <span className="material-symbols-outlined text-lg">swap_horiz</span>
        Switch Project
      </button>
    </div>
  )
}
