<script lang="ts">
  import { colorKey } from '../stores/viewStore';

  // Metadata keys the user can color by (from the active document). `selected` is the key
  // actually in effect (the store value, or the resolved default when the store is null) so
  // the dropdown reflects what's on screen.
  export let keys: string[] = [];
  export let selected: string | null = null;

  function onChange(e: Event): void {
    colorKey.set((e.currentTarget as HTMLSelectElement).value || null);
  }
</script>

{#if keys.length}
  <label class="color-key">
    <span>Color by</span>
    <select value={selected ?? ''} on:change={onChange}>
      {#each keys as key}
        <option value={key}>{key}</option>
      {/each}
    </select>
  </label>
{/if}

<style>
  .color-key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--fg-muted);
  }
  select {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
  }
</style>
