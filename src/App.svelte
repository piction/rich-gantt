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
  import { setAbsoluteStart, setDuration, setMetadataBody } from './interaction/barEdits';
  import { toEpochDay } from './compute/dateMath';
  import type { Task, ScheduledTask } from './model/types';

  // Transient hover state.
  let hoverTask: Task | null = null;
  let hoverScheduled: ScheduledTask | null = null;
  let hoverAnchor: Element | null = null;

  // Click-locked selection. Held by id so the card follows the task across document edits
  // (e.g. after unlinking), while the anchor element is keyed and stays stable per task.
  let selectedId: string | null = null;
  let selectedAnchor: Element | null = null;

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
  // Each double-click selects the task and signals the card to enter editor mode.
  let editSignal = 0;
  function onBarSelect(task: Task, el: SVGElement): void {
    selectedId = task.id;
    selectedAnchor = el;
    editSignal++;
  }
  function clearSelection(): void {
    selectedId = null;
    selectedAnchor = null;
  }
  // A click outside any task bar and outside the card unselects.
  function onWindowClick(e: MouseEvent): void {
    const el = e.target as Element | null;
    if (el?.closest('.bar') || el?.closest('.card')) return;
    clearSelection();
  }
  // Unlink the selected task: pin it to its current start, which drops the incoming `after`
  // dependency (position is either/or) — the same destructive op as a front-edge drag.
  function onUnlink(): void {
    if (!selectedId || !$activeDocument) return;
    const s = $schedule?.tasks.get(selectedId);
    if (!s) return;
    commitDocument(setAbsoluteStart($activeDocument, selectedId, s.startDay));
  }
  // Commit edited fields (duration + markdown body) for the selected task.
  function onSave(changes: { duration: number; body: string }): void {
    if (!selectedId || !$activeDocument) return;
    let doc = setDuration($activeDocument, selectedId, changes.duration);
    doc = setMetadataBody(doc, selectedId, changes.body);
    commitDocument(doc);
  }
  // Commit a new absolute start date (from the card's date picker) for the selected task.
  function onStartChange(date: string): void {
    if (!selectedId || !$activeDocument) return;
    commitDocument(setAbsoluteStart($activeDocument, selectedId, toEpochDay(date)));
  }

  // Selection resolved from the live stores, so the card reflects edits immediately.
  $: selectedTask = selectedId && $activeDocument ? $activeDocument.tasks.get(selectedId) ?? null : null;
  $: selectedScheduled = selectedId && $schedule ? $schedule.tasks.get(selectedId) ?? null : null;
  // A stale selection (task removed from the source) drops itself.
  $: if (selectedId && $activeDocument && !$activeDocument.tasks.has(selectedId)) clearSelection();

  // The card shows the selected task when one is locked, otherwise the hovered task.
  $: cardTask = selectedTask ?? hoverTask;
  $: cardScheduled = selectedTask ? selectedScheduled : hoverScheduled;
  $: cardAnchor = selectedTask ? selectedAnchor : hoverAnchor;
  $: cardLocked = selectedTask !== null;

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
              {selectedId}
              {onBarEnter}
              {onBarLeave}
              {onBarSelect}
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

<svelte:window on:click={onWindowClick} />

<HoverCard
  task={cardTask}
  scheduled={cardScheduled}
  anchor={cardAnchor}
  locked={cardLocked}
  {onUnlink}
  {onSave}
  {onStartChange}
  {editSignal}
/>

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
