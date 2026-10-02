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
- **Focus mode** — clicking a bar body selects it (first click never mutates): focus ring,
  unrelated bars fade, its own arrows turn accent, and `ui/FocusPill.svelte` floats above it.
  - **Move**: drag the selected body (4 px threshold) or `←`/`→` (`⇧` = week). `moveTask` pins
    the task to an absolute date, so `after` links are cut — previewed as a red dashed edge with
    a scissors badge plus a readout. Dropping back on the original day cancels. The pill's
    link-chip ✕ unlinks in place.
  - **Length**: pill stepper / `+` `−`, or type digits while focused (`7`, `7.5`, `2w`); live
    preview, `↵` commits, `Esc` reverts. Same `setDuration` as the end-edge drag.
  - **Add after** (`A`): `ui/AddTaskPopover.svelte` + ghost-bar preview of `addTaskAfter`. Id is
    `newTaskId`: first word of the section, ≤5 alphanumerics, plus a unique counter (`found1`).
    `⇧↵` creates and opens another add-after on the new task.
  - **New task** (toolbar `+ Task` / `N`, no selection needed): same popover plus a start-date
    picker, defaulting to the chart's earliest start. `addTaskAt` pins it to that date and
    appends it to the chosen section.
  - **Edit** (`↵` / double-click): `ui/TaskEditor.svelte` — label, metadata keys, raw markdown
    notes, jump to source; id is read-only. Pop-out button for a large markdown editor.
    Saved through `updateTask`.
  - **Delete** (`Del`): `deleteTask` pins direct successors to their current start (as if
    unlinked), so nothing else moves. No confirm and no undo (undo is out of scope).
