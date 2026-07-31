import type { Food } from "@/lib/types";
import { mealMacros } from "@/lib/nutrition/macros";

const round1 = (n: number) => Math.round(n * 10) / 10;

const DEFAULT_5_NAMES = [
  "Café da manhã", "Lanche/pré-treino", "Almoço", "Lanche/pré-treino", "Jantar",
];
const DEFAULT_5_WEIGHTS = [0.2, 0.1, 0.3, 0.15, 0.25];

export function mealSubTargets(
  dayTarget: { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number },
  n: number,
) {
  const names = n === 5 ? DEFAULT_5_NAMES : Array.from({ length: n }, (_, i) => `Refeição ${i + 1}`);
  const weights = n === 5 ? DEFAULT_5_WEIGHTS : Array.from({ length: n }, () => 1 / n);
  return names.map((name, i) => ({
    name,
    kcal: round1(dayTarget.target_kcal * weights[i]),
    protein_g: round1(dayTarget.target_protein_g * weights[i]),
    carbs_g: round1(dayTarget.target_carbs_g * weights[i]),
    fat_g: round1(dayTarget.target_fat_g * weights[i]),
  }));
}

export function scaleOptionToKcal(
  items: { quantity: number; unit: "g" | "unit"; food: Food }[],
  targetKcal: number,
): { quantity: number; unit: "g" | "unit"; food: Food }[] {
  const currentKcal = mealMacros(items).kcal;
  if (currentKcal <= 0) return items;
  const factor = targetKcal / currentKcal;
  return items.map((it) => ({ ...it, quantity: round1(it.quantity * factor) }));
}
