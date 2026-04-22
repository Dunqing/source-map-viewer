import type { MappingDiagnostic, MappingSegment, SourceMapData } from "./types";
import { detectLanguage } from "./language";
import { extractGeneratedSnippet, extractOriginalSnippet } from "./snippets";

/** Escape markdown-structural characters in untrusted metadata strings. */
export function escapeMarkdown(s: string): string {
  return s.replace(/[[\](){}#*_`|~<>!\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Quality analysis — detects issues beyond spec violations
// ---------------------------------------------------------------------------

export interface QualityWarning {
  type:
    | "original-whitespace-target"
    | "generated-whitespace-target"
    | "low-coverage"
    | "missing-sources-content";
  message: string;
  /** Number of mappings affected (for whitespace-target variants) */
  count?: number;
}

/** Count of leading whitespace characters (spaces/tabs) in a line. */
function leadingWhitespace(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function isLeadingWhitespaceTarget(lineText: string | undefined, column: number): boolean {
  if (!lineText) return false;
  const indent = leadingWhitespace(lineText);
  return indent > 0 && column < indent && lineText.trim().length > 0;
}

export function analyzeQuality(
  data: SourceMapData,
  generatedCode: string,
  coveragePercent: number,
): QualityWarning[] {
  const warnings: QualityWarning[] = [];

  // 1. Mappings pointing into leading whitespace
  const sourceLines: (string[] | null)[] = data.sourcesContent.map((c) =>
    c !== null ? c.split("\n") : null,
  );
  const generatedLines = generatedCode.split("\n");

  let originalWhitespaceTargetCount = 0;
  let generatedWhitespaceTargetCount = 0;
  for (const seg of data.mappings) {
    if (
      isLeadingWhitespaceTarget(
        sourceLines[seg.sourceIndex]?.[seg.originalLine],
        seg.originalColumn,
      )
    ) {
      originalWhitespaceTargetCount++;
    }

    if (isLeadingWhitespaceTarget(generatedLines[seg.generatedLine], seg.generatedColumn)) {
      generatedWhitespaceTargetCount++;
    }
  }
  if (originalWhitespaceTargetCount > 0) {
    warnings.push({
      type: "original-whitespace-target",
      message: `${originalWhitespaceTargetCount} mapping(s) point into leading whitespace on the original side instead of actual code tokens. This often indicates the recorded original column is anchored to indentation rather than the source token that produced the output.`,
      count: originalWhitespaceTargetCount,
    });
  }
  if (generatedWhitespaceTargetCount > 0) {
    warnings.push({
      type: "generated-whitespace-target",
      message: `${generatedWhitespaceTargetCount} mapping(s) point into leading whitespace on the generated side. This often indicates generated columns were recorded before final indentation or formatting was applied.`,
      count: generatedWhitespaceTargetCount,
    });
  }

  // 2. Low coverage
  if (coveragePercent < 50 && generatedCode.length > 100) {
    warnings.push({
      type: "low-coverage",
      message: `Only ${coveragePercent}% of generated code is covered by mappings. Large unmapped regions make debugging impossible in those areas.`,
    });
  }

  // 3. Missing sourcesContent
  const missingContent = data.sources.filter((_, i) => data.sourcesContent[i] == null);
  if (missingContent.length > 0) {
    warnings.push({
      type: "missing-sources-content",
      message: `${missingContent.length} source file(s) have no embedded content (${missingContent.map(escapeMarkdown).join(", ")}). Debuggers cannot show original code without the source files available on disk.`,
    });
  }

  return warnings;
}

export interface DebugPromptInput {
  generatedCode: string;
  sourceMapJson: string;
  parsedData: SourceMapData;
  mappingIndex: MappingSegment[];
  diagnostics: MappingDiagnostic[];
  badSegmentSet: Set<MappingSegment>;
  splitTokenSegmentSet: Set<MappingSegment>;
  qualityWarnings: QualityWarning[];
  coveragePercent: number;
  /** Optional URL to the visualization for the "Open in Source Map Viz" link */
  visualizationUrl?: string;
}

interface PromptMappingRow {
  seg: MappingSegment;
  i: number;
  gen: string;
  orig: string;
  genSnippet: string;
  origSnippet: string;
  source: string;
  isBad: boolean;
  isSplitToken: boolean;
  isOriginalWhitespaceTarget: boolean;
  isGeneratedWhitespaceTarget: boolean;
}

interface PromptCluster {
  rows: PromptMappingRow[];
  representative: PromptMappingRow;
  score: number;
  startIndex: number;
  endIndex: number;
}

interface LineWindow {
  start: number;
  end: number;
}

function classifyRegionKind(lineText: string): string {
  const trimmed = lineText.trim();
  if (trimmed.startsWith("return function")) return "generated wrapper function";
  if (trimmed.startsWith("babelHelpers.decorate")) return "decorator helper emission";
  if (/^(function|const|let|var|if|return)\b/.test(trimmed)) return "statement start";
  if (/^(get|set)\b/.test(trimmed)) return "accessor header";
  if (/^[A-Za-z_$][A-Za-z0-9_$]*\(.*\)\s*\{?$/.test(trimmed)) return "method/header emission";
  return "emitted code region";
}

function sameSegment(a: MappingSegment, b: MappingSegment): boolean {
  return (
    a.generatedLine === b.generatedLine &&
    a.generatedColumn === b.generatedColumn &&
    a.originalLine === b.originalLine &&
    a.originalColumn === b.originalColumn &&
    a.sourceIndex === b.sourceIndex &&
    a.nameIndex === b.nameIndex
  );
}

function compareOriginalPosition(a: MappingSegment, b: MappingSegment): number {
  return (
    a.originalLine - b.originalLine ||
    a.originalColumn - b.originalColumn ||
    a.generatedLine - b.generatedLine ||
    a.generatedColumn - b.generatedColumn
  );
}

function getNextGeneratedBoundary(
  mappings: MappingSegment[],
  index: number,
): MappingSegment | null {
  return index + 1 < mappings.length ? mappings[index + 1] : null;
}

function getNextOriginalBoundary(
  mappingsBySource: Map<number, MappingSegment[]>,
  mapping: MappingSegment,
): MappingSegment | null {
  const sourceMappings = mappingsBySource.get(mapping.sourceIndex) ?? [];
  const index = sourceMappings.findIndex((candidate) => sameSegment(candidate, mapping));
  return index >= 0 && index + 1 < sourceMappings.length ? sourceMappings[index + 1] : null;
}

function buildFlagLabels(mapping: PromptMappingRow): string[] {
  const flags: string[] = [];
  if (mapping.isBad) flags.push("⚠️ invalid");
  if (mapping.isSplitToken) flags.push("✂️ split-token");
  if (mapping.isGeneratedWhitespaceTarget) flags.push("⚡ generated-whitespace");
  if (mapping.isOriginalWhitespaceTarget) flags.push("⚡ original-whitespace");
  return flags;
}

function formatSourceName(sourceName: string): string {
  return sourceName.replace(/^\.\//, "");
}

function isSuspiciousMapping(mapping: PromptMappingRow): boolean {
  return (
    mapping.isSplitToken ||
    mapping.isGeneratedWhitespaceTarget ||
    mapping.isOriginalWhitespaceTarget
  );
}

function getRowSeverity(mapping: PromptMappingRow): number {
  let score = 0;
  if (mapping.isBad) score += 100;
  if (mapping.isSplitToken) score += 35;
  if (mapping.isGeneratedWhitespaceTarget) score += 8;
  if (mapping.isOriginalWhitespaceTarget) score += 6;

  const lineDelta = Math.abs(mapping.seg.originalLine - mapping.seg.generatedLine);
  score += Math.min(lineDelta, 12);

  if (
    mapping.isSplitToken &&
    !mapping.isGeneratedWhitespaceTarget &&
    !mapping.isOriginalWhitespaceTarget
  ) {
    score += 8;
  }

  if (mapping.isSplitToken) {
    if (mapping.seg.generatedColumn > 0) score += 3;
    if (mapping.seg.originalColumn > 0) score += 3;
  }

  return score;
}

function createPromptCluster(rows: PromptMappingRow[]): PromptCluster {
  const representative = [...rows].sort(
    (a, b) =>
      getRowSeverity(b) - getRowSeverity(a) ||
      Math.abs(b.seg.originalLine - b.seg.generatedLine) -
        Math.abs(a.seg.originalLine - a.seg.generatedLine) ||
      a.i - b.i,
  )[0];

  const distinctFlags = new Set(rows.flatMap((row) => buildFlagLabels(row))).size;
  const maxLineDelta = Math.max(
    ...rows.map((row) => Math.abs(row.seg.originalLine - row.seg.generatedLine)),
  );
  const score =
    rows.reduce((sum, row) => sum + getRowSeverity(row), 0) +
    distinctFlags * 4 +
    maxLineDelta +
    Math.min(rows.length, 8);

  return {
    rows,
    representative,
    score,
    startIndex: rows[0].i,
    endIndex: rows[rows.length - 1].i,
  };
}

function canExtendPromptCluster(current: PromptMappingRow[], row: PromptMappingRow): boolean {
  const previous = current[current.length - 1];
  if (!previous) return false;

  if (row.seg.sourceIndex !== previous.seg.sourceIndex) return false;
  if (row.i - previous.i > 8) return false;
  if (Math.abs(row.seg.originalLine - previous.seg.originalLine) > 2) return false;
  if (Math.abs(row.seg.generatedLine - previous.seg.generatedLine) > 2) return false;
  if (row.i - current[0].i > 24) return false;

  let minOriginalLine = row.seg.originalLine;
  let maxOriginalLine = row.seg.originalLine;
  let minGeneratedLine = row.seg.generatedLine;
  let maxGeneratedLine = row.seg.generatedLine;

  for (const currentRow of current) {
    minOriginalLine = Math.min(minOriginalLine, currentRow.seg.originalLine);
    maxOriginalLine = Math.max(maxOriginalLine, currentRow.seg.originalLine);
    minGeneratedLine = Math.min(minGeneratedLine, currentRow.seg.generatedLine);
    maxGeneratedLine = Math.max(maxGeneratedLine, currentRow.seg.generatedLine);
  }

  return maxOriginalLine - minOriginalLine <= 5 && maxGeneratedLine - minGeneratedLine <= 5;
}

function buildSuspiciousClusters(mappings: PromptMappingRow[]): PromptCluster[] {
  const suspiciousRows = mappings.filter(isSuspiciousMapping);

  if (suspiciousRows.length === 0) return [];

  const clusters: PromptCluster[] = [];
  let current: PromptMappingRow[] = [];

  for (const row of suspiciousRows) {
    if (canExtendPromptCluster(current, row)) {
      current.push(row);
      continue;
    }

    if (current.length > 0) {
      clusters.push(createPromptCluster(current));
    }
    current = [row];
  }

  if (current.length > 0) {
    clusters.push(createPromptCluster(current));
  }

  return clusters.sort((a, b) => b.score - a.score || a.startIndex - b.startIndex);
}

function buildFocusedMappings(
  mappings: PromptMappingRow[],
  focusIndices: number[],
  regionCount: number,
): { rows: Array<PromptMappingRow | { omitted: number }>; note: string } {
  if (mappings.length <= 40 && focusIndices.length === 0) {
    return { rows: mappings, note: `${mappings.length}` };
  }

  const included = new Set<number>();
  const uniqueFocusIndices = [...new Set(focusIndices)];

  if (uniqueFocusIndices.length === 0) {
    for (let i = 0; i < Math.min(12, mappings.length); i++) included.add(i);
  } else {
    for (const focusIndex of uniqueFocusIndices.slice(0, 3)) {
      for (
        let i = Math.max(0, focusIndex - 2);
        i <= Math.min(mappings.length - 1, focusIndex + 3);
        i++
      ) {
        included.add(i);
      }
    }
  }

  const sorted = [...included].sort((a, b) => a - b);
  const rows: Array<PromptMappingRow | { omitted: number }> = [];
  let previous = -1;

  for (const index of sorted) {
    if (previous >= 0 && index > previous + 1) {
      rows.push({ omitted: index - previous - 1 });
    }
    rows.push(mappings[index]);
    previous = index;
  }

  return {
    rows,
    note:
      regionCount > 0
        ? `showing ${sorted.length} focused rows from ${Math.min(regionCount, 3)} suspicious region${regionCount === 1 ? "" : "s"} out of ${mappings.length} total`
        : `showing ${sorted.length} focused rows out of ${mappings.length} total`,
  };
}

function buildLineWindows(targetLines: number[], totalLines: number, padding = 2): LineWindow[] {
  if (totalLines === 0) return [];

  const uniqueTargets = [
    ...new Set(targetLines.filter((line) => line >= 0 && line < totalLines)),
  ].sort((a, b) => a - b);
  if (uniqueTargets.length === 0) {
    return [{ start: 0, end: Math.min(totalLines - 1, 11) }];
  }

  const windows = uniqueTargets.map((line) => ({
    start: Math.max(0, line - padding),
    end: Math.min(totalLines - 1, line + padding),
  }));

  const merged: LineWindow[] = [];
  for (const window of windows) {
    const previous = merged[merged.length - 1];
    if (!previous || window.start > previous.end + 1) {
      merged.push(window);
    } else {
      previous.end = Math.max(previous.end, window.end);
    }
  }

  return merged.slice(0, 4);
}

function formatCodeExcerpt(lines: string[], targetLines: number[], padding = 2): string {
  if (lines.length === 0) return "(empty)";

  const windows = buildLineWindows(targetLines, lines.length, padding);
  const output: string[] = [];
  let previousEnd = -1;

  for (const window of windows) {
    if (previousEnd >= 0 && window.start > previousEnd + 1) {
      output.push("  ... | ...");
    }

    for (let line = window.start; line <= window.end; line++) {
      output.push(`${String(line + 1).padStart(3)} | ${lines[line] ?? ""}`);
    }

    previousEnd = window.end;
  }

  return output.join("\n");
}

function visualizeWhitespace(text: string): string {
  return text.replace(/\t/g, "⇥").replace(/ /g, "·");
}

function formatRangeLabel(line: number, start: number, end: number): string {
  return end !== start ? `${line + 1}:${start}-${line + 1}:${end}` : `${line + 1}:${start}`;
}

function getRangeEnd(
  lineText: string,
  currentLine: number,
  currentColumn: number,
  nextLine: number | undefined,
  nextColumn: number | undefined,
): number {
  if (nextLine === currentLine && typeof nextColumn === "number") {
    return Math.max(currentColumn, Math.min(nextColumn, lineText.length));
  }
  return Math.max(currentColumn, lineText.length);
}

function formatRangeSnippet(lineText: string, start: number, end: number): string {
  const safeStart = Math.max(0, Math.min(start, lineText.length));
  const safeEnd = Math.max(safeStart, Math.min(end, lineText.length));
  const contextStart = Math.max(0, safeStart - 12);
  const contextEnd = Math.min(lineText.length, Math.max(safeEnd, safeStart + 1) + 12);

  const before = visualizeWhitespace(lineText.slice(contextStart, safeStart));
  const selected = visualizeWhitespace(lineText.slice(safeStart, safeEnd));
  const after = visualizeWhitespace(lineText.slice(safeEnd, contextEnd));

  return `${contextStart > 0 ? "..." : ""}${before}${safeEnd > safeStart ? `[[${selected}]]` : "|"}${safeEnd > safeStart ? after : visualizeWhitespace(lineText.slice(safeStart, contextEnd))}${contextEnd < lineText.length ? "..." : ""}`;
}

function buildPatternSummary(
  suspiciousClusters: PromptCluster[],
  focusClusters: PromptCluster[],
  allMappings: PromptMappingRow[],
  genLines: string[],
): string[] {
  if (suspiciousClusters.length === 0) return [];

  const suspiciousRows = allMappings.filter(isSuspiciousMapping);
  const generatedWhitespaceRows = suspiciousRows.filter(
    (mapping) => mapping.isGeneratedWhitespaceTarget,
  ).length;
  const statementOrHeaderRows = suspiciousRows.filter((mapping) => {
    const line = genLines[mapping.seg.generatedLine] ?? "";
    const indent = leadingWhitespace(line);
    return mapping.seg.generatedColumn <= indent + 1;
  }).length;

  const likelyCause =
    suspiciousRows.some((mapping) => mapping.isSplitToken) && generatedWhitespaceRows > 0
      ? "One plausible common cause: generated columns are being recorded before final printed token boundaries are stable, especially after indentation and code rewriting, so mappings land in generated whitespace or inside the first emitted token."
      : suspiciousRows.some((mapping) => mapping.isSplitToken)
        ? "One plausible common cause: source-map spans are anchored to enclosing statements or pre-rewrite ranges instead of the exact emitted token boundary."
        : "One plausible common cause: generated columns are recorded before indentation or whitespace is applied to the final output.";

  return [
    "## Pattern summary",
    "",
    `- Suspicious mappings cluster into ${suspiciousClusters.length} region${suspiciousClusters.length === 1 ? "" : "s"}, so this looks systematic rather than isolated.`,
    ...(generatedWhitespaceRows > 0
      ? [
          `- ${generatedWhitespaceRows}/${suspiciousRows.length} suspicious mapping(s) also point into generated indentation.`,
        ]
      : []),
    ...(statementOrHeaderRows > 0
      ? [
          `- ${statementOrHeaderRows}/${suspiciousRows.length} suspicious mapping(s) start at line starts or emitted headers, which is consistent with statement-span or pre-print column recording.`,
        ]
      : []),
    ...focusClusters.slice(0, 3).map((cluster, index) => {
      const row = cluster.representative;
      const kind = classifyRegionKind(genLines[row.seg.generatedLine] ?? "");
      return `- Region ${index + 1}: original ${cluster.rows[0].seg.originalLine + 1}-${cluster.rows[cluster.rows.length - 1].seg.originalLine + 1} → generated ${cluster.rows[0].seg.generatedLine + 1}-${cluster.rows[cluster.rows.length - 1].seg.generatedLine + 1} around ${kind} (\`${row.origSnippet}\` → \`${row.genSnippet}\`).`;
    }),
    `- ${likelyCause}`,
    "",
  ];
}

function extractRawMappings(jsonString: string): string | null {
  try {
    const raw = JSON.parse(jsonString) as {
      mappings?: unknown;
      sections?: Array<{
        offset?: { line?: unknown; column?: unknown };
        map?: { mappings?: unknown };
      }>;
    };

    if (typeof raw.mappings === "string") {
      return raw.mappings;
    }

    if (!Array.isArray(raw.sections)) {
      return null;
    }

    const sections = raw.sections
      .map((section, index) => {
        const mappings = section?.map?.mappings;
        if (typeof mappings !== "string") return null;

        const line = typeof section.offset?.line === "number" ? section.offset.line : "?";
        const column = typeof section.offset?.column === "number" ? section.offset.column : "?";
        return `# Section ${index + 1} @ ${line}:${column}\n${mappings}`;
      })
      .filter((section): section is string => section !== null);

    return sections.length > 0 ? sections.join("\n\n") : null;
  } catch {
    return null;
  }
}

export function generateDebugPrompt(input: DebugPromptInput): string {
  const {
    generatedCode,
    sourceMapJson,
    parsedData,
    mappingIndex,
    diagnostics,
    badSegmentSet,
    splitTokenSegmentSet,
    qualityWarnings,
    coveragePercent,
    visualizationUrl,
  } = input;

  const genLines = generatedCode.split("\n");
  const sourceLinesByIndex = parsedData.sourcesContent.map((content) => content?.split("\n") ?? []);
  const snippetOptions = { length: 30 } as const;
  const sources = parsedData.sources;
  const totalMappings = mappingIndex.length;
  const badCount = diagnostics.length;
  const splitTokenCount = splitTokenSegmentSet.size;
  const rawMappings = extractRawMappings(sourceMapJson);

  const mappingsBySource = new Map<number, MappingSegment[]>();
  for (const mapping of parsedData.mappings) {
    const entries = mappingsBySource.get(mapping.sourceIndex);
    if (entries) {
      entries.push(mapping);
    } else {
      mappingsBySource.set(mapping.sourceIndex, [mapping]);
    }
  }
  for (const mappings of mappingsBySource.values()) {
    mappings.sort(compareOriginalPosition);
  }

  const allMappings: PromptMappingRow[] = mappingIndex.map((seg, i) => {
    const origLinesForSource = sourceLinesByIndex[seg.sourceIndex] ?? [];
    const origLine = origLinesForSource[seg.originalLine] ?? "";
    const genLine = genLines[seg.generatedLine] ?? "";
    return {
      seg,
      i,
      gen: `${seg.generatedLine + 1}:${seg.generatedColumn}`,
      orig: `${seg.originalLine + 1}:${seg.originalColumn}`,
      genSnippet: extractGeneratedSnippet(
        genLines,
        seg.generatedLine,
        seg.generatedColumn,
        snippetOptions,
      ),
      origSnippet: extractOriginalSnippet(
        origLinesForSource,
        seg.originalLine,
        seg.originalColumn,
        snippetOptions,
      ),
      source: escapeMarkdown(formatSourceName(sources[seg.sourceIndex] ?? "?")),
      isBad: badSegmentSet.has(seg),
      isSplitToken: splitTokenSegmentSet.has(seg),
      isOriginalWhitespaceTarget: isLeadingWhitespaceTarget(origLine, seg.originalColumn),
      isGeneratedWhitespaceTarget: isLeadingWhitespaceTarget(genLine, seg.generatedColumn),
    };
  });
  const suspiciousCount = allMappings.filter(isSuspiciousMapping).length;

  const suspiciousClusters = buildSuspiciousClusters(allMappings);
  const firstBadIdx = allMappings.findIndex((mapping) => mapping.isBad);

  const primaryCluster = suspiciousClusters[0] ?? null;
  const primarySuspect = primaryCluster?.representative ?? null;
  const nextGeneratedBoundary = primarySuspect
    ? getNextGeneratedBoundary(mappingIndex, primarySuspect.i)
    : null;
  const nextOriginalBoundary = primarySuspect
    ? getNextOriginalBoundary(mappingsBySource, primarySuspect.seg)
    : null;

  const focusClusters = primaryCluster
    ? [
        primaryCluster,
        ...suspiciousClusters.filter((cluster) => cluster !== primaryCluster).slice(0, 2),
      ]
    : suspiciousClusters.slice(0, 3);
  const focusIndices =
    focusClusters.length > 0
      ? focusClusters.map((cluster) => cluster.representative.i)
      : firstBadIdx >= 0
        ? [firstBadIdx]
        : [];

  const { rows: focusedMappingRows, note: mappingNote } = buildFocusedMappings(
    allMappings,
    focusIndices,
    focusClusters.length,
  );

  const relevantSourceIndexes = new Set<number>();
  const originalFocusLinesBySource = new Map<number, number[]>();
  const generatedFocusLines: number[] = [];

  for (const cluster of focusClusters) {
    for (const mapping of cluster.rows) {
      relevantSourceIndexes.add(mapping.seg.sourceIndex);
      generatedFocusLines.push(mapping.seg.generatedLine);
      const lines = originalFocusLinesBySource.get(mapping.seg.sourceIndex);
      if (lines) {
        lines.push(mapping.seg.originalLine);
      } else {
        originalFocusLinesBySource.set(mapping.seg.sourceIndex, [mapping.seg.originalLine]);
      }
    }
  }

  if (primarySuspect) {
    relevantSourceIndexes.add(primarySuspect.seg.sourceIndex);
    generatedFocusLines.push(primarySuspect.seg.generatedLine);
    const lines = originalFocusLinesBySource.get(primarySuspect.seg.sourceIndex);
    if (lines) {
      lines.push(primarySuspect.seg.originalLine);
    } else {
      originalFocusLinesBySource.set(primarySuspect.seg.sourceIndex, [
        primarySuspect.seg.originalLine,
      ]);
    }
  }

  if (relevantSourceIndexes.size === 0 && sources.length > 0) {
    relevantSourceIndexes.add(0);
  }

  function formatRow(mapping: PromptMappingRow): string {
    const flags = buildFlagLabels(mapping).join(", ");
    const gen = mapping.genSnippet.replace(/\|/g, "\\|");
    const orig = mapping.origSnippet.replace(/\|/g, "\\|");
    return `| ${mapping.orig} | \`${orig}\` | → | ${mapping.gen} | \`${gen}\` | ${mapping.source} | ${flags || ""} |`;
  }

  function formatGapRow(omitted: number): string {
    return `| ... | _${omitted} mapping(s) omitted_ |  | ... | _focused around likely issues_ |  |  |`;
  }

  const header = "| Orig | Original code | → | Gen | Generated code | Source | Flags |";
  const divider = "|------|--------------|---|-----|---------------|--------|-------|";

  const hasIssues = badCount > 0 || suspiciousCount > 0 || qualityWarnings.length > 0;
  const primarySuspectFlags = primarySuspect ? buildFlagLabels(primarySuspect) : [];

  const primaryOriginalLine = primarySuspect
    ? (sourceLinesByIndex[primarySuspect.seg.sourceIndex]?.[primarySuspect.seg.originalLine] ?? "")
    : "";
  const primaryGeneratedLine = primarySuspect
    ? (genLines[primarySuspect.seg.generatedLine] ?? "")
    : "";
  const primaryOriginalRangeEnd = primarySuspect
    ? getRangeEnd(
        primaryOriginalLine,
        primarySuspect.seg.originalLine,
        primarySuspect.seg.originalColumn,
        nextOriginalBoundary?.originalLine,
        nextOriginalBoundary?.originalColumn,
      )
    : 0;
  const primaryGeneratedRangeEnd = primarySuspect
    ? getRangeEnd(
        primaryGeneratedLine,
        primarySuspect.seg.generatedLine,
        primarySuspect.seg.generatedColumn,
        nextGeneratedBoundary?.generatedLine,
        nextGeneratedBoundary?.generatedColumn,
      )
    : 0;

  const primarySuspectLines = primarySuspect
    ? [
        "## Primary suspect",
        "",
        `- Segment #${primarySuspect.i + 1}`,
        ...(primaryCluster
          ? [
              `- Suspicious region: ${primaryCluster.rows.length} mapping(s), original lines ${primaryCluster.rows[0].seg.originalLine + 1}-${primaryCluster.rows[primaryCluster.rows.length - 1].seg.originalLine + 1}, generated lines ${primaryCluster.rows[0].seg.generatedLine + 1}-${primaryCluster.rows[primaryCluster.rows.length - 1].seg.generatedLine + 1}`,
            ]
          : []),
        `- Original ${primarySuspect.orig} \`${primarySuspect.origSnippet}\` → Generated ${primarySuspect.gen} \`${primarySuspect.genSnippet}\``,
        `- Flags: ${primarySuspectFlags.length > 0 ? primarySuspectFlags.join(", ") : "none"}`,
        `- Original mapped range: ${formatRangeLabel(
          primarySuspect.seg.originalLine,
          primarySuspect.seg.originalColumn,
          primaryOriginalRangeEnd,
        )} \`${formatRangeSnippet(
          primaryOriginalLine,
          primarySuspect.seg.originalColumn,
          primaryOriginalRangeEnd,
        )}\``,
        `- Generated mapped range: ${formatRangeLabel(
          primarySuspect.seg.generatedLine,
          primarySuspect.seg.generatedColumn,
          primaryGeneratedRangeEnd,
        )} \`${formatRangeSnippet(
          primaryGeneratedLine,
          primarySuspect.seg.generatedColumn,
          primaryGeneratedRangeEnd,
        )}\``,
        ...(nextGeneratedBoundary
          ? [
              `- Next generated boundary: ${nextGeneratedBoundary.generatedLine + 1}:${nextGeneratedBoundary.generatedColumn}`,
            ]
          : []),
        ...(primarySuspect.isSplitToken
          ? [
              "- Why suspicious: the mapped span does not align to a real token boundary. It crosses emitted token boundaries and/or ends inside an identifier, so the sourcemap is semantically wrong even if it is spec-valid.",
            ]
          : primarySuspect.isGeneratedWhitespaceTarget
            ? [
                "- Why suspicious: the generated column points into indentation, which usually means generated columns were recorded before final formatting or indentation was applied.",
              ]
            : primarySuspect.isOriginalWhitespaceTarget
              ? [
                  "- Why suspicious: the original column points into indentation instead of the source token that produced this output.",
                ]
              : []),
        "",
      ]
    : [];

  const patternSummaryLines = buildPatternSummary(
    suspiciousClusters,
    focusClusters,
    allMappings,
    genLines,
  );

  const originalCodeSections = [...relevantSourceIndexes]
    .sort((a, b) => a - b)
    .flatMap((sourceIndex) => {
      const sourceName = formatSourceName(sources[sourceIndex] ?? `source-${sourceIndex}`);
      const sourceLines = sourceLinesByIndex[sourceIndex] ?? [];
      const excerpt = formatCodeExcerpt(
        sourceLines,
        originalFocusLinesBySource.get(sourceIndex) ?? [],
      );
      return [
        `### ${escapeMarkdown(sourceName)}`,
        "",
        `\`\`\`${detectLanguage(sourceName)}`,
        excerpt,
        "```",
        "",
      ];
    });

  const generatedExcerpt = formatCodeExcerpt(genLines, generatedFocusLines);

  const sections = [
    "# Source Map Debug Report",
    "",
    ...(visualizationUrl ? [`[Open in Source Map Viewer](${visualizationUrl})`, ""] : []),
    "## Overview",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Sources | ${sources.map((source) => escapeMarkdown(formatSourceName(source))).join(", ")} |`,
    `| Total mappings | ${totalMappings} |`,
    `| Coverage | ${coveragePercent}% of generated code |`,
    `| Invalid mappings | ${badCount} |`,
    `| Split-token mappings | ${splitTokenCount} |`,
    `| Suspicious mappings | ${suspiciousCount} |`,
    `| Quality warnings | ${qualityWarnings.length} |`,
    `| Names | ${parsedData.names.length > 0 ? parsedData.names.length : "none"} |`,
    "",
    ...(hasIssues
      ? [
          "## Issues",
          "",
          ...(badCount > 0
            ? [
                `**${badCount} invalid mapping(s)** — position data violates the spec:`,
                `- First at generated position ${allMappings[firstBadIdx]?.gen ?? "?"}`,
                "",
              ]
            : []),
          ...(splitTokenCount > 0
            ? [
                `- ${splitTokenCount} mapping(s) split a token/identifier boundary. This is semantically wrong even when the VLQ data is spec-valid.`,
                "",
              ]
            : []),
          ...(qualityWarnings.length > 0
            ? [...qualityWarnings.map((warning) => `- ${warning.message}`), ""]
            : []),
        ]
      : [
          "## Issues",
          "",
          "No invalid mappings or quality issues detected. Review the focused mapping table below for semantic correctness.",
          "",
        ]),
    ...patternSummaryLines,
    ...primarySuspectLines,
    "## Original code excerpts",
    "",
    ...originalCodeSections,
    "## Generated code excerpt",
    "",
    `\`\`\`${detectLanguage(parsedData.file ?? "output.js")}`,
    generatedExcerpt,
    "```",
    "",
    `## Mapping table (${mappingNote})`,
    "",
    "Original → Generated. Flags: ⚠️ invalid position, ✂️ splits a token, ⚡ generated-whitespace, ⚡ original-whitespace.",
    "",
    header,
    divider,
    ...focusedMappingRows.map((row) =>
      "omitted" in row ? formatGapRow(row.omitted) : formatRow(row),
    ),
    "",
    "## Analysis instructions",
    "",
    "1. **Start with the primary suspect** — Explain whether that mapping is genuinely wrong or merely reflects expected source-level changes (type erasure, helper insertion, wrapper generation, minification, etc.).",
    "2. **Inspect the boundary** — Use the mapped ranges above to identify the exact generated/original token boundary that should have been recorded instead.",
    "3. **Identify the pattern** — Decide whether the bug is indentation drift, token-span selection, helper or wrapper generation, printer timing, or another source-map generation pattern.",
    "4. **Suggest a fix** — Point to the source-map recording logic that should change, and describe the exact span/column that should be recorded.",
    "",
    "## Reference",
    "",
    "- [ECMA-426: Source Map Format](https://tc39.es/ecma426/)",
    "",
    ...(rawMappings ? ["## Appendix: Raw mappings (VLQ)", "", "```text", rawMappings, "```"] : []),
  ];

  return sections.join("\n");
}
