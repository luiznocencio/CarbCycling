import { describe, it, expect } from "vitest";
import { suggestTargets } from "@/lib/nutrition/targets";

describe("suggestTargets", () => {
  it("dia baixo carbo, manutenção, 80kg moderado", () => {
    expect(
      suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "low" }),
    ).toEqual({ target_kcal: 2720, target_protein_g: 160, target_carbs_g: 80, target_fat_g: 196 });
  });
  it("dia alto carbo tem mais carbo e menos gordura que o baixo", () => {
    const low = suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "low" });
    const high = suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "high" });
    expect(high.target_carbs_g).toBeGreaterThan(low.target_carbs_g);
    expect(high.target_fat_g).toBeLessThan(low.target_fat_g);
    expect(high.target_protein_g).toBe(low.target_protein_g);
  });
  it("perda de gordura reduz kcal vs manutenção", () => {
    const cut = suggestTargets({ weightKg: 80, goal: "fat_loss", activityLevel: "moderate", carbLevel: "medium" });
    const maint = suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "medium" });
    expect(cut.target_kcal).toBeLessThan(maint.target_kcal);
  });
});
