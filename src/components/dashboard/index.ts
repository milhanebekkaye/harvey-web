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
 * Shows title, duration, label, and status border
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
 * TaskCategoryBadge - Label badge
 * Labels: Coding, Research, Design, Marketing, Communication, Personal, Planning
 */
export {
  TaskCategoryBadge,
  TaskLabelBadge,
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
 * ChatSidebar - Left sidebar with project/task conversation switching
 * Shell: header, nav panel overlay, ProjectChatView or TaskChatView
 */
export { ChatSidebar } from './ChatSidebar'
export type { ChatSidebarProps } from './ChatSidebar'

/**
 * ConversationNavPanel - Overlay panel to switch between project and task chats
 */
export { ConversationNavPanel, type OpenTaskChat } from './ConversationNavPanel'

/**
 * ProjectChatView - Project chat content (messages, input, rebuild)
 */
export { ProjectChatView } from './ProjectChatView'
export type { ProjectChatViewProps } from './ProjectChatView'

/**
 * TaskChatView - Task chat placeholder (Step 1: UI only, disabled input)
 */
export { TaskChatView } from './TaskChatView'

/**
 * TimelineView - Timeline display of tasks grouped by date
 * Past (collapsible), Overdue, Today, Tomorrow, week days, Next Week, Later, Unscheduled
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
