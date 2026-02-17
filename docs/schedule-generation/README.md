# Schedule Generation

Summary of how Harvey generates and assigns tasks to a schedule. For full flow and file references, see [task-generation/README.md](task-generation/README.md).

## Algorithm overview

1. **Extract constraints** from onboarding conversation (schedule duration, available time, enrichment: skill_level, tools_and_stack, deadline, phases, etc.).
2. **Generate tasks** via Claude using `buildTaskGenerationPrompt()` (includes user context, phases, project notes, communication style, specificity/session/deadline rules).
3. **Parse tasks** from Claude output into `ParsedTask[]` with dependencies (DEPENDS_ON).
4. **Assign to schedule**: build availability map, then **order tasks by dependency only** (topological sort), then fill slots day by day.

## Dependency sorting (critical)

- Tasks are ordered with a **topological sort** so that any task with `depends_on` is scheduled **after** its dependencies.
- We **do not** re-sort by priority after the dependency sort. Re-sorting by priority would break the dependency chain (e.g. a high-priority task that depends on a low-priority task could be placed before it).
- Claude already orders tasks by importance in the generation prompt; the scheduler preserves that order within the dependency constraint.

## Enriched context in task generation

`buildTaskGenerationPrompt()` uses top-level **skill_level** (not `preferences.skill_level`) and injects:

- **User context**: motivation, skill level, preferred session length, tech stack, project type, target deadline
- **Project phases**: when defined, tasks are aligned with the active phase
- **Project notes**: critical context from extraction
- **Communication style**: direct / encouraging / detailed (affects tone of descriptions and success criteria)
- **Rules**: specificity (tool names in titles, measurable success criteria), session-length optimization, deadline pacing
