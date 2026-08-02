import { describe, it, expect } from "vitest";
import { weeklyKcalByLevel, levelTargets, distributeWeeklyTargets, goalAdjustment } from "@/lib/nutrition/weekly";

describe("weeklyKcalByLevel", () => {
  it("média ponderada = avgDaily e ciclo monotônico", () => {
    const r = { low: 0.85, medium: 1.0, high: 1.15 };
    const counts = { low: 3, medium: 2, high: 2 };
    const res = weeklyKcalByLevel(2176, r, counts);
    const weighted =
      (counts.low * res.low + counts.medium * res.medium + counts.high * res.high) / 7;
    expect(weighted).toBeCloseTo(2176, 6);
    expect(res.low).toBeLessThan(res.medium);
    expect(res.medium).toBeLessThan(res.high);
    expect(Math.round(res.low)).toBe(1890);
    expect(Math.round(res.high)).toBe(2557);
  });
});

describe("levelTargets", () => {
  it("dia baixo 1890kcal/80kg sem clamp", () => {
    expect(levelTargets(1890, 80, "low", { guardrails: true, bmr: 1768 })).toEqual({
      target_kcal: 1887,
      target_protein_g: 160,
      target_carbs_g: 80,
      target_fat_g: 103,
      warnings: [],
    });
  });
  it("travas ligadas: piso no BMR", () => {
    const t = levelTargets(1600, 80, "low", { guardrails: true, bmr: 1768 });
    expect(t.target_kcal).toBeGreaterThanOrEqual(1768 - 5);
    expect(t.warnings.length).toBeGreaterThan(0);
  });
  it("travas desligadas: sem piso", () => {
    const t = levelTargets(1600, 80, "low", { guardrails: false, bmr: 1768 });
    expect(t.target_kcal).toBeLessThan(1768);
    expect(t.warnings).toEqual([]);
  });
  it("travas ligadas: piso de gordura 0.5g/kg", () => {
    const t = levelTargets(1500, 80, "high", { guardrails: true, bmr: 1000 });
    expect(t.target_fat_g).toBe(40);
    expect(t.warnings.some((w) => w.toLowerCase().includes("gordura"))).toBe(true);
  });
});

describe("distributeWeeklyTargets", () => {
  it("perda moderada, 80kg, 3/2/2 → média ≈ alvo", () => {
    const res = distributeWeeklyTargets({
      tdee: 2720,
      weightKg: 80,
      goal: "fat_loss",
      intensity: "moderate",
      guardrails: true,
      bmr: 1768,
      levelCounts: { low: 3, medium: 2, high: 2 },
    });
    expect(res.summary.avgDailyTarget).toBe(2176);
    expect(res.summary.actualWeeklyAvg).toBeGreaterThan(2150);
    expect(res.summary.actualWeeklyAvg).toBeLessThan(2200);
    expect(res.perLevel.low.target_carbs_g).toBe(80);
    expect(res.perLevel.high.target_carbs_g).toBe(320);
    expect(res.perLevel.high.target_kcal).toBeGreaterThan(res.perLevel.low.target_kcal);
  });
  it("kcalAdjustment desloca o avgDailyTarget", () => {
    const base = distributeWeeklyTargets({ tdee: 2500, weightKg: 80, goal: "maintenance", intensity: "moderate", guardrails: false, bmr: 1700, levelCounts: { low: 1, medium: 1, high: 1 } });
    const adj = distributeWeeklyTargets({ tdee: 2500, weightKg: 80, goal: "maintenance", intensity: "moderate", guardrails: false, bmr: 1700, levelCounts: { low: 1, medium: 1, high: 1 }, kcalAdjustment: -300 });
    expect(adj.summary.avgDailyTarget).toBe(base.summary.avgDailyTarget - 300);
  });
  it("goalAdjustment expõe o ajuste do plano", () => {
    expect(goalAdjustment("fat_loss", "moderate")).toBe(-0.2);
    expect(goalAdjustment("maintenance", "light")).toBe(0);
  });
});
