<script lang="ts">
  import { onDestroy } from 'svelte';
  import { activeDocument, schedule } from '../stores/documentStore';
  import { zoom, theme as appTheme, colorKey } from '../stores/viewStore';
  import { computeLayout } from '../render/layout';
  import { availableColorKeys, colorLegend } from '../render/colors';
  import { WEEKEND_EXCLUDED_SCALE } from '../render/scale';
  import { exportSvg, readTheme, svgToPng } from '../render/exportSvg';
  import { downloadBlob } from '../utils/download';

  // Export the chart as an image: live preview + format / theme / content / resolution options.
  export let name: string; // plan title: header text and download filename
  export let meta: string; // "14 tasks · 6 Jan – 21 Mar"
  export let onClose: () => void;

  let format: 'png' | 'svg' = 'png';
  let theme: 'light' | 'dark' = $appTheme;
  let withTitle = true;
  let withLegend = true;
  let scale = 2;
  let busy = false;
  let previewUrl: string | undefined;

  $: doc = $activeDocument;
  $: key = doc ? $colorKey ?? availableColorKeys(doc)[0] ?? null : null;
  $: result =
    doc && $schedule
      ? exportSvg(
          computeLayout(doc, $schedule, $zoom, key, doc.excludeWeekends ? WEEKEND_EXCLUDED_SCALE : 1),
          {
            colors: readTheme(theme),
            title: withTitle ? { name, meta } : null,
            legend: withLegend ? colorLegend(doc, key) : [],
            durations: new Map([...doc.tasks.values()].map((t) => [t.id, t.duration])),
          },
        )
      : null;
  $: svgBlob = result ? new Blob([result.svg], { type: 'image/svg+xml' }) : null;
  $: previewUrl = swapUrl(previewUrl, svgBlob);
  $: size = result
    ? format === 'png'
      ? `${Math.round(result.width * scale)} × ${Math.round(result.height * scale)} px`
      : `${Math.round(result.width)} × ${Math.round(result.height)}`
    : '';

  function swapUrl(prev: string | undefined, blob: Blob | null): string | undefined {
    if (prev) URL.revokeObjectURL(prev);
    return blob ? URL.createObjectURL(blob) : undefined;
  }
  onDestroy(() => previewUrl && URL.revokeObjectURL(previewUrl));

  async function download(): Promise<void> {
    if (!result || !svgBlob) return;
    busy = true;
    try {
      const blob = format === 'svg' ? svgBlob : await svgToPng(result.svg, result.width, result.height, scale);
      downloadBlob(`${name}.${format}`, blob);
      onClose();
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click|self={onClose}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Export image">
    <div class="preview">
      {#if previewUrl}<img src={previewUrl} alt="Export preview" />{/if}
    </div>
    <div class="opts">
      <h3>Export image</h3>
      <div class="opt">
        <span class="lbl">Format</span>
        <div class="seg">
          <button class:on={format === 'png'} on:click={() => (format = 'png')}>PNG</button>
          <button class:on={format === 'svg'} on:click={() => (format = 'svg')}>SVG</button>
        </div>
      </div>
      <div class="opt">
        <span class="lbl">Theme</span>
        <div class="seg">
          <button class:on={theme === 'light'} on:click={() => (theme = 'light')}>Light</button>
          <button class:on={theme === 'dark'} on:click={() => (theme = 'dark')}>Dark</button>
        </div>
      </div>
      <div class="opt">
        <span class="lbl">Include</span>
        <label><input type="checkbox" bind:checked={withTitle} /> Title &amp; date range</label>
        <label><input type="checkbox" bind:checked={withLegend} /> Color legend</label>
      </div>
      {#if format === 'png'}
        <div class="opt">
          <span class="lbl">Resolution</span>
          <div class="seg">
            {#each [1, 2, 3] as s}
              <button class:on={scale === s} on:click={() => (scale = s)}>{s}×</button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="foot">
        <span class="size">{size}</span>
        <span class="actions">
          <button class="cancel" on:click={onClose}>Cancel</button>
          <button class="primary" disabled={!result || busy} on:click={download}>Download</button>
        </span>
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: rgba(15, 23, 42, 0.35);
  }
  .dialog {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    width: min(1100px, calc(100vw - 48px));
    height: min(620px, calc(100vh - 48px));
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    overflow: hidden;
    font-size: 12.5px;
  }
  /* checkerboard so the image's own background is visible against the dialog */
  .preview {
    overflow: auto;
    padding: 16px;
    border-right: 1px solid var(--border);
    background: repeating-conic-gradient(var(--kbd-bg) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }
  .preview img {
    display: block;
    max-width: 100%;
    margin: auto;
    border-radius: 4px;
    box-shadow: var(--shadow);
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
  }
  .lbl {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    margin-bottom: 4px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 3px 0;
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
    padding: 3px 10px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--fg-muted);
  }
  .seg button.on {
    background: var(--surface);
    color: var(--fg);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
  .foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .size {
    font-size: 11px;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .cancel {
    font: inherit;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    border-radius: 7px;
    padding: 6px 12px;
    cursor: pointer;
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
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
