<script lang="ts">
  import { zoom } from '../stores/viewStore';
  import type { ZoomLevel } from '../render/scale';
  const levels: ZoomLevel[] = ['month', 'week', 'day'];
</script>

<div class="zoom" role="group" aria-label="Timescale zoom">
  {#each levels as level}
    <button class:active={$zoom === level} on:click={() => zoom.set(level)}>
      {level}
    </button>
  {/each}
</div>

<style>
  .zoom {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  button {
    border: 0;
    background: var(--bg);
    color: var(--fg-muted);
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    text-transform: capitalize;
  }
  button + button {
    border-left: 1px solid var(--border);
  }
  button.active {
    background: var(--bar-0);
    color: #fff;
  }
</style>
