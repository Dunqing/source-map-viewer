import type { MappingDiagnostic, MappingSegment, SourceMapData } from "./types";
import { detectLanguage } from "../composables/useHighlighter";

/** Escape markdown-structural characters in untrusted metadata strings. */
export function escapeMarkdown(s: string): string {
  return s.replace(/[[\](){}#*_`|~<>!\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Quality analysis — detects issues beyond spec violations
// ---------------------------------------------------------------------------

export interface QualityWarning {
  type: "whitespace-target" | "low-coverage" | "missing-sources-content";
  message: string;
  /** Number of mappings affected (for whitespace-target) */
  count?: number;
}

/** Count of leading whitespace characters (spaces/tabs) in a line. */
function leadingWhitespace(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
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

  let whitespaceTargetCount = 0;
  for (const seg of data.mappings) {
    const lines = sourceLines[seg.sourceIndex];
    if (!lines) continue;
    const line = lines[seg.originalLine];
    if (!line) continue;
    const indent = leadingWhitespace(line);
    // Mapping column is within indentation AND the line has actual code after it
    if (indent > 0 && seg.originalColumn < indent && line.trim().length > 0) {
      whitespaceTargetCount++;
    }
  }
  if (whitespaceTargetCount > 0) {
    warnings.push({
      type: "whitespace-target",
      message: `${whitespaceTargetCount} mapping(s) point into leading whitespace instead of actual code tokens. This causes imprecise breakpoint placement and incorrect stepping in debuggers.`,
      count: whitespaceTargetCount,
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
  qualityWarnings: QualityWarning[];
  coveragePercent: number;
  /** Optional URL to the visualization for the "Open in Source Map Viz" link */
  visualizationUrl?: string;
}

export function generateDebugPrompt(input: DebugPromptInput): string {
  const {
    generatedCode,
    sourceMapJson,
    parsedData,
    mappingIndex,
    diagnostics,
    badSegmentSet,
    qualityWarnings,
    coveragePercent,
    visualizationUrl,
  } = input;

  const genLines = generatedCode.split("\n");
  const origLines = parsedData.sourcesContent[0]?.split("\n") ?? [];
  const sources = parsedData.sources;
  const totalMappings = mappingIndex.length;
  const badCount = diagnostics.length;

  const numberedOrig = origLines.map((l, i) => `${String(i + 1).padStart(3)} | ${l}`).join("\n");
  const numberedGen = genLines.map((l, i) => `${String(i + 1).padStart(3)} | ${l}`).join("\n");

  const allMappings = mappingIndex.map((seg, i) => {
    const genSnippet = (genLines[seg.generatedLine] ?? "").slice(
      seg.generatedColumn,
      seg.generatedColumn + 30,
    );
    const origLine = origLines[seg.originalLine] ?? "";
    const origSnippet = origLine.slice(seg.originalColumn, seg.originalColumn + 30);
    const isBad = badSegmentSet.has(seg);
    const indent = leadingWhitespace(origLine);
    const isWhitespaceTarget =
      indent > 0 && seg.originalColumn < indent && origLine.trim().length > 0;
    return {
      i,
      gen: `${seg.generatedLine + 1}:${seg.generatedColumn}`,
      orig: `${seg.originalLine + 1}:${seg.originalColumn}`,
      genSnippet,
      origSnippet,
      source: escapeMarkdown(sources[seg.sourceIndex] ?? "?"),
      isBad,
      isWhitespaceTarget,
    };
  });

  const firstBadIdx = allMappings.findIndex((m) => m.isBad);

  let relevantMappings = allMappings;
  let mappingNote = "";
  if (firstBadIdx > 10 && allMappings.length > 40) {
    const contextStart = Math.max(0, firstBadIdx - 5);
    relevantMappings = [...allMappings.slice(0, 8), ...allMappings.slice(contextStart)];
    mappingNote = `Showing first 8 correct mappings + mappings from #${contextStart + 1} onward (around where issues start). ${allMappings.length} total.`;
  }

  function formatRow(m: (typeof allMappings)[0]) {
    const flag = m.isBad ? " ⚠️" : m.isWhitespaceTarget ? " ⚡" : "";
    const gen = m.genSnippet.replace(/\|/g, "\\|");
    const orig = m.origSnippet.replace(/\|/g, "\\|");
    return `| ${m.gen} | \`${gen}\` | → | ${m.orig} | \`${orig}\` | ${m.source} |${flag}`;
  }

  const header = "| Gen | Generated code | → | Orig | Original code | Source | |";
  const divider = "|-----|---------------|---|------|--------------|--------|---|";

  const hasIssues = badCount > 0 || qualityWarnings.length > 0;

  const sections = [
    "# Source Map Debug Report",
    "",
    ...(visualizationUrl ? [`[Open in Source Map Viewer](${visualizationUrl})`, ""] : []),
    "## Overview",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Sources | ${sources.map(escapeMarkdown).join(", ")} |`,
    `| Total mappings | ${totalMappings} |`,
    `| Coverage | ${coveragePercent}% of generated code |`,
    `| Invalid mappings | ${badCount} |`,
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
          ...(qualityWarnings.length > 0
            ? [...qualityWarnings.map((w) => `- ${w.message}`), ""]
            : []),
        ]
      : [
          "## Issues",
          "",
          "No invalid mappings or quality issues detected. Review the mapping table below for semantic correctness.",
          "",
        ]),
    "## Original code",
    "",
    `\`\`\`${detectLanguage(sources[0] ?? "")}`,
    numberedOrig,
    "```",
    "",
    "## Generated code",
    "",
    `\`\`\`${detectLanguage(parsedData.file ?? "output.js")}`,
    numberedGen,
    "```",
    "",
    `## Mapping table${mappingNote ? ` (${mappingNote})` : ` (${allMappings.length})`}`,
    "",
    "Generated → Original. Flags: ⚠️ invalid position, ⚡ maps to whitespace.",
    "",
    header,
    divider,
    ...relevantMappings.map(formatRow),
    "",
    "## Analysis instructions",
    "",
    "1. **Locate the issue** — Find the first mapping where the generated snippet doesn't correspond to the original snippet. What should it map to instead?",
    "2. **Identify the pattern** — Is the error a consistent line offset? Column drift? Restricted to specific constructs (decorators, JSX, destructuring)?",
    "3. **Diagnose the root cause** — What did the transformer do wrong? Common causes: not accounting for removed/inserted lines, using statement spans instead of token spans, wrong column offset for indented code.",
    "4. **Suggest a fix** — What specific change in the transformer's source map generation would correct this?",
  ];

  return sections.join("\n");
}
