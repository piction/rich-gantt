<script lang="ts">
  // Top/bottom split with a draggable divider (brainstorm §7.1). Timeline is wide, so the
  // full width goes to the top pane and the code pane sits below.
  export let topFraction = 0.6; // 0..1

  let container: HTMLDivElement;
  let dragging = false;

  function startDrag(): void {
    dragging = true;
  }
  function onMove(e: PointerEvent): void {
    if (!dragging || !container) return;
    const rect = container.getBoundingClientRect();
    const f = (e.clientY - rect.top) / rect.height;
    topFraction = Math.min(0.85, Math.max(0.15, f));
  }
  function endDrag(): void {
    dragging = false;
  }
</script>

<svelte:window on:pointermove={onMove} on:pointerup={endDrag} />

<div class="split" bind:this={container}>
  <div class="pane top" style={`flex-basis:${topFraction * 100}%`}>
    <slot name="top" />
  </div>
  <div
    class="divider"
    class:dragging
    on:pointerdown={startDrag}
    role="separator"
    aria-orientation="horizontal"
    tabindex="-1"
  ></div>
  <div class="pane bottom">
    <slot name="bottom" />
  </div>
</div>

<style>
  .split {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .pane {
    overflow: hidden;
    min-height: 0;
  }
  .pane.top {
    flex-grow: 0;
    flex-shrink: 0;
  }
  .pane.bottom {
    flex: 1;
  }
  .divider {
    height: 6px;
    background: var(--border);
    cursor: row-resize;
    flex-shrink: 0;
  }
  .divider:hover,
  .divider.dragging {
    background: var(--fg-muted);
  }
</style>
