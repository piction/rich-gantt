<script lang="ts">
  import { computePosition, flip, shift, offset, size } from '@floating-ui/dom';
  import { tick } from 'svelte';
  import type { Task, ScheduledTask } from '../model/types';
  import type { LegendEntry } from '../render/colors';
  import { splitMetadataBody } from '../interaction/barEdits';
  import { formatWeekdayLabel, toEpochDay } from '../compute/dateMath';
  import { renderMetadataMarkdown } from './markdown';
  import Icon from './Icon.svelte';

  export let task: Task | null = null;
  export let scheduled: ScheduledTask | null = null;
  export let anchor: Element | null = null;
  export let labelOf: (id: string) => string = (id) => id; // predecessor names
  export let colorKey: string | null = null; // its value gets the swatch from the legend
  export let legend: LegendEntry[] = [];

  // Title + dates, one line per `after` predecessor, the keys as read-only chips (the same as
  // the key editor), then the free markdown notes below a divider. The notes are the point of
  // the card, so it grows with them: wider up to MAX_W (CSS), taller up to MAX_H or the space
  // the viewport has left. Notes that still don't fit fade out at the bottom.
  $: dependsOn = task && task.position.kind === 'after' ? task.position.ids : [];
  $: notes = task?.metadata ? splitMetadataBody(task.metadata.body).notes : '';
  $: attrs = task?.metadata ? [...task.metadata.attrs] : [];
  const fillOf = (v: string): string | undefined => legend.find((e) => e.value === v)?.fill;
  const day = (d: string): string => formatWeekdayLabel(toEpochDay(d));

  const MAX_H = 560;
  let card: HTMLDivElement;
  let notesEl: HTMLDivElement | null = null;
  let cut = false;

  // Reposition whenever the target task/anchor changes (Floating UI: flip/shift so it
  // never clips at the timeline edges).
  $: if (task && anchor) reposition();

  async function reposition(): Promise<void> {
    await tick();
    if (!card || !anchor) return;
    const { x, y } = await computePosition(anchor, card, {
      placement: 'top',
      middleware: [
        offset(8),
        flip(),
        size({
          padding: 6,
          apply({ availableHeight, elements }) {
            elements.floating.style.maxHeight = `${Math.min(MAX_H, availableHeight)}px`;
          },
        }),
        shift({ padding: 6 }),
      ],
    });
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    cut = !!notesEl && notesEl.scrollHeight > notesEl.clientHeight + 1;
  }
</script>

{#if task}
  <div class="card" bind:this={card}>
    <div>
      <div class="head">
        <span class="title">{task.label}</span>
        <span class="dur">{task.duration}d</span>
      </div>
      {#if scheduled}
        <div class="sub">
          <Icon name="calendar" size={11} />
          {day(scheduled.start)} → {day(scheduled.end)}
        </div>
      {/if}
      {#each dependsOn as id}
        <div class="sub"><Icon name="link" size={11} /> after <b>{labelOf(id)}</b></div>
      {/each}
    </div>
    {#if attrs.length}
      <div class="chips">
        {#each attrs as [k, v]}
          {@const fill = k === colorKey ? fillOf(v) : undefined}
          <span class="kv">
            <span class="k">{k}</span>
            <span class="v">{#if fill}<span class="sw" style:background={fill} />{/if}{v}</span>
          </span>
        {/each}
      </div>
    {/if}
    {#if notes}
      <div class="rule" />
      <div class="notes" class:cut bind:this={notesEl}>{@html renderMetadataMarkdown(notes)}</div>
    {/if}
  </div>
{/if}

<style>
  .card {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10;
    /* grows with the content: no narrower than the old card, no wider than a reading column */
    width: max-content;
    min-width: 280px;
    max-width: 440px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 10px 12px;
    overflow: hidden;
    font-size: 12.5px;
    pointer-events: none;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .title {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    font-size: 13.5px;
    line-height: 1.3;
  }
  .dur {
    flex: none;
    font-weight: 600;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--fg-muted);
    background: var(--kbd-bg);
    border-radius: 4px;
    padding: 1px 6px;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    font-size: 11.5px;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
  }
  .sub b {
    color: var(--fg);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .kv {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    font-size: 11.5px;
  }
  .k {
    background: var(--kbd-bg);
    color: var(--fg-muted);
    padding: 2px 6px;
  }
  .v {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
  }
  .sw {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex: none;
  }
  /* Divider between the structured part and the free notes; runs edge to edge. */
  .rule {
    flex: none;
    height: 1px;
    background: var(--border);
    margin: 4px -12px 2px;
  }
  /* Basic-markdown rendering of the notes (see ui/markdown.ts). They take whatever height the
     card has left; when that isn't enough the last lines fade out. */
  .notes {
    flex: 0 1 auto;
    min-height: 0;
    line-height: 1.45;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .notes.cut {
    mask-image: linear-gradient(to bottom, #000 calc(100% - 32px), transparent);
  }
  .notes :global(code) {
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
    background: var(--kbd-bg);
    border-radius: 3px;
    padding: 0 3px;
  }
  .notes :global(a) {
    color: var(--accent);
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
    background: var(--kbd-bg);
    border-radius: 4px;
    overflow-x: auto;
  }
  .notes :global(pre) :global(code) {
    background: none;
    padding: 0;
  }
</style>
