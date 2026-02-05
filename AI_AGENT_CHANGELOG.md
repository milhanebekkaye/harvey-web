## AI Agent Change Log

**What this file is**

- **Purpose**: This file is a **running log of all non-trivial code changes made by AI agents** working on this repository.
- **Audience**: Future AI agents and human maintainers who need to understand **what changed, why, and where to look if something broke**.
- **Scope**: Any change that affects behavior, data structures, or architecture should be recorded here (features, refactors, schema changes, important bug fixes).

Always use `ARCHITECTURE.md` to understand **how the codebase is structured**, and use this `AI_AGENT_CHANGELOG.md` to understand **how it has evolved over time**.

---

## How AI agents should use this file

When you (an AI agent) make a significant change:

1. **Add a new entry at the top** of the “Change log” section (most recent first).
2. **Be concise but precise**:
   - What you changed.
   - Why you changed it.
   - Which files/directories were touched.
   - Any potential risks or follow-up work.
3. **Link to relevant sections** in `ARCHITECTURE.md` if you changed or added documented modules.
4. If you **revert** or significantly modify a previous change, reference the earlier entry by date and short title.

Think of this file as your **debug breadcrumb trail**: future agents (or humans) should be able to answer “What changed recently that might explain this behavior?” by scanning this log.

---

## Recommended entry format

When adding a new entry, follow this structure:

```markdown
### YYYY-MM-DD – Short, descriptive title

- **Agent / context**: (e.g. “Cursor AI assistant”, brief description of the request or task)
- **Summary**: 1–3 bullet points of what changed at a high level.
- **Files touched**: Key files or directories, not every single file if many were affected.
- **Motivation**: Why this change was made (bug fix, feature request, refactor, performance, etc.).
- **Risks / notes**: Anything that might break, areas to watch, or TODOs for follow-up.
- **Related docs**: References to sections in `ARCHITECTURE.md` or external design docs if applicable.
```

You don’t need to paste large code snippets here—this file is about **narrative and intent**, not implementation details.

---

## Change log

*(Most recent entries go at the top of this section.)*

### 2026-02-05 – Initialize architecture and AI agent changelog docs

- **Agent / context**: Cursor AI assistant – initial documentation setup request.
- **Summary**:
  - Created `ARCHITECTURE.md` as the main architecture and project-structure overview.
  - Created `AI_AGENT_CHANGELOG.md` to track future AI-driven code changes.
- **Files touched**:
  - `ARCHITECTURE.md`
  - `AI_AGENT_CHANGELOG.md`
- **Motivation**: Provide a clear, central reference for how the codebase is organized and a dedicated log for AI-made changes to aid debugging and future maintenance.
- **Related docs**: `ARCHITECTURE.md` (entire document).

