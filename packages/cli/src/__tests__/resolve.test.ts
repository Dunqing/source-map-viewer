import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { resolveFile } from "../resolve.js";

const FIXTURE_DIR = join(import.meta.dirname, "__fixtures__");

// Simple valid source map for testing
const SIMPLE_MAP = JSON.stringify({
  version: 3,
  sources: ["input.js"],
  sourcesContent: ["const a = 1;"],
  names: [],
  mappings: "IAAI",
  file: "output.js",
});

describe("resolveFile", () => {
  beforeEach(() => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("resolves inline base64 sourceMappingURL", () => {
    const base64Map = Buffer.from(SIMPLE_MAP).toString("base64");
    const code = `var a=1;\n//# sourceMappingURL=data:application/json;base64,${base64Map}`;
    const filePath = join(FIXTURE_DIR, "inline.js");
    writeFileSync(filePath, code);

    const result = resolveFile(filePath);

    expect(result.sourceMapJson).toBe(SIMPLE_MAP);
    // The inline comment should be stripped from generated code
    expect(result.generatedCode).not.toContain("sourceMappingURL");
    expect(result.generatedCode).toContain("var a=1;");
    expect(result.label).toBe("inline.js");
  });

  it("resolves inline sourceMappingURL with charset metadata", () => {
    const base64Map = Buffer.from(SIMPLE_MAP).toString("base64");
    const code = `var a=1;\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}`;
    const filePath = join(FIXTURE_DIR, "inline-charset.js");
    writeFileSync(filePath, code);

    const result = resolveFile(filePath);

    expect(result.sourceMapJson).toBe(SIMPLE_MAP);
    expect(result.generatedCode).not.toContain("sourceMappingURL");
    expect(result.generatedCode).toContain("var a=1;");
  });

  it("resolves external .map file via sourceMappingURL comment", () => {
    const code = `var a=1;\n//# sourceMappingURL=bundle.js.map`;
    const filePath = join(FIXTURE_DIR, "bundle.js");
    const mapPath = join(FIXTURE_DIR, "bundle.js.map");
    writeFileSync(filePath, code);
    writeFileSync(mapPath, SIMPLE_MAP);

    const result = resolveFile(filePath);

    expect(result.sourceMapJson).toBe(SIMPLE_MAP);
    expect(result.generatedCode).toBe(code);
    expect(result.label).toBe("bundle.js");
  });

  it("resolves sibling .map file when no sourceMappingURL", () => {
    const code = "var a=1;";
    const filePath = join(FIXTURE_DIR, "app.js");
    const mapPath = join(FIXTURE_DIR, "app.js.map");
    writeFileSync(filePath, code);
    writeFileSync(mapPath, SIMPLE_MAP);

    const result = resolveFile(filePath);

    expect(result.sourceMapJson).toBe(SIMPLE_MAP);
    expect(result.generatedCode).toBe(code);
    expect(result.label).toBe("app.js");
  });

  it("resolves .map file directly and finds sibling code file", () => {
    const code = "var a=1;";
    const filePath = join(FIXTURE_DIR, "output.js");
    const mapPath = join(FIXTURE_DIR, "output.js.map");
    writeFileSync(filePath, code);
    writeFileSync(mapPath, SIMPLE_MAP);

    const result = resolveFile(mapPath);

    expect(result.sourceMapJson).toBe(SIMPLE_MAP);
    expect(result.generatedCode).toBe(code);
    expect(result.label).toBe("output.js.map");
  });

  it("throws on missing file", () => {
    const filePath = join(FIXTURE_DIR, "nonexistent.js");

    expect(() => resolveFile(filePath)).toThrow("File not found");
  });

  it("throws when no source map found", () => {
    const code = "var a=1;";
    const filePath = join(FIXTURE_DIR, "orphan.js");
    writeFileSync(filePath, code);

    expect(() => resolveFile(filePath)).toThrow("No source map found");
  });
});
