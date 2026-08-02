export function distinctDayTypeIds(
  pattern: { weekday: number; day_type_id: string }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of [...pattern].sort((a, b) => a.weekday - b.weekday)) {
    if (!e.day_type_id || seen.has(e.day_type_id)) continue;
    seen.add(e.day_type_id);
    out.push(e.day_type_id);
  }
  return out;
}
