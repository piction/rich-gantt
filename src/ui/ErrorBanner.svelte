<script lang="ts">
  import type { ParseError } from '../model/types';
  export let errors: ParseError[] = [];
  export let warnings: ParseError[] = [];
</script>

{#if errors.length > 0}
  <div class="banner error" role="alert">
    <strong>{errors.length} parse error{errors.length > 1 ? 's' : ''}</strong>
    — showing last valid chart.
    <ul>
      {#each errors as e}
        <li>{e.line ? `Line ${e.line}: ` : ''}{e.message}</li>
      {/each}
    </ul>
  </div>
{:else if warnings.length > 0}
  <div class="banner warn">
    {#each warnings as w}
      <div>⚠ {w.message}</div>
    {/each}
  </div>
{/if}

<style>
  .banner {
    padding: 6px 10px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .banner.error {
    background: var(--error-bg);
    color: var(--error-fg);
    border-color: var(--error-border);
  }
  .banner.warn {
    background: var(--panel-bg);
    color: var(--fg-muted);
  }
  ul {
    margin: 4px 0 0;
    padding-left: 18px;
  }
</style>
