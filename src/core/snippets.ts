export function extractSnippet(lines: string[], line: number, col: number, length = 40): string {
  return (lines[line] ?? "").slice(col, col + length).trim() || "(empty)";
}
