<script lang="ts">
  import type { ParsedDocument, ScheduleResult, Task } from '../model/types';
  import type { ZoomLevel } from './scale';
  import { xToDay } from './scale';
  import { workingDaysBetween } from '../compute/dateMath';
  import { computeLayout, sourceAnchor, frontAnchor, type Bar } from './layout';
  import { computeSchedule } from '../compute/scheduler';
  import {
    setAbsoluteStart,
    setDuration,
    addDependency,
    canAddDependency,
  } from '../interaction/barEdits';

  export let doc: ParsedDocument;
  export let schedule: ScheduleResult;
  export let zoom: ZoomLevel;
  export let colorKey: string | null = null;
  export let weekendDayScale = 1;

  // Bubbled up so the parent can position a Floating-UI hover card.
  export let onBarEnter: (task: Task, el: SVGElement) => void = () => {};
  export let onBarLeave: () => void = () => {};
  // Called when a drag gesture commits a mutated document.
  export let onEdit: (doc: ParsedDocument) => void = () => {};

  let svgEl: SVGSVGElement;

  // Drag state. While dragging, previewDoc overrides the committed doc for a live preview.
  type Mode = 'move' | 'pin' | 'resize';
  let drag: { id: string; mode: Mode; grabOffsetDays: number; startDay: number } | null =
    null;
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

  const EDGE = 6; // px width of the front/end resize zones
  const DOT_R = 4; // radius of the connector dots
  const TARGET_R = 14; // hit radius when snapping a dropped edge to a front dot

  $: renderDoc = previewDoc ?? doc;
  $: excluded = renderDoc.excludeWeekends;
  $: renderSchedule = previewDoc ? computeSchedule(previewDoc) : schedule;
  $: layout = computeLayout(renderDoc, renderSchedule, zoom, colorKey, weekendDayScale);

  // Labels are drawn inside the bar, colored to contrast the fill. A label that doesn't fit is
  // clipped to the widest prefix that fits with a trailing "..." — so text never spills past the
  // bar onto the page background (where its contrast is undefined).
  const LABEL_PAD = 6;
  const ELLIPSIS = '...';
  let measureCtx: CanvasRenderingContext2D | null = null;
  function textWidth(s: string): number {
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
      if (measureCtx) measureCtx.font = '12px system-ui, sans-serif';
    }
    return measureCtx ? measureCtx.measureText(s).width : s.length * 6.6;
  }
  function fitLabel(b: Bar): string {
    const max = b.w - 2 * LABEL_PAD;
    if (max <= 0) return '';
    if (textWidth(b.label) <= max) return b.label;
    let s = b.label;
    while (s.length && textWidth(s + ELLIPSIS) > max) s = s.slice(0, -1);
    return s ? s + ELLIPSIS : '';
  }

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

  function isAnchor(id: string): boolean {
    return doc.tasks.get(id)?.position.kind === 'absolute';
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

  function startDrag(e: PointerEvent, id: string, mode: Mode): void {
    // `after` tasks have no move affordance — their position is derived (§6.7).
    if (mode === 'move' && !isAnchor(id)) return;
    e.preventDefault();
    e.stopPropagation();
    const s = schedule.tasks.get(id);
    if (!s) return;
    drag = { id, mode, grabOffsetDays: pointerDay(e) - s.startDay, startDay: s.startDay };
    svgEl.setPointerCapture(e.pointerId);
    onBarLeave(); // hide hover card during drag
  }

  function onPointerMove(e: PointerEvent): void {
    if (connect) {
      const p = pointerPoint(e);
      connect = { ...connect, x: p.x, y: p.y, targetId: frontHit(p, connect.fromId) };
      return;
    }
    if (!drag) return;
    const day = pointerDay(e);
    if (drag.mode === 'resize') {
      // In working-day mode the duration is measured in work days, so the dragged span must
      // discount any weekends it crosses.
      const span = excluded
        ? workingDaysBetween(drag.startDay, day)
        : day - drag.startDay;
      previewDoc = setDuration(doc, drag.id, span);
    } else {
      // move (anchor) and pin (front edge) both set an absolute start.
      previewDoc = setAbsoluteStart(doc, drag.id, day - drag.grabOffsetDays);
    }
  }

  function onPointerUp(e: PointerEvent): void {
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

  // Break the packed dependency: pin the successor to its current start (drops the single
  // incoming `after`), same destructive op as a front-edge drag (§6.9). It then unpacks.
  function breakJunction(e: Event, toId: string): void {
    e.preventDefault();
    e.stopPropagation();
    const s = schedule.tasks.get(toId);
    if (!s) return;
    onEdit(setAbsoluteStart(doc, toId, s.startDay));
  }

  const edgeW = (b: Bar) => Math.min(EDGE, Math.max(2, b.w / 3));
</script>

<div class="timeline-scroll">
  <svg
    class="timeline"
    class:dragging={drag !== null}
    class:connecting={connect !== null}
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

    <!-- section bands + labels -->
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
        <text x="6" y={section.y + 16} class="section-label">{section.name}</text>
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
        {@const anchor = task?.position.kind === 'absolute'}
        <g
          class="bar"
          role="button"
          tabindex="0"
          on:mouseenter={(e) => task && !drag && onBarEnter(task, e.currentTarget)}
          on:mouseleave={onBarLeave}
          on:focus={(e) => task && onBarEnter(task, e.currentTarget)}
          on:blur={onBarLeave}
        >
          {#if bar.isMilestone}
            <path
              d={milestonePath(bar)}
              style={`fill:${bar.fill}`}
              class="milestone"
              class:movable={anchor}
              on:pointerdown={(e) => startDrag(e, bar.id, 'move')}
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

            <!-- drag zones (transparent, on top of the bar). Packed bars omit the front-edge
                 pin zone: it would collide with the predecessor's end-resize edge, and the
                 chevron junction is the affordance to detach them instead. -->
            {#if !bar.packedAfter}
              <rect
                x={bar.x}
                y={bar.y}
                width={edgeW(bar)}
                height={bar.h}
                class="zone edge"
                on:pointerdown={(e) => startDrag(e, bar.id, 'pin')}
              >
                <title>Pin absolute start (detaches dependency)</title>
              </rect>
            {/if}
            <rect
              x={bar.x + (bar.packedAfter ? 0 : edgeW(bar))}
              y={bar.y}
              width={Math.max(0, bar.w - (bar.packedAfter ? 1 : 2) * edgeW(bar))}
              height={bar.h}
              class="zone middle"
              class:movable={anchor}
              on:pointerdown={(e) => startDrag(e, bar.id, 'move')}
            >
              <title>{anchor ? 'Move task' : 'Position derived from dependency'}</title>
            </rect>
            <rect
              x={bar.x + bar.w - edgeW(bar)}
              y={bar.y}
              width={edgeW(bar)}
              height={bar.h}
              class="zone edge"
              on:pointerdown={(e) => startDrag(e, bar.id, 'resize')}
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

    <!-- dependency arrows on top -->
    <g class="arrows">
      {#each layout.arrows as arrow}
        <path d={arrow.d} class="arrow" marker-end="url(#arrowhead)" />
      {/each}
    </g>

    <!-- packed after-chain junctions: a chevron at the successor's front (click to detach);
         a gap between the bars gets a dashed lead-in from the predecessor's end -->
    <g class="junctions">
      {#each layout.junctions as j (j.toId)}
        {#if j.gap}
          <line x1={j.fromX} y1={j.y} x2={j.x} y2={j.y} class="junction-gap" />
        {/if}
        <path
          d={chevronPath(j.x, j.y)}
          class="junction-chevron"
          role="button"
          tabindex="0"
          aria-label="Detach dependency"
          on:click={(e) => breakJunction(e, j.toId)}
          on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && breakJunction(e, j.toId)}
        >
          <title>Depends on previous task — click to detach</title>
        </path>
      {/each}
    </g>

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

<style>
  .timeline-scroll {
    overflow: auto;
    width: 100%;
    height: 100%;
    background: var(--timeline-bg);
  }
  .timeline {
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
  .zone.middle {
    cursor: default;
  }
  .zone.middle.movable {
    cursor: grab;
  }
  .milestone.movable {
    cursor: grab;
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
    cursor: pointer;
  }
  .junction-chevron:hover,
  .junction-chevron:focus {
    stroke: var(--bar-stroke-hover);
    outline: none;
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
  .connect-line.snapped {
    stroke-dasharray: none;
    stroke-width: 2;
  }
</style>
