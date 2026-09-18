<script lang="ts">
  import { activeDocument, commitDocument } from '../stores/documentStore';

  // "exclude weekends" lives on the document (mermaid `excludes weekends`), so toggling it
  // rewrites the editor text and typing the directive flips the switch — one source of truth.
  $: checked = $activeDocument?.excludeWeekends ?? false;

  function toggle(e: Event): void {
    const doc = $activeDocument;
    const next = (e.currentTarget as HTMLInputElement).checked;
    if (doc) commitDocument({ ...doc, excludeWeekends: next });
  }
</script>

<label class="weekend" title="Compress each weekend to 1/3 of a day (mermaid: excludes weekends)">
  <input type="checkbox" {checked} disabled={!$activeDocument} on:change={toggle} />
  <span class="switch" aria-hidden="true"></span>
  <span class="text">Exclude weekends</span>
</label>

<style>
  .weekend {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--fg-muted);
    cursor: pointer;
    user-select: none;
  }
  /* Hide the native box; the .switch is the visual control. */
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .switch {
    position: relative;
    flex: none;
    width: 30px;
    height: 16px;
    border-radius: 999px;
    background: var(--border);
    transition: background 0.15s ease;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--bg);
    transition: transform 0.15s ease;
  }
  input:checked + .switch {
    background: var(--bar-0);
  }
  input:checked + .switch::after {
    transform: translateX(14px);
  }
  input:focus-visible + .switch {
    outline: 2px solid var(--bar-0);
    outline-offset: 2px;
  }
</style>
