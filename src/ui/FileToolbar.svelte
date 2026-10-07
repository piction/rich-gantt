<script lang="ts">
  import { sourceText, activeDocument, schedule, loadSource } from '../stores/documentStore';
  import { serializeDocument } from '../serializer';
  import { downloadText, readFileText } from '../utils/download';
  import { formatDayLabel } from '../compute/dateMath';
  import { theme } from '../stores/viewStore';
  import { get } from 'svelte/store';
  import ExportDialog from './ExportDialog.svelte';

  let fileInput: HTMLInputElement;
  let exporting = false;
  // Plan title: names the downloaded file, filled from the uploaded file's name.
  let planName = 'plan';
  let committed = planName;

  $: tasks = $schedule ? [...$schedule.tasks.values()] : [];
  $: meta = tasks.length
    ? `${tasks.length} tasks · ${formatDayLabel(Math.min(...tasks.map((t) => t.startDay)))} – ` +
      formatDayLabel(Math.ceil(Math.max(...tasks.map((t) => t.endDay))) - 1)
    : '';

  async function onUpload(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      planName = committed = file.name.replace(/\.md$/i, '');
      loadSource(await readFileText(file));
    }
    (e.target as HTMLInputElement).value = '';
  }

  function onDownload(): void {
    // Prefer the canonical serialization of the parsed model; fall back to raw text.
    const doc = get(activeDocument);
    const text = doc ? serializeDocument(doc) : get(sourceText);
    downloadText(`${planName.trim() || 'plan'}.md`, text);
  }

  function onTitleKey(e: KeyboardEvent): void {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === 'Escape') planName = committed;
    if (e.key === 'Enter' || e.key === 'Escape') input.blur();
  }

  function onTitleBlur(): void {
    planName = committed = planName.trim() || 'plan';
  }

  function toggleTheme(): void {
    theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }
</script>

<div class="toolbar">
  <div class="side">
    <strong class="brand">Gantt Planner</strong>
  </div>
  <div class="center">
    <span class="grow" data-value={planName || 'plan'}>
      <input
        class="title"
        bind:value={planName}
        on:keydown={onTitleKey}
        on:blur={onTitleBlur}
        placeholder="plan"
        spellcheck="false"
        size="1"
        title="Plan title (download filename)"
      />
    </span>
    {#if meta}<span class="meta">{meta}</span>{/if}
  </div>
  <div class="side right">
    <button on:click={() => fileInput.click()}>Upload</button>
    <button on:click={onDownload}>Download</button>
    <button on:click={() => (exporting = true)} disabled={!$schedule}>Export…</button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".md,text/markdown"
      on:change={onUpload}
      hidden
    />
    <button on:click={toggleTheme} title="Toggle theme">
      {$theme === 'dark' ? '☀' : '☾'}
    </button>
  </div>
</div>

{#if exporting}
  <ExportDialog name={planName.trim() || 'plan'} {meta} onClose={() => (exporting = false)} />
{/if}

<style>
  /* Three columns: equal-width sides keep the title truly centered. */
  .toolbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-bg);
  }
  .side {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .right {
    justify-content: flex-end;
  }
  .brand {
    font-size: 13px;
  }
  .center {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  /* Input auto-sizes to its text: a hidden ::after copy sets the grid cell's width. */
  .grow {
    display: inline-grid;
    min-width: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .grow::after {
    content: attr(data-value);
    visibility: hidden;
    white-space: pre;
    padding: 2px 8px;
    border: 1px solid transparent;
  }
  .grow::after,
  .title {
    grid-area: 1 / 1;
  }
  .title {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 2px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    outline: none;
    background: transparent;
    color: var(--fg);
    font: inherit;
    text-align: center;
    text-overflow: ellipsis;
    cursor: text;
  }
  .title:hover {
    background: var(--kbd-bg);
  }
  .title:focus {
    background: var(--bg);
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .title::placeholder {
    color: var(--fg-muted);
  }
  .meta {
    font-size: 11.5px;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  button {
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    padding: 4px 10px;
    font-size: 12px;
    border-radius: 5px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--fg-muted);
  }
</style>
