import type { Goal, ActivityLevel, CarbLevel } from "@/lib/types";

const PROTEIN_G_PER_KG = 2.0;
const CARB_G_PER_KG: Record<CarbLevel, number> = {
  low: 1.0,
  medium: 2.5,
  high: 4.0,
};
const ACTIVITY_KCAL_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 28,
  light: 31,
  moderate: 34,
  active: 37,
};
const GOAL_KCAL_MULTIPLIER: Record<Goal, number> = {
  fat_loss: 0.8,
  maintenance: 1.0,
  muscle_gain: 1.1,
};

export function suggestTargets(input: {
  weightKg: number;
  goal: Goal;
  activityLevel: ActivityLevel;
  carbLevel: CarbLevel;
}): {
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
} {
  const { weightKg, goal, activityLevel, carbLevel } = input;

  const maintenanceKcal = weightKg * ACTIVITY_KCAL_PER_KG[activityLevel];
  const target_kcal = Math.round(maintenanceKcal * GOAL_KCAL_MULTIPLIER[goal]);
  const target_protein_g = Math.round(PROTEIN_G_PER_KG * weightKg);
  const target_carbs_g = Math.round(CARB_G_PER_KG[carbLevel] * weightKg);
  const target_fat_g = Math.max(0, Math.round((target_kcal - target_protein_g * 4 - target_carbs_g * 4) / 9));

  return {
    target_kcal,
    target_protein_g,
    target_carbs_g,
    target_fat_g,
  };
}
