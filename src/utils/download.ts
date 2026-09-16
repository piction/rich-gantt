// Trigger a client-side file download of text content. No backend (brainstorm §7.2).
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read a user-picked File as text. */
export function readFileText(file: File): Promise<string> {
  return file.text();
}
