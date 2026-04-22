export function detectLanguage(filename: string): string {
  if (filename.endsWith(".ts") || filename.endsWith(".tsx")) return "typescript";
  if (filename.endsWith(".css") || filename.endsWith(".scss")) return "css";
  if (filename.endsWith(".json") || filename.endsWith(".map")) return "json";
  return "javascript";
}
