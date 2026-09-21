// Line-oriented tokenizer. Splits the source into the mermaid block's inner lines and the
// per-task `## Task metadata: <id>` markdown blocks. Emits flat tokens with 1-based line
// numbers; no interpretation of task/field grammar happens here (that is the mermaid and
// metadata parsers' job).

export interface SourceLine {
  text: string;
  lineNo: number; // 1-based, in the original document
}

/** One `## Task metadata: <id>` block: its id and the raw markdown lines below it. */
export interface MetadataBlock {
  id: string;
  headerLineNo: number; // 1-based line of the heading
  bodyLines: SourceLine[]; // lines after the heading up to the next heading; blank ends trimmed
}

export interface TokenizedDoc {
  mermaidFound: boolean;
  mermaidLines: SourceLine[]; // inside the fence, excluding the fence markers
  metadataBlocks: MetadataBlock[];
}

const FENCE_OPEN_RE = /^\s*```+\s*mermaid\s*$/i;
const FENCE_CLOSE_RE = /^\s*```+\s*$/;
// A metadata block is opened by this heading; its id is everything after the colon. A space
// before the colon is tolerated (`## Task metadata : id`).
const META_HEADING_RE = /^\s{0,3}##\s+Task metadata\s*:\s*(\S.*?)\s*$/;
// Any level-1/2 ATX heading ends the current block (level-3+ stays inside the body).
const HEADING_RE = /^\s{0,3}#{1,2}\s+/;
// A fenced code-block delimiter (``` or ~~~, optional info string). Lines inside a fence are
// literal content — headings, `#` comments, and even a `## Task metadata:` line there must NOT
// be treated as structure, so we toggle fence state and skip the heading check while inside one.
const FENCE_RE = /^\s{0,3}(```+|~~~+)/;

export function tokenize(source: string): TokenizedDoc {
  const lines = source.split('\n');

  const { mermaidFound, mermaidLines, fenceEndIndex } = extractMermaid(lines);
  const metadataBlocks = extractMetadataBlocks(lines, fenceEndIndex);

  return { mermaidFound, mermaidLines, metadataBlocks };
}

function extractMermaid(lines: string[]): {
  mermaidFound: boolean;
  mermaidLines: SourceLine[];
  fenceEndIndex: number; // index after the closing fence, or 0 if none
} {
  let i = 0;
  while (i < lines.length && !FENCE_OPEN_RE.test(lines[i])) i++;
  if (i >= lines.length) return { mermaidFound: false, mermaidLines: [], fenceEndIndex: 0 };

  const inner: SourceLine[] = [];
  let j = i + 1;
  while (j < lines.length && !FENCE_CLOSE_RE.test(lines[j])) {
    inner.push({ text: lines[j], lineNo: j + 1 });
    j++;
  }
  // j is the closing fence (or EOF). Content after it is where metadata lives.
  return { mermaidFound: true, mermaidLines: inner, fenceEndIndex: j + 1 };
}

function extractMetadataBlocks(lines: string[], startIndex: number): MetadataBlock[] {
  const blocks: MetadataBlock[] = [];
  let i = startIndex;
  let inFence = false; // track fences outside blocks too, so a stray fence can't spawn a phantom
  while (i < lines.length) {
    if (inFence) {
      if (FENCE_RE.test(lines[i])) inFence = false;
      i++;
      continue;
    }
    const m = META_HEADING_RE.exec(lines[i]);
    if (!m) {
      if (FENCE_RE.test(lines[i])) inFence = true;
      i++;
      continue;
    }
    const id = m[1].trim();
    const headerLineNo = i + 1;

    // Collect body lines up to the next level-1/2 heading, but keep fenced code intact: a
    // heading-looking line inside a ``` fence is literal content, not a block boundary.
    const bodyLines: SourceLine[] = [];
    let j = i + 1;
    let bodyFence = false;
    while (j < lines.length) {
      if (FENCE_RE.test(lines[j])) bodyFence = !bodyFence;
      else if (!bodyFence && HEADING_RE.test(lines[j])) break;
      bodyLines.push({ text: lines[j], lineNo: j + 1 });
      j++;
    }
    blocks.push({ id, headerLineNo, bodyLines: trimBlankEnds(bodyLines) });
    i = j; // resume at the next heading (which may open another block)
  }
  return blocks;
}

/** Drop blank lines at the start and end so `body` is canonical regardless of spacing. */
function trimBlankEnds(lines: SourceLine[]): SourceLine[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].text.trim() === '') start++;
  while (end > start && lines[end - 1].text.trim() === '') end--;
  return lines.slice(start, end);
}
