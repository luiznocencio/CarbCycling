export type WeightLog = { logged_on: string; weight_kg: number };
const KCAL_PER_KG = 7700;
const dayNum = (d: string) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);

export function trendKgPerWeek(
  logs: WeightLog[], opts: { windowDays: number; asOf: string },
): { slope: number | null; points: number; spanDays: number } {
  const end = dayNum(opts.asOf);
  const inWin = logs
    .filter((l) => { const d = dayNum(l.logged_on); return d <= end && d > end - opts.windowDays; })
    .map((l) => ({ x: dayNum(l.logged_on), y: l.weight_kg }))
    .sort((a, b) => a.x - b.x);
  if (inWin.length < 2) return { slope: null, points: inWin.length, spanDays: 0 };
  const x0 = inWin[0].x;
  const pts = inWin.map((p) => ({ x: p.x - x0, y: p.y }));
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  const spanDays = pts[n - 1].x;
  if (den === 0) return { slope: null, points: n, spanDays };
  return { slope: (num / den) * 7, points: n, spanDays };
}

export function weightAnalysis(input: {
  tdee: number; adjPct: number; kcalAdjustment: number; logs: WeightLog[]; asOf: string;
}) {
  const avgDailyTarget = Math.round(input.tdee * (1 + input.adjPct)) + input.kcalAdjustment;
  const expectedKgPerWeek = ((avgDailyTarget - input.tdee) * 7) / KCAL_PER_KG;
  const t = trendKgPerWeek(input.logs, { windowDays: 28, asOf: input.asOf });
  const enoughData = t.slope != null && t.points >= 2 && t.spanDays >= 10;
  const actualKgPerWeek = enoughData ? t.slope : null;
  let deltaKcalPerDay = 0, suggestedDelta = 0;
  let status: "on_track" | "eat_less" | "eat_more" | "insufficient_data" = "insufficient_data";
  if (enoughData && actualKgPerWeek != null) {
    const raw = ((expectedKgPerWeek - actualKgPerWeek) * KCAL_PER_KG) / 7;
    deltaKcalPerDay = Math.round(raw / 25) * 25;
    if (Math.abs(deltaKcalPerDay) >= 75) {
      suggestedDelta = deltaKcalPerDay;
      status = deltaKcalPerDay < 0 ? "eat_less" : "eat_more";
    } else {
      status = "on_track";
    }
  }
  return { avgDailyTarget, expectedKgPerWeek, actualKgPerWeek, enoughData, deltaKcalPerDay, suggestedDelta, status };
}
