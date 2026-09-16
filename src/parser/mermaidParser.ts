// Parses the mermaid gantt block's inner lines into schedule tasks + sections.
// Grammar per task line:  Label : [tag,...] id, position, duration
//   tags    = done | active | crit | milestone   (leading, optional; only milestone modeled)
//   position = `after <id> [<id>...]`  OR  YYYY-MM-DD
//   duration = <n>d  where n is a multiple of 0.5

import type { ParseError, ScheduleTask, Section, TaskKind } from '../model/types';
import type { SourceLine } from './tokenizer';
import { isValidDateString, isValidDuration } from '../compute/dateMath';

export interface MermaidParseResult {
  title: string | null;
  dateFormat: string | null;
  tasks: ScheduleTask[];
  sections: Section[];
  errors: ParseError[];
}

const TAGS = new Set(['done', 'active', 'crit', 'milestone']);
const DURATION_RE = /^(\d+(?:\.5)?)d$/;
const AFTER_RE = /^after\s+(.+)$/;
const DATEISH_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

export function parseMermaid(lines: SourceLine[]): MermaidParseResult {
  const errors: ParseError[] = [];
  const tasks: ScheduleTask[] = [];
  const sections: Section[] = [];
  let title: string | null = null;
  let dateFormat: string | null = null;
  let currentSection = '';
  let sectionEntry: Section | null = null;

  const attachToSection = (id: string) => {
    if (!sectionEntry || sectionEntry.name !== currentSection) {
      sectionEntry = sections.find((s) => s.name === currentSection) ?? null;
      if (!sectionEntry) {
        sectionEntry = { name: currentSection, taskIds: [] };
        sections.push(sectionEntry);
      }
    }
    sectionEntry.taskIds.push(id);
  };

  for (const { text, lineNo } of lines) {
    const line = text.trim();
    if (line === '' || line === 'gantt') continue;

    if (/^title\s+/i.test(line)) {
      title = line.replace(/^title\s+/i, '').trim();
      continue;
    }
    if (/^dateFormat\s+/i.test(line)) {
      dateFormat = line.replace(/^dateFormat\s+/i, '').trim();
      if (dateFormat !== 'YYYY-MM-DD') {
        errors.push({
          code: 'UNSUPPORTED_DATE_FORMAT',
          message: `Only dateFormat YYYY-MM-DD is supported (got "${dateFormat}").`,
          line: lineNo,
        });
      }
      continue;
    }
    if (/^section\s+/i.test(line)) {
      currentSection = line.replace(/^section\s+/i, '').trim();
      continue;
    }
    // Ignore other stock directives (view concerns), e.g. `excludes weekends`, `axisFormat`.
    if (/^(excludes|includes|axisFormat|todayMarker|weekday|tickInterval)\b/i.test(line)) {
      continue;
    }

    const task = parseTaskLine(line, lineNo, errors);
    if (task) {
      tasks.push(task);
      attachToSection(task.id);
    }
  }

  return { title, dateFormat, tasks, sections, errors };
}

function parseTaskLine(
  line: string,
  lineNo: number,
  errors: ParseError[],
): ScheduleTask | null {
  const colon = line.lastIndexOf(':');
  if (colon === -1) {
    errors.push({
      code: 'MALFORMED_TASK_LINE',
      message: `Task line has no ':' separating label from fields.`,
      line: lineNo,
    });
    return null;
  }
  const label = line.slice(0, colon).trim();
  const fields = line
    .slice(colon + 1)
    .split(',')
    .map((f) => f.trim());

  // Consume leading tags.
  let idx = 0;
  let kind: TaskKind = 'task';
  while (idx < fields.length && TAGS.has(fields[idx])) {
    if (fields[idx] === 'milestone') kind = 'milestone';
    idx++;
  }

  const id = fields[idx];
  idx++;
  if (!id) {
    errors.push({
      code: 'MISSING_ID',
      message: `Task "${label || '(unnamed)'}" is missing its mandatory id.`,
      line: lineNo,
    });
    return null;
  }

  const rest = fields.slice(idx).filter((f) => f !== '');
  if (rest.length !== 2) {
    errors.push({
      code: 'MALFORMED_TASK_LINE',
      message: `Task "${id}" must have exactly a position and a duration (got ${rest.length} field(s)).`,
      line: lineNo,
    });
    return null;
  }
  const [positionField, durationField] = rest;

  const position = parsePosition(positionField, id, lineNo, errors);
  const duration = parseDuration(durationField, id, lineNo, errors);
  if (!position || duration === null) return null;

  return { id, label, section: '', position, duration, kind, sourceLine: lineNo };
}

function parsePosition(
  field: string,
  id: string,
  lineNo: number,
  errors: ParseError[],
): ScheduleTask['position'] | null {
  const after = field.match(AFTER_RE);
  if (after) {
    const ids = after[1].trim().split(/\s+/).filter(Boolean);
    return { kind: 'after', ids };
  }
  if (isValidDateString(field)) {
    return { kind: 'absolute', date: field };
  }
  if (DATEISH_RE.test(field)) {
    errors.push({
      code: 'BAD_DATE_FORMAT',
      message: `Task "${id}" has an invalid or non-canonical date "${field}" (use YYYY-MM-DD).`,
      line: lineNo,
    });
    return null;
  }
  errors.push({
    code: 'NEITHER_DATE_NOR_AFTER',
    message: `Task "${id}" position "${field}" is neither a YYYY-MM-DD date nor an "after <id>".`,
    line: lineNo,
  });
  return null;
}

function parseDuration(
  field: string,
  id: string,
  lineNo: number,
  errors: ParseError[],
): number | null {
  const m = field.match(DURATION_RE);
  if (!m) {
    errors.push({
      code: 'INVALID_DURATION_GRANULARITY',
      message: `Task "${id}" duration "${field}" must be <n>d in 0.5-day steps (e.g. 3d, 0.5d).`,
      line: lineNo,
    });
    return null;
  }
  const value = Number(m[1]);
  if (!isValidDuration(value)) {
    errors.push({
      code: 'INVALID_DURATION_GRANULARITY',
      message: `Task "${id}" duration "${field}" must be a non-negative multiple of 0.5 days.`,
      line: lineNo,
    });
    return null;
  }
  return value;
}
