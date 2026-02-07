## Harvey Web – Codebase Overview

**Purpose of this document**

- **Single source of truth**: This file is the main entry point for understanding how the Harvey web app is structured.
- **For humans and AI agents**: Both engineers and AI assistants should use this document to orient themselves before making changes.
- **Always keep updated**: Whenever you introduce a new feature, module, or significant refactor, update the relevant section here.

The project is a **Next.js (App Router) + TypeScript** application, using **Prisma** for database access, **Supabase** for authentication, and **Anthropic Claude** for AI features.

---

## Top-level structure

Root of the repository:

- **`.env.example`**: Example environment variables required by the app (e.g. database URLs, API keys). Copy to `.env.local` and fill in real values for local development.
- **`.gitignore`**: Files and folders that Git should ignore (build artifacts, local env files, etc.).
- **`components.json`**: Configuration for UI component tooling (often used by component libraries or generators).
- **`eslint.config.mjs`**: ESLint configuration for linting the codebase (JavaScript/TypeScript/React rules).
- **`next.config.ts`**: Next.js configuration (custom build config, experimental flags, etc.).
- **`package-lock.json`**: Exact dependency tree lockfile for npm. Do not edit manually.
- **`package.json`**: Project metadata, dependencies, and scripts (e.g. `dev`, `build`, `lint`, `prisma:*`).
- **`postcss.config.mjs`**: PostCSS configuration (used by Tailwind and other CSS tooling).
- **`prisma.config.ts`**: Central Prisma configuration, typically wiring Prisma to the schema and runtime environment.
- **`public/`**: Static assets served directly by Next.js (images, SVGs, etc.).
- **`docs/`**: Documentation of the project (how work files, features, etc.).
- **`README.md`**: Generic Next.js README from `create-next-app`. For detailed internals, prefer this `ARCHITECTURE.md`.
- **`src/`**: All application source code (Next.js app, components, domain logic, types).
- **`prisma/`**: Prisma schema and database migrations for this project.
- **`tailwind.config.ts`**: Tailwind CSS configuration (design tokens, theme extensions, plugins).
- **`tsconfig.json`**: TypeScript compiler configuration for the project.

> Note: `node_modules/` and nested `.prisma/` directories contain generated or third‑party code and are not documented in detail here. Treat them as implementation details of dependencies.

---

## `public/` – Static assets

Static files served from the root of the site:

- **`file.svg`**: Generic file icon used in the UI.
- **`globe.svg`**: Globe illustration, likely used in onboarding or marketing sections.
- **`next.svg`**: Next.js logo SVG (default asset from the template).
- **`vercel.svg`**: Vercel logo SVG.
- **`window.svg`**: Window/desktop-like graphic, used in UI/marketing sections.

These assets are referenced via paths like `/file.svg` from React components.

---

## `src/` – Application source

### Overview

`src/` contains:

- **`app/`**: Next.js App Router entrypoints (pages, layouts, API routes).
- **`components/`**: Reusable React components grouped by feature (auth, dashboard, onboarding).
- **`lib/`**: Domain logic, services, integrations (AI, auth, DB, scheduling).
- **`node_modules/.prisma/`**: Generated Prisma client (do not edit).
- **`prisma/`**: Prisma schema and migrations (project-local, not the generated client).
- **`types/`**: Shared TypeScript types for API, auth, chat, tasks, and users.

---

## `src/app/` – Next.js App Router

Core Next.js application structure.

- **`layout.tsx`**: Root layout component for the entire app. Defines HTML structure, global providers, and shared UI wrappers.
- **`globals.css`**: Global CSS imported by the root layout (Tailwind base styles, global resets, custom global styles).
- **`favicon.ico`**: Browser tab icon.
- **`page.tsx`**: Root `/` route (landing page). Typically serves marketing or entry experience for the app.

Additional route groups:

- **`loading/page.tsx`**: A route that provides a loading/placeholder experience, likely displayed while the main experience or data loads.
- **`onboarding/page.tsx`**: `/onboarding` route. Manages the onboarding experience and initial user setup, using components from `src/components/onboarding`.
- **`signin/page.tsx`**: `/signin` route. Handles email-based sign-in and integration with Supabase auth.
- **`dashboard/page.tsx`**: `/dashboard` route. Main authenticated user experience; shows tasks, timeline, calendar, and chat sidebar using dashboard components.

Auth callback:

- **`auth/callback/route.ts`**: Server route handling authentication callbacks (e.g. OAuth redirects). Finishes login, sets session, and redirects to the appropriate page.

### API routes – `src/app/api/`

These are server-side route handlers (Next.js Route Handlers). Each `route.ts` implements HTTP methods (`GET`, `POST`, etc.) for a particular resource.

- **`chat/route.ts`**
  - Endpoint under `/api/chat`.
  - Streaming chat: uses Vercel AI SDK (`streamText`, `createUIMessageStream`, `createUIMessageStreamResponse`) with `@ai-sdk/anthropic`.
  - Accepts `messages`, `projectId`, `context` (onboarding | project-chat | task-chat).
  - Saves messages to Discussion on stream finish. During onboarding, runs early project title/description extraction via `extractProjectInfo()` and updates Project when data is available. See `docs/streaming-chat/README.md` and `docs/onboarding/README.md`.

- **`discussions/[projectId]/route.ts`**
  - Endpoint under `/api/discussions/[projectId]`.
  - Manages AI or human discussions tied to a specific project (identified by `projectId`).
  - Likely uses `src/lib/discussions/discussion-service.ts` and `src/lib/projects/project-service.ts`.

- **`schedule/generate-schedule/route.ts`**
  - Endpoint under `/api/schedule/generate-schedule`.
  - Generates or regenerates a task schedule for a given project/user.
  - Relies heavily on `src/lib/schedule/schedule-generation.ts` and `src/lib/schedule/task-scheduler.ts`.

- **`schedule/reset-schedule/route.ts`**
  - Endpoint under `/api/schedule/reset-schedule`.
  - Resets or clears an existing schedule (e.g. when user wants to restart planning).

- **`tasks/route.ts`**
  - Endpoint under `/api/tasks`.
  - Handles list/create operations for tasks (e.g. `GET` for fetching tasks, `POST` for creating).
  - Uses `src/lib/tasks/task-service.ts` for domain logic.

- **`tasks/[taskId]/route.ts`**
  - Endpoint under `/api/tasks/[taskId]`.
  - Handles single-task operations (fetch, update, delete) based on `taskId`.

- **`tasks/[taskId]/checklist/route.ts`**
  - Endpoint under `/api/tasks/[taskId]/checklist`.
  - Manages per-task checklist items (e.g. marking subtasks complete/incomplete).
  - Works together with the `TaskChecklistItem` UI component and `task-service`.

---

## `src/components/` – UI components

Shared React components grouped by feature.

### `src/components/auth/`

Auth-related UI used on sign-in/sign-up flows:

- **`AuthButtons.tsx`**: High-level auth button group (e.g. “Continue with Email”, “Continue with Provider”). Encapsulates auth triggers.
- **`AuthError.tsx`**: Displays authentication-related error messages in a consistent style.
- **`EmailLoginForm.tsx`**: Form component for logging in with email/password or magic link.
- **`EmailSignupForm.tsx`**: Form component for user registration via email, likely tied into Supabase auth.

### `src/components/dashboard/`

Dashboard UI for authenticated users:

- **`index.ts`**: Barrel file re-exporting dashboard components for simpler imports.
- **`CalendarView.tsx`**: Visual calendar representation of tasks/schedule.
- **`ChatSidebar.tsx`**: Sidebar showing AI or project-related chat, typically integrated with `/api/chat`.
- **`TaskCategoryBadge.tsx`**: Styled badge indicating task label (Coding, Research, Design, Marketing, Communication, Personal, Planning).
- **`TaskChecklistItem.tsx`**: UI for a single checklist item within a task (checkbox, label, status).
- **`TaskDetails.tsx`**: Detailed view of a selected task (description, status, success criteria, etc.).
- **`TaskModal.tsx`**: Modal dialog for creating or editing a task.
- **`TaskStatusBadge.tsx`**: Badge displaying a task’s current status (e.g. Todo, In Progress, Done).
- **`TaskTile.tsx`**: Compact card/tile representation of a task, used in lists or board views.
- **`TimelineView.tsx`**: Timeline visualization of tasks and schedule over time.
- **`ViewToggle.tsx`**: Control for toggling between different dashboard views (e.g. Calendar vs Timeline).

### `src/components/onboarding/`

Components used on the onboarding/chat-style experience:

- **`index.ts`**: Barrel file re-exporting onboarding components.
- **`ChatAvatar.tsx`**: Avatar component representing the AI assistant or user in chat messages.
- **`ChatInput.tsx`**: Input area for sending messages or onboarding responses.
- **`ChatMessage.tsx`**: Render of a single chat message bubble (user or AI). Supports streaming: shows content progressively or loading dots.
- **`OnboardingCTA.tsx`**: Call-to-action component used during onboarding (buttons, prompts).
- **`OnboardingHeader.tsx`**: Header section for onboarding pages (title, subtitle, progress).
- **`OnboardingProgress.tsx`**: Visual indicator of user’s progress through onboarding steps.

---

## `src/lib/` – Domain logic and services

This directory holds non-UI logic: integrations, services, scheduling, and utilities.

### `src/lib/ai/`

- **`claude-client.ts`**: Helpers for Claude (`isIntakeComplete`, `cleanResponse`, `formatMessagesForClaude`). Non-streaming chat uses `getChatCompletion`; streaming chat uses Vercel AI SDK (`@ai-sdk/anthropic`) in the API route.
- **`prompts.ts`**: All prompt templates and system instructions for AI interactions (e.g. how Harvey should respond, task breakdown prompts, schedule generation prompts).
- **`project-extraction.ts`**: Extracts `project_title` and `project_description` from onboarding conversation via Claude. Used in chat route `onFinish` during onboarding to populate Project model early; mirrors the constraint extraction pattern.

### `src/lib/auth/`

- **`auth-service.ts`**: High-level authentication service functions (sign-in, sign-out, session retrieval). Bridges UI and Supabase/Supabase SSR.
- **`supabase-server.ts`**: Server-side helpers for using Supabase with Next.js (e.g. getting a Supabase client on the server, reading cookies).
- **`supabase.ts`**: Client-side Supabase initialization (browser usage).

### `src/lib/db/`

- **`prisma.ts`**: Prisma client initialization. Exports a singleton Prisma client used across the app for database operations.
- **`test-connection.ts`**: Small utility to test the database connection (e.g. health checks, debugging local DB connectivity).

### `src/lib/discussions/`

- **`discussion-service.ts`**: Service layer for discussion entities (create/fetch discussions, append messages, link them to projects). Used by the `/api/discussions/[projectId]` route and possibly UI.

### `src/lib/projects/`

- **`project-service.ts`**: Service layer for project entities (create, update, fetch projects). Provides a clean interface over Prisma models.

### `src/lib/schedule/`

- **`schedule-generation.ts`**: Core logic for generating a schedule based on tasks, timelines, and AI suggestions. Constraint extraction uses a higher token limit (4096) so full constraint JSON is returned; `repairJSON` handles truncated constraint JSON (closes arrays before objects, closes truncated string values) so user constraints are used instead of defaults when the model output is cut off.
- **`task-scheduler.ts`**: Pure scheduling algorithms and helpers (e.g. assigning tasks to slots, respecting dependencies and constraints). Orders tasks by dependency (topological sort) then priority so dependents are scheduled after their dependencies.

### `src/lib/tasks/`

- **`task-service.ts`**: Service layer for task entities (CRUD operations, checklist operations, status transitions). When a task is set to **skipped**, all tasks that depend on it (via `depends_on`) are cascade-skipped. Used heavily by task-related API routes and dashboard UI.

### `src/lib/users/`

- **`user-actions.ts`**: Higher-level user actions (e.g. onboarding completion, preference updates) that may span multiple services or tables.
- **`user-service.ts`**: Direct user entity operations (create, fetch by ID/email, update).

### `src/lib/utils.ts` – General utilities

- **`utils.ts`**: Grab-bag of shared helper functions (formatting, date utilities, type guards, etc.) used across different parts of the app.

---

## `src/prisma/` – Prisma schema and migrations

> Note: There is also a generated Prisma client under `src/node_modules/.prisma/`. That generated code should not be modified directly.

- **`schema.prisma`**: Source of truth for the database schema (models such as User, Project, Task, Schedule, Discussion, etc.). Changes here are applied to the DB via migrations. The **Task** model includes `depends_on String[]` (task IDs this task depends on), used for dependency-aware scheduling and cascade skip when a task is skipped.

- **`migrations/`**: Auto-generated migration history:
  - **`20260203144248_change_success_criteria_to_json/`**
    - **`migration.sql`**: SQL statements for changing a `success_criteria` field to a JSON type (or similar).
  - **`20260203144607_change_success_criteria_to_json/`**
    - **`migration.sql`**: Follow-up migration adjusting or fixing the same field.
  - **`migration_lock.toml`**: Lockfile used by Prisma Migrate to coordinate applied migrations.

Migrations are applied via Prisma CLI commands (see `package.json` scripts or your own workflow).

---

## `src/types/` – Shared TypeScript types

Type definitions for different aspects of the app:

- **`api.types.ts`**: Types for API request/response shapes (e.g. payloads for `/api/chat`, `/api/tasks`, `/api/schedule`).
- **`auth.types.ts`**: Types for authentication flows (session, user, tokens, auth state).
- **`chat.types.ts`**: Types used in chat flows (message roles, content structures, conversation metadata).
- **`task.types.ts`**: Types describing tasks, checklists, task statuses, categories, and scheduling metadata.
- **`user.types.ts`**: Types for user entities, profiles, onboarding state, and preferences.

These types should be reused across UI, services, and API routes to keep the app type-safe and consistent.

---

## `src/node_modules/.prisma/` – Generated Prisma client

This directory is generated by Prisma and contains:

- **`client.*` files**: JavaScript and TypeScript entrypoints for the Prisma client.
- **`default.*`, `edge.*`, `runtime/`**: Different runtime targets and bundling variants.
- **`schema.prisma`**: A copy of the schema used internally by the generated client.
- **`*.wasm` and related loaders**: Compiled WebAssembly modules that speed up query compilation.

**Do not edit files in this directory manually.** They are regenerated via Prisma CLI (`prisma generate`) and should be treated as build artifacts.

---

## How to keep this document up to date

When you:

- Add a new **route/page** → Update the relevant section under `src/app/`.
- Add a new **component** → Add a short entry under the appropriate feature directory in `src/components/`.
- Introduce or change a **service or lib module** → Update `src/lib/` sections to describe its responsibilities.
- Modify the **database schema** → Document new/changed models under `src/prisma/` and reference how they are used in services.

Treat this file as a **living map** of the codebase. Keeping it accurate will significantly improve onboarding, debugging, and collaboration for both humans and AI agents.
