// Svelte action: keep a fixed-position overlay attached to an anchor element (Floating UI).
// Tracks the anchor every frame because SVG bars move by attribute changes (drag previews),
// which no resize/scroll observer would catch. A null anchor detaches and clears the position,
// leaving placement to CSS (used by the editor's pop-out mode).

import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';

export interface FloatingOptions {
  anchor: Element | null;
  placement: Placement;
}

export function floating(node: HTMLElement, opts: FloatingOptions) {
  let cleanup = () => {};

  function setup({ anchor, placement }: FloatingOptions): void {
    cleanup();
    cleanup = () => {};
    node.style.left = '';
    node.style.top = '';
    if (!anchor) return;
    cleanup = autoUpdate(
      anchor,
      node,
      async () => {
        const { x, y } = await computePosition(anchor, node, {
          strategy: 'fixed',
          placement,
          middleware: [offset(8), flip(), shift({ padding: 6 })],
        });
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
      },
      { animationFrame: true },
    );
  }

  setup(opts);
  return { update: setup, destroy: () => cleanup() };
}
