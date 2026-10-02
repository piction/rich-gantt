<script lang="ts">
  // Multi-select quick actions, floating above the selected block: count, nudge the block a day
  // left / right, clear. Moving is the only group action. Pure view — every action is a callback.
  import Icon from './Icon.svelte';
  import { floating } from './floating';

  export let count: number;
  export let anchor: Element | null;
  export let onNudge: (days: number) => void;
  export let onClear: () => void;
</script>

<div class="pill" use:floating={{ anchor, placement: 'top' }}>
  <span class="count"><span class="badge">{count}</span>tasks selected</span>
  <span class="sep" />
  <button class="pbtn" aria-label="Move −1 day" on:click={() => onNudge(-1)}>
    <Icon name="minus" size={13} /><span class="tip">Move −1 day <kbd>←</kbd></span>
  </button>
  <span class="muted">move</span>
  <button class="pbtn" aria-label="Move +1 day" on:click={() => onNudge(1)}>
    <Icon name="plus" size={13} /><span class="tip">Move +1 day <kbd>→</kbd></span>
  </button>
  <span class="sep" />
  <span class="muted hint">drag any selected bar</span>
  <button class="pbtn" aria-label="Clear selection" on:click={onClear}>
    <Icon name="x" size={13} /><span class="tip">Clear selection <kbd>Esc</kbd></span>
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
  .hint {
    padding: 0 6px;
    font-size: 11.5px;
  }
  .sep {
    width: 1px;
    align-self: stretch;
    margin: 4px 3px;
    background: var(--border);
  }
  .count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px 3px 6px;
    font-weight: 600;
  }
  .badge {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--surface);
    font: 700 11px/18px system-ui, sans-serif;
    text-align: center;
  }
  .pbtn {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 6px 7px;
    border-radius: 7px;
  }
  .pbtn:hover {
    background: var(--kbd-bg);
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
