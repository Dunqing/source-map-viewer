// Serialized maps deliberately retain duplicate segments. SourceMapGenerator
// deduplicates identical tuples, so multiplicity regressions use raw VLQ below.
export const originalCode = "class A {\n  public verify() {}\n}\n";
export const generatedCode = "class A {\n\tverify() {}\n}\n";

export const reproMapA = {
  version: 3 as const,
  file: "out.js",
  sources: ["input.ts"],
  sourcesContent: [originalCode],
  names: [],
  // 1:0→1:0, 1:6→1:6, 1:8→1:8,
  // 2:1→2:2, 2:1→2:9, 2:10→2:18, 2:11→2:19, 3:0→3:0.
  mappings: "AAAA,MAAM,EAAE;CACN,AAAO,SAAS,CAAC;AACnB",
};
export const reproMapB = {
  ...reproMapA,
  // Only the 2:1→2:2 occurrence was removed.
  mappings: "AAAA,MAAM,EAAE;CACC,SAAS,CAAC;AACnB",
};

export const reproEntryA = {
  label: "before.js",
  generatedCode,
  sourceMapJson: JSON.stringify(reproMapA),
};
export const reproEntryB = {
  label: "after.js",
  generatedCode,
  sourceMapJson: JSON.stringify(reproMapB),
};
