import { decodeSourceMapDataUrl, extractInlineSourceMap } from "./parser";
import type { RawSourceMap } from "./types";

const SOURCE_MAP_EXTENSIONS = new Set([".map", ".json"]);
const EXTERNAL_SOURCE_MAP_RE =
  /(?:\/\/[#@]\s*sourceMappingURL=|\/\*[#@]\s*sourceMappingURL=)\s*(\S+)\s*\*?\/?\s*$/m;

export interface FileCollectionEntry {
  path: string;
  content: string;
}

export interface ResolvedFileCollection {
  generatedCode: string;
  sourceMapJson: string;
  label: string;
  entryPath: string;
  generatedPath?: string;
  sourceMapPath?: string;
}

export interface SourceContentLookup {
  get(path: string): string | null;
}

interface Candidate {
  key: string;
  anchorPath: string;
  generatedPath?: string;
  sourceMapPath?: string;
  generatedCode: string;
  sourceMapJson: string;
  label: string;
}

interface ParsedEntry extends FileCollectionEntry {
  path: string;
  ext: string;
  sourceMapJson: string | null;
  rawSourceMap: RawSourceMap | null;
  inline: { generatedCode: string; sourceMapJson: string } | null;
}

function isSourceMapObject(value: unknown): value is RawSourceMap {
  if (typeof value !== "object" || value == null) return false;
  if (!("version" in value) && !("sections" in value)) return false;
  const map = value as { mappings?: unknown; sections?: unknown };
  return typeof map.mappings === "string" || Array.isArray(map.sections);
}

function parseSourceMapObject(input: string): RawSourceMap | null {
  try {
    const parsed = JSON.parse(input);
    return isSourceMapObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePath(input: string): string {
  const replaced = input.replace(/\\/g, "/");
  const driveMatch = replaced.match(/^[A-Za-z]:/);
  const drive = driveMatch?.[0] ?? "";
  const withoutDrive = drive ? replaced.slice(drive.length) : replaced;
  const absolute = withoutDrive.startsWith("/");
  const parts = withoutDrive.split("/");
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!absolute && !drive) {
        stack.push("..");
      }
      continue;
    }
    stack.push(part);
  }

  let prefix = drive;
  if (absolute) prefix += "/";

  const joined = stack.join("/");
  if (!prefix) return joined;
  return joined ? `${prefix}${joined}` : prefix;
}

function dirname(input: string): string {
  const path = normalizePath(input);
  if (!path) return "";
  if (path === "/" || /^[A-Za-z]:\/?$/.test(path)) return path;

  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) return "";
  if (lastSlash === 0) return "/";
  if (/^[A-Za-z]:$/.test(path.slice(0, lastSlash))) {
    return `${path.slice(0, lastSlash)}/`;
  }
  return path.slice(0, lastSlash);
}

function basename(input: string): string {
  const path = normalizePath(input);
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

function joinPath(base: string, child: string): string {
  if (!base) return child;
  if (!child) return base;
  return `${base.replace(/\/+$/g, "")}/${child.replace(/^\/+/g, "")}`;
}

function isAbsoluteLikePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

function resolvePath(baseDir: string, target: string): string {
  const sanitized = normalizePath(target);
  if (isAbsoluteLikePath(sanitized)) return sanitized;
  return normalizePath(baseDir ? `${baseDir}/${sanitized}` : sanitized);
}

function sanitizeVirtualPath(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  try {
    if (trimmed.startsWith("webpack:///")) {
      return decodeURIComponent(trimmed.slice("webpack:///".length));
    }
    if (trimmed.startsWith("webpack://")) {
      return decodeURIComponent(trimmed.slice("webpack://".length));
    }
    if (trimmed.startsWith("file:///")) {
      const decoded = decodeURIComponent(trimmed.slice("file:///".length));
      return decoded.startsWith("/") || /^[A-Za-z]:/.test(decoded) ? decoded : `/${decoded}`;
    }
    if (/^[A-Za-z][A-Za-z+\-.0-9]*:\/\//.test(trimmed)) {
      return null;
    }
    if (/^[A-Za-z][A-Za-z+\-.0-9]*:/.test(trimmed) && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
      return null;
    }
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function getExtension(input: string): string {
  const name = basename(input);
  if (name.endsWith(".map")) return ".map";
  const dotIndex = name.lastIndexOf(".");
  return dotIndex === -1 ? "" : name.slice(dotIndex);
}

function findExternalSourceMapReference(code: string): string | null {
  const match = code.match(EXTERNAL_SOURCE_MAP_RE);
  return match?.[1] ?? null;
}

function enumerateReferenceCandidates(
  anchorDir: string,
  sourceRoot: string | undefined,
  source: string,
): string[] {
  const candidates = new Set<string>();

  function addReference(ref: string | undefined) {
    if (!ref) return;
    const sanitized = sanitizeVirtualPath(ref);
    if (!sanitized) return;

    const direct = normalizePath(sanitized);
    if (direct) {
      candidates.add(direct);
      if (direct.startsWith("/")) {
        candidates.add(direct.slice(1));
      }
    }

    const resolved = resolvePath(anchorDir, sanitized);
    if (resolved) {
      candidates.add(resolved);
      if (resolved.startsWith("/")) {
        candidates.add(resolved.slice(1));
      }
    }
  }

  const combined = sourceRoot ? joinPath(sourceRoot, source) : source;
  addReference(combined);
  if (sourceRoot) addReference(source);

  return [...candidates].filter(Boolean);
}

export function hydrateSourceMapJson(
  sourceMapJson: string,
  anchorPath: string,
  lookup: SourceContentLookup,
): string {
  const raw = parseSourceMapObject(sourceMapJson);
  if (!raw) return sourceMapJson;

  const changed = hydrateRawSourceMap(raw, normalizePath(anchorPath), lookup);
  return changed ? JSON.stringify(raw) : sourceMapJson;
}

function hydrateRawSourceMap(
  raw: RawSourceMap,
  anchorPath: string,
  lookup: SourceContentLookup,
): boolean {
  if (Array.isArray(raw.sections)) {
    let changed = false;
    for (const section of raw.sections) {
      if (section?.map) {
        changed = hydrateRawSourceMap(section.map, anchorPath, lookup) || changed;
      }
    }
    return changed;
  }

  if (!Array.isArray(raw.sources) || raw.sources.length === 0) return false;

  const sourcesContent = Array.isArray(raw.sourcesContent) ? [...raw.sourcesContent] : [];
  while (sourcesContent.length < raw.sources.length) {
    sourcesContent.push(null);
  }

  let changed = false;
  const anchorDir = dirname(anchorPath);

  for (const [index, source] of raw.sources.entries()) {
    if (sourcesContent[index] != null || typeof source !== "string" || !source) continue;

    let resolved: string | null = null;
    for (const candidate of enumerateReferenceCandidates(anchorDir, raw.sourceRoot, source)) {
      resolved = lookup.get(candidate);
      if (resolved != null) break;
    }

    if (resolved != null) {
      sourcesContent[index] = resolved;
      changed = true;
    }
  }

  if (changed) {
    raw.sourcesContent = sourcesContent;
  }

  return changed;
}

function dedupeEntries(entries: FileCollectionEntry[]): ParsedEntry[] {
  const byPath = new Map<string, ParsedEntry>();

  for (const entry of entries) {
    const path = normalizePath(entry.path);
    if (!path) continue;

    const sourceMapJson = parseSourceMapObject(entry.content) ? entry.content : null;
    byPath.set(path, {
      path,
      content: entry.content,
      ext: getExtension(path),
      sourceMapJson,
      rawSourceMap: sourceMapJson ? parseSourceMapObject(sourceMapJson) : null,
      inline: extractInlineSourceMap(entry.content)
        ? {
            generatedCode: extractInlineSourceMap(entry.content)!.code,
            sourceMapJson: extractInlineSourceMap(entry.content)!.sourceMapJson,
          }
        : null,
    });
  }

  return [...byPath.values()];
}

function mergeCandidates(existing: Candidate, incoming: Candidate): Candidate {
  const generatedCode =
    incoming.generatedCode.length > existing.generatedCode.length
      ? incoming.generatedCode
      : existing.generatedCode;

  return {
    ...existing,
    generatedCode,
    generatedPath: incoming.generatedPath ?? existing.generatedPath,
    sourceMapPath: incoming.sourceMapPath ?? existing.sourceMapPath,
    label: incoming.generatedPath || incoming.generatedCode ? incoming.label : existing.label,
  };
}

function getSharedRootPrefix(entries: ParsedEntry[]): string | null {
  if (entries.length === 0) return null;

  const first = entries[0].path.split("/")[0];
  if (!first) return null;
  if (!entries.every((entry) => entry.path.startsWith(`${first}/`))) return null;

  return first;
}

function createEntryIndex(entries: ParsedEntry[]): Map<string, ParsedEntry> {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const sharedRoot = getSharedRootPrefix(entries);

  if (sharedRoot) {
    for (const entry of entries) {
      const stripped = entry.path.slice(sharedRoot.length + 1);
      if (stripped && !byPath.has(stripped)) {
        byPath.set(stripped, entry);
      }
    }
  }

  return byPath;
}

function createLookup(byPath: Map<string, ParsedEntry>): SourceContentLookup {
  return {
    get(path) {
      return byPath.get(normalizePath(path))?.content ?? null;
    },
  };
}

function findEntryByReference(
  byPath: Map<string, ParsedEntry>,
  anchorDir: string,
  reference: string,
): ParsedEntry | undefined {
  for (const candidate of enumerateReferenceCandidates(anchorDir, undefined, reference)) {
    const entry = byPath.get(candidate);
    if (entry) return entry;
  }
  return undefined;
}

function stripSharedRoot(path: string | undefined, sharedRoot: string | null): string | undefined {
  if (!path || !sharedRoot) return path;
  const prefix = `${sharedRoot}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function getCandidateEntryPath(
  candidate: Pick<Candidate, "generatedPath" | "sourceMapPath" | "label">,
  sharedRoot: string | null,
) {
  return (
    stripSharedRoot(candidate.generatedPath, sharedRoot) ??
    stripSharedRoot(candidate.sourceMapPath, sharedRoot) ??
    candidate.label
  );
}

function toResolvedFileCollection(
  candidate: Candidate,
  sharedRoot: string | null,
): ResolvedFileCollection {
  return {
    generatedCode: candidate.generatedCode,
    sourceMapJson: candidate.sourceMapJson,
    label: candidate.label,
    entryPath: getCandidateEntryPath(candidate, sharedRoot),
    generatedPath: stripSharedRoot(candidate.generatedPath, sharedRoot),
    sourceMapPath: stripSharedRoot(candidate.sourceMapPath, sharedRoot),
  };
}

export function resolveSourceMapsFromFileCollection(
  entries: FileCollectionEntry[],
): ResolvedFileCollection[] {
  if (entries.length === 0) {
    throw new Error("No files were provided.");
  }

  const parsedEntries = dedupeEntries(entries);
  const sharedRoot = getSharedRootPrefix(parsedEntries);
  const byPath = createEntryIndex(parsedEntries);
  const lookup = createLookup(byPath);
  const candidates = new Map<string, Candidate>();

  function addCandidate(candidate: Candidate) {
    const hydratedSourceMapJson = hydrateSourceMapJson(
      candidate.sourceMapJson,
      candidate.anchorPath,
      lookup,
    );
    const next = { ...candidate, sourceMapJson: hydratedSourceMapJson };
    const existing = candidates.get(candidate.key);
    candidates.set(candidate.key, existing ? mergeCandidates(existing, next) : next);
  }

  for (const entry of parsedEntries) {
    if (entry.inline) {
      addCandidate({
        key: `inline:${entry.path}`,
        anchorPath: entry.path,
        generatedPath: entry.path,
        generatedCode: entry.inline.generatedCode,
        sourceMapJson: entry.inline.sourceMapJson,
        label: basename(entry.path),
      });
      continue;
    }

    const dataUrlJson = decodeSourceMapDataUrl(entry.content);
    if (dataUrlJson && parseSourceMapObject(dataUrlJson)) {
      addCandidate({
        key: `data-url:${entry.path}`,
        anchorPath: entry.path,
        generatedCode: "",
        sourceMapJson: dataUrlJson,
        label: basename(entry.path),
      });
    }

    const externalMapRef = findExternalSourceMapReference(entry.content);
    if (externalMapRef) {
      const mapEntry = findEntryByReference(byPath, dirname(entry.path), externalMapRef);
      if (mapEntry?.sourceMapJson) {
        addCandidate({
          key: `map:${mapEntry.path}`,
          anchorPath: mapEntry.path,
          generatedPath: entry.path,
          sourceMapPath: mapEntry.path,
          generatedCode: entry.content,
          sourceMapJson: mapEntry.sourceMapJson,
          label: basename(entry.path),
        });
      }
    }

    const siblingMapPath = normalizePath(`${entry.path}.map`);
    const siblingMap = byPath.get(siblingMapPath);
    if (siblingMap?.sourceMapJson) {
      addCandidate({
        key: `map:${siblingMapPath}`,
        anchorPath: siblingMapPath,
        generatedPath: entry.path,
        sourceMapPath: siblingMapPath,
        generatedCode: entry.content,
        sourceMapJson: siblingMap.sourceMapJson,
        label: basename(entry.path),
      });
    }

    if (!SOURCE_MAP_EXTENSIONS.has(entry.ext) || !entry.sourceMapJson || !entry.rawSourceMap)
      continue;

    let generatedPath: string | undefined;
    let generatedCode = "";

    if (entry.path.endsWith(".map")) {
      const siblingPath = normalizePath(entry.path.slice(0, -4));
      const siblingEntry = byPath.get(siblingPath);
      if (siblingEntry) {
        generatedPath = siblingPath;
        generatedCode = siblingEntry.content;
      }
    }

    if (!generatedPath && typeof entry.rawSourceMap.file === "string" && entry.rawSourceMap.file) {
      const fileEntry = findEntryByReference(byPath, dirname(entry.path), entry.rawSourceMap.file);
      if (fileEntry) {
        generatedPath = fileEntry.path;
        generatedCode = fileEntry.content;
      }
    }

    addCandidate({
      key: `map:${entry.path}`,
      anchorPath: entry.path,
      generatedPath,
      sourceMapPath: entry.path,
      generatedCode,
      sourceMapJson: entry.sourceMapJson,
      label: basename(generatedPath ?? entry.path),
    });
  }

  const resolvedCandidates = [...candidates.values()];
  if (resolvedCandidates.length === 0) {
    throw new Error(
      "No source map found. Upload a .map file, code with an inline sourceMappingURL, or a folder containing an unambiguous source map pair.",
    );
  }

  return resolvedCandidates
    .sort((left, right) =>
      getCandidateEntryPath(left, sharedRoot).localeCompare(
        getCandidateEntryPath(right, sharedRoot),
      ),
    )
    .map((candidate) => toResolvedFileCollection(candidate, sharedRoot));
}

export function resolveSourceMapFromFileCollection(
  entries: FileCollectionEntry[],
): ResolvedFileCollection {
  const resolvedCandidates = resolveSourceMapsFromFileCollection(entries);

  if (resolvedCandidates.length > 1) {
    const labels = resolvedCandidates
      .map((candidate) => candidate.entryPath)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 4)
      .join(", ");
    throw new Error(
      `Multiple source map entrypoints found: ${labels}. Upload fewer files or choose a specific file/folder entry.`,
    );
  }

  return resolvedCandidates[0];
}
