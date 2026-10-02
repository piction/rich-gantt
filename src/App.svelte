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
  import SectionCard from './ui/SectionCard.svelte';
  import Timeline from './render/Timeline.svelte';
  import Icon from './ui/Icon.svelte';
  import type { SectionBand } from './render/layout';
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
  import type { Task, ScheduledTask } from './model/types';

  let codeEditor: CodeEditor;
  let timeline: Timeline;

  // Transient hover state.
  let hoverTask: Task | null = null;
  let hoverScheduled: ScheduledTask | null = null;
  let hoverAnchor: Element | null = null;

  function onBarEnter(task: Task, el: SVGElement): void {
    hoverTask = task;
    hoverScheduled = $schedule?.tasks.get(task.id) ?? null;
    hoverAnchor = el;
  }
  function onBarLeave(): void {
    hoverTask = null;
    hoverScheduled = null;
    hoverAnchor = null;
  }

  // Transient section-duration hover state (drives the SectionCard popup).
  let hoverSection: SectionBand | null = null;
  let hoverSectionAnchor: Element | null = null;
  function onSectionEnter(section: SectionBand, el: SVGElement): void {
    hoverSection = section;
    hoverSectionAnchor = el;
  }
  function onSectionLeave(): void {
    hoverSection = null;
    hoverSectionAnchor = null;
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
      const res = await fetch(new URL('sample-plan.md', document.baseURI));
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
          <button
            class="add-task"
            title="New task (N)"
            disabled={!$activeDocument?.sections.length}
            on:click={() => timeline?.openNew()}
          >
            <Icon name="plus" size={14} /><span>Task</span>
          </button>
        </div>
        <div class="viz-canvas">
          {#if $activeDocument && $schedule}
            <Timeline
              bind:this={timeline}
              doc={$activeDocument}
              schedule={$schedule}
              zoom={$zoom}
              colorKey={effectiveColorKey}
              weekendDayScale={$activeDocument.excludeWeekends ? WEEKEND_EXCLUDED_SCALE : 1}
              {onBarEnter}
              {onBarLeave}
              {onSectionEnter}
              {onSectionLeave}
              onEdit={commitDocument}
              onJumpToSource={(line) => codeEditor?.revealLine(line)}
            />
          {:else}
            <div class="empty">No valid plan to display yet.</div>
          {/if}
        </div>
      </div>

      <div slot="bottom" class="code">
        <ErrorBanner errors={$parseErrors} warnings={$warnings} />
        <div class="code-editor">
          <CodeEditor bind:this={codeEditor} value={$sourceText} errors={$parseErrors} onChange={updateSource} />
        </div>
      </div>
    </SplitPane>
  </div>
</div>

<HoverCard task={hoverTask} scheduled={hoverScheduled} anchor={hoverAnchor} />

<SectionCard section={hoverSection} anchor={hoverSectionAnchor} />

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
  .add-task {
    margin-left: auto;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    background: var(--accent);
    color: var(--accent-fg);
    border: 0;
    border-radius: 6px;
    padding: 4px 10px 4px 8px;
    cursor: pointer;
  }
  .add-task:disabled {
    opacity: 0.5;
    cursor: default;
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
