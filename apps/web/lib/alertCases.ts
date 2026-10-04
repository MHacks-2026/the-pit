export interface CaseEntry<T> {
  id: string;
  owner: string;
  kind: string;
  at: number;
  alert: T;
}

export interface AlertCase<T> {
  owner: string;
  kind: string;
  latestAt: number;
  entries: CaseEntry<T>[];
}

/** Group nearby findings for display; each original alert remains available. */
export function groupAlertCases<T>(entries: readonly CaseEntry<T>[], gapMs = 10 * 60_000): AlertCase<T>[] {
  const cases: AlertCase<T>[] = [];
  const sorted = [...entries].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  for (const entry of sorted) {
    const match = cases.find(item => item.owner === entry.owner && item.kind === entry.kind &&
      item.entries[item.entries.length - 1].at - entry.at <= gapMs);
    if (match) match.entries.push(entry);
    else cases.push({ owner: entry.owner, kind: entry.kind, latestAt: entry.at, entries: [entry] });
  }
  return cases;
}
