import { describe, it, expect } from "vite-plus/test";
import { analyzeQuality, generateDebugPrompt } from "../core/prompt";
import type { MappingDiagnostic, MappingSegment, SourceMapData } from "../core/types";

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
    splitTokenSegmentSet: new Set(),
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

    expect(prompt).toContain("## Appendix: Raw mappings (VLQ)");
    expect(prompt).toContain("## Reference");
    expect(prompt).toContain("[ECMA-426: Source Map Format](https://tc39.es/ecma426/)");
    expect(prompt).toContain("AAAA");
  });

  it("normalizes displayed source names in the prompt", () => {
    const prompt = generateDebugPrompt({
      generatedCode: "const a = 1;",
      sourceMapJson: JSON.stringify({
        version: 3,
        file: "output.js",
        sources: ["./input.js"],
        names: [],
        mappings: "AAAA",
      }),
      parsedData: {
        ...parsedData,
        sources: ["./input.js"],
      },
      mappingIndex: [segment],
      diagnostics: [],
      badSegmentSet: new Set(),
      splitTokenSegmentSet: new Set(),
      qualityWarnings: [],
      coveragePercent: 100,
    });

    expect(prompt).toContain("| Sources | input.js |");
    expect(prompt).toContain("### input.js");
    expect(prompt).toContain("| 1:0 | `const a = 1;` | → | 1:0 | `const a = 1;` | input.js |");
    expect(prompt).not.toContain("./input.js");
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

    expect(prompt).toContain("## Appendix: Raw mappings (VLQ)");
    expect(prompt).toContain("## Reference");
    expect(prompt).toContain("# Section 1 @ 0:0");
    expect(prompt).toContain("AAAA");
  });

  it("uses rendered generated snippets instead of leading whitespace", () => {
    const whitespaceData: SourceMapData = {
      version: 3,
      file: "output.js",
      sources: ["input.js"],
      sourcesContent: ["return value;"],
      names: [],
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
      ],
    };

    const prompt = generateDebugPrompt({
      generatedCode: "    return value;",
      sourceMapJson: JSON.stringify({
        version: 3,
        file: "output.js",
        sources: ["input.js"],
        names: [],
        mappings: "AAAA",
      }),
      parsedData: whitespaceData,
      mappingIndex: whitespaceData.mappings,
      diagnostics: [],
      badSegmentSet: new Set(),
      splitTokenSegmentSet: new Set(),
      qualityWarnings: [],
      coveragePercent: 100,
    });

    expect(prompt).toContain(
      "| 1:0 | `return value;` | → | 1:0 | `return value;` | input.js | ⚡ generated-whitespace |",
    );
    expect(prompt).toContain(
      "Original → Generated. Flags: ⚠️ invalid position, ✂️ boundary-crossing heuristic, ⚡ generated-whitespace, ⚡ original-whitespace.",
    );
    expect(prompt).toContain(
      "| Orig | Original code | → | Gen | Generated code | Source | Flags |",
    );
    expect(prompt).toContain("| Boundary-crossing heuristics | 0 |");
    expect(prompt).toContain("| Suspicious mappings | 1 |");
    expect(prompt).toContain("## Primary suspect");
    expect(prompt).toContain("## Pattern summary");
    expect(prompt).toContain("Raw mapping point:");
    expect(prompt).toContain("Generated inferred range to next boundary:");
    expect(prompt).toContain("## Original code excerpts");
    expect(prompt).toContain("## Generated code excerpt");
  });

  it("picks the strongest split-token suspect without relying on selection state", () => {
    const first: MappingSegment = {
      generatedLine: 0,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      sourceIndex: 0,
      nameIndex: null,
    };
    const second: MappingSegment = {
      generatedLine: 0,
      generatedColumn: 3,
      originalLine: 0,
      originalColumn: 3,
      sourceIndex: 0,
      nameIndex: null,
    };
    const extraMappings = Array.from({ length: 50 }, (_, i) => ({
      generatedLine: i + 1,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      sourceIndex: 0,
      nameIndex: null,
    }));

    const prompt = generateDebugPrompt({
      generatedCode: ["foobar();", ...Array.from({ length: 50 }, () => "noop();")].join("\n"),
      sourceMapJson: JSON.stringify({
        version: 3,
        file: "output.js",
        sources: ["input.js"],
        names: [],
        mappings: "AAAA",
      }),
      parsedData: {
        version: 3,
        file: "output.js",
        sources: ["input.js"],
        sourcesContent: ["foobar();"],
        names: [],
        mappings: [first, second, ...extraMappings],
      },
      mappingIndex: [first, second, ...extraMappings],
      diagnostics: [],
      badSegmentSet: new Set(),
      splitTokenSegmentSet: new Set([first, second]),
      qualityWarnings: [],
      coveragePercent: 100,
    });

    expect(prompt).toContain("## Primary suspect");
    expect(prompt).toContain("Segment #2");
    expect(prompt).not.toContain("selected in viewer");
    expect(prompt).toContain("Flags: ✂️ boundary-crossing heuristic");
    expect(prompt).toContain("One plausible common cause:");
    expect(prompt).toContain("Region 1:");
    expect(prompt).toContain("| Boundary-crossing heuristics | 2 |");
    expect(prompt).toContain("| Suspicious mappings | 2 |");
    expect(prompt).toContain("Raw mapping point:");
    expect(prompt).toContain("Original inferred range to next boundary:");
    expect(prompt).toContain("Generated inferred range to next boundary:");
    expect(prompt).toContain("Next generated boundary: 2:0");
    expect(prompt).toContain("## Mapping table (showing");
    expect(prompt).toContain("showing 5 focused rows from 1 suspicious region out of 52 total");
    expect(prompt).toContain("✂️ boundary-crossing heuristic");
    expect(prompt).toContain(
      "This is a heuristic signal from neighboring points, not proof that the individual mapping point is wrong.",
    );
    expect(prompt).not.toContain(" 50 | noop();");
  });

  it("prefers the strongest suspicious region over the earliest suspicious row", () => {
    const mappings: MappingSegment[] = [
      {
        generatedLine: 0,
        generatedColumn: 0,
        originalLine: 0,
        originalColumn: 0,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 0,
        generatedColumn: 3,
        originalLine: 0,
        originalColumn: 3,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 2,
        generatedColumn: 1,
        originalLine: 10,
        originalColumn: 0,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 2,
        generatedColumn: 5,
        originalLine: 10,
        originalColumn: 5,
        sourceIndex: 0,
        nameIndex: null,
      },
    ];

    const prompt = generateDebugPrompt({
      generatedCode: "    foo();\nnoop();\nbarbaz();",
      sourceMapJson: JSON.stringify({
        version: 3,
        file: "output.js",
        sources: ["input.ts"],
        names: [],
        mappings: "AAAA",
      }),
      parsedData: {
        version: 3,
        file: "output.js",
        sources: ["input.ts"],
        sourcesContent: [
          ["foo();", "x", "x", "x", "x", "x", "x", "x", "x", "x", "barbaz();"].join("\n"),
        ],
        names: [],
        mappings,
      },
      mappingIndex: mappings,
      diagnostics: [],
      badSegmentSet: new Set(),
      splitTokenSegmentSet: new Set(mappings),
      qualityWarnings: [],
      coveragePercent: 100,
    });

    expect(prompt).toContain("Segment #4");
    expect(prompt).toContain("Original 11:5 `z();` → Generated 3:5 `z();`");
    expect(prompt).toContain("## Pattern summary");
    expect(prompt).toContain("code rewriting");
    expect(prompt).not.toContain("transformer");
  });

  it("does not invent semantic pattern summaries for invalid-only mappings", () => {
    const invalidSegment: MappingSegment = {
      generatedLine: 8,
      generatedColumn: 4,
      originalLine: 0,
      originalColumn: 0,
      sourceIndex: 3,
      nameIndex: null,
    };
    const diagnostics: MappingDiagnostic[] = [
      {
        segment: invalidSegment,
        type: "invalid-source",
        message: "Source index 3 is out of bounds",
      },
    ];

    const prompt = generateDebugPrompt({
      generatedCode: Array.from({ length: 12 }, (_, i) => `line${i};`).join("\n"),
      sourceMapJson: JSON.stringify({
        version: 3,
        file: "output.js",
        sources: ["input.ts"],
        names: [],
        mappings: "AAAA",
      }),
      parsedData: {
        version: 3,
        file: "output.js",
        sources: ["input.ts"],
        sourcesContent: ["line0;"],
        names: [],
        mappings: [invalidSegment],
      },
      mappingIndex: [invalidSegment],
      diagnostics,
      badSegmentSet: new Set([invalidSegment]),
      splitTokenSegmentSet: new Set(),
      qualityWarnings: [],
      coveragePercent: 100,
    });

    expect(prompt).toContain("| Invalid mappings | 1 |");
    expect(prompt).toContain("| Boundary-crossing heuristics | 0 |");
    expect(prompt).toContain("| Suspicious mappings | 0 |");
    expect(prompt).toContain("**1 invalid mapping(s)**");
    expect(prompt).toContain("First at generated position 9:4");
    expect(prompt).not.toContain("## Pattern summary");
    expect(prompt).not.toContain("## Primary suspect");
    expect(prompt).not.toContain("Likely common cause:");
    expect(prompt).toContain("## Mapping table (showing 1 focused rows out of 1 total)");
  });

  it("splits transitive suspicious chains into multiple regions", () => {
    const lines = Array.from({ length: 7 }, (_, i) => `token${i}();`);
    const mappings: MappingSegment[] = lines.map((_, i) => ({
      generatedLine: i,
      generatedColumn: 1,
      originalLine: i,
      originalColumn: 1,
      sourceIndex: 0,
      nameIndex: null,
    }));

    const prompt = generateDebugPrompt({
      generatedCode: lines.join("\n"),
      sourceMapJson: JSON.stringify({
        version: 3,
        file: "output.js",
        sources: ["input.ts"],
        names: [],
        mappings: "AAAA",
      }),
      parsedData: {
        version: 3,
        file: "output.js",
        sources: ["input.ts"],
        sourcesContent: [lines.join("\n")],
        names: [],
        mappings,
      },
      mappingIndex: mappings,
      diagnostics: [],
      badSegmentSet: new Set(),
      splitTokenSegmentSet: new Set(mappings),
      qualityWarnings: [],
      coveragePercent: 100,
    });

    expect(prompt).toContain("Suspicious mappings cluster into 2 regions");
    expect(prompt).toContain("showing 7 focused rows from 2 suspicious regions out of 7 total");
  });
});

describe("analyzeQuality", () => {
  it("warns when generated mappings point into leading whitespace", () => {
    const warnings = analyzeQuality(
      {
        version: 3,
        file: "output.js",
        sources: ["input.js"],
        sourcesContent: ["return value;"],
        names: [],
        mappings: [
          {
            generatedLine: 0,
            generatedColumn: 0,
            originalLine: 0,
            originalColumn: 0,
            sourceIndex: 0,
            nameIndex: null,
          },
        ],
      },
      "    return value;",
      100,
    );

    expect(warnings).toContainEqual({
      type: "generated-whitespace-target",
      message:
        "1 mapping(s) point into leading whitespace on the generated side. This often indicates generated columns were recorded before final indentation or formatting was applied.",
      count: 1,
    });
  });
});
