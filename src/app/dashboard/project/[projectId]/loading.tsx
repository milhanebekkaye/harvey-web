/**
 * Loading state for Project Details page (shown while server fetches project).
 */
export default function ProjectDetailsLoading() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <span className="material-symbols-outlined animate-spin text-4xl">
          progress_activity
        </span>
        <span className="text-sm">Loading project...</span>
      </div>
    </div>
  )
}
