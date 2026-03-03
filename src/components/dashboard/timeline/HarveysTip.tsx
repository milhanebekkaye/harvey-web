interface HarveysTipProps {
  tip: string
  isLoading: boolean
  onRefresh: () => void
}

export function HarveysTip({ tip, isLoading, onRefresh }: HarveysTipProps) {
  return (
    <div className="bg-slate-50 p-4 rounded-xl flex gap-3 mb-4">
      <div className="size-8 rounded-full bg-gradient-to-tr from-[#895af6] to-purple-400 flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5">
        H
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold text-[#895af6] uppercase tracking-wider mb-1">
            Harvey&apos;s Tip
          </h5>
          <button
            type="button"
            onClick={onRefresh}
            className="text-[10px] text-slate-400 hover:text-slate-600 disabled:text-slate-300 disabled:cursor-not-allowed flex items-center gap-0.5 transition-colors"
            disabled={isLoading}
          >
            <span className="material-symbols-outlined text-[12px]">refresh</span>
            Refresh
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 py-1">
            <span
              aria-label="Loading tip"
              className="w-3 h-3 border border-slate-300 border-t-slate-500 rounded-full animate-spin"
            />
            <span className="text-slate-500 text-xs">Generating tip...</span>
          </div>
        ) : (
          <p className="text-slate-600 text-xs leading-relaxed">{tip}</p>
        )}
      </div>
    </div>
  )
}
