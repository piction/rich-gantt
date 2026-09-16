<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
  import type { ParseError } from '../model/types';

  export let value: string;
  export let errors: ParseError[] = [];
  export let onChange: (text: string) => void = () => {};

  let container: HTMLDivElement;
  let view: EditorView;

  onMount(() => {
    view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          lintGutter(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChange(u.state.doc.toString());
          }),
          EditorView.theme(
            {
              '&': { height: '100%', fontSize: '13px' },
              '.cm-scroller': { fontFamily: 'ui-monospace, monospace' },
            },
            { dark: false },
          ),
        ],
      }),
    });
    pushDiagnostics();
  });

  onDestroy(() => view?.destroy());

  function pushDiagnostics(): void {
    if (!view) return;
    const doc = view.state.doc;
    const diags: Diagnostic[] = errors
      .filter((e) => e.line && e.line >= 1 && e.line <= doc.lines)
      .map((e) => {
        const line = doc.line(e.line!);
        return { from: line.from, to: line.to, severity: 'error', message: e.message };
      });
    view.dispatch(setDiagnostics(view.state, diags));
  }

  // Keep the editor text in sync when the source is replaced externally (e.g. file load),
  // without clobbering the user's cursor during normal typing.
  $: if (view && value !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }
  $: if (view) {
    errors;
    pushDiagnostics();
  }
</script>

<div class="editor" bind:this={container}></div>

<style>
  .editor {
    height: 100%;
    overflow: auto;
    background: var(--bg);
  }
</style>
