# interaction/

Bar gestures. Pure model edits live in `barEdits.ts`; the pointer wiring is in
`../render/Timeline.svelte`, and commits flow through `commitDocument` in
`../stores/documentStore.ts` (serialize → re-parse), so the editor pane and model stay in sync.

## Implemented

- **End-edge drag** → extend/shrink duration; position preserved. Successors are `after` the
  dragged task and cascade via the scheduler. Live preview during drag, commit on release.
- **Dot-connector dependency creation** (§6.8) — each bar shows two dots on hover: a
  **source dot** at its **center-bottom** and a **front dot** at its start. Drag from a
  source dot; a rubber-band line follows the cursor and every legal front dot lights up as a
  drop target; release on one to add `after <source>` to it. The front dot **accumulates**
  fan-in (an `after` task gains a predecessor; an absolute task converts to `after`, dropping
  its date). `addDependency` / `canAddDependency` in `barEdits.ts` reject self-links,
  duplicates, and cycles. Dependency edges are drawn center-bottom → front to match the dots.
