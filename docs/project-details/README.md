# Project Details Page (Feature C)

The Project Details page lets users view and edit everything Harvey has extracted about their project. It is Feature C of the MVP Launch Sprint. This page handles **project-level context**; the Settings page handles **user-level constraints** (schedule, availability, preferences).

## Access

- **Primary entry**: Click the **purple project pill** (below Harvey’s header in the chat sidebar). A dropdown appears with:
  - **Project Details** → navigates to this page
  - **User Settings** → navigates to Settings
  - Archive Project / Switch Project (placeholders for future)
- **From Settings**: In the “Project” section, **View Project Details** links to `/dashboard/project/[projectId]` when the user has a project.
- **Bidirectional**: Project Details page has “Dashboard” back link in the sticky top bar (no User Settings link in the new layout; access Settings via dashboard sidebar or project dropdown).

## Route

- **Path**: `/dashboard/project/[projectId]`
- **Page**: `src/app/dashboard/project/[projectId]/page.tsx` (server component: auth, `getProjectById`, then client form).
- **Loading**: `src/app/dashboard/project/[projectId]/loading.tsx` shows a spinner while the page loads.

## Page layout (redesigned)

- **Sticky top bar**: Frosted glass bar; left = “Dashboard” back link (with unsaved-changes confirm when dirty); right = “All changes saved” when clean, or **Discard** + **Save Changes** (purple pill) when dirty. `max-w-6xl mx-auto px-10`.
- **Hero**: Two-column (`max-w-6xl mx-auto px-10 pt-14 pb-10`). Left: status pill (Active/Paused/Completed), “Last updated [relative time]”, editable title (click to edit, pencil on hover), description (EditableField, slate-400), “Created [date]”. Right: metadata card (white, rounded-2xl) with progress ring (completed phases / total), then five editable metadata rows: Deadline, Skill level, Stack, Commitment (hrs/week), Type — each with icon and EditableField.
- **Phase stepper + tabs card**: Single white card. Top: horizontal phase stepper (colored bars: completed = green, active = violet, future = grey; hover shows tooltip with title, goal, deadline, status). Below: tabs **Overview** | **Phases** | **Harvey’s Notes** (notes tab shows count badge). Active tab has violet underline.
- **Tab content** (in a second white card below):
  - **Overview**: 12-column editorial grid — Goals, Motivation (with violet left border), Stack (tool pills + “+ Add”), Details (Type, Deadline, Weekly hours, Skill level), and Milestones (read-only list when present).
  - **Phases**: Vertical timeline (completed = green check dot, active = violet glowing dot, future = numbered grey dot); each row has title, status badge, goal, deadline, edit/remove; “+ Add Phase” at bottom.
  - **Harvey’s Notes**: Info banner (brain emoji + short explanation); each note shows date (left), text (right), edit/remove; long notes (>200 chars) have “Read more” / “Show less”; notes containing “CRITICAL” get “Key insight” amber badge; “+ Add Note” at bottom.

Save/discard and unsaved state are handled in the sticky top bar (no separate bottom StickyUnsavedBar on this page). Toast “Changes saved” and beforeunload/navigation guards unchanged.

## API

- **GET `/api/projects/[projectId]`**: Returns the project for the authenticated user (ownership checked). Used for refetch and by the server page (data is fetched server-side for initial load).
- **PATCH `/api/projects/[projectId]`**: Partial update. Body can include: `title`, `description`, `goals`, `status`, `target_deadline`, `skill_level`, `tools_and_stack`, `project_type`, `weekly_hours_commitment`, `motivation`. Validation: `weekly_hours_commitment` 1–168, `status` one of active/paused/completed, `project_type` any string or null, `tools_and_stack` array of strings (max 10, no duplicates). Returns updated project (with ISO date strings).

## Where data is stored

All fields are on the **Project** model (Prisma): `title`, `description`, `goals`, `status`, `target_deadline`, `skill_level`, `tools_and_stack`, `project_type`, `weekly_hours_commitment`, `motivation`, `updatedAt`. See `src/prisma/schema.prisma` and `src/lib/projects/project-service.ts`.

## Relationship to Settings

- **Settings page**: User life constraints (work schedule, commute, availability windows, preferences). Stored on **User** (availabilityWindows, energy_peak, rest_days) and **Project** (schedule_duration_days, exclusions).
- **Project Details page**: What the project is and how the user relates to it (goals, deadline, type, skill level, stack, weekly commitment, motivation). Stored on **Project** scalar/enum fields.

The Settings page has a “View Project Details” link; the Project Details page has a “User Settings” link. Both have “Back to Dashboard”.

## Files

- **Page**: `src/app/dashboard/project/[projectId]/page.tsx`, `loading.tsx`
- **API**: `src/app/api/projects/[projectId]/route.ts`
- **Components**: `src/components/dashboard/ProjectDetailsForm.tsx`, `EditableField.tsx`, `ProjectDropdownMenu.tsx` (StickyUnsavedBar is not used on Project Details; save/discard live in the page’s sticky top bar)
- **ChatSidebar**: `src/components/dashboard/ChatSidebar.tsx` (pill + dropdown integration)
- **Settings**: `src/app/dashboard/settings/page.tsx` (Project section link)

## Unsaved changes

- **Top bar**: When dirty, the sticky top bar shows **Discard** and **Save Changes** (purple pill) on the right; when clean, it shows “All changes saved”. Same handlers as before (Discard reverts to last saved; Save Changes runs PATCH).
- **beforeunload**: When there are unsaved changes, the browser’s “Leave site?” prompt is shown on refresh or close.
- **In-app navigation**: Clicking “Dashboard” with unsaved changes opens a confirm dialog: “You have unsaved changes. Are you sure you want to leave?”
