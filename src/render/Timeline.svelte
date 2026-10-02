<script lang="ts">
  import { tick } from 'svelte';
  import type { ParsedDocument, ScheduleResult, Task } from '../model/types';
  import type { ZoomLevel } from './scale';
  import { xToDay } from './scale';
  import {
    workingDaysBetween,
    fromEpochDay,
    formatDayLabel,
    isWeekend,
  } from '../compute/dateMath';
  import { computeLayout, sourceAnchor, frontAnchor, type Bar, type SectionBand } from './layout';
  import { computeSchedule } from '../compute/scheduler';
  import {
    setDuration,
    addDependency,
    canAddDependency,
    moveTask,
    deleteTask,
    addTaskAfter,
    addTaskAt,
    updateTask,
    type NewTaskDraft,
  } from '../interaction/barEdits';
  import { ICONS } from '../ui/icons';
  import FocusPill from '../ui/FocusPill.svelte';
  import AddTaskPopover from '../ui/AddTaskPopover.svelte';
  import TaskEditor from '../ui/TaskEditor.svelte';
  import { floating } from '../ui/floating';

  export let doc: ParsedDocument;
  export let schedule: ScheduleResult;
  export let zoom: ZoomLevel;
  export let colorKey: string | null = null;
  export let weekendDayScale = 1;

  // Bubbled up so the parent can position a Floating-UI hover card.
  export let onBarEnter: (task: Task, el: SVGElement) => void = () => {};
  export let onBarLeave: () => void = () => {};
  // Hovering a section's duration label bubbles up so the parent can position an info popup.
  export let onSectionEnter: (section: SectionBand, el: SVGElement) => void = () => {};
  export let onSectionLeave: () => void = () => {};
  // Called when a drag gesture commits a mutated document.
  export let onEdit: (doc: ParsedDocument) => void = () => {};
  // Focus-mode editor's "Source" link: reveal this 1-based source line in the code editor.
  export let onJumpToSource: (line: number) => void = () => {};

  let svgEl: SVGSVGElement;

  // End-edge resize drag. While dragging, previewDoc overrides the committed doc for a live preview.
  let drag: { id: string; startDay: number } | null = null;
  let previewDoc: ParsedDocument | null = null;

  // Dot-connector state (§6.8): rubber-band an `after` edge from a source dot (center-bottom
  // of a predecessor) to a front dot (start of the successor). sx/sy is the fixed source
  // anchor; x/y follows the cursor; targetId is the front dot currently hovered (if legal).
  let connect: {
    fromId: string;
    sx: number;
    sy: number;
    x: number;
    y: number;
    targetId: string | null;
  } | null = null;

  const EDGE = 6; // px width of the end resize zone
  const DOT_R = 4; // radius of the connector dots
  const TARGET_R = 14; // hit radius when snapping a dropped edge to a front dot

  // Focus mode: a clicked bar body is selected and gets the action pill. `mode` is the open
  // popover (add-after / new pinned task / edit). Body-dragging a selected bar moves it (`move`), which pins it to
  // an absolute date and so breaks its `after` links — previewed as cut arrows before release.
  let selectedId: string | null = null;
  let mode: 'add' | 'new' | 'edit' | null = null;
  let move: {
    id: string;
    x0: number;
    grab: number; // pointer day − bar start day, so the bar doesn't jump under the cursor
    origStart: number; // whole start day before the move
    origAfter: string[];
    origin: { x: number; y: number; w: number; h: number };
    moved: boolean;
  } | null = null;
  let durPreview: number | null = null; // length being typed into the pill
  let addDraft: NewTaskDraft = { label: '', duration: 1, section: '' };
  let newStart = ''; // start date of a 'new' (pinned) task
  let newSection = false; // 'new' mode is creating a section (with its first task)
  let pill: FocusPill;
  let ringEl: SVGRectElement | null = null;
  let barEls: Record<string, SVGGElement | null> = {};
  const DRAG_THRESHOLD = 4; // px before a press on a selected bar becomes a move

  $: selectedTask = selectedId ? doc.tasks.get(selectedId) ?? null : null;
  $: addPreview =
    mode === 'add' && selectedId
      ? addTaskAfter(doc, selectedId, addDraft)
      : mode === 'new'
        ? addTaskAt(doc, newStart, addDraft)
        : null;
  $: focusPreview =
    addPreview?.doc ??
    (durPreview !== null && selectedId ? setDuration(doc, selectedId, durPreview) : null);
  $: renderDoc = previewDoc ?? focusPreview ?? doc;
  $: excluded = renderDoc.excludeWeekends;
  $: renderSchedule = renderDoc === doc ? schedule : computeSchedule(renderDoc);
  $: layout = computeLayout(renderDoc, renderSchedule, zoom, colorKey, weekendDayScale);

  // Labels are drawn inside the bar, colored to contrast the fill. A label that doesn't fit is
  // clipped to the widest prefix that fits with a trailing "..." — so text never spills past the
  // bar onto the page background (where its contrast is undefined).
  const LABEL_PAD = 6;
  const ELLIPSIS = '...';
  const BOLD = '600 12px system-ui, sans-serif';
  const SMALL = '11px system-ui, sans-serif';
  let measureCtx: CanvasRenderingContext2D | null = null;
  function textWidth(s: string, font = '12px system-ui, sans-serif'): number {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    if (!measureCtx) return s.length * 6.6;
    measureCtx.font = font;
    return measureCtx.measureText(s).width;
  }
  function fitText(text: string, max: number, font?: string): string {
    if (max <= 0) return '';
    if (textWidth(text, font) <= max) return text;
    let s = text;
    while (s.length && textWidth(s + ELLIPSIS, font) > max) s = s.slice(0, -1);
    return s ? s + ELLIPSIS : '';
  }
  const fitLabel = (b: Bar): string => fitText(b.label, b.w - 2 * LABEL_PAD);

  // Right-aligned duration (e.g. "5d"), shown inside the bar only when the FULL label plus a
  // gap plus the duration all fit — i.e. there is leftover space beyond the label.
  const DUR_GAP = 8;
  function fitDuration(b: Bar, duration: number): string {
    const s = `${duration}d`;
    const inner = b.w - 2 * LABEL_PAD;
    const labelW = textWidth(b.label);
    const need = (labelW > 0 ? labelW + DUR_GAP : 0) + textWidth(s);
    return need <= inner ? s : '';
  }

  // Section duration shown next to its name; trims float artifacts from working-day spans.
  const fmtDays = (n: number): string => `${Math.round(n * 100) / 100}d`;

  // Section-name column, left of the scrolling timeline: fits the longest "name  12d" up to
  // COL_MAX (longer names get an ellipsis), and at least the "+ New section" placeholder.
  const COL_PAD = 10;
  const COL_GAP = 8; // between a section name and its duration
  const COL_MIN = 130;
  const COL_MAX = 220;
  $: colW = Math.min(
    COL_MAX,
    Math.max(
      COL_MIN,
      ...layout.sections.map(
        (s) => 2 * COL_PAD + textWidth(s.name, BOLD) + COL_GAP + textWidth(fmtDays(s.durationDays), SMALL),
      ),
    ),
  );
  function sectionName(s: SectionBand): string {
    const dur = s.hasTasks ? COL_GAP + textWidth(fmtDays(s.durationDays), SMALL) : 0;
    return fitText(s.name, colW - 2 * COL_PAD - dur, BOLD);
  }

  function pointerDay(e: PointerEvent): number {
    const x = e.clientX - svgEl.getBoundingClientRect().left;
    return xToDay(x, layout.t0, layout.pxPerDay, layout.weekendDayScale);
  }

  function pointerPoint(e: PointerEvent): { x: number; y: number } {
    const r = svgEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Nearest bar whose front dot is within TARGET_R of `p` and forms a legal edge. */
  function frontHit(p: { x: number; y: number }, fromId: string): string | null {
    let best: string | null = null;
    let bestD = TARGET_R;
    for (const bar of layout.bars) {
      if (bar.id === fromId || !canAddDependency(doc, fromId, bar.id)) continue;
      const a = frontAnchor(bar);
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (d < bestD) {
        bestD = d;
        best = bar.id;
      }
    }
    return best;
  }

  function startConnect(e: PointerEvent, id: string): void {
    e.preventDefault();
    e.stopPropagation();
    const bar = layout.barsById.get(id);
    if (!bar) return;
    const a = sourceAnchor(bar);
    connect = { fromId: id, sx: a.x, sy: a.y, x: a.x, y: a.y, targetId: null };
    svgEl.setPointerCapture(e.pointerId);
    onBarLeave();
  }

  function startResize(e: PointerEvent, id: string): void {
    e.preventDefault();
    e.stopPropagation();
    const s = schedule.tasks.get(id);
    if (!s) return;
    drag = { id, startDay: s.startDay };
    svgEl.setPointerCapture(e.pointerId);
    onBarLeave(); // hide hover card during drag
  }

  function onPointerMove(e: PointerEvent): void {
    if (move) {
      if (!move.moved && Math.abs(e.clientX - move.x0) < DRAG_THRESHOLD) return;
      move.moved = true;
      const start = Math.round(pointerDay(e) - move.grab);
      // Dropping back on the original day is a cancel (and keeps any `after` link).
      previewDoc = start === move.origStart ? null : moveTask(doc, move.id, fromEpochDay(start));
      return;
    }
    if (connect) {
      const p = pointerPoint(e);
      connect = { ...connect, x: p.x, y: p.y, targetId: frontHit(p, connect.fromId) };
      return;
    }
    if (!drag) return;
    const day = pointerDay(e);
    // In working-day mode the duration is measured in work days, so the dragged span must
    // discount any weekends it crosses.
    const span = excluded ? workingDaysBetween(drag.startDay, day) : day - drag.startDay;
    previewDoc = setDuration(doc, drag.id, span);
  }

  function onPointerUp(e: PointerEvent): void {
    if (move) {
      const committed = previewDoc;
      svgEl.releasePointerCapture?.(e.pointerId);
      move = null;
      previewDoc = null;
      if (committed) onEdit(committed);
      return;
    }
    if (connect) {
      const { fromId, targetId } = connect;
      svgEl.releasePointerCapture?.(e.pointerId);
      connect = null;
      if (targetId) onEdit(addDependency(doc, fromId, targetId));
      return;
    }
    if (!drag) return;
    const committed = previewDoc;
    svgEl.releasePointerCapture?.(e.pointerId);
    drag = null;
    previewDoc = null;
    if (committed) onEdit(committed);
  }

  function milestonePath(b: Bar): string {
    const r = b.h / 2;
    return `M ${b.cx},${b.cy - r} L ${b.cx + r},${b.cy} L ${b.cx},${b.cy + r} L ${b.cx - r},${b.cy} Z`;
  }

  // Chevron ">" marking a packed `after` junction. The glyph spans x-CHEV..x+1, so its visual
  // center sits left of the seam midpoint; nudge it right by CHEV_SHIFT to sit in the gap.
  const CHEV = 4;
  const CHEV_SHIFT = 2;
  function chevronPath(x: number, y: number): string {
    const cx = x + CHEV_SHIFT;
    return `M ${cx - CHEV},${y - CHEV} L ${cx + 1},${y} L ${cx - CHEV},${y + CHEV}`;
  }

  const edgeW = (b: Bar) => Math.min(EDGE, Math.max(2, b.w / 3));

  // --- Focus mode ---

  // Drop the selection when its task disappears (deleted here or edited away in the source).
  $: pruneSelection(doc);
  function pruneSelection(d: ParsedDocument): void {
    if (selectedId && !d.tasks.has(selectedId)) clearFocus();
  }

  // Predecessors and successors of the selection stay legible; everything else fades.
  $: related = relatedTo(renderDoc, selectedId);
  function relatedTo(d: ParsedDocument, id: string | null): Set<string> {
    const out = new Set<string>();
    if (!id) return out;
    const t = d.tasks.get(id);
    if (t?.position.kind === 'after') t.position.ids.forEach((p) => out.add(p));
    for (const o of d.tasks.values()) {
      if (o.position.kind === 'after' && o.position.ids.includes(id)) out.add(o.id);
    }
    return out;
  }

  function sectionOf(id: string): string {
    return doc.sections.find((s) => s.taskIds.includes(id))?.name ?? '';
  }

  function select(id: string): void {
    selectedId = id;
    mode = null;
    durPreview = null;
    onBarLeave(); // the pill replaces the hover card
  }

  function clearFocus(): void {
    selectedId = null;
    mode = null;
    durPreview = null;
  }

  function startOf(id: string): number {
    return Math.floor(schedule.tasks.get(id)?.startDay ?? 0);
  }

  /** `day` shifted by n days; in working-day mode weekends are skipped so a nudge never stalls. */
  function shiftDay(day: number, n: number): number {
    if (!doc.excludeWeekends) return day + n;
    const dir = Math.sign(n);
    let d = day;
    for (let left = Math.abs(n); left > 0; ) {
      d += dir;
      if (!isWeekend(d)) left--;
    }
    return d;
  }

  function onBarPointerDown(e: PointerEvent, id: string): void {
    if (e.button !== 0 || id === addPreview?.id) return;
    if (id !== selectedId) {
      select(id); // first click only focuses — it never moves anything
      return;
    }
    const bar = layout.barsById.get(id);
    const task = doc.tasks.get(id);
    if (!bar || !task) return;
    mode = null;
    move = {
      id,
      x0: e.clientX,
      grab: pointerDay(e) - startOf(id),
      origStart: startOf(id),
      origAfter: task.position.kind === 'after' ? [...task.position.ids] : [],
      origin: { x: bar.x, y: bar.y, w: bar.w, h: bar.h },
      moved: false,
    };
    svgEl.setPointerCapture(e.pointerId);
  }

  function onBackgroundPointerDown(e: PointerEvent): void {
    if (!(e.target as Element).closest('.bar')) clearFocus();
  }

  function unlink(): void {
    if (selectedId) onEdit(moveTask(doc, selectedId, fromEpochDay(startOf(selectedId))));
  }

  function nudge(days: number): void {
    if (!selectedId) return;
    onEdit(moveTask(doc, selectedId, fromEpochDay(shiftDay(startOf(selectedId), days))));
  }

  function setLength(days: number): void {
    durPreview = null;
    if (selectedId) onEdit(setDuration(doc, selectedId, days));
  }

  function openAdd(): void {
    if (!selectedTask) return;
    addDraft = {
      label: '',
      duration: selectedTask.duration || 1, // a milestone's 0d is no useful default
      section: sectionOf(selectedTask.id),
    };
    mode = 'add';
  }

  /** Id of the task that starts first in the chart (null for an empty chart). */
  function firstTask(): string | null {
    let first: string | null = null;
    for (const id of schedule.tasks.keys()) {
      if (first === null || startOf(id) < startOf(first)) first = id;
    }
    return first;
  }

  /**
   * New free task, pinned by default to the chart's earliest start. A section's proposed bar
   * passes its own section; the `N` key defaults to the first task's. With
   * `asSection` the popover asks for a new section's name instead (it holds this first task).
   */
  async function openNew(section?: string, asSection = false): Promise<void> {
    const first = firstTask();
    if (!asSection && !doc.sections.length) return;
    clearFocus();
    newStart = first ? fromEpochDay(startOf(first)) : new Date().toISOString().slice(0, 10);
    newSection = asSection;
    addDraft = {
      label: '',
      duration: 1,
      section: asSection ? '' : section ?? ((first && sectionOf(first)) || doc.sections[0].name),
    };
    mode = 'new';
    await tick(); // bring the ghost bar (and so the popover) into view
    if (addPreview) barEls[addPreview.id]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  async function createTask(chain: boolean): Promise<void> {
    if (!addPreview) return;
    const { doc: next, id } = addPreview;
    onEdit(next);
    select(id);
    if (!chain) return;
    await tick(); // let the committed doc flow back in before reading the new task
    openAdd();
  }

  function removeSelected(): void {
    if (!selectedId) return;
    const id = selectedId;
    const task = doc.tasks.get(id);
    const succ = doc.order.find((o) => {
      const p = doc.tasks.get(o)?.position;
      return p?.kind === 'after' && p.ids.includes(id);
    });
    const next = succ ?? (task?.position.kind === 'after' ? task.position.ids[0] : null);
    onEdit(deleteTask(doc, id, (sid) => fromEpochDay(startOf(sid))));
    if (next) select(next);
    else clearFocus();
  }

  function onKeydown(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey || drag || connect || move) return;
    // A keyboard-focused bar (Tab) is selected with Enter.
    const barId = el.closest?.('.bar')?.getAttribute('data-id');
    if (mode) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      openNew(undefined, e.shiftKey);
      return;
    }
    if (!selectedId) {
      if (barId && e.key === 'Enter') {
        e.preventDefault();
        select(barId);
      }
      return;
    }
    if (e.key === 'Enter' && el.tagName === 'BUTTON') return; // let the button activate
    const k = e.key;
    const order = layout.bars.map((b) => b.id);
    const at = order.indexOf(selectedId);
    const resizable = selectedTask?.kind !== 'milestone';
    if (/^[0-9]$/.test(k) && resizable) pill?.startDurationEdit(k);
    else if ((k === '+' || k === '=') && resizable && selectedTask)
      setLength(selectedTask.duration + 1);
    else if (k === '-' && resizable && selectedTask)
      setLength(Math.max(0.5, selectedTask.duration - 1));
    else if (k === 'ArrowLeft') nudge(e.shiftKey ? (doc.excludeWeekends ? -5 : -7) : -1);
    else if (k === 'ArrowRight') nudge(e.shiftKey ? (doc.excludeWeekends ? 5 : 7) : 1);
    else if (k === 'ArrowDown') select(order[Math.min(order.length - 1, at + 1)]);
    else if (k === 'ArrowUp') select(order[Math.max(0, at - 1)]);
    else if (k === 'a' || k === 'A') openAdd();
    else if (k === 'Enter') mode = 'edit';
    else if (k === 'Delete' || k === 'Backspace') removeSelected();
    else if (k === 'Escape') clearFocus();
    else return;
    e.preventDefault();
  }

  // Cut-link preview while moving a dependent bar: the predecessor's edge drawn dashed red,
  // with a scissors badge on it.
  $: cutLinks =
    move?.moved && previewDoc
      ? move.origAfter.flatMap((from) => {
          const a = layout.barsById.get(from);
          const b = move && layout.barsById.get(move.id);
          if (!a || !b) return [];
          const s = sourceAnchor(a, b.cy < a.cy ? 'top' : 'bottom');
          const t = frontAnchor(b);
          const vertical = Math.abs(t.y - s.y) > 24;
          return [
            {
              d: `M ${s.x},${s.y} V ${t.y} H ${t.x}`,
              cx: vertical ? s.x : (s.x + t.x) / 2,
              cy: vertical ? (s.y + t.y) / 2 : t.y,
            },
          ];
        })
      : [];

  $: moveReadout = move?.moved && selectedId ? readout(renderSchedule, selectedId) : '';
  function readout(sched: ScheduleResult, id: string): string {
    const s = sched.tasks.get(id);
    if (!s || !move) return '';
    const delta = Math.floor(s.startDay) - move.origStart;
    const span = `${formatDayLabel(s.startDay)} → ${formatDayLabel(s.endDay - 1e-9)}`;
    return `${span} · ${delta >= 0 ? '+' : ''}${delta}d`;
  }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="timeline-scroll"
  style:scroll-padding-left="{colW}px"
  on:pointerdown={onBackgroundPointerDown}
>
  <div class="canvas" style:width="{colW + layout.width}px">
  <!-- section-name column: sticky on horizontal scroll, scrolls vertically with the chart -->
  <svg
    class="names"
    class:focusing={selectedId !== null}
    width={colW}
    height={layout.height}
    viewBox={`0 0 ${colW} ${layout.height}`}
  >
    <rect width={colW} height={layout.height} class="names-bg" />
    {#each layout.sections as section, i}
      {#if i % 2 === 1}
        <rect y={section.y} width={colW} height={section.height} class="section-band alt" />
      {/if}
      {#if section.hasTasks}
        {@const name = sectionName(section)}
        <g
          class="section-label-group"
          role="button"
          tabindex="0"
          aria-label={`${section.name}, ${fmtDays(section.durationDays)}`}
          on:mouseenter={(e) => onSectionEnter(section, e.currentTarget)}
          on:mouseleave={onSectionLeave}
          on:focus={(e) => onSectionEnter(section, e.currentTarget)}
          on:blur={onSectionLeave}
        >
          <text x={COL_PAD} y={section.y + 16} class="section-label">{name}</text>
          <text
            x={COL_PAD + textWidth(name, BOLD) + COL_GAP}
            y={section.y + 16}
            class="section-dur-text">{fmtDays(section.durationDays)}</text>
        </g>
      {:else}
        <text x={COL_PAD} y={section.y + 16} class="section-label">{sectionName(section)}</text>
      {/if}
    {/each}
    <g
      class="proposed"
      role="button"
      tabindex="-1"
      on:click={() => openNew(undefined, true)}
      on:keydown={(e) => e.key === 'Enter' && openNew(undefined, true)}
    >
      <rect
        x={COL_PAD - 4}
        y={layout.addSection.y}
        width={colW - 2 * COL_PAD + 8}
        height={layout.addSection.h}
        rx="5"
      />
      <text x={COL_PAD + 4} y={layout.addSection.y + layout.addSection.h / 2 + 4}>+ New section</text>
      <title>New section (⇧N)</title>
    </g>
    <line x1={colW - 0.5} y1="0" x2={colW - 0.5} y2={layout.height} class="names-edge" />
  </svg>

  <svg
    class="timeline"
    class:dragging={drag !== null}
    class:connecting={connect !== null}
    class:focusing={selectedId !== null}
    class:moving={move?.moved}
    bind:this={svgEl}
    width={layout.width}
    height={layout.height}
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    role="img"
    aria-label="Gantt chart"
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
  >
    <defs>
      <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" class="arrowhead" />
      </marker>
      <marker id="arrowhead-focus" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" class="arrowhead focus" />
      </marker>
      <marker id="arrowhead-cut" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" class="arrowhead cut" />
      </marker>
    </defs>

    <!-- grid: weekend shading + gridlines under everything -->
    <g class="grid">
      {#each layout.weekends as wknd}
        <rect
          x={wknd.x}
          y={layout.headerHeight}
          width={wknd.w}
          height={layout.height - layout.headerHeight}
          class="weekend"
        />
      {/each}
      {#each layout.ticks as tick}
        <line x1={tick.x} y1={layout.headerHeight} x2={tick.x} y2={layout.height} class="gridline" />
      {/each}
    </g>

    <!-- section bands -->
    <g class="sections">
      {#each layout.sections as section, i}
        <rect
          x="0"
          y={section.y}
          width={layout.width}
          height={section.height}
          class="section-band"
          class:alt={i % 2 === 1}
        />
      {/each}
    </g>

    <!-- axis tick labels -->
    <g class="axis">
      {#each layout.ticks as tick}
        <text x={tick.x + 3} y={18} class="tick-label">{tick.label}</text>
      {/each}
    </g>

    <!-- task bars -->
    <g class="bars">
      {#each layout.bars as bar (bar.id)}
        {@const task = renderDoc.tasks.get(bar.id)}
        {@const isGhost = bar.id === addPreview?.id}
        <g
          class="bar"
          class:selected={bar.id === selectedId}
          class:related={related.has(bar.id)}
          class:ghost={isGhost}
          data-id={bar.id}
          role="button"
          tabindex="0"
          bind:this={barEls[bar.id]}
          on:pointerdown={(e) => onBarPointerDown(e, bar.id)}
          on:dblclick={() => bar.id === selectedId && (mode = 'edit')}
          on:mouseenter={(e) =>
            task && !drag && !move && bar.id !== selectedId && !isGhost && onBarEnter(task, e.currentTarget)}
          on:mouseleave={onBarLeave}
          on:focus={(e) => task && bar.id !== selectedId && !isGhost && onBarEnter(task, e.currentTarget)}
          on:blur={onBarLeave}
        >
          {#if bar.id === selectedId}
            {@const r = bar.isMilestone ? bar.h / 2 : 0}
            <rect
              bind:this={ringEl}
              x={(bar.isMilestone ? bar.cx - r : bar.x) - 3.5}
              y={bar.y - 3.5}
              width={(bar.isMilestone ? 2 * r : bar.w) + 7}
              height={bar.h + 7}
              rx="6"
              class="focus-ring"
            />
          {/if}
          {#if bar.isMilestone}
            <path
              d={milestonePath(bar)}
              style={`fill:${bar.fill}`}
              class="milestone"
            />
            <text x={bar.cx + bar.h} y={bar.cy + 4} class="bar-label outside">{bar.label}</text>
          {:else}
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.w}
              height={bar.h}
              rx="3"
              style={`fill:${bar.fill}`}
              class="bar-rect"
            />
            <text
              x={bar.x + LABEL_PAD}
              y={bar.cy + 4}
              class="bar-label inside"
              style={`fill:${bar.labelFill}`}>{fitLabel(bar)}</text>
            {#if task}
              {@const durText = fitDuration(bar, task.duration)}
              {#if durText}
                <text
                  x={bar.x + bar.w - LABEL_PAD}
                  y={bar.cy + 4}
                  text-anchor="end"
                  class="bar-label inside duration"
                  style={`fill:${bar.labelFill}`}>{durText}</text>
              {/if}
            {/if}

            <!-- end-edge resize zone (transparent, on top of the bar) -->
            <rect
              x={bar.x + bar.w - edgeW(bar)}
              y={bar.y}
              width={edgeW(bar)}
              height={bar.h}
              class="zone edge"
              on:pointerdown={(e) => startResize(e, bar.id)}
            >
              <title>Extend duration</title>
            </rect>
          {/if}

          <!-- dot connectors (§6.8): source = center-bottom (drag out), front = start (drop target) -->
          <circle
            cx={sourceAnchor(bar).x}
            cy={sourceAnchor(bar).y}
            r={DOT_R}
            class="dot source-dot"
            on:pointerdown={(e) => startConnect(e, bar.id)}
          >
            <title>Drag to a task's front to make it depend on this one</title>
          </circle>
          <circle
            cx={frontAnchor(bar).x}
            cy={frontAnchor(bar).y}
            r={DOT_R}
            class="dot front-dot"
            class:target={connect?.targetId === bar.id}
          />
        </g>
      {/each}
    </g>

    <!-- proposed "+ New task" bar ending each section, at the chart start -->
    <g class="proposed-bars">
      {#each layout.sections as section}
        {@const a = section.addBar}
        <g
          class="proposed"
          role="button"
          tabindex="-1"
          on:click={() => openNew(section.name)}
          on:keydown={(e) => e.key === 'Enter' && openNew(section.name)}
        >
          <rect x={a.x} y={a.y} width={a.w} height={a.h} rx="3" />
          <text x={a.x + a.w / 2} y={a.y + a.h / 2 + 4} text-anchor="middle">+ New task</text>
          <title>New task in {section.name} · {formatDayLabel(layout.startDay)}</title>
        </g>
      {/each}
    </g>

    <!-- dependency arrows on top -->
    <g class="arrows">
      {#each layout.arrows as arrow}
        {@const hot = selectedId !== null && (arrow.from === selectedId || arrow.to === selectedId)}
        <path
          d={arrow.d}
          class="arrow"
          class:focus={hot}
          class:ghost={arrow.to === addPreview?.id}
          marker-end={hot ? 'url(#arrowhead-focus)' : 'url(#arrowhead)'}
        />
      {/each}
    </g>

    <!-- packed after-chain junctions: a chevron at the successor's front; a gap between the
         bars gets a dashed lead-in from the predecessor's end -->
    <g class="junctions">
      {#each layout.junctions as j (j.toId)}
        {#if j.gap}
          <line x1={j.fromX} y1={j.y} x2={j.x} y2={j.y} class="junction-gap" />
        {/if}
        <path d={chevronPath(j.x, j.y)} class="junction-chevron">
          <title>Depends on previous task</title>
        </path>
      {/each}
    </g>

    <!-- focus mode: where a moved bar came from, and the links the move will cut -->
    {#if move?.moved && previewDoc}
      <rect
        x={move.origin.x}
        y={move.origin.y}
        width={move.origin.w}
        height={move.origin.h}
        rx="3"
        class="move-origin"
      />
      {#each cutLinks as cut}
        <path d={cut.d} class="cut-link" marker-end="url(#arrowhead-cut)" />
        <g class="cut-badge" transform={`translate(${cut.cx - 9},${cut.cy - 9})`}>
          <circle cx="9" cy="9" r="9" />
          <g transform="translate(3,3) scale(0.5)">
            {#each ICONS.scissors as d}<path {d} />{/each}
          </g>
        </g>
      {/each}
    {/if}

    <!-- rubber-band line while drawing a new dependency -->
    {#if connect}
      <path
        d={`M ${connect.sx},${connect.sy} L ${connect.x},${connect.y}`}
        class="connect-line"
        class:snapped={connect.targetId !== null}
        marker-end="url(#arrowhead)"
      />
    {/if}
  </svg>
  </div>
</div>

{#if selectedTask && !move?.moved && !mode}
  <FocusPill
    bind:this={pill}
    task={selectedTask}
    anchor={ringEl}
    startLabel={formatDayLabel(startOf(selectedTask.id))}
    excludeWeekends={doc.excludeWeekends}
    onUnlink={unlink}
    onPreviewDuration={(d) => (durPreview = d)}
    onSetDuration={setLength}
    onAdd={openAdd}
    onEdit={() => (mode = 'edit')}
    onDelete={removeSelected}
  />
{/if}
{#if moveReadout}
  <div class="move-readout" use:floating={{ anchor: ringEl, placement: 'top' }}>
    {moveReadout}{#if move?.origAfter.length && previewDoc}&nbsp;·
      <span class="warn">unlinks {move.origAfter.join(', ')}</span>{/if}
  </div>
{/if}
{#if addPreview && ((selectedTask && mode === 'add') || mode === 'new')}
  <AddTaskPopover
    afterLabel={mode === 'add' ? selectedTask?.label ?? null : null}
    newSection={mode === 'new' && newSection}
    bind:start={newStart}
    bind:draft={addDraft}
    sections={doc.sections.map((s) => s.name)}
    anchor={barEls[addPreview.id] ?? null}
    onCreate={createTask}
    onCancel={() => (mode = null)}
  />
{/if}
{#if selectedTask && mode === 'edit'}
  <TaskEditor
    task={selectedTask}
    anchor={ringEl}
    onSave={(edit) => {
      if (selectedId) onEdit(updateTask(doc, selectedId, edit));
      mode = null;
    }}
    onCancel={() => (mode = null)}
    onJumpToSource={() => {
      if (selectedTask) onJumpToSource(selectedTask.sourceLine);
      mode = null;
    }}
  />
{/if}

<style>
  .timeline-scroll {
    overflow: auto;
    width: 100%;
    height: 100%;
    background: var(--timeline-bg);
  }
  .canvas {
    display: flex;
    align-items: flex-start;
  }
  .names {
    position: sticky;
    left: 0;
    z-index: 1;
    flex: none;
    display: block;
    font-family: system-ui, sans-serif;
  }
  .names-bg {
    fill: var(--timeline-bg);
  }
  .names-edge {
    stroke: var(--border);
  }
  /* proposed (not yet made) items: light blue + dashed, like the add-after ghost bar */
  .proposed {
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 0.12s ease;
  }
  .proposed rect {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-dasharray: 4 3;
  }
  .proposed text {
    font-size: 11.5px;
    font-weight: 600;
    fill: var(--accent);
  }
  .proposed:hover,
  .proposed:focus-visible {
    opacity: 1;
    outline: none;
  }
  .proposed:hover rect,
  .proposed:focus-visible rect {
    stroke-dasharray: none;
  }
  /* in focus mode the pill's "+ After" is the add action; the proposals step back */
  .focusing .proposed {
    opacity: 0;
    pointer-events: none;
  }
  .timeline {
    flex: none;
    display: block;
    font-family: system-ui, sans-serif;
    touch-action: none;
  }
  .timeline.dragging {
    cursor: grabbing;
  }
  .weekend {
    fill: var(--weekend-fill);
  }
  .gridline {
    stroke: var(--gridline);
    stroke-width: 1;
  }
  .section-band {
    fill: transparent;
  }
  .section-band.alt {
    fill: var(--section-alt);
  }
  .section-label {
    font-size: 12px;
    font-weight: 600;
    fill: var(--fg-muted);
  }
  .section-label-group {
    cursor: help;
  }
  /* The day count reads as a secondary annotation, matching the in-bar task duration. */
  .section-dur-text {
    font-size: 11px;
    fill: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }
  .section-label-group:hover .section-label,
  .section-label-group:focus .section-label,
  .section-label-group:hover .section-dur-text,
  .section-label-group:focus .section-dur-text {
    fill: var(--fg);
  }
  .section-label-group:focus {
    outline: none;
  }
  .tick-label {
    font-size: 11px;
    fill: var(--fg-muted);
  }
  .bar-rect,
  .milestone {
    stroke: var(--bar-stroke);
    stroke-width: 1;
  }
  .bar-label {
    font-size: 12px;
    pointer-events: none;
  }
  /* Overflowing / milestone labels sit on the page background. */
  .bar-label.outside {
    fill: var(--fg);
  }
  /* Duration reads as a secondary annotation. */
  .bar-label.duration {
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
  .bar:hover .bar-rect,
  .bar:focus .bar-rect,
  .bar:hover .milestone,
  .bar:focus .milestone {
    stroke: var(--bar-stroke-hover);
    stroke-width: 2;
  }
  /* drag zones */
  .zone {
    fill: transparent;
  }
  .zone.edge {
    cursor: ew-resize;
  }
  .arrow {
    fill: none;
    stroke: var(--arrow);
    stroke-width: 1.5;
  }
  .arrowhead {
    fill: var(--arrow);
  }
  /* packed after-chain junctions */
  .junction-chevron {
    fill: none;
    stroke: var(--arrow);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .junction-gap {
    stroke: var(--arrow);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  /* dot connectors */
  .dot {
    fill: var(--arrow);
    stroke: var(--timeline-bg);
    stroke-width: 1.5;
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .source-dot {
    cursor: crosshair;
    pointer-events: none;
  }
  /* reveal a bar's own dots on hover, and arm its source dot for dragging */
  .bar:hover .dot {
    opacity: 1;
  }
  .bar:hover .source-dot {
    pointer-events: auto;
  }
  .front-dot {
    pointer-events: none;
  }
  /* while drawing, reveal every legal front dot as a drop target */
  .timeline.connecting .front-dot {
    opacity: 0.5;
  }
  .front-dot.target {
    opacity: 1;
    r: 6;
    fill: var(--bar-stroke-hover);
  }
  .connect-line {
    fill: none;
    stroke: var(--arrow);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
    pointer-events: none;
  }
  /* --- focus mode --- */
  .bar {
    transition: opacity 0.18s ease;
  }
  .timeline.focusing .bar:not(.selected):not(.related):not(.ghost) {
    opacity: 0.32;
  }
  .timeline.focusing .bar.related {
    opacity: 0.85;
  }
  .timeline.focusing .arrow:not(.focus):not(.ghost),
  .timeline.focusing .junction-chevron,
  .timeline.focusing .junction-gap {
    opacity: 0.3;
  }
  .bar-rect,
  .milestone {
    cursor: pointer;
  }
  /* the focus ring marks the selection; drop the hover outline under it */
  .bar.selected .bar-rect,
  .bar.selected .milestone {
    stroke: var(--bar-stroke);
    stroke-width: 1;
    cursor: grab;
    filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.25));
  }
  .timeline.moving,
  .timeline.moving .bar-rect {
    cursor: grabbing;
  }
  .bar.selected:focus {
    outline: none;
  }
  .focus-ring {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    pointer-events: none;
  }
  .bar.ghost {
    pointer-events: none;
  }
  .bar.ghost .bar-rect {
    fill: var(--accent-soft) !important;
    stroke: var(--accent);
    stroke-dasharray: 4 3;
  }
  .bar.ghost .bar-label {
    fill: var(--accent) !important;
    font-style: italic;
  }
  .arrow.focus {
    stroke: var(--accent);
    stroke-width: 2;
  }
  .arrow.ghost {
    stroke: var(--accent);
    stroke-dasharray: 4 3;
  }
  .arrowhead.focus {
    fill: var(--accent);
  }
  .arrowhead.cut {
    fill: var(--danger);
  }
  .move-origin {
    fill: none;
    stroke: var(--fg-muted);
    stroke-dasharray: 3 3;
    opacity: 0.7;
    pointer-events: none;
  }
  .cut-link {
    fill: none;
    stroke: var(--danger);
    stroke-width: 1.5;
    stroke-dasharray: 3 4;
    pointer-events: none;
  }
  .cut-badge {
    pointer-events: none;
  }
  .cut-badge circle {
    fill: var(--surface);
    stroke: var(--danger);
    stroke-width: 1.5;
  }
  .cut-badge path {
    fill: none;
    stroke: var(--danger);
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .move-readout {
    position: fixed;
    z-index: 20;
    background: var(--fg);
    color: var(--bg);
    border-radius: 7px;
    padding: 4px 8px;
    font-size: 11.5px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    box-shadow: var(--shadow);
    pointer-events: none;
  }
  .move-readout .warn {
    color: var(--error-border);
  }
  .connect-line.snapped {
    stroke-dasharray: none;
    stroke-width: 2;
  }
</style>
