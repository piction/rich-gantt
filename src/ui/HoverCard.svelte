<script lang="ts">
  import { computePosition, flip, shift, offset } from '@floating-ui/dom';
  import { tick } from 'svelte';
  import type { Task, ScheduledTask } from '../model/types';
  import { renderMetadataMarkdown } from './markdown';

  export let task: Task | null = null;
  export let scheduled: ScheduledTask | null = null;
  export let anchor: Element | null = null;

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
  <div class="card" bind:this={card}>
    <div class="title">
      <span class="title-text">{task.label} <span class="id">{task.id}</span></span>
      <span class="duration">{task.duration}d</span>
    </div>
    {#if task.metadata && task.metadata.body}
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
          </span>
          <span class="date-val">{scheduled.start}</span>
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
  .date-val {
    font-variant-numeric: tabular-nums;
  }
</style>
