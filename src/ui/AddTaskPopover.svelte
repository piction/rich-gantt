<script lang="ts">
  // "+ After" bootstrap: asks only for a name; length and section default to the focused
  // task's. The timeline previews the draft as a ghost bar (this popover is anchored to it).
  // Without `afterLabel` it is "+ New task": a free task pinned to a bound `start`. With
  // `newSection` it creates a section: its name is typed on top and the task is its first.
  import type { NewTaskDraft } from '../interaction/barEdits';
  import { isValidDateString } from '../compute/dateMath';
  import Icon from './Icon.svelte';
  import { floating } from './floating';

  export let afterLabel: string | null = null;
  export let start = ''; // bound, YYYY-MM-DD; only used without afterLabel
  export let newSection = false;
  export let draft: NewTaskDraft; // bound: edits drive the ghost-bar preview
  export let sections: string[];
  export let anchor: Element | null;
  export let onCreate: (chain: boolean) => void; // chain = immediately add another after it
  export let onCancel: () => void;

  const PICKS = [1, 2, 3, 5, 10];
  $: picks = [...new Set([...PICKS, draft.duration])].sort((a, b) => a - b);

  function focusInput(el: HTMLInputElement): void {
    el.focus();
  }

  // A half-typed or cleared date is not propagated, so the ghost-bar preview never breaks.
  function onDate(e: Event): void {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (isValidDateString(v)) start = v;
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCreate(e.shiftKey);
    } else if (e.key === 'Escape') onCancel();
    e.stopPropagation();
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="pop"
  role="dialog"
  aria-label="New task"
  tabindex="-1"
  use:floating={{ anchor, placement: 'bottom-start' }}
  on:keydown={onKey}
>
  <div class="head">
    {#if afterLabel}
      <Icon name="after" size={14} /><span class="muted">New task after</span><b>{afterLabel}</b>
    {:else}
      <Icon name="plus" size={14} /><span class="muted">{newSection ? 'New section' : 'New task'}</span>
    {/if}
  </div>
  {#if newSection}
    <input class="name" placeholder="Section name" bind:value={draft.section} use:focusInput />
    <input class="name" placeholder="First task name" bind:value={draft.label} />
  {:else}
    <input class="name" placeholder="Task name" bind:value={draft.label} use:focusInput />
  {/if}
  {#if !afterLabel}
    <div class="row">
      <span class="lbl">Start</span>
      <input type="date" class="date" value={start} on:input={onDate} />
    </div>
  {/if}
  <div class="row">
    <span class="lbl">Length</span>
    <div class="seg">
      {#each picks as d}
        <button class:on={d === draft.duration} on:click={() => (draft.duration = d)}>{d}d</button>
      {/each}
    </div>
  </div>
  {#if !newSection}
    <div class="row">
      <span class="lbl">Section</span>
      <select bind:value={draft.section}>
        {#each sections as s}<option value={s}>{s}</option>{/each}
      </select>
    </div>
  {/if}
  <div class="foot">
    <span class="hint"><kbd>↵</kbd> create <kbd>⇧↵</kbd> + next <kbd>Esc</kbd></span>
    <button class="primary" on:click={() => onCreate(false)}>Create</button>
  </div>
</div>

<style>
  .pop {
    position: fixed;
    z-index: 20;
    width: 300px;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 12px;
    font-size: 12.5px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    color: var(--fg-muted);
  }
  .head b {
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted {
    color: var(--fg-muted);
    flex: none;
  }
  .name {
    width: 100%;
    font: 600 14px system-ui, sans-serif;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 7px 9px;
    outline: none;
    margin-bottom: 10px;
  }
  .name:focus,
  .date:focus,
  select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .lbl {
    width: 52px;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
  }
  .seg {
    display: inline-flex;
    background: var(--kbd-bg);
    border-radius: 7px;
    padding: 2px;
  }
  .seg button {
    font: inherit;
    border: 0;
    background: none;
    padding: 3px 9px;
    border-radius: 5px;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    color: var(--fg-muted);
  }
  .seg button.on {
    background: var(--surface);
    color: var(--fg);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
  select,
  .date {
    font: inherit;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 4px 6px;
    outline: none;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
  }
  .hint {
    font-size: 11px;
    color: var(--fg-muted);
    display: flex;
    gap: 4px;
    align-items: center;
  }
  kbd {
    font: 600 10.5px ui-monospace, monospace;
    background: var(--kbd-bg);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 4px;
    color: var(--fg);
  }
  .primary {
    font: inherit;
    background: var(--accent);
    color: var(--accent-fg);
    border: 0;
    border-radius: 7px;
    padding: 6px 14px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
