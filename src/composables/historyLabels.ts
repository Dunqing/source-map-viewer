export function formatMultiEntryHistoryLabel(
  sessionLabel: string,
  activeEntryLabel: string,
  count: number,
): string {
  const baseLabel = sessionLabel.trim() || "Multi-entry bundle";
  const entryLabel = activeEntryLabel.trim();
  const countLabel = count === 1 ? "1 entry" : `${count} entries`;

  if (!entryLabel) {
    return `${baseLabel} (${countLabel})`;
  }

  return `${baseLabel} · ${entryLabel} (${countLabel})`;
}
