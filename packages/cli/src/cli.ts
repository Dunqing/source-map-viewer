import { resolveFile } from "./resolve.js";
import { upload } from "./upload.js";
import { parseSourceMap } from "@core/parser.js";
import {
  buildInverseMappingIndex,
  buildMappingIndex,
  buildVisibleGeneratedMappingIndex,
} from "@core/mapper.js";
import { findTokenSplitSegments, validateMappings } from "@core/validator.js";
import { generateDebugPrompt, analyzeQuality } from "@core/prompt.js";
import { calculateStats } from "@core/stats.js";
import { diffMappings } from "@core/diff.js";
import { extractGeneratedSnippet, extractOriginalSnippet } from "@core/snippets.js";

const HELP_TEXT = `
source-map-viewer — Inspect and debug source map mappings

Usage:
  source-map-viewer <path>                        Upload a file or folder and open in browser
  source-map-viewer <path> --url                  Print shareable URL only
  source-map-viewer <path> --ai                   Print markdown debug report (offline)
  source-map-viewer compare <pathA> <pathB>       Compare two source maps in browser
  source-map-viewer compare <pathA> <pathB> --url Print compare URL only
  source-map-viewer compare <pathA> <pathB> --ai  Print diff report to stdout

Options:
  --url          Print URL without opening browser
  --no-open      Alias for --url
  --ai           Print AI-friendly markdown report to stdout
  --copy         Copy output to clipboard (works with --ai and --url)
  --host <url>   Custom API host (default: https://source-map-viewer.void.app)
                 Directory inputs must contain one unambiguous source map entrypoint
  -h, --help     Show this help
`.trim();

function parseArgs(argv: string[]) {
  let help = false;
  let urlOnly = false;
  let aiMode = false;
  let copy = false;
  let host: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--url" || arg === "--no-open") {
      urlOnly = true;
    } else if (arg === "--ai") {
      aiMode = true;
    } else if (arg === "--copy") {
      copy = true;
    } else if (arg === "--host") {
      host = argv[++i];
      if (!host) {
        console.error("Error: --host requires a URL argument");
        process.exit(1);
      }
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    } else {
      console.error(`Error: Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return { help, urlOnly, aiMode, copy, host, positional };
}

async function copyToClipboard(text: string): Promise<void> {
  const { execSync } = await import("node:child_process");
  const platform = process.platform;
  if (platform === "darwin") {
    execSync("pbcopy", { input: text });
  } else if (platform === "win32") {
    execSync("clip", { input: text });
  } else {
    execSync("xclip -selection clipboard", { input: text });
  }
}

function formatDiffMarkdown(
  a: { label: string; generatedCode: string; sourceMapJson: string },
  b: { label: string; generatedCode: string; sourceMapJson: string },
): string {
  const parsedA = parseSourceMap(a.sourceMapJson);
  const parsedB = parseSourceMap(b.sourceMapJson);
  const indexA = buildMappingIndex(parsedA.mappings);
  const indexB = buildMappingIndex(parsedB.mappings);
  const genLinesA = a.generatedCode.split("\n");
  const genLinesB = b.generatedCode.split("\n");
  const compareIndexA = buildVisibleGeneratedMappingIndex(indexA, genLinesA);
  const compareIndexB = buildVisibleGeneratedMappingIndex(indexB, genLinesB);
  const diagA = validateMappings(parsedA);
  const diagB = validateMappings(parsedB);
  const { entries, summary } = diffMappings(compareIndexA, compareIndexB, {
    sourcesA: parsedA.sources,
    sourcesB: parsedB.sources,
  });

  const origLinesA = parsedA.sourcesContent.map((c) => (c ?? "").split("\n"));
  const origLinesB = parsedB.sourcesContent.map((c) => (c ?? "").split("\n"));

  function compareCountLabel(visibleCount: number, rawCount: number): string {
    return visibleCount === rawCount
      ? `${visibleCount} mappings`
      : `${visibleCount} compared, ${rawCount} raw`;
  }

  function origSnippet(entry: (typeof entries)[0], side: "a" | "b"): string {
    const seg = entry[side];
    if (!seg) return "—";
    const allLines = side === "a" ? origLinesA : origLinesB;
    const sourceLines = allLines[seg.sourceIndex] ?? [];
    const src = (side === "a" ? parsedA : parsedB).sources[seg.sourceIndex] ?? "?";
    const code = extractOriginalSnippet(sourceLines, seg.originalLine, seg.originalColumn);
    return `${src} ${seg.originalLine + 1}:${seg.originalColumn} \`${code}\``;
  }

  const lines = [
    "# Source Map Diff Report",
    "",
    `**A:** ${a.label} (${compareCountLabel(compareIndexA.length, indexA.length)}, ${diagA.length} bad)`,
    `**B:** ${b.label} (${compareCountLabel(compareIndexB.length, indexB.length)}, ${diagB.length} bad)`,
    "",
    "## Summary",
    "",
    `- **Same:** ${summary.same}`,
    `- **Changed:** ${summary.changed}`,
    `- **Removed:** ${summary.removed} (in A but not B)`,
    `- **Added:** ${summary.added} (in B but not A)`,
    "",
  ];

  if (summary.changed + summary.removed + summary.added === 0) {
    lines.push("Source maps are identical.", "");
  } else {
    lines.push("## Changed Mappings", "");

    for (const entry of entries) {
      if (entry.status === "same") continue;
      const seg = entry.a ?? entry.b!;
      const gen = `${seg.generatedLine + 1}:${seg.generatedColumn}`;
      const genCode = extractGeneratedSnippet(
        entry.a ? genLinesA : genLinesB,
        seg.generatedLine,
        seg.generatedColumn,
      );

      lines.push(`### ${entry.status.toUpperCase()} at ${gen}: \`${genCode}\``);
      if (entry.a) lines.push(`- **A →** ${origSnippet(entry, "a")}`);
      if (entry.b) lines.push(`- **B →** ${origSnippet(entry, "b")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function handleCompare(
  positional: string[],
  flags: { aiMode: boolean; urlOnly: boolean; copy: boolean; host?: string },
) {
  if (positional.length < 2) {
    console.error("Error: compare requires two file or folder arguments");
    console.error("Usage: source-map-viewer compare <pathA> <pathB>");
    process.exit(1);
  }

  const fileA = resolveFile(positional[0]);
  const fileB = resolveFile(positional[1]);

  if (flags.aiMode) {
    const markdown = formatDiffMarkdown(
      {
        label: fileA.label,
        generatedCode: fileA.generatedCode,
        sourceMapJson: fileA.sourceMapJson,
      },
      {
        label: fileB.label,
        generatedCode: fileB.generatedCode,
        sourceMapJson: fileB.sourceMapJson,
      },
    );
    process.stdout.write(markdown);
    if (flags.copy) {
      await copyToClipboard(markdown);
      console.error("Copied to clipboard");
    }
    return;
  }

  // Upload both and open compare URL
  const [resA, resB] = await Promise.all([
    upload(fileA.generatedCode, fileA.sourceMapJson, flags.host),
    upload(fileB.generatedCode, fileB.sourceMapJson, flags.host),
  ]);

  const baseUrl = flags.host ?? "https://source-map-viewer.void.app";
  const url = `${baseUrl}/compare?a=${resA.id}&b=${resB.id}`;
  console.log(url);

  if (flags.copy) {
    await copyToClipboard(url);
    console.error("Copied to clipboard");
  }

  if (!flags.urlOnly) {
    const open = await import("open");
    await open.default(url);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const { help, urlOnly, aiMode, copy, host, positional } = parseArgs(args);

  if (help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (positional.length === 0) {
    console.log(HELP_TEXT);
    process.exit(1);
  }

  // Compare subcommand
  if (positional[0] === "compare") {
    await handleCompare(positional.slice(1), { aiMode, urlOnly, copy, host });
    return;
  }

  const filePath = positional[0];
  const { generatedCode, sourceMapJson } = resolveFile(filePath);

  if (aiMode) {
    const parsedData = parseSourceMap(sourceMapJson);
    const mappingIndex = buildMappingIndex(parsedData.mappings);
    const inverseMappingIndex = buildInverseMappingIndex(parsedData.mappings);
    const diagnostics = validateMappings(parsedData);
    const badSegmentSet = new Set(diagnostics.map((d) => d.segment));
    const splitTokenSegmentSet = findTokenSplitSegments(
      parsedData,
      generatedCode,
      mappingIndex,
      inverseMappingIndex,
    );
    const stats = calculateStats(parsedData, generatedCode, diagnostics, mappingIndex);
    const qualityWarnings = analyzeQuality(parsedData, generatedCode, stats.coveragePercent);
    const markdown = generateDebugPrompt({
      generatedCode,
      sourceMapJson,
      parsedData,
      mappingIndex,
      diagnostics,
      badSegmentSet,
      splitTokenSegmentSet,
      qualityWarnings,
      coveragePercent: stats.coveragePercent,
    });
    process.stdout.write(markdown);
    if (copy) {
      await copyToClipboard(markdown);
      console.error("Copied to clipboard");
    }
    return;
  }

  // Default mode: upload
  const { url } = await upload(generatedCode, sourceMapJson, host);
  console.log(url);

  if (copy) {
    await copyToClipboard(url);
    console.error("Copied to clipboard");
  }

  if (!urlOnly) {
    const open = await import("open");
    await open.default(url);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
});
