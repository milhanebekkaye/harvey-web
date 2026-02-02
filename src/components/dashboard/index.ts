/**
 * Dashboard Components Index
 *
 * Barrel export file for all dashboard-related components.
 * Import from '@/components/dashboard' for cleaner imports.
 *
 * @example
 * import { TaskTile, TaskDetails, TaskModal } from '@/components/dashboard'
 */

// ============================================
// Task Display Components
// ============================================

/**
 * TaskTile - Collapsed task card for timeline view
 * Shows title, duration, category, and status border
 */
export { TaskTile, TaskTileCompact, TaskTileCalendar } from './TaskTile'

/**
 * TaskDetails - Expanded task view with full information
 * Shows description, checklist, Harvey tip, and actions
 */
export { TaskDetails, TaskDetailsInline } from './TaskDetails'

/**
 * TaskModal - Modal dialog for calendar view
 * Full-featured modal with task details and actions
 */
export { TaskModal } from './TaskModal'

// ============================================
// Badge Components
// ============================================

/**
 * TaskStatusBadge - Status indicator dot/badge
 * Colors: green (completed), red (urgent), purple (focus), gray (pending)
 */
export { TaskStatusBadge, StatusDot } from './TaskStatusBadge'

/**
 * TaskCategoryBadge - Category label badge
 * Categories: Management, Research, Team, Design, Marketing, etc.
 */
export {
  TaskCategoryBadge,
  CategoryBadgeWithIcon,
  getCategoryIcon,
} from './TaskCategoryBadge'

// ============================================
// Checklist Components
// ============================================

/**
 * TaskChecklistItem - Single checklist item with checkbox
 * TaskChecklist - Container for multiple checklist items
 */
export { TaskChecklistItem, TaskChecklist } from './TaskChecklistItem'

// ============================================
// Layout Components
// ============================================

/**
 * ChatSidebar - Left sidebar with conversation history
 * Displays onboarding messages in chat format
 */
export { ChatSidebar } from './ChatSidebar'

/**
 * TimelineView - Timeline display of tasks grouped by date
 * TODAY, TOMORROW, THIS WEEK sections
 */
export { TimelineView } from './TimelineView'

/**
 * CalendarView - Calendar display of tasks (Coming Soon)
 * Weekly grid with hourly time slots
 */
export { CalendarView } from './CalendarView'

/**
 * ViewToggle - Toggle between Timeline and Calendar views
 * Includes search bar
 */
export { ViewToggle } from './ViewToggle'
export type { ViewMode } from './ViewToggle'
