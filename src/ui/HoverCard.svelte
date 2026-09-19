<script lang="ts">
  import { computePosition, flip, shift, offset } from '@floating-ui/dom';
  import { tick } from 'svelte';
  import type { Task, ScheduledTask } from '../model/types';
  import { renderMetadataMarkdown } from './markdown';

  export let task: Task | null = null;
  export let scheduled: ScheduledTask | null = null;
  export let anchor: Element | null = null;
  // Locked = the card is pinned to a selected task; it then accepts pointer events so the
  // link icon becomes an actionable unlink button.
  export let locked = false;
  export let onUnlink: () => void = () => {};
  // Commit edited fields (duration in days, markdown body) for the current task; editor mode
  // is entered by double-clicking the task (see editSignal).
  export let onSave: (changes: { duration: number; body: string }) => void = () => {};
  // Commit a new absolute start date (YYYY-MM-DD) for the current task.
  export let onStartChange: (date: string) => void = () => {};
  // Bumped by the parent on every task selection (double-click); each bump enters editor mode.
  export let editSignal = 0;

  // Inline-edit state.
  let editing = false;
  let editingStart = false;
  let durationInput: HTMLInputElement;
  let bodyInput: HTMLTextAreaElement;
  let startInput: HTMLInputElement;

  // Leaving the selection (card no longer locked) exits editor mode.
  $: if (!locked) ((editing = false), (editingStart = false));
  // Each selection signal enters editor mode with the cursor on the duration.
  let lastSignal = editSignal;
  $: if (editSignal !== lastSignal) {
    lastSignal = editSignal;
    startEdit();
  }

  async function startEdit(): Promise<void> {
    editing = true;
    await tick();
    // The card grew into an edit panel — re-clamp it so it stays within the viewport.
    reposition();
    // Cursor defaults to the duration field, with its value selected for quick overtyping.
    durationInput?.focus();
    durationInput?.select();
  }

  function commitEdit(): void {
    if (!editing) return; // already closed (e.g. cancelled via Escape)
    const days = Number(durationInput?.value);
    const body = bodyInput?.value ?? '';
    editing = false;
    if (Number.isFinite(days) && days > 0) onSave({ duration: days, body });
  }

  // Commit only when focus leaves the card entirely; moving between the duration input and the
  // body textarea keeps the editor open.
  function onCardFocusOut(e: FocusEvent): void {
    if (!editing) return;
    const next = e.relatedTarget as Node | null;
    if (next && card?.contains(next)) return;
    commitEdit();
  }

  function onDurationKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') editing = false; // unmounts inputs; commitEdit no-ops
  }

  function onBodyKey(e: KeyboardEvent): void {
    // Plain Enter inserts a newline (multi-line markdown); Cmd/Ctrl+Enter commits.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitEdit();
    else if (e.key === 'Escape') editing = false;
  }

  // Start-date editing: reveal a date input seeded with the current start, then open its native
  // picker so the calendar lands on that date.
  async function startDateEdit(): Promise<void> {
    editingStart = true;
    await tick();
    startInput?.focus();
    startInput?.showPicker?.();
  }

  function commitStart(): void {
    if (!editingStart) return; // change + blur can both fire; commit once
    const date = startInput?.value;
    editingStart = false;
    if (date) onStartChange(date);
  }

  // When the start is derived from predecessors (`after`), show a link icon and name them.
  $: dependsOn =
    task && task.position.kind === 'after' ? task.position.ids : null;

  let card: HTMLDivElement;

  // Reposition whenever the target task/anchor changes (Floating UI: flip/shift so it
  // never clips at the timeline edges).
  $: if (task && anchor) reposition();

  async function reposition(): Promise<void> {
    await tick();
    if (!card || !anchor) return;
    const { x, y } = await computePosition(anchor, card, {
      placement: 'top',
      middleware: [offset(8), flip(), shift({ padding: 6 })],
    });
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }
</script>

{#if task}
  <div class="card" class:locked class:editing bind:this={card} on:focusout={onCardFocusOut}>
    <div class="title">
      <span class="title-text">{task.label} <span class="id">{task.id}</span></span>
      {#if editing}
        <span class="duration duration-edit">
          <input
            type="number"
            min="1"
            bind:this={durationInput}
            value={task.duration}
            on:keydown={onDurationKey}
            on:click|stopPropagation
          />d
        </span>
      {:else}
        <span class="duration">{task.duration}d</span>
      {/if}
    </div>
    {#if editing}
      <textarea
        class="notes-edit"
        bind:this={bodyInput}
        value={task.metadata?.body ?? ''}
        placeholder="Markdown notes…"
        rows="4"
        on:keydown={onBodyKey}
        on:click|stopPropagation
      ></textarea>
    {:else if task.metadata && task.metadata.body}
      <div class="notes">{@html renderMetadataMarkdown(task.metadata.body)}</div>
    {:else}
      <div class="empty">No metadata for this task.</div>
    {/if}
    {#if scheduled}
      <div class="dates">
        <div class="date-row">
          <span class="date-key">
            Start
            {#if dependsOn}
              {#if locked}
                <button
                  type="button"
                  class="link-btn"
                  title={`Unlink from ${dependsOn.join(', ')}`}
                  aria-label={`Unlink from ${dependsOn.join(', ')}`}
                  on:click|stopPropagation={onUnlink}
                >
                  <svg
                    class="link-icon"
                    viewBox="0 0 24 24"
                    width="11"
                    height="11"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </button>
              {:else}
                <svg
                  class="link-icon"
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <title>Starts after {dependsOn.join(', ')}</title>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              {/if}
            {:else if locked}
              <button
                type="button"
                class="link-btn"
                title="Edit start date"
                aria-label="Edit start date"
                on:click|stopPropagation={startDateEdit}
              >
                <svg
                  class="link-icon"
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </button>
            {/if}
          </span>
          {#if editingStart}
            <input
              type="date"
              class="start-input"
              bind:this={startInput}
              value={scheduled.start}
              on:change={commitStart}
              on:blur={commitStart}
              on:click|stopPropagation
            />
          {:else}
            <span class="date-val">{scheduled.start}</span>
          {/if}
        </div>
        <div class="date-row">
          <span class="date-key">End</span>
          <span class="date-val">{scheduled.end}</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .card {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10;
    max-width: 280px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    padding: 8px 10px;
    font-size: 12px;
    pointer-events: none;
  }
  /* While editing, the card grows into a roomy panel so the notes are comfortable to write
     in — a generous width and larger type, overriding the compact hover-card sizing. */
  .card.editing {
    max-width: none;
    width: min(560px, 90vw);
    padding: 14px 16px;
    font-size: 14px;
  }
  /* A locked (selected) card is interactive so its controls can be clicked. */
  .card.locked {
    pointer-events: auto;
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }
  .title-text {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 600;
  }
  .duration {
    flex: none;
    align-self: flex-start;
    color: var(--fg-muted);
    font-weight: 600;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    background: var(--bg-muted, rgba(127, 127, 127, 0.15));
    border-radius: 4px;
    padding: 1px 6px;
    white-space: nowrap;
  }
  /* Inline duration editor: keep the pill footprint, swap the number for an input. */
  .duration-edit {
    padding: 0 6px 0 3px;
  }
  .duration-edit input {
    width: 2.5em;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: right;
    padding: 0;
    margin-right: 1px;
  }
  .duration-edit input:focus {
    outline: none;
  }
  .id {
    color: var(--fg-muted);
    font-weight: 400;
    font-family: ui-monospace, monospace;
  }
  /* Basic-markdown rendering of the metadata body (see ui/markdown.ts). */
  .notes :global(code) {
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
    background: var(--bg-muted, rgba(127, 127, 127, 0.15));
    border-radius: 3px;
    padding: 0 3px;
  }
  .notes :global(a) {
    color: var(--accent, #3b82f6);
  }
  .notes :global(ul),
  .notes :global(ol) {
    margin: 2px 0;
    padding-left: 16px;
  }
  /* Block elements from a multi-line body: keep them compact inside the card. */
  .notes :global(h1),
  .notes :global(h2),
  .notes :global(h3),
  .notes :global(h4),
  .notes :global(h5),
  .notes :global(h6) {
    margin: 6px 0 2px;
    font-size: 1em;
    font-weight: 600;
  }
  .notes :global(pre) {
    margin: 4px 0;
    padding: 6px 8px;
    background: var(--bg-muted, rgba(127, 127, 127, 0.15));
    border-radius: 4px;
    overflow-x: auto;
  }
  .notes :global(pre) :global(code) {
    background: none;
    padding: 0;
  }
  .empty {
    color: var(--fg-muted);
  }
  /* Inline body editor: a roomy textarea so notes are comfortable to write. */
  .notes-edit {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-height: 40vh;
    resize: vertical;
    font: inherit;
    line-height: 1.5;
    color: var(--fg);
    background: var(--bg-muted, rgba(127, 127, 127, 0.08));
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 10px;
  }
  .notes-edit:focus {
    outline: none;
    border-color: var(--accent, #3b82f6);
  }
  /* Start/end dates: a separate section below a divider. */
  .dates {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .date-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .date-key {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--fg-muted);
  }
  .link-icon {
    color: var(--fg-muted);
    display: block;
  }
  /* Unlink control: an icon-only button that stays visually quiet until hovered. */
  .link-btn {
    display: inline-flex;
    align-items: center;
    padding: 1px;
    margin: -1px;
    border: none;
    background: none;
    color: var(--fg-muted);
    cursor: pointer;
    border-radius: 3px;
  }
  .link-btn:hover {
    color: var(--accent, #3b82f6);
    background: var(--bg-muted, rgba(127, 127, 127, 0.15));
  }
  .date-val {
    font-variant-numeric: tabular-nums;
  }
  /* Inline start-date picker: matches the card typography, quiet border. */
  .start-input {
    font: inherit;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
  }
  .start-input:focus {
    outline: none;
    border-color: var(--accent, #3b82f6);
  }
</style>
