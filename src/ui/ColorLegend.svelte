<script lang="ts">
  import type { LegendEntry } from '../render/colors';

  // Value → color mapping for the key currently coloring the bars, shown as a row of chips so
  // the legend uses the same fills as the timeline.
  export let entries: LegendEntry[] = [];
</script>

{#if entries.length}
  <ul class="legend" aria-label="Color legend">
    {#each entries as entry}
      <li class="chip">
        <span class="swatch" style="background:{entry.fill}"></span>
        <span class="value">{entry.value}</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--fg-muted);
  }
  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid var(--bar-stroke);
    flex: none;
  }
  .value {
    white-space: nowrap;
  }
</style>
