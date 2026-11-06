import {
  buildInverseMappingIndex,
  buildMappingIndex,
  findMappingForGenerated,
  findMappingsForOriginal,
} from "./mapper";
import type { MappingSegment, SourceMapData } from "./types";

export interface PositionQuery {
  side: "generated" | "original";
  line: number;
  column: number;
  sourceIndex: number;
}

export interface PositionLookupResult {
  kind: "exact" | "range" | "unmapped" | "out-of-bounds";
  matches: MappingSegment[];
  endColumn: number | null;
  message: string;
}

/** Parse one location or stack frame, preserving the caller's column convention. */
export function parsePositionInput(
  input: string,
  columnBase: 0 | 1,
): { line: number; column: number; filename: string | null } {
  const malformed = () =>
    new Error(
      "Enter a single line:column, filename:line:column, or stack frame with integer coordinates.",
    );
  let location = input.trim();
  if (!location || /[\r\n]/u.test(location)) throw malformed();

  if (/^at\s/u.test(location)) {
    location = location.replace(/^at\s+/u, "");
    // Find the outer location wrapper without confusing parentheses in a path
    // with the function/location delimiter. Anonymous frames have no wrapper.
    let depth = 0;
    let wrapper = -1;
    for (let i = 0; i < location.length; i++) {
      if (location[i] === "(") {
        if (depth === 0) wrapper = i;
        depth++;
      } else if (location[i] === ")") {
        if (--depth < 0) throw malformed();
      }
    }
    if (depth !== 0) throw malformed();
    if (location.endsWith(")")) {
      if (wrapper < 1 || !/\s/u.test(location[wrapper - 1])) throw malformed();
      location = location.slice(wrapper + 1, -1);
    }
  } else {
    // Firefox nested function names may contain /. Preserve absolute paths
    // and URL credentials, including protocol-relative URLs.
    const firefox = location.match(/^(?!\/)[^@:\\]*@(.+)$/u);
    if (firefox) location = firefox[1];
  }

  // Greedy filename matching keeps URL ports and Windows drive letters intact.
  const match = location.match(/^(?:(.+):)?(\d+):(\d+)$/u);
  if (!match) throw malformed();
  const line = Number(match[2]);
  const column = Number(match[3]);
  if (!Number.isSafeInteger(line) || line < 1) {
    throw new Error("Line must be a safe integer of at least 1.");
  }
  if (!Number.isSafeInteger(column) || column < columnBase) {
    throw new Error(`Column must be a safe integer of at least ${columnBase}.`);
  }
  return { line: line - 1, column: column - columnBase, filename: match[1] ?? null };
}

function validCoordinate(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function contentLines(content: string): string[] {
  return content.split(/\r\n?|\n/u);
}

function withinContent(lines: string[], line: number, column: number): boolean {
  return line < lines.length && column <= lines[line].length;
}

function emptyResult(
  kind: "unmapped" | "out-of-bounds",
  message: string,
  endColumn: number | null = null,
): PositionLookupResult {
  return { kind, matches: [], endColumn, message };
}

export function lookupPosition(
  data: SourceMapData,
  generatedCode: string,
  query: PositionQuery,
): PositionLookupResult {
  const { line, column, sourceIndex } = query;
  if (!validCoordinate(line) || !validCoordinate(column)) {
    return emptyResult("out-of-bounds", "Line and column must be nonnegative safe integers.");
  }
  const position = `${line + 1}:${column}`;

  if (query.side === "original") {
    if (!validCoordinate(sourceIndex) || sourceIndex >= data.sources.length) {
      return emptyResult("out-of-bounds", "The selected original source does not exist.");
    }
    const content = data.sourcesContent[sourceIndex];
    if (content != null && !withinContent(contentLines(content), line, column)) {
      return emptyResult(
        "out-of-bounds",
        `Original position ${position} is outside the source content.`,
      );
    }
    const matches = findMappingsForOriginal(
      buildInverseMappingIndex(data.mappings),
      sourceIndex,
      line,
      column,
    );
    if (matches.length === 0) {
      return emptyResult("unmapped", `No exact mapping exists for original position ${position}.`);
    }
    return {
      kind: "exact",
      matches,
      endColumn: null,
      message: `Found ${matches.length} exact mapping${matches.length === 1 ? "" : "s"} for original position ${position}.`,
    };
  }

  // An empty generatedCode is the existing API's representation of absent code.
  const lines = generatedCode === "" ? null : contentLines(generatedCode);
  if (lines && !withinContent(lines, line, column)) {
    return emptyResult(
      "out-of-bounds",
      `Generated position ${position} is outside the generated code.`,
    );
  }
  const lineEnd = lines ? lines[line].length : null;
  const index = buildMappingIndex(data.mappings).filter(
    (segment) => segment.generatedLine === line,
  );
  const next = index.find((segment) => segment.generatedColumn > column);
  const nextColumn = next?.generatedColumn ?? null;
  const gapEnd = nextColumn === null ? lineEnd : Math.min(nextColumn, lineEnd ?? Infinity);
  const selected = findMappingForGenerated(index, line, column);
  if (!selected) {
    return emptyResult(
      "unmapped",
      `Generated position ${position} is in an unmapped gap on line ${line + 1}.`,
      gapEnd,
    );
  }

  const matches = index.filter((segment) => segment.generatedColumn === selected.generatedColumn);
  let endColumn = gapEnd;
  for (const segment of matches) {
    if (segment.generatedEndColumn !== undefined) {
      endColumn = Math.min(endColumn ?? Infinity, segment.generatedEndColumn);
    }
  }
  if (endColumn !== null && column >= endColumn && column !== selected.generatedColumn) {
    // Duplicate points share the most conservative explicit boundary.
    return emptyResult(
      "unmapped",
      `Generated position ${position} is at or beyond the end of the mapped interval.`,
      gapEnd,
    );
  }
  const exact = column === selected.generatedColumn;
  if (!exact && endColumn === null) {
    return emptyResult(
      "unmapped",
      `The mapped range at generated position ${position} is unknown without generated code or an end boundary.`,
    );
  }
  return {
    kind: exact ? "exact" : "range",
    matches,
    endColumn,
    message: exact
      ? `Found ${matches.length} exact mapping${matches.length === 1 ? "" : "s"} at generated position ${position}.`
      : `Generated position ${position} uses the mapping at ${line + 1}:${selected.generatedColumn}; the original position is not interpolated.`,
  };
}
