<script lang="ts">
  // Focus-mode quick actions, floating above the focused bar: link chip (with unlink), length
  // stepper (type an exact length), + After, Edit, Delete. Pure view — every action is a callback.
  import type { Task } from '../model/types';
  import Icon from './Icon.svelte';
  import { floating } from './floating';

  export let task: Task;
  export let anchor: Element | null;
  export let startLabel: string; // pinned start, shown when the task is not `after` anything
  export let excludeWeekends = false;
  export let onUnlink: () => void;
  export let onPreviewDuration: (days: number | null) => void; // null = clear preview
  export let onSetDuration: (days: number) => void;
  export let onAdd: () => void;
  export let onEdit: () => void;
  export let onDelete: () => void;

  let durInput: HTMLInputElement;
  let durText = '';
  let editingDur = false;

  $: after = task.position.kind === 'after' ? task.position.ids : null;
  $: if (!editingDur) durText = String(task.duration);

  /** `7`, `7.5`, `7d`, `2w` (a week = 5 working days when weekends are excluded, else 7). */
  function parseDuration(s: string): number | null {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*([dw])?\s*$/i.exec(s);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    const days = m[2]?.toLowerCase() === 'w' ? n * (excludeWeekends ? 5 : 7) : n;
    return days > 0 ? days : null;
  }

  /** Called by the timeline when a digit is typed while a bar is focused. */
  export function startDurationEdit(initial: string): void {
    editingDur = true;
    durText = durInput.value = initial;
    durInput.focus(); // editingDur is set, so focus keeps the caret after the digit
    onPreviewDuration(parseDuration(durText));
  }

  function onDurInput(): void {
    editingDur = true;
    onPreviewDuration(parseDuration(durText));
  }

  function commitDur(): void {
    if (!editingDur) return;
    editingDur = false;
    const days = parseDuration(durText);
    onPreviewDuration(null);
    if (days !== null && days !== task.duration) onSetDuration(days);
  }

  function onDurKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') durInput.blur(); // blur commits
    else if (e.key === 'Escape') {
      editingDur = false;
      onPreviewDuration(null);
      durInput.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = parseDuration(durText) ?? task.duration;
      durText = String(Math.max(0.5, cur + (e.key === 'ArrowUp' ? 1 : -1)));
      onDurInput();
    }
    e.stopPropagation();
  }

  function step(d: number): void {
    onSetDuration(Math.max(0.5, task.duration + d));
  }
</script>

<div class="pill" use:floating={{ anchor, placement: 'top' }}>
  {#if after}
    <span class="chip" title="Start follows {after.join(', ')} — moving the bar unlinks it">
      <Icon name="link" size={13} />
      <span class="muted">after</span>
      <span class="name">{after.join(', ')}</span>
      <button class="x" title="Unlink (pin to the current start date)" on:click={onUnlink}>
        <Icon name="x" size={11} />
      </button>
    </span>
  {:else}
    <span class="chip" title="Pinned start date — drag the bar or use ← / → to move">
      <Icon name="calendar" size={13} />
      <span class="name">{startLabel}</span>
    </span>
  {/if}

  {#if task.kind !== 'milestone'}
    <span class="sep" />
    <span class="stepper" class:editing={editingDur}>
      <button title="−1 day (−)" on:click={() => step(-1)}><Icon name="minus" size={13} /></button>
      <input
        bind:this={durInput}
        bind:value={durText}
        class="num"
        aria-label="Length in days"
        title="Length in days — type 7, 7.5 or 2w"
        on:focus={() => !editingDur && durInput.select()}
        on:input={onDurInput}
        on:keydown={onDurKey}
        on:blur={commitDur}
      /><span class="unit">d</span>
      <button title="+1 day (+)" on:click={() => step(1)}><Icon name="plus" size={13} /></button>
    </span>
  {/if}

  <span class="sep" />
  <button class="pbtn" on:click={onAdd}>
    <Icon name="plus" /><span>After</span><span class="tip">Add task after <kbd>A</kbd></span>
  </button>
  <button class="pbtn icon" aria-label="Edit" on:click={onEdit}>
    <Icon name="pencil" /><span class="tip">Edit <kbd>↵</kbd></span>
  </button>
  <button class="pbtn icon danger" aria-label="Delete" on:click={onDelete}>
    <Icon name="trash" /><span class="tip">Delete <kbd>Del</kbd></span>
  </button>
</div>

<style>
  .pill {
    position: fixed;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    padding: 3px;
    font-size: 12px;
    white-space: nowrap;
    animation: pop-in 0.14s ease-out;
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  button {
    font: inherit;
    color: inherit;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .muted {
    color: var(--fg-muted);
  }
  .sep {
    width: 1px;
    align-self: stretch;
    margin: 4px 3px;
    background: var(--border);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 4px 3px 8px;
    color: var(--fg-muted);
  }
  .chip .name {
    color: var(--fg);
    font-weight: 600;
  }
  .chip .x {
    padding: 3px;
    border-radius: 5px;
    color: var(--fg-muted);
  }
  .chip .x:hover {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    border-radius: 7px;
    padding: 0 2px;
  }
  .stepper button {
    padding: 5px;
    border-radius: 6px;
    color: var(--fg-muted);
  }
  .stepper button:hover {
    background: var(--kbd-bg);
    color: var(--fg);
  }
  .stepper.editing {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }
  .num {
    width: 3.2em;
    text-align: right;
    font: 600 13px system-ui, sans-serif;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
    background: none;
    border: 0;
    outline: none;
    padding: 3px 1px;
  }
  .unit {
    color: var(--fg-muted);
    font-weight: 600;
    padding-right: 4px;
  }
  .pbtn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 9px;
    border-radius: 7px;
    font-weight: 500;
  }
  .pbtn.icon {
    padding: 6px 7px;
  }
  .pbtn:hover {
    background: var(--kbd-bg);
  }
  .pbtn.danger:hover {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--fg);
    color: var(--bg);
    font-size: 11px;
    padding: 4px 7px;
    border-radius: 6px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.1s 0.35s;
  }
  .pbtn:hover .tip {
    opacity: 1;
  }
  kbd {
    font: 600 10.5px ui-monospace, monospace;
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 0 4px;
    opacity: 0.8;
  }
</style>
