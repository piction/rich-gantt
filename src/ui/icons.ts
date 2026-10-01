// Lucide-style 24×24 stroke icons as path data (rendered by Icon.svelte with stroke=currentColor).
export const ICONS = {
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  calendar: ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
  pencil: ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  scissors: [
    'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    'M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    'M8.12 8.12 12 12',
    'M20 4 8.12 15.88',
    'M14.8 14.8 20 20',
  ],
  code: ['m10 13-2 2 2 2', 'm14 17 2-2-2-2', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
  after: ['M3 5v14', 'M21 12H7', 'm15 18 6-6-6-6'],
  maximize: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  minimize: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
} as const;

export type IconName = keyof typeof ICONS;
