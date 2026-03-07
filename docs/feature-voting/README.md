# Feature voting board

## What this feature is about

The feature voting board lets users propose features and vote on them. Each user can vote at most once per feature (unique constraint on feature_id + user_id).

## Database

- **Table:** `features` (Prisma model `Feature`).  
  **Fields:** `id` (uuid), `title`, `description`, `created_at`.  
  **Relation:** `votes FeatureVote[]`.

- **Table:** `feature_votes` (Prisma model `FeatureVote`).  
  **Fields:** `id` (uuid), `feature_id` (references `features.id`), `user_id` (references `users.id`), `created_at`.  
  **Constraint:** `@@unique([featureId, userId])` — one vote per user per feature.  
  **Relations:** `feature Feature`, `user User`.

- **User:** `User.featureVotes FeatureVote[]` (reverse relation).

## API

- **GET /api/features** — List all features. Auth required. Returns `{ features: [...] }` sorted by voteCount descending. Each item: `{ id, title, description, createdAt, voteCount, hasVoted }`. Implemented in `src/app/api/features/route.ts`.
- **POST /api/features/[featureId]/vote** — Toggle vote. Auth required. If the user already voted, removes the vote and returns 200 `{ voted: false }`; otherwise creates the vote and returns 201 `{ voted: true }`. Returns 404 if the feature does not exist. Implemented in `src/app/api/features/[featureId]/vote/route.ts`.

Features are created directly in the database (e.g. Supabase Studio); there is no public API for creating features.

## Frontend

- **Roadmap page** (`src/app/dashboard/roadmap/page.tsx`): "Feature Roadmap" with subtitle "Vote for the features you want to see next." Fetches GET /api/features on mount. Features displayed as white cards (title, description, vote button with count + upvote icon). Vote button toggles via POST /api/features/[featureId]/vote with optimistic UI. Empty state: "No features on the roadmap yet. Stay tuned!" Accessible via **ProjectDropdownMenu** (Roadmap link between Project Details and User Settings).

## Files

- **Schema:** `src/prisma/schema.prisma` — models `Feature`, `FeatureVote`, and `User.featureVotes` relation.
- **Migration:** `src/prisma/migrations/20260307180000_add_feedback_and_feature_voting/migration.sql` (creates `features` and `feature_votes` tables).
- **Routes:** `src/app/api/features/route.ts` (GET), `src/app/api/features/[featureId]/vote/route.ts` (POST).
- **Page:** `src/app/dashboard/roadmap/page.tsx`.
