import type { Food } from "@/lib/types";
import { mealMacros, itemMacros } from "@/lib/nutrition/macros";

const round1 = (n: number) => Math.round(n * 10) / 10;

const NAMES_BY_N: Record<number, string[]> = {
  3: ["Café da manhã", "Almoço", "Jantar"],
  4: ["Café da manhã", "Almoço", "Lanche", "Jantar"],
  5: ["Café da manhã", "Lanche/pré-treino", "Almoço", "Lanche/pré-treino", "Jantar"],
  6: ["Café da manhã", "Lanche", "Almoço", "Lanche", "Jantar", "Ceia"],
};
const WEIGHTS_BY_N: Record<number, number[]> = {
  3: [0.25, 0.4, 0.35],
  4: [0.25, 0.35, 0.1, 0.3],
  5: [0.2, 0.1, 0.3, 0.15, 0.25],
  6: [0.2, 0.1, 0.28, 0.1, 0.22, 0.1],
};

export function mealSubTargets(
  dayTarget: { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number },
  n: number,
) {
  const names = NAMES_BY_N[n] ?? Array.from({ length: n }, (_, i) => `Refeição ${i + 1}`);
  const weights = WEIGHTS_BY_N[n] ?? Array.from({ length: n }, () => 1 / n);
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

export function scaleOptionToTarget(
  items: { quantity: number; unit: "g" | "unit"; food: Food }[],
  target: { kcal: number; protein_g: number },
): { quantity: number; unit: "g" | "unit"; food: Food }[] {
  if (items.length === 0) return items;
  const targetFrac = target.kcal > 0 ? (target.protein_g * 4) / target.kcal : 0;
  const groupA: typeof items = [];
  const groupB: typeof items = [];
  for (const it of items) {
    const m = itemMacros(it, it.food);
    const frac = m.kcal > 0 ? (m.protein_g * 4) / m.kcal : 0;
    (frac > targetFrac ? groupA : groupB).push(it);
  }
  if (groupA.length === 0 || groupB.length === 0) {
    return scaleOptionToKcal(items, target.kcal);
  }
  const macA = mealMacros(groupA);
  const macB = mealMacros(groupB);
  const Ka = macA.kcal, Pa = macA.protein_g, Kb = macB.kcal, Pb = macB.protein_g;
  const det = Ka * Pb - Kb * Pa;
  if (det === 0) return scaleOptionToKcal(items, target.kcal);
  const a = (target.kcal * Pb - target.protein_g * Kb) / det;
  const b = (Ka * target.protein_g - Pa * target.kcal) / det;
  if (!isFinite(a) || !isFinite(b) || a < 0 || b < 0) {
    return scaleOptionToKcal(items, target.kcal);
  }
  const inA = new Set(groupA);
  return items.map((it) => ({ ...it, quantity: round1(it.quantity * (inA.has(it) ? a : b)) }));
}
