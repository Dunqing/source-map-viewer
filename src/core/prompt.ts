import type { MappingDiagnostic, MappingSegment, SourceMapData } from "./types";
import { detectLanguage } from "../composables/useHighlighter";

/** Escape markdown-structural characters in untrusted metadata strings. */
export function escapeMarkdown(s: string): string {
  return s.replace(/[[\](){}#*_`|~<>!\\]/g, "\\$&");
}

export interface DebugPromptInput {
  generatedCode: string;
  sourceMapJson: string;
  parsedData: SourceMapData;
  mappingIndex: MappingSegment[];
  diagnostics: MappingDiagnostic[];
  badSegmentSet: Set<MappingSegment>;
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
    return {
      i,
      gen: `${seg.generatedLine + 1}:${seg.generatedColumn}`,
      orig: `${seg.originalLine + 1}:${seg.originalColumn}`,
      genSnippet,
      origSnippet,
      source: escapeMarkdown(sources[seg.sourceIndex] ?? "?"),
      isBad,
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
    const flag = m.isBad ? " ⚠️" : "";
    return `| ${m.gen} | \`${m.genSnippet}\` | → | ${m.orig} | \`${m.origSnippet}\` | ${m.source} |${flag}`;
  }

  const header = "| Gen | Generated code | → | Orig | Original code | Source | |";
  const divider = "|-----|---------------|---|------|--------------|--------|---|";

  const rawMappings = sourceMapJson ? JSON.parse(sourceMapJson).mappings : "";

  const sections = [
    "# Source Map Debug Report",
    "",
    "## Background",
    "",
    "A source map maps positions in generated/compiled code back to positions in the original source.",
    'Each mapping says: "generated line X, column Y corresponds to original file F, line A, column B".',
    "",
    "A mapping is **bad** (marked ⚠️ below) when it points to a position that doesn't exist:",
    "- **Negative column** (e.g., `45:-1`) — invalid, the transformer computed a wrong offset",
    "- **Out-of-bounds line** — original line exceeds the source file's total lines",
    "- **Out-of-bounds column** — column exceeds the length of that line",
    "",
    "## Problem",
    "",
    `This source map has **${badCount} bad mappings** out of ${totalMappings} total.`,
    badCount > 0
      ? `The first bad mapping appears at generated position ${allMappings[firstBadIdx]?.gen ?? "?"}.`
      : "No invalid positions found, but mappings may still point to wrong (but technically valid) locations.",
    "",
    "## Summary",
    "",
    `- **Sources:** ${sources.map(escapeMarkdown).join(", ")}`,
    `- **Total mappings:** ${totalMappings}`,
    `- **Bad mappings:** ${badCount} (${Math.round((badCount / totalMappings) * 100)}%)`,
    `- **Names in source map:** ${parsedData.names.length > 0 ? parsedData.names.map(escapeMarkdown).join(", ") : "(none)"}`,
    ...(visualizationUrl
      ? [`- **Visualization:** [Open in Source Map Viz](${visualizationUrl})`]
      : []),
    "",
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
    `## Mappings${mappingNote ? ` (${mappingNote})` : ` (${allMappings.length})`}`,
    "",
    "Each row: generated position → original position. ⚠️ = bad mapping.",
    "",
    header,
    divider,
    ...relevantMappings.map(formatRow),
    "",
    "## Raw VLQ mappings string",
    "",
    "```",
    rawMappings,
    "```",
    "",
    "## Your task",
    "",
    "Analyze the mappings above and answer:",
    "",
    "1. **Where do mappings go wrong?** Identify the first incorrect mapping and what it should map to instead.",
    "2. **What is the pattern?** Is it progressive drift (increasing line offset)? Random? Only in certain code constructs?",
    "3. **What is the root cause?** What did the transformer do wrong? (e.g., didn't account for removed decorator lines, wrong span on synthesized AST nodes, etc.)",
    "4. **How to fix it?** What specific change in the transformer would correct the source map output?",
  ];

  return sections.join("\n");
}
