import { describe, expect, it } from "vite-plus/test";
import {
  resolveSourceMapFromFileCollection,
  resolveSourceMapsFromFileCollection,
} from "../core/inputResolver";

describe("resolveSourceMapFromFileCollection", () => {
  it("pairs root-relative sourceMappingURL paths against upload-root-relative entries", () => {
    const sourceMapJson = JSON.stringify({
      version: 3,
      file: "/js/app.js",
      sources: ["../src/input.ts"],
      names: [],
      mappings: "AAAA",
    });

    const result = resolveSourceMapFromFileCollection([
      {
        path: "js/app.js",
        content: "console.log('ok');\n//# sourceMappingURL=/maps/app.js.map",
      },
      { path: "maps/app.js.map", content: sourceMapJson },
      { path: "src/input.ts", content: "const input = 1;" },
    ]);

    expect(result.label).toBe("app.js");
    expect(result.generatedCode).toContain("console.log('ok');");
    expect(JSON.parse(result.sourceMapJson).sourcesContent).toEqual(["const input = 1;"]);
  });

  it("pairs root-relative source map file fields against upload-root-relative entries", () => {
    const sourceMapJson = JSON.stringify({
      version: 3,
      file: "/js/app.js",
      sources: [],
      names: [],
      mappings: "",
    });

    const result = resolveSourceMapFromFileCollection([
      { path: "maps/app.js.map", content: sourceMapJson },
      { path: "js/app.js", content: "console.log('from file field');" },
    ]);

    expect(result.label).toBe("app.js");
    expect(result.generatedCode).toBe("console.log('from file field');");
  });

  it("does not hydrate sourcesContent from basename-only matches", () => {
    const sourceMapJson = JSON.stringify({
      version: 3,
      sources: ["../src/index.ts"],
      names: [],
      mappings: "AAAA",
    });

    const result = resolveSourceMapFromFileCollection([
      { path: "dist/app.js.map", content: sourceMapJson },
      { path: "examples/index.ts", content: "wrong();" },
    ]);

    expect(JSON.parse(result.sourceMapJson).sourcesContent).toBeUndefined();
  });

  it("returns all detected entrypoints from a folder upload in path order", () => {
    const alphaMap = JSON.stringify({
      version: 3,
      file: "js/alpha.js",
      sources: [],
      names: [],
      mappings: "",
    });
    const betaMap = JSON.stringify({
      version: 3,
      file: "js/beta.js",
      sources: [],
      names: [],
      mappings: "",
    });

    const results = resolveSourceMapsFromFileCollection([
      { path: "maps/beta.js.map", content: betaMap },
      { path: "js/beta.js", content: "console.log('beta');" },
      { path: "maps/alpha.js.map", content: alphaMap },
      { path: "js/alpha.js", content: "console.log('alpha');" },
    ]);

    expect(results.map((result) => result.entryPath)).toEqual(["js/alpha.js", "js/beta.js"]);
    expect(results.map((result) => result.label)).toEqual(["alpha.js", "beta.js"]);
  });
});
