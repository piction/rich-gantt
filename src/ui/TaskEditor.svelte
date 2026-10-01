<script lang="ts">
  // Edit popover for the focused task: label, metadata keys (add / rename / change / remove),
  // the raw free-markdown notes, and a jump to the source. The task id is shown, never editable.
  // The maximize button pops it out into a large centered dialog for long-form markdown.
  import type { Task } from '../model/types';
  import { splitMetadataBody, type MetadataParts } from '../interaction/barEdits';
  import Icon from './Icon.svelte';
  import { floating } from './floating';

  export let task: Task;
  export let anchor: Element | null;
  export let onSave: (edit: { label: string } & MetadataParts) => void;
  export let onCancel: () => void;
  export let onJumpToSource: () => void;

  const initial = splitMetadataBody(task.metadata?.body ?? '');
  let label = task.label;
  let attrs: [string, string][] = initial.attrs;
  let notes = initial.notes;
  let expanded = false;

  function save(): void {
    onSave({ label, attrs, notes });
  }

  function focusSelect(el: HTMLInputElement): void {
    el.focus();
    el.select();
  }

  function onKey(e: KeyboardEvent): void {
    const inName = (e.target as HTMLElement).classList.contains('name');
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || inName)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') onCancel();
    e.stopPropagation();
  }
</script>

{#if expanded}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={() => (expanded = false)} />
{/if}
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="pop"
  class:expanded
  role="dialog"
  aria-label="Edit task"
  tabindex="-1"
  use:floating={{ anchor: expanded ? null : anchor, placement: 'bottom-start' }}
  on:keydown={onKey}
>
  <div class="head">
    <Icon name="pencil" size={14} /><span class="muted">Edit</span>
    <code title="The task id is fixed">{task.id}</code>
    <button class="link" title="Show this task in the source editor" on:click={onJumpToSource}>
      <Icon name="code" size={13} /> Source
    </button>
    <button
      class="iconbtn"
      title={expanded ? 'Back to compact' : 'Pop out for long markdown'}
      on:click={() => (expanded = !expanded)}
    >
      <Icon name={expanded ? 'minimize' : 'maximize'} size={14} />
    </button>
  </div>

  <label class="field">
    <span class="lbl">Name</span>
    <input class="name" bind:value={label} use:focusSelect />
  </label>

  <div class="field">
    <span class="lbl">Keys</span>
    <div class="keys">
      {#each attrs as attr, i}
        <span class="kv">
          <input class="k" bind:value={attr[0]} placeholder="key" size={Math.max(3, attr[0].length)} />
          <input class="v" bind:value={attr[1]} placeholder="value" />
          <button
            class="rm"
            title="Remove key"
            on:click={() => (attrs = attrs.filter((_, j) => j !== i))}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      {/each}
      <button class="add" on:click={() => (attrs = [...attrs, ['', '']])}>
        <Icon name="plus" size={12} /> key
      </button>
    </div>
  </div>

  <label class="field notes">
    <span class="lbl">Notes <span class="muted">(markdown)</span></span>
    <textarea bind:value={notes} rows="4" spellcheck="false" />
  </label>

  <div class="foot">
    <span class="hint"><kbd>⌘↵</kbd> save <kbd>Esc</kbd> cancel</span>
    <button class="primary" on:click={save}>Save</button>
  </div>
</div>

<style>
  .pop {
    position: fixed;
    z-index: 20;
    width: 360px;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 12px;
    font-size: 12.5px;
  }
  /* Pop-out: large but not full screen, centered over a dimmed page. */
  .pop.expanded {
    z-index: 31;
    width: min(960px, 90vw);
    height: min(820px, 86vh);
    left: 50% !important;
    top: 50% !important;
    transform: translate(-50%, -50%);
    padding: 16px 18px;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgba(15, 17, 21, 0.45);
  }
  button {
    font: inherit;
    color: inherit;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
    color: var(--fg-muted);
  }
  .head code {
    font: 12px ui-monospace, monospace;
    color: var(--fg);
    background: var(--kbd-bg);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .link {
    margin-left: auto;
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-size: 11.5px;
    color: var(--accent);
  }
  .iconbtn {
    padding: 4px;
    border-radius: 6px;
    color: var(--fg-muted);
  }
  .iconbtn:hover {
    background: var(--kbd-bg);
    color: var(--fg);
  }
  .muted {
    color: var(--fg-muted);
    font-weight: 400;
  }
  .field {
    display: block;
    margin-bottom: 9px;
  }
  .lbl {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    margin-bottom: 3px;
  }
  input,
  textarea {
    font: inherit;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 6px 8px;
    outline: none;
  }
  input:focus,
  textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .name {
    width: 100%;
    font-size: 14px;
    font-weight: 600;
  }
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .kv {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
  }
  .kv input {
    border: 0;
    border-radius: 0;
    padding: 3px 6px;
    font-size: 11.5px;
    box-shadow: none;
  }
  .kv .k {
    background: var(--kbd-bg);
    color: var(--fg-muted);
  }
  .kv .v {
    width: 96px;
  }
  .kv:focus-within {
    border-color: var(--accent);
  }
  .rm {
    padding: 4px 5px;
    color: var(--fg-muted);
  }
  .rm:hover {
    color: var(--danger);
  }
  .add {
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 2px 7px;
    color: var(--fg-muted);
    font-size: 11.5px;
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
  .notes {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  textarea {
    width: 100%;
    flex: 1;
    resize: vertical;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.5;
  }
  .expanded textarea {
    resize: none;
    font-size: 13px;
    padding: 10px 12px;
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
    background: var(--accent);
    color: var(--accent-fg);
    border-radius: 7px;
    padding: 6px 14px;
    font-weight: 600;
  }
</style>
