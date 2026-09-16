// View-only state: zoom level and theme. Never serialized into the document (brainstorm
// §6.1, §7.4) — kept deliberately separate from documentStore to enforce that.
import { writable } from 'svelte/store';
import type { ZoomLevel } from '../render/scale';

export const zoom = writable<ZoomLevel>('week');
export const theme = writable<'light' | 'dark'>('light');

// Metadata attribute the task bars are colored by. null = auto (first key in the document).
export const colorKey = writable<string | null>(null);
