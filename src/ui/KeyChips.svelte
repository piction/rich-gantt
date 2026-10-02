<script lang="ts">
  // Metadata key chips shared by the add and edit popovers. "+ key" opens a list of the keys
  // used in the plan; picking one moves on to a list of that key's values. Both lists take free
  // text, offered as a trailing "+ New …" row. Clicking a chip's key or value reopens its list.
  // Typed text is written into `attrs` live, so the bound value is always current.
  import type { KeyUsage } from '../interaction/barEdits';
  import { buildColorScale } from '../render/colors';
  import Icon from './Icon.svelte';

  export let attrs: [string, string][]; // bound
  export let catalog: KeyUsage[];
  export let colorKey: string | null = null; // chips of this key get a color swatch
  export let colorValues: string[] = []; // colorKey's values on the other tasks

  type Part = 0 | 1; // index into a [key, value] pair
  interface Option {
    text: string;
    count: number;
    isNew: boolean;
  }

  let edit: { i: number; part: Part; before: string } | null = null;
  let hl = 0;
  let addBtn: HTMLButtonElement;

  $: query = edit ? attrs[edit.i][edit.part] : '';
  // Reopening a chip lists every option; filtering starts once the text is changed.
  $: options = edit ? optionsFor(edit.i, edit.part, query === edit.before ? '' : query) : [];
  $: hl = defaultHighlight(options, query);
  $: colorOf = buildColorScale([
    ...colorValues,
    ...attrs.filter(([k]) => k === colorKey).map(([, v]) => v),
  ]);

  const same = (a: string, b: string): boolean => a.toLowerCase() === b.trim().toLowerCase();

  function optionsFor(i: number, part: Part, q: string): Option[] {
    const needle = q.trim().toLowerCase();
    let known: Option[];
    if (part === 0) {
      const used = new Set(attrs.filter((_, j) => j !== i).map(([k]) => k));
      known = catalog
        .filter((u) => !used.has(u.key))
        .map((u) => ({ text: u.key, count: u.count, isNew: false }));
    } else {
      known = (catalog.find((u) => u.key === attrs[i][0])?.values ?? []).map((v) => ({
        text: v.value,
        count: v.count,
        isNew: false,
      }));
    }
    const matches = known.filter((o) => o.text.toLowerCase().includes(needle));
    const exact = matches.some((o) => same(o.text, q));
    return needle && !exact ? [...matches, { text: q.trim(), count: 0, isNew: true }] : matches;
  }

  /** The exact match if there is one, else the first row (the "+ New" row when nothing matches). */
  function defaultHighlight(opts: Option[], q: string): number {
    return Math.max(0, opts.findIndex((o) => !o.isNew && same(o.text, q)));
  }

  const isNewKey = (k: string): boolean => !catalog.some((u) => u.key === k);
  const isNewValue = (k: string, v: string): boolean =>
    !!v && !catalog.find((u) => u.key === k)?.values.some((x) => x.value === v);

  function open(i: number, part: Part): void {
    edit = { i, part, before: attrs[i][part] };
  }

  function addKey(): void {
    attrs = [...attrs, ['', '']];
    open(attrs.length - 1, 0);
  }

  function remove(i: number): void {
    attrs = attrs.filter((_, j) => j !== i);
  }

  /** Leave edit mode; a chip without a key is dropped. */
  function close(): void {
    edit = null;
    attrs = attrs.filter(([k]) => k.trim() !== '');
  }

  function accept(o: Option | undefined): void {
    if (!edit) return;
    const { i, part } = edit;
    if (o) attrs[i][part] = o.text;
    if (part === 0 && attrs[i][0].trim()) open(i, 1);
    else {
      close();
      addBtn.focus();
    }
  }

  function onInput(e: Event): void {
    if (edit) attrs[edit.i][edit.part] = (e.currentTarget as HTMLInputElement).value;
  }

  function onKey(e: KeyboardEvent): void {
    if (!edit) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = options.length;
      if (n) hl = (hl + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      accept(options[hl]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      attrs[edit.i][edit.part] = edit.before;
      close();
      addBtn.focus();
    } else if (e.key === 'Backspace' && edit.part === 1 && query === '') {
      e.preventDefault();
      open(edit.i, 0);
    }
  }

  /** Focus a freshly shown input. Its blur closes the list, unless editing already moved on. */
  function field(el: HTMLInputElement, at: typeof edit): void {
    el.focus();
    el.select();
    el.addEventListener('blur', () => {
      if (edit === at) close();
    });
  }
</script>

<div class="keys">
  {#each attrs as [k, v], i}
    {@const editing = edit?.i === i ? edit.part : null}
    <span class="kvw">
      <span class="kv" class:on={editing !== null}>
        {#if editing === 0}
          <input
            class="k"
            value={k}
            placeholder="key"
            size={Math.max(4, k.length)}
            use:field={edit}
            on:input={onInput}
            on:keydown={onKey}
          />
        {:else}
          <button class="k" title="Change key" on:click={() => open(i, 0)}>
            {#if isNewKey(k)}<span class="new">new</span>{/if}{k}
          </button>
        {/if}
        {#if editing === 1}
          <input
            class="v"
            value={v}
            placeholder="value"
            size={Math.max(5, v.length)}
            use:field={edit}
            on:input={onInput}
            on:keydown={onKey}
          />
        {:else if editing === null}
          <button class="v" title="Change value" on:click={() => open(i, 1)}>
            {#if k === colorKey && v}<span class="sw" style:background={colorOf(v).fill} />{/if}
            {#if isNewValue(k, v) && !isNewKey(k)}<span class="new">new</span>{/if}{v}
          </button>
          <button class="rm" title="Remove key" on:click={() => remove(i)}>
            <Icon name="x" size={10} />
          </button>
        {/if}
      </span>
      {#if editing !== null && options.length}
        <div class="menu" role="listbox">
          {#each options as o, j}
            <!-- mousedown would blur the input and close the list before the click lands -->
            <button
              class="it"
              class:hl={j === hl}
              class:create={o.isNew}
              role="option"
              aria-selected={j === hl}
              on:mousedown|preventDefault
              on:click={() => accept(o)}
            >
              {#if o.isNew}
                <Icon name="plus" size={12} /> New {editing === 0 ? 'key' : 'value'} "{o.text}"
              {:else}
                <span class="txt">{o.text}</span>
                <span class="n">{o.count}{editing === 0 ? ' tasks' : ''}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </span>
  {/each}
  <button class="add" bind:this={addBtn} on:click={addKey}>
    <Icon name="plus" size={12} /> key
  </button>
</div>

<style>
  button {
    font: inherit;
    color: inherit;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }
  .kvw {
    position: relative;
    display: inline-flex;
  }
  .kv {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg);
    font-size: 11.5px;
  }
  .kv.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .kv input,
  .kv button.k,
  .kv button.v {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: inherit;
    color: var(--fg);
    border: 0;
    border-radius: 0;
    padding: 3px 6px;
    background: none;
    outline: none;
    box-shadow: none;
  }
  .kv button.k {
    background: var(--kbd-bg);
    color: var(--fg-muted);
  }
  .kv button.v {
    padding-right: 2px;
  }
  .sw {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex: none;
  }
  /* this key/value isn't used anywhere else in the plan yet (catches typos) */
  .new {
    font: 700 9px system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: 3px;
    padding: 1px 3px;
  }
  .rm {
    display: inline-flex;
    padding: 4px 5px;
    color: var(--fg-muted);
  }
  .rm:hover {
    color: var(--danger);
  }
  .add {
    border: 1px dashed var(--border);
    border-radius: 6px;
    padding: 2px 7px;
    color: var(--fg-muted);
    font-size: 11.5px;
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
  .add:focus-visible {
    outline: none;
    border-color: var(--accent);
    color: var(--fg);
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 3;
    min-width: 170px;
    max-height: 220px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 9px;
    box-shadow: var(--shadow);
    padding: 4px;
    font-size: 12px;
  }
  .it {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 4px 7px;
    border-radius: 6px;
    white-space: nowrap;
    text-align: left;
  }
  .it.hl {
    background: var(--accent-soft);
  }
  .it.create {
    color: var(--accent);
    font-weight: 600;
  }
  .txt {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .n {
    margin-left: auto;
    color: var(--fg-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
</style>
