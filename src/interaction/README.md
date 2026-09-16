# interaction/

Bar-zone drag gestures (brainstorm §6.7–§6.9). Pure model edits live in `barEdits.ts`; the
pointer wiring is in `../render/Timeline.svelte`, and commits flow through
`commitDocument` in `../stores/documentStore.ts` (serialize → re-parse), so the editor pane
and model stay in sync.

## Implemented

- **Middle drag** → move the whole bar. Only anchor (absolute-start) tasks; `after` tasks
  show no move affordance (their position is derived).
- **Front-edge drag** → pin an absolute start. Replaces the position, breaking that task's
  incoming `after` — the one destructive op (§6.9).
- **End-edge drag** → extend/shrink duration; position preserved.
- **Cascade** is automatic: successors are `after` the dragged task and recompute via the
  scheduler. Live preview during drag, commit on release.
- **Dot-connector dependency creation** (§6.8) — each bar shows two dots on hover: a
  **source dot** at its **center-bottom** and a **front dot** at its start. Drag from a
  source dot; a rubber-band line follows the cursor and every legal front dot lights up as a
  drop target; release on one to add `after <source>` to it. The front dot **accumulates**
  fan-in (an `after` task gains a predecessor; an absolute task converts to `after`, dropping
  its date). `addDependency` / `canAddDependency` in `barEdits.ts` reject self-links,
  duplicates, and cycles. Dependency edges are drawn center-bottom → front to match the dots.

## Still deferred

- **Removing** an `after` edge via the dots (detach is currently only the front-edge pin op).
- Lag / `type: wait` tasks (§6.10) and completion status.
