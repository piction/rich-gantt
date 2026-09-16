# Gantt Planner

A browser-based Gantt **editor/visualizer**. A plan is one markdown file: a standalone
Mermaid `gantt` block (the schedule) plus a `## Gantt task metadata` table (owner, team,
type, notes). One immutable task **id** renders the bar, is the `after` dependency
reference, and keys the metadata row.

See `../Gantt editor - brainstorm.md` for the full design rationale.

## v1 scope (this build)

- Hand-written **parser + canonical serializer** for the Mermaid+metadata format.
- **Scheduler**: resolves absolute anchors + `after` chains (fan-in = latest predecessor
  end) into concrete dates; supports `0.5d` granularity.
- Read-only **SVG timeline**: section bands, task bars, milestones, dependency arrows,
  weekend shading; **month / week / day** zoom.
- **Split-screen** UI: chart on top, CodeMirror 6 editor below, with a debounced
  re-parse. While the code is invalid the chart keeps the last good render and errors show
  inline (banner + editor gutter).
- **Metadata hover card** (Floating UI) — the `description` cell renders **basic inline
  markdown** (bold/italic, `code`, safe links, `<br>` breaks, `- ` bullets); escaped +
  sanitized (see `src/ui/markdown.ts`). **File upload/download**, light/dark theme.
- **Bar-drag editing**: middle = move (anchors), front edge = pin absolute start (detaches
  the incoming dependency), end edge = extend duration; successors cascade. See
  `src/interaction/README.md`.
- **Dot-connector dependency creation**: drag from a bar's center-bottom **source dot** to
  another task's **front dot** to add an `after` edge (fan-in accumulates; self/dup/cycle
  rejected). Edges render center-bottom → front.
- Still deferred: removing edges via the dots, lag/`wait` tasks.

## Run it (Docker — no host Node needed)

```sh
docker compose up dev        # dev server + HMR at http://localhost:5173
docker compose exec dev npm test     # run the unit tests (parser/scheduler/serializer/render)
docker compose run --rm dev npm run build   # static build → dist/
```

Serve the static build anywhere (e.g. `cd dist && python3 -m http.server`), or deploy
`dist/` to GitHub Pages / Netlify.

## Architecture

Pure, framework-free core (`model`, `parser`, `serializer`, `compute`, `render/*.ts`) with
Svelte only at the edges (`render/*.svelte`, `ui`, `stores`). The parsed model is the single
source of truth; both panes are projections of it. Colors and zoom are view concerns and are
never stored in the file.
