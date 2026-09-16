<script lang="ts">
  import { sourceText, activeDocument, loadSource } from '../stores/documentStore';
  import { serializeDocument } from '../serializer';
  import { downloadText, readFileText } from '../utils/download';
  import { theme } from '../stores/viewStore';
  import { get } from 'svelte/store';

  let fileInput: HTMLInputElement;

  async function onUpload(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) loadSource(await readFileText(file));
    (e.target as HTMLInputElement).value = '';
  }

  function onDownload(): void {
    // Prefer the canonical serialization of the parsed model; fall back to raw text.
    const doc = get(activeDocument);
    const text = doc ? serializeDocument(doc) : get(sourceText);
    downloadText('plan.md', text);
  }

  function toggleTheme(): void {
    theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }
</script>

<div class="toolbar">
  <strong class="brand">Gantt Planner</strong>
  <button on:click={() => fileInput.click()}>Upload</button>
  <button on:click={onDownload}>Download</button>
  <input
    bind:this={fileInput}
    type="file"
    accept=".md,text/markdown"
    on:change={onUpload}
    hidden
  />
  <span class="spacer"></span>
  <button on:click={toggleTheme} title="Toggle theme">
    {$theme === 'dark' ? '☀' : '☾'}
  </button>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-bg);
  }
  .brand {
    font-size: 13px;
    margin-right: 4px;
  }
  .spacer {
    flex: 1;
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
