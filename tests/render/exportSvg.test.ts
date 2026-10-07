import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument } from '../../src/parser';
import { computeSchedule } from '../../src/compute/scheduler';
import { computeLayout } from '../../src/render/layout';
import { availableColorKeys, colorLegend } from '../../src/render/colors';
import { exportSvg, THEME_VARS } from '../../src/render/exportSvg';
import { fitLabel } from '../../src/render/text';

const sample = readFileSync('public/sample-plan.md', 'utf8');
// Distinct fake hex per variable, so each can be traced into the output.
const colors = Object.fromEntries(THEME_VARS.map((v, i) => [v, `#${(0x100000 + i).toString(16)}`]));

function render(opts: { title?: boolean; legend?: boolean } = {}) {
  const r = parseDocument(sample);
  if (!r.ok) throw new Error('parse failed');
  const doc = r.doc;
  const key = availableColorKeys(doc)[0];
  const layout = computeLayout(doc, computeSchedule(doc), 'week', key);
  const out = exportSvg(layout, {
    colors,
    title: opts.title ? { name: 'Roadmap <Q4>', meta: '9 tasks' } : null,
    legend: opts.legend ? colorLegend(doc, key) : [],
    durations: new Map([...doc.tasks.values()].map((t) => [t.id, t.duration])),
  });
  return { ...out, layout, legend: colorLegend(doc, key) };
}

describe('exportSvg', () => {
  it('resolves every CSS variable to a literal color', () => {
    const { svg, layout } = render({ title: true, legend: true });
    expect(svg).not.toContain('var(');
    // bar fills from the categorical palette made it through
    for (const b of layout.bars) expect(svg).toContain(`fill="${colors[b.fill.slice(4, -1)]}"`);
  });

  it('draws every bar and none of the interactive layers', () => {
    const { svg, layout } = render();
    for (const b of layout.bars) {
      const text = b.isMilestone ? b.label : fitLabel(b);
      expect(svg).toContain(`>${text.replace(/&/g, '&amp;')}</text>`);
    }
    expect(svg).not.toContain('New task');
    expect(svg).not.toContain('New section');
    expect(svg).not.toContain('<circle'); // connector dots
  });

  it('adds the escaped title and the legend only when asked', () => {
    const bare = render();
    const full = render({ title: true, legend: true });
    expect(bare.svg).not.toContain('Roadmap');
    expect(full.svg).toContain('Roadmap &lt;Q4&gt;');
    for (const e of full.legend) expect(full.svg).toContain(`>${e.value}</text>`);
    expect(full.height).toBeGreaterThan(bare.height);
    expect(full.width).toBe(bare.width);
  });
});
