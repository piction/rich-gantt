<script lang="ts">
  import { computePosition, flip, shift, offset } from '@floating-ui/dom';
  import { tick } from 'svelte';
  import type { SectionBand } from '../render/layout';

  export let section: SectionBand | null = null;
  export let anchor: Element | null = null;

  let card: HTMLDivElement;

  // Reposition whenever the target section/anchor changes (Floating UI: flip/shift so it
  // never clips at the viewport edges).
  $: if (section && anchor) reposition();

  async function reposition(): Promise<void> {
    await tick();
    if (!card || !anchor) return;
    const { x, y } = await computePosition(anchor, card, {
      placement: 'bottom-start',
      middleware: [offset(8), flip(), shift({ padding: 6 })],
    });
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }

  // Trim float artifacts from working-day spans; keep the 0.5 granularity tasks use.
  const fmtDays = (n: number): string => `${Math.round(n * 100) / 100}d`;
</script>

{#if section}
  <div class="card" bind:this={card}>
    <div class="title">{section.name}</div>
    <div class="rows">
      <div class="row">
        <span class="key">Duration</span>
        <span class="val">
          {fmtDays(section.durationDays)}
          <span class="dates">({section.startDate} → {section.endDate})</span>
        </span>
      </div>
      <div class="row">
        <span class="key">Total work</span>
        <span class="val">{fmtDays(section.totalWorkDays)}</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .card {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10;
    max-width: 320px;
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
    font-weight: 600;
    margin-bottom: 4px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .key {
    color: var(--fg-muted);
  }
  .val {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .dates {
    color: var(--fg-muted);
  }
</style>
