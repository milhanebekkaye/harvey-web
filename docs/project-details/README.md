# Project Details Page (Feature C)

The Project Details page lets users view and edit everything Harvey has extracted about their project. It is Feature C of the MVP Launch Sprint. This page handles **project-level context**; the Settings page handles **user-level constraints** (schedule, availability, preferences).

## Access

- **Primary entry**: Click the **purple project pill** (below Harvey’s header in the chat sidebar). A dropdown appears with:
  - **Project Details** → navigates to this page
  - **User Settings** → navigates to Settings
  - Archive Project / Switch Project (placeholders for future)
- **From Settings**: In the “Project” section, **View Project Details** links to `/dashboard/project/[projectId]` when the user has a project.
- **Bidirectional**: Project Details page has “Back to Dashboard” and “User Settings” in the top bar.

## Route

- **Path**: `/dashboard/project/[projectId]`
- **Page**: `src/app/dashboard/project/[projectId]/page.tsx` (server component: auth, `getProjectById`, then client form).
- **Loading**: `src/app/dashboard/project/[projectId]/loading.tsx` shows a spinner while the page loads.

## Page layout

- **Top**: Back to Dashboard, User Settings (with unsaved-changes confirm when dirty).
- **Header**: Editable project title (click to edit), status badge (Active / Paused / Completed), Archive / Delete buttons, “Last updated by Harvey • [time]”.
- **Main**: Two-column grid (stacks on mobile):
  - **Project Info**: Description (textarea, 500 chars), Goals (textarea, 500 chars), Target Deadline (date, nullable), Project Type (select: Web App, Mobile App, SaaS, Content, Research, Other).
  - **Your Context**: Skill Level (Beginner / Intermediate / Advanced), Tools & Stack (tag pills, add/remove, max 10), Weekly Hours (1–168, +/-), Motivation (textarea, 300 chars).
- **Bottom**: **Sticky unsaved bar** (fixed at bottom): when there are unsaved changes, a bar shows “You have unsaved changes” with **Discard** and **Save Changes** buttons. On save: PATCH `/api/projects/[projectId]`, toast “Changes saved”, timestamp updates. Main content has bottom padding so it is not hidden behind the bar.

## API

- **GET `/api/projects/[projectId]`**: Returns the project for the authenticated user (ownership checked). Used for refetch and by the server page (data is fetched server-side for initial load).
- **PATCH `/api/projects/[projectId]`**: Partial update. Body can include: `title`, `description`, `goals`, `status`, `target_deadline`, `skill_level`, `tools_and_stack`, `project_type`, `weekly_hours_commitment`, `motivation`. Validation: `weekly_hours_commitment` 1–168, `status` one of active/paused/completed, `project_type` any string or null, `tools_and_stack` array of strings (max 10, no duplicates). Returns updated project (with ISO date strings).

## Where data is stored

All fields are on the **Project** model (Prisma): `title`, `description`, `goals`, `status`, `target_deadline`, `skill_level`, `tools_and_stack`, `project_type`, `weekly_hours_commitment`, `motivation`, `updatedAt`. See `src/prisma/schema.prisma` and `src/lib/projects/project-service.ts`.

## Relationship to Settings

- **Settings page**: User life constraints (work schedule, commute, availability windows, preferences). Stored on **User** and **Project.contextData** (available_time, preferences).
- **Project Details page**: What the project is and how the user relates to it (goals, deadline, type, skill level, stack, weekly commitment, motivation). Stored on **Project** scalar/enum fields.

The Settings page has a “View Project Details” link; the Project Details page has a “User Settings” link. Both have “Back to Dashboard”.

## Files

- **Page**: `src/app/dashboard/project/[projectId]/page.tsx`, `loading.tsx`
- **API**: `src/app/api/projects/[projectId]/route.ts`
- **Components**: `src/components/dashboard/ProjectDetailsForm.tsx`, `EditableField.tsx`, `src/components/ui/StickyUnsavedBar.tsx`, `ProjectDropdownMenu.tsx`
- **ChatSidebar**: `src/components/dashboard/ChatSidebar.tsx` (pill + dropdown integration)
- **Settings**: `src/app/dashboard/settings/page.tsx` (Project section link)

## Unsaved changes

- **Sticky bar**: When dirty, a fixed bar at the bottom shows “You have unsaved changes” with **Discard** (reverts to last saved) and **Save Changes** (PATCH). Implemented via shared **StickyUnsavedBar** (`src/components/ui/StickyUnsavedBar.tsx`).
- **beforeunload**: When there are unsaved changes, the browser’s “Leave site?” prompt is shown on refresh or close.
- **In-app navigation**: Clicking “Back to Dashboard” or “User Settings” with unsaved changes opens a confirm dialog: “You have unsaved changes. Are you sure you want to leave?”
