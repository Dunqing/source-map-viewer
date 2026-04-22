import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export interface ResolvedSourceMap {
  generatedCode: string;
  sourceMapJson: string;
  label: string;
}

// Inline base64
const INLINE_SOURCE_MAP_RE =
  /(?:\/\/[#@]\s*sourceMappingURL=|\/\*[#@]\s*sourceMappingURL=)(data:application\/json;base64,([A-Za-z0-9+/=]+))\s*\*?\/?\s*$/m;

// External file reference
const EXTERNAL_SOURCE_MAP_RE =
  /(?:\/\/[#@]\s*sourceMappingURL=|\/\*[#@]\s*sourceMappingURL=)\s*(\S+)\s*\*?\/?\s*$/m;

const SOURCE_MAP_EXTENSIONS = new Set([".map", ".json"]);
const GENERATED_CODE_EXTENSIONS = new Set([".js", ".ts", ".css"]);

function readFile(filePath: string): string {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    throw new Error(`File not found: ${absolute}`);
  }
  return readFileSync(absolute, "utf-8");
}

function resolveFromSourceMap(filePath: string, sourceMapJson: string): { generatedCode: string } {
  const absolute = resolve(filePath);
  const dir = dirname(absolute);
  const mapBasename = basename(absolute);

  // Try stripping .map extension to find sibling generated file
  if (mapBasename.endsWith(".map")) {
    const siblingName = mapBasename.slice(0, -4); // strip ".map"
    const siblingPath = resolve(dir, siblingName);
    if (existsSync(siblingPath)) {
      return { generatedCode: readFileSync(siblingPath, "utf-8") };
    }
  }

  // Check the source map's `file` field
  try {
    const parsed = JSON.parse(sourceMapJson);
    if (typeof parsed.file === "string" && parsed.file) {
      const filePropPath = resolve(dir, parsed.file);
      if (existsSync(filePropPath)) {
        return { generatedCode: readFileSync(filePropPath, "utf-8") };
      }
    }
  } catch {
    // Invalid JSON in source map — proceed without generated code
  }

  return { generatedCode: "" };
}

function resolveFromGeneratedCode(
  filePath: string,
  generatedCode: string,
): { sourceMapJson: string; generatedCode: string } {
  const absolute = resolve(filePath);
  const dir = dirname(absolute);
  const name = basename(absolute);

  // 1. Check for inline base64 sourceMappingURL
  const inlineMatch = generatedCode.match(INLINE_SOURCE_MAP_RE);
  if (inlineMatch) {
    const base64 = inlineMatch[2];
    const sourceMapJson = Buffer.from(base64, "base64").toString("utf-8");
    // Strip the sourceMappingURL comment from the generated code
    const cleanedCode = generatedCode.replace(INLINE_SOURCE_MAP_RE, "");
    return { sourceMapJson, generatedCode: cleanedCode };
  }

  // 2. Check for external sourceMappingURL comment
  const externalMatch = generatedCode.match(EXTERNAL_SOURCE_MAP_RE);
  if (externalMatch) {
    const mapRef = externalMatch[1];
    const mapPath = resolve(dir, mapRef);
    if (!existsSync(mapPath)) {
      throw new Error(`Source map not found: ${mapPath} (referenced by ${name})`);
    }
    const sourceMapJson = readFileSync(mapPath, "utf-8");
    return { sourceMapJson, generatedCode };
  }

  // 3. Check for sibling .map file
  const siblingMapPath = `${absolute}.map`;
  if (existsSync(siblingMapPath)) {
    const sourceMapJson = readFileSync(siblingMapPath, "utf-8");
    return { sourceMapJson, generatedCode };
  }

  throw new Error(
    `No source map found for ${name}.\nLooked for: inline sourceMappingURL, external .map reference, ${name}.map`,
  );
}

function getExtension(filePath: string): string {
  const name = basename(filePath);
  // Handle .map specifically (e.g., bundle.js.map -> .map)
  if (name.endsWith(".map")) return ".map";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return name.slice(dotIndex);
}

export function resolveFile(filePath: string): ResolvedSourceMap {
  const absolute = resolve(filePath);
  const content = readFile(absolute);
  const ext = getExtension(absolute);
  const label = basename(absolute);

  if (SOURCE_MAP_EXTENSIONS.has(ext)) {
    const { generatedCode } = resolveFromSourceMap(absolute, content);
    return { generatedCode, sourceMapJson: content, label };
  }

  if (GENERATED_CODE_EXTENSIONS.has(ext)) {
    const result = resolveFromGeneratedCode(absolute, content);
    return {
      generatedCode: result.generatedCode,
      sourceMapJson: result.sourceMapJson,
      label,
    };
  }

  // Unknown extension — try treating as generated code first
  try {
    const result = resolveFromGeneratedCode(absolute, content);
    return {
      generatedCode: result.generatedCode,
      sourceMapJson: result.sourceMapJson,
      label,
    };
  } catch {
    // Fall back to treating as source map
    try {
      JSON.parse(content); // validate it's JSON
      const { generatedCode } = resolveFromSourceMap(absolute, content);
      return { generatedCode, sourceMapJson: content, label };
    } catch {
      throw new Error(
        `No source map found for ${label}.\nLooked for: inline sourceMappingURL, external .map reference, ${label}.map`,
      );
    }
  }
}
