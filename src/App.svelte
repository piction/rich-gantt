<script lang="ts">
  import { onMount } from 'svelte';
  import SplitPane from './ui/SplitPane.svelte';
  import FileToolbar from './ui/FileToolbar.svelte';
  import ZoomToggle from './ui/ZoomToggle.svelte';
  import WeekendControl from './ui/WeekendControl.svelte';
  import ColorKeySelect from './ui/ColorKeySelect.svelte';
  import ColorLegend from './ui/ColorLegend.svelte';
  import ErrorBanner from './ui/ErrorBanner.svelte';
  import CodeEditor from './ui/CodeEditor.svelte';
  import HoverCard from './ui/HoverCard.svelte';
  import Timeline from './render/Timeline.svelte';
  import {
    sourceText,
    activeDocument,
    schedule,
    parseErrors,
    warnings,
    updateSource,
    loadSource,
    commitDocument,
  } from './stores/documentStore';
  import { zoom, theme, colorKey } from './stores/viewStore';
  import { WEEKEND_EXCLUDED_SCALE } from './render/scale';
  import { availableColorKeys, colorLegend } from './render/colors';
  import type { Task } from './model/types';

  let hoverTask: Task | null = null;
  let hoverAnchor: Element | null = null;

  function onBarEnter(task: Task, el: SVGElement): void {
    hoverTask = task;
    hoverAnchor = el;
  }
  function onBarLeave(): void {
    hoverTask = null;
    hoverAnchor = null;
  }

  // Apply theme to :root.
  $: document.documentElement.dataset.theme = $theme;

  // Coloring key: available metadata keys, and the one in effect (store override or the
  // first key by default) so the timeline and the dropdown agree.
  $: colorKeys = $activeDocument ? availableColorKeys($activeDocument) : [];
  $: effectiveColorKey = $colorKey ?? colorKeys[0] ?? null;
  $: legend = $activeDocument ? colorLegend($activeDocument, effectiveColorKey) : [];

  // Load the richer bundled sample on first load (falls back to the built-in default).
  onMount(async () => {
    try {
      const res = await fetch('/sample-plan.md');
      if (res.ok) loadSource(await res.text());
    } catch {
      /* keep default */
    }
  });
</script>

<div class="app">
  <FileToolbar />
  <div class="body">
    <SplitPane topFraction={0.62}>
      <div slot="top" class="viz">
        <div class="viz-toolbar">
          <ZoomToggle />
          <WeekendControl />
          <ColorKeySelect keys={colorKeys} selected={effectiveColorKey} />
          <ColorLegend entries={legend} />
        </div>
        <div class="viz-canvas">
          {#if $activeDocument && $schedule}
            <Timeline
              doc={$activeDocument}
              schedule={$schedule}
              zoom={$zoom}
              colorKey={effectiveColorKey}
              weekendDayScale={$activeDocument.excludeWeekends ? WEEKEND_EXCLUDED_SCALE : 1}
              {onBarEnter}
              {onBarLeave}
              onEdit={commitDocument}
            />
          {:else}
            <div class="empty">No valid plan to display yet.</div>
          {/if}
        </div>
      </div>

      <div slot="bottom" class="code">
        <ErrorBanner errors={$parseErrors} warnings={$warnings} />
        <div class="code-editor">
          <CodeEditor value={$sourceText} errors={$parseErrors} onChange={updateSource} />
        </div>
      </div>
    </SplitPane>
  </div>
</div>

<HoverCard task={hoverTask} anchor={hoverAnchor} />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .body {
    flex: 1;
    min-height: 0;
  }
  .viz,
  .code {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .viz-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }
  .viz-canvas {
    flex: 1;
    min-height: 0;
  }
  .code-editor {
    flex: 1;
    min-height: 0;
  }
  .empty {
    padding: 20px;
    color: var(--fg-muted);
  }
</style>
