/**
 * View Toggle Component
 *
 * Toggle buttons to switch between List and Timeline views.
 * Includes search bar for filtering tasks.
 *
 * Features:
 * - Radio button toggle for view selection
 * - Search input for task filtering
 * - Responsive design
 */

'use client'

/**
 * View modes available
 */
export type ViewMode = 'list' | 'timeline'

/**
 * Props for ViewToggle component
 */
interface ViewToggleProps {
  /**
   * Currently selected view
   */
  view: ViewMode

  /**
   * Callback when view changes
   */
  onViewChange: (view: ViewMode) => void

  /**
   * Search query value (optional)
   */
  searchQuery?: string

  /**
   * Callback when search query changes (optional)
   */
  onSearchChange?: (query: string) => void

  /**
   * Whether to show the search bar
   */
  showSearch?: boolean
}

/**
 * ViewToggle Component
 *
 * Renders a toggle for switching between List and Timeline views.
 * Optionally includes a search bar for filtering tasks.
 *
 * @example
 * <ViewToggle
 *   view={currentView}
 *   onViewChange={setCurrentView}
 *   searchQuery={search}
 *   onSearchChange={setSearch}
 * />
 */
export function ViewToggle({
  view,
  onViewChange,
  searchQuery = '',
  onSearchChange,
  showSearch = true,
}: ViewToggleProps) {
  return (
    <div className="sticky top-0 z-20 bg-[#FAF9F6]/95 backdrop-blur-md px-8 py-6 flex items-center justify-between border-b border-black/5">
      {/* View Toggle Buttons */}
      <div className="flex h-11 w-64 items-center justify-center rounded-xl bg-slate-200/50 p-1">
        {/* List Option */}
        <label
          className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-bold leading-normal transition-all ${
            view === 'list' ? 'bg-white shadow-sm text-[#895af6]' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <span className="truncate">List</span>
          <input
            type="radio"
            name="view-toggle"
            value="list"
            checked={view === 'list'}
            onChange={() => onViewChange('list')}
            className="invisible w-0"
          />
        </label>

        {/* Timeline Option */}
        <label
          className={`flex cursor-pointer h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-bold leading-normal transition-all ${
            view === 'timeline' ? 'bg-white shadow-sm text-[#895af6]' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <span className="truncate">Timeline</span>
          <input
            type="radio"
            name="view-toggle"
            value="timeline"
            checked={view === 'timeline'}
            onChange={() => onViewChange('timeline')}
            className="invisible w-0"
          />
        </label>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="flex-1 max-w-sm ml-6">
          <div className="relative flex items-center w-full">
            <span className="material-symbols-outlined absolute left-3 text-slate-400">
              search
            </span>
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="w-full bg-slate-200/50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange?.('')}
                className="absolute right-3 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
