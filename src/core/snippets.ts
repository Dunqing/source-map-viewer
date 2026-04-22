import { clampOriginalPosition, skipLeadingWhitespace } from "./mapper";

export interface SnippetOptions {
  length?: number;
  appendEllipsis?: boolean;
}

interface ExtractSnippetOptions extends SnippetOptions {
  skipIndent?: boolean;
}

function clampSnippetColumn(lineText: string, column: number): number {
  return Math.max(0, Math.min(lineText.length, column));
}

function formatSnippet(
  text: string,
  start: number,
  { length = 40, appendEllipsis = false }: SnippetOptions,
): string {
  const end = start + length;
  const snippet = text.slice(start, end).trim();
  if (!snippet) return "(empty)";
  return appendEllipsis && end < text.length ? `${snippet}...` : snippet;
}

export function extractSnippet(
  lines: string[],
  line: number,
  col: number,
  { length = 40, appendEllipsis = false, skipIndent = false }: ExtractSnippetOptions = {},
): string {
  const text = lines[line] ?? "";
  const start = skipIndent ? skipLeadingWhitespace(text, col) : clampSnippetColumn(text, col);
  return formatSnippet(text, start, { length, appendEllipsis });
}

export function extractGeneratedSnippet(
  lines: string[],
  line: number,
  col: number,
  options: SnippetOptions = {},
): string {
  return extractSnippet(lines, line, col, { ...options, skipIndent: true });
}

export function extractOriginalSnippet(
  lines: string[],
  line: number,
  col: number,
  options: SnippetOptions = {},
): string {
  const clamped = clampOriginalPosition(line, col, lines);
  return extractSnippet(lines, clamped.line, clamped.column, options);
}
