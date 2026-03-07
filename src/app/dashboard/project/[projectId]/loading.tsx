import { Loader2 } from 'lucide-react'

/**
 * Loading state for Project Details page (shown while server fetches project).
 */
export default function ProjectDetailsLoading() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="w-10 h-10 animate-spin" />
        <span className="text-sm">Loading project...</span>
      </div>
    </div>
  )
}
