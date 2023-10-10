export interface SourceMapData {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: MappingSegment[];
}

export interface MappingSegment {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number;
  originalColumn: number;
  sourceIndex: number;
  nameIndex: number | null;
}

export type MappingIndex = MappingSegment[];

export type InverseMappingIndex = Map<number, MappingSegment[]>;

export interface MappingDiagnostic {
  segment: MappingSegment;
  type: "invalid-source" | "out-of-bounds" | "unmapped" | "suspicious";
  message: string;
}

export interface SourceMapStats {
  totalMappings: number;
  mappedBytes: number;
  unmappedBytes: number;
  coveragePercent: number;
  fileSizes: { name: string; size: number }[];
  badMappings: number;
}

export interface RawSourceMap {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names?: string[];
  mappings: string;
  sections?: { offset: { line: number; column: number }; map: RawSourceMap }[];
}
