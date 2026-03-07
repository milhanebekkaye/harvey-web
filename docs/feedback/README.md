# Feedback system

## What this feature is about

The feedback system lets users submit structured feedback (bugs, improvements, feature requests, questions, or other). Submissions are stored in the database and can be triaged via status (new, seen, resolved).

## Database

- **Table:** `feedbacks` (Prisma model `Feedback`).
- **Fields:** `id` (uuid), `user_id` (references `users.id`), `user_name` (denormalized display name), `label` (bug | improvement | feature_request | question | other), `content` (text), `status` (default "new"; new | seen | resolved), `created_at`.
- **Relation:** Each feedback belongs to one User (`User.feedbacks`).

## API

- **POST /api/feedback** — Submit feedback. Auth required. Body: `{ label: string, content: string }`. `label` must be one of: bug, improvement, feature_request, question, other. `content` required. Creates a Feedback with userId (from Supabase auth), userName (from DB user name, else email, else "Anonymous"), and status "new". Returns 201 with `{ success: true }`. Implemented in `src/app/api/feedback/route.ts`.

## Frontend

- **FeedbackButton** (`src/components/dashboard/FeedbackButton.tsx`): Floating button (fixed bottom-right, purple pill) "What would make Harvey better?" Opens a modal with label chips (Bug, Improvement, Feature Request, Question, Other), textarea, and Submit. On success shows "Thanks for your feedback! 🎉" for 2s then closes. Modal closes on backdrop click or Escape. Rendered on the dashboard page (`src/app/dashboard/page.tsx`).

## Files

- **Schema:** `src/prisma/schema.prisma` — model `Feedback` and `User.feedbacks` relation.
- **Migration:** `src/prisma/migrations/20260307180000_add_feedback_and_feature_voting/migration.sql` (creates `feedbacks` table).
- **Route:** `src/app/api/feedback/route.ts` — POST handler.
- **Component:** `src/components/dashboard/FeedbackButton.tsx`.

Admin UI for listing or triaging feedback is to be added separately.
