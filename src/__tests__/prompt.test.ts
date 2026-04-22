import { describe, it, expect } from "vite-plus/test";
import { generateDebugPrompt } from "../core/prompt";
import type { MappingSegment, SourceMapData } from "../core/types";

const segment: MappingSegment = {
  generatedLine: 0,
  generatedColumn: 0,
  originalLine: 0,
  originalColumn: 0,
  sourceIndex: 0,
  nameIndex: null,
};

const parsedData: SourceMapData = {
  version: 3,
  file: "output.js",
  sources: ["input.js"],
  sourcesContent: ["const a = 1;"],
  names: [],
  mappings: [segment],
};

function buildPrompt(sourceMapJson: string): string {
  return generateDebugPrompt({
    generatedCode: "const a = 1;",
    sourceMapJson,
    parsedData,
    mappingIndex: [segment],
    diagnostics: [],
    badSegmentSet: new Set(),
    qualityWarnings: [],
    coveragePercent: 100,
  });
}

describe("generateDebugPrompt", () => {
  it("includes raw VLQ mappings for regular source maps", () => {
    const prompt = buildPrompt(
      JSON.stringify({
        version: 3,
        file: "output.js",
        sources: ["input.js"],
        names: [],
        mappings: "AAAA",
      }),
    );

    expect(prompt).toContain("## Raw mappings (VLQ)");
    expect(prompt).toContain("AAAA");
  });

  it("includes per-section VLQ mappings for index maps", () => {
    const prompt = buildPrompt(
      JSON.stringify({
        version: 3,
        sections: [
          {
            offset: { line: 0, column: 0 },
            map: {
              version: 3,
              sources: ["input.js"],
              names: [],
              mappings: "AAAA",
            },
          },
        ],
      }),
    );

    expect(prompt).toContain("## Raw mappings (VLQ)");
    expect(prompt).toContain("# Section 1 @ 0:0");
    expect(prompt).toContain("AAAA");
  });
});
