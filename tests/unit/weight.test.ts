import { describe, it, expect } from "vitest";
import { trendKgPerWeek, weightAnalysis } from "@/lib/nutrition/weight";

const mk = (d: string, w: number) => ({ logged_on: d, weight_kg: w });

describe("trendKgPerWeek", () => {
  it("calcula kg/semana (perda)", () => {
    const r = trendKgPerWeek(
      [mk("2026-07-01", 80), mk("2026-07-08", 79.5), mk("2026-07-15", 79)],
      { windowDays: 28, asOf: "2026-07-15" },
    );
    expect(r.slope).not.toBeNull();
    expect(r.slope!).toBeCloseTo(-0.5, 1); // ~-0.5 kg/sem
  });
  it("poucos pontos → slope null", () => {
    expect(trendKgPerWeek([mk("2026-07-15", 80)], { windowDays: 28, asOf: "2026-07-15" }).slope).toBeNull();
  });
});

describe("weightAnalysis", () => {
  it("perdendo devagar demais → eat_less", () => {
    const logs = [mk("2026-07-01", 80), mk("2026-07-15", 79.8)]; // ~-0.1 kg/sem
    const a = weightAnalysis({ tdee: 2500, adjPct: -0.2, kcalAdjustment: 0, logs, asOf: "2026-07-15" });
    expect(a.avgDailyTarget).toBe(2000);
    expect(a.expectedKgPerWeek).toBeCloseTo(-0.45, 1);
    expect(a.status).toBe("eat_less");
    expect(a.suggestedDelta).toBeLessThan(0);
    expect(Math.abs(a.suggestedDelta) % 25).toBe(0);
  });
  it("dados insuficientes → insufficient_data, delta 0", () => {
    const a = weightAnalysis({ tdee: 2500, adjPct: 0, kcalAdjustment: 0, logs: [mk("2026-07-15", 80)], asOf: "2026-07-15" });
    expect(a.status).toBe("insufficient_data");
    expect(a.suggestedDelta).toBe(0);
  });
});
