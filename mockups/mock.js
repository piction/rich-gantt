/* Mockup-only renderer. Mimics src/render/Timeline.svelte visually (bars, sections, weekend
   shading, center-bottom → front arrows) so focus-mode designs can be judged in context.
   Plain script (no modules) so the pages open straight from file://. */
(function () {
  const PX = 28, X0 = 170, HEADER = 30, SEC_HEAD = 24, ROW = 30, BAR_H = 20, DAYS = 30;
  const DAY0 = Date.UTC(2026, 8, 14); // Mon 14 Sep 2026
  const FILL = { architecture: 0, development: 1, testing: 2 };

  const SAMPLE = [
    { id: 'arch1', label: 'Data model design', section: 'Foundation', start: 0, dur: 3, after: [], type: 'architecture' },
    { id: 'dev1', label: 'Parser & serializer', section: 'Foundation', dur: 5, after: ['arch1'], type: 'development' },
    { id: 'dev2', label: 'Model unit tests', section: 'Foundation', dur: 4, after: ['arch1'], type: 'development' },
    { id: 'arch2', label: 'Render architecture', section: 'Core', dur: 3, after: ['dev1'], type: 'architecture' },
    { id: 'dev3', label: 'SVG timeline & bars', section: 'Core', dur: 5, after: ['arch2'], type: 'development' },
    { id: 'dev4', label: 'Zoom (day/wk/month)', section: 'Core', dur: 4, after: ['arch2'], type: 'development' },
    { id: 'arch3', label: 'Interaction design', section: 'Integration', dur: 2, after: ['dev3'], type: 'architecture' },
    { id: 'dev5', label: 'Drag & dot gestures', section: 'Integration', dur: 5, after: ['arch3'], type: 'development' },
    { id: 'dev6', label: 'Metadata hover UI', section: 'Integration', dur: 3, after: ['arch3'], type: 'development' },
  ];

  const sample = () => SAMPLE.map((t) => ({ ...t, after: [...t.after] }));

  function schedule(tasks) {
    const by = new Map(tasks.map((t) => [t.id, t]));
    const out = new Map();
    const visit = (id) => {
      if (out.has(id)) return out.get(id);
      const t = by.get(id);
      const preds = t.after.filter((p) => by.has(p));
      const start = preds.length ? Math.max(...preds.map((p) => visit(p).end)) : t.start ?? 0;
      const r = { start, end: start + t.dur };
      out.set(id, r);
      return r;
    };
    tasks.forEach((t) => visit(t.id));
    return out;
  }

  function fmtDay(d) {
    return new Date(DAY0 + Math.floor(d) * 864e5).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    });
  }

  let ctx;
  function textW(s) {
    ctx = ctx || document.createElement('canvas').getContext('2d');
    ctx.font = '12px system-ui, sans-serif';
    return ctx.measureText(s).width;
  }
  function fit(s, max) {
    if (max <= 0) return '';
    if (textW(s) <= max) return s;
    while (s.length && textW(s + '…') > max) s = s.slice(0, -1);
    return s ? s + '…' : '';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function layout(tasks) {
    const sch = schedule(tasks);
    const sections = [];
    for (const t of tasks) {
      let s = sections.find((s) => s.name === t.section);
      if (!s) sections.push((s = { name: t.section, ids: [] }));
      s.ids.push(t.id);
    }
    let y = HEADER;
    const bars = new Map();
    for (const s of sections) {
      s.y = y;
      let ry = y + SEC_HEAD;
      for (const id of s.ids) {
        const r = sch.get(id);
        const x = X0 + r.start * PX, w = Math.max(r.end - r.start, 0.5) * PX;
        bars.set(id, { id, x, y: ry + (ROW - BAR_H) / 2, w, h: BAR_H, cx: x + w / 2, cy: ry + ROW / 2, start: r.start, end: r.end });
        ry += ROW;
      }
      s.h = ry - y + 6;
      y += s.h;
    }
    return { sections, bars, sch, width: X0 + DAYS * PX, height: y + 8, xOfDay: (d) => X0 + d * PX, dayOfX: (x) => (x - X0) / PX };
  }

  /* opts: tasks, selected, origin {x,w,y,h} (dashed pre-move outline), broken [{from,to}],
     dim (default: true when something is selected). */
  function render(host, o) {
    const tasks = o.tasks;
    const L = layout(tasks);
    const by = new Map(tasks.map((t) => [t.id, t]));
    const sel = o.selected;
    const related = new Set();
    if (sel && by.has(sel)) {
      by.get(sel).after.forEach((p) => related.add(p));
      tasks.forEach((t) => t.after.includes(sel) && related.add(t.id));
    }
    const dim = o.dim ?? !!sel;
    let s = `<svg class="timeline${dim ? ' focusing' : ''}" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}">
      <defs>
        <marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="arrowhead"/></marker>
        <marker id="ah-f" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="arrowhead focus"/></marker>
        <marker id="ah-d" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="arrowhead danger"/></marker>
      </defs>`;
    L.sections.forEach((sec, i) => {
      if (i % 2) s += `<rect x="0" y="${sec.y}" width="${L.width}" height="${sec.h}" class="section-band alt"/>`;
    });
    for (let d = 0; d < DAYS; d++) {
      const x = L.xOfDay(d);
      if (d % 7 === 5 || d % 7 === 6) s += `<rect x="${x}" y="${HEADER}" width="${PX}" height="${L.height - HEADER}" class="weekend"/>`;
      if (d % 7 === 0) {
        s += `<line x1="${x}" y1="${HEADER}" x2="${x}" y2="${L.height}" class="gridline"/>`;
        s += `<text x="${x + 3}" y="19" class="tick-label">${fmtDay(d).slice(4)}</text>`;
      }
    }
    L.sections.forEach((sec) => (s += `<text x="10" y="${sec.y + 16}" class="section-label">${esc(sec.name)}</text>`));

    // origin outline (where the bar was before the move)
    if (o.origin) s += `<rect x="${o.origin.x}" y="${o.origin.y}" width="${o.origin.w}" height="${o.origin.h}" rx="3" class="origin"/>`;

    // bars
    for (const t of tasks) {
      const b = L.bars.get(t.id);
      const cls = ['bar'];
      if (t.ghost) cls.push('ghost');
      if (t.id === sel) cls.push('selected');
      else if (dim && !related.has(t.id)) cls.push('dim');
      else if (dim) cls.push('related');
      const k = FILL[t.type];
      const fill = k === undefined ? 'var(--bar-none)' : `var(--bar-${k})`;
      const fg = k === undefined ? 'var(--bar-none-fg)' : `var(--bar-${k}-fg)`;
      s += `<g class="${cls.join(' ')}" data-id="${t.id}">`;
      if (t.id === sel) s += `<rect x="${b.x - 3.5}" y="${b.y - 3.5}" width="${b.w + 7}" height="${b.h + 7}" rx="6" class="focus-ring"/>`;
      s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" class="bar-rect" style="${t.ghost ? '' : `fill:${fill}`}"/>`;
      const label = fit(t.label, b.w - 12);
      s += `<text x="${b.x + 6}" y="${b.cy + 4}" class="bar-label" style="${t.ghost ? '' : `fill:${fg}`}">${esc(label)}</text>`;
      const dur = `${t.dur}d`;
      if (label === t.label && textW(t.label) + 8 + textW(dur) <= b.w - 12)
        s += `<text x="${b.x + b.w - 6}" y="${b.cy + 4}" text-anchor="end" class="bar-label dur" style="${t.ghost ? '' : `fill:${fg}`}">${dur}</text>`;
      s += `</g>`;
    }

    // dependency arrows: predecessor center-bottom → successor front
    const arrow = (from, to, cls, mk) => {
      const a = L.bars.get(from), b = L.bars.get(to);
      return `<path d="M ${a.cx},${a.y + a.h} V ${b.cy} H ${b.x - 2}" class="arrow ${cls}" marker-end="url(#${mk})"/>`;
    };
    for (const t of tasks)
      for (const p of t.after) {
        if (!L.bars.has(p)) continue;
        const hot = sel && (t.id === sel || p === sel);
        s += arrow(p, t.id, t.ghost ? 'ghost' : hot ? 'focus' : dim ? 'dim' : '', hot ? 'ah-f' : 'ah');
      }
    for (const br of o.broken || []) {
      const a = L.bars.get(br.from), b = L.bars.get(br.to);
      s += arrow(br.from, br.to, 'broken', 'ah-d');
      const mx = a.cx, my = (a.y + a.h + b.cy) / 2 + 2;
      s += `<g class="cut" transform="translate(${mx - 9},${my - 9})"><circle cx="9" cy="9" r="9"/><g transform="translate(3,3) scale(0.5)">${ICONS.scissors}</g></g>`;
    }
    s += `</svg>`;

    host.classList.add('stage');
    let chart = host.querySelector(':scope > .layer-chart');
    if (!chart) {
      chart = document.createElement('div');
      chart.className = 'layer-chart';
      const ui = document.createElement('div');
      ui.className = 'layer-ui';
      host.append(chart, ui);
    }
    chart.innerHTML = s;
    host.style.width = L.width + 'px';
    host.style.height = L.height + 'px';
    return L;
  }

  /* Absolutely position an HTML overlay at (x, y) in chart coordinates. ax/ay are the anchor
     fractions of the overlay's own box (-0.5,-1 = centered above the point). */
  function place(host, html, x, y, { ax = -0.5, ay = -1, dx = 0, dy = 0, cls = '' } = {}) {
    const el = document.createElement('div');
    el.className = 'ov ' + cls;
    el.innerHTML = html;
    move(el, x, y, { ax, ay, dx, dy });
    host.querySelector('.layer-ui').append(el);
    return el;
  }
  function move(el, x, y, { ax = -0.5, ay = -1, dx = 0, dy = 0 } = {}) {
    el.style.left = x + dx + 'px';
    el.style.top = y + dy + 'px';
    el.style.transform = `translate(${ax * 100}%, ${ay * 100}%)`;
  }
  const callout = (host, n, x, y) => place(host, n, x, y, { ax: -0.5, ay: -0.5, cls: 'callout' });

  /* Storyboard frame: header + stage + notes. Returns the stage host. */
  function frame(parent, { step, title, text, notes = [] }) {
    const sec = document.createElement('section');
    sec.className = 'frame';
    sec.innerHTML = `<header><span class="step">${step}</span><div><h3>${title}</h3><p>${text}</p></div></header>
      <div class="stage-scroll"><div class="stage-host"></div></div>
      ${notes.length ? `<ol class="notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ol>` : ''}`;
    document.querySelector(parent).append(sec);
    return sec.querySelector('.stage-host');
  }

  // Lucide-style icons (24×24, stroke = currentColor)
  const ICONS = {
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    unlink: '<path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/><path d="M8 2v3"/><path d="M2 8h3"/><path d="M16 19v3"/><path d="M19 16h3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    move: '<path d="m18 8 4 4-4 4"/><path d="m6 8-4 4 4 4"/><path d="M2 12h20"/>',
    code: '<path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    after: '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m15 18 6-6-6-6"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  };
  const icon = (name, size = 16) =>
    `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

  /* ---- Variant A components (shared by the storyboard and the playground) ---- */

  /* link: {kind:'after', names:[...]} | {kind:'date', text}; dur: string; editing: bool;
     tip: name of the button whose tooltip is forced visible. */
  function pill({ link, dur, editing = false, tip = null, tipText = null }) {
    const linkChip =
      link.kind === 'after'
        ? `<span class="chip" title="Start is derived — moving the bar will unlink it">${icon('link', 13)}<span class="muted">after</span><span class="name">${esc(link.names.join(', '))}</span><button class="x" data-act="unlink" title="Unlink (pin to current date)">${icon('x', 11)}</button></span>`
        : `<span class="chip" title="Pinned start date — drag the bar or use ←/→">${icon('calendar', 13)}<span class="name">${esc(link.text)}</span></span>`;
    const btn = (act, ic, label, kbd, extra = '') =>
      `<button class="pbtn ${label ? '' : 'icon'} ${extra} ${tip === act ? 'show-tip' : ''}" data-act="${act}">${icon(ic)}${label ? `<span>${label}</span>` : ''}<span class="tip">${tip === act && tipText ? tipText : `${act[0].toUpperCase() + act.slice(1)}`} <kbd>${kbd}</kbd></span></button>`;
    return `<div class="pill">
      ${linkChip}
      <span class="sep"></span>
      <span class="stepper${editing ? ' editing' : ''}">
        <button data-act="dec" title="−1 day (−)">${icon('minus', 13)}</button>
        <span class="num" data-act="dur" title="Type a number to set the length">${esc(dur)}${editing ? '<i class="caret"></i>' : ''}</span><span class="unit">d</span>
        <button data-act="inc" title="+1 day (+)">${icon('plus', 13)}</button>
      </span>
      <span class="sep"></span>
      ${btn('add', 'plus', 'After', 'A')}
      ${btn('edit', 'pencil', '', '↵')}
      ${btn('delete', 'trash', '', 'Del', 'danger')}
    </div>`;
  }

  function toast(host, html, L) {
    return place(host, `<div class="toast">${html}</div>`, L.width / 2, L.height - 10, { ay: -1 });
  }

  function addPopover({ after, name = '', dur = 3, section, typing = false }) {
    return `<div class="pop add" data-keep>
      <div class="pop-head">${icon('after', 14)}<span class="muted">New task after</span><b>${esc(after)}</b></div>
      <label class="field"><input class="name${typing ? ' fake-focus' : ''}" placeholder="Task name" value="${esc(name)}" /></label>
      <div class="row"><span class="lbl">Length</span>
        <div class="seg">${[1, 2, 3, 5, 10].map((d) => `<button data-dur="${d}" class="${d === dur ? 'on' : ''}">${d}d</button>`).join('')}</div>
      </div>
      <div class="row"><span class="lbl">Section</span><span class="select">${esc(section)} <span class="muted">▾</span></span></div>
      <div class="pop-foot">
        <span class="hint"><kbd>↵</kbd> create <kbd>⇧↵</kbd> + next <kbd>Esc</kbd></span>
        <button class="primary" data-act="create">Create</button>
      </div>
    </div>`;
  }

  function editPopover(t, notes) {
    const keys = t.type ? [['type', t.type], ['owner', 'Jonas'], ['team', 'Core']] : [];
    return `<div class="pop edit" data-keep>
      <div class="pop-head">${icon('pencil', 14)}<span class="muted">Edit</span><code>${esc(t.id)}</code>
        <a class="src" href="#" title="Jump to this task in the source editor">${icon('code', 13)} Source</a></div>
      <label class="field"><span class="lbl">Name</span><input class="name" value="${esc(t.label)}" /></label>
      <div class="field"><span class="lbl">Keys</span>
        <div class="keys">${keys.map(([k, v]) => `<span class="kv"><span class="k">${k}</span><input class="v" value="${esc(v)}"/></span>`).join('')}
          <button class="ghost-btn">${icon('plus', 12)} key</button></div>
      </div>
      <label class="field"><span class="lbl">Notes</span><textarea rows="3">${esc(notes)}</textarea></label>
      <div class="pop-foot">
        <span class="hint"><kbd>⌘↵</kbd> save <kbd>Esc</kbd> cancel</span>
        <button class="primary" data-act="save">Save</button>
      </div>
    </div>`;
  }

  function themeToggle() {
    const b = document.createElement('button');
    b.className = 'theme-toggle';
    b.textContent = '◐ Theme';
    b.onclick = () => {
      const r = document.documentElement;
      r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
    };
    document.body.append(b);
  }

  window.Gantt = { sample, schedule, layout, render, place, move, callout, frame, icon, esc, fmtDay, pill, toast, addPopover, editPopover, themeToggle, PX, BAR_H };
})();
