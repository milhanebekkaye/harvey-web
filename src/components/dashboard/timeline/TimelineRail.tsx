import type { ReactNode } from 'react'

interface TimelineRailProps {
  children: ReactNode
}

export function TimelineRail({ children }: TimelineRailProps) {
  return (
    <div className="relative pl-14 pb-20">
      <div className="absolute left-5 top-5 bottom-6 w-[2px] bg-gradient-to-b from-emerald-200 via-[#895af6]/40 to-slate-300" />
      {children}
    </div>
  )
}
