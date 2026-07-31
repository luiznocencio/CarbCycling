import type { Food, Macros } from "@/lib/types";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function itemGrams(
  item: { quantity: number; unit: "g" | "unit" },
  food: Pick<Food, "unit_grams">,
): number {
  return item.unit === "unit" ? item.quantity * (food.unit_grams ?? 0) : item.quantity;
}

export function itemMacros(
  item: { quantity: number; unit: "g" | "unit" },
  food: Food,
): Macros {
  const f = itemGrams(item, food) / 100;
  return {
    kcal: round1(food.kcal_per_100g * f),
    protein_g: round1(food.protein_per_100g * f),
    carbs_g: round1(food.carbs_per_100g * f),
    fat_g: round1(food.fat_per_100g * f),
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce((acc, m) => ({
    kcal: round1(acc.kcal + m.kcal),
    protein_g: round1(acc.protein_g + m.protein_g),
    carbs_g: round1(acc.carbs_g + m.carbs_g),
    fat_g: round1(acc.fat_g + m.fat_g),
  }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

export function mealMacros(
  items: { quantity: number; unit: "g" | "unit"; food: Food }[],
): Macros {
  return sumMacros(items.map((it) => itemMacros(it, it.food)));
}

export function compareToTarget(planned: Macros, target: { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number }) {
  return {
    kcal: round1(planned.kcal - target.target_kcal),
    protein_g: round1(planned.protein_g - target.target_protein_g),
    carbs_g: round1(planned.carbs_g - target.target_carbs_g),
    fat_g: round1(planned.fat_g - target.target_fat_g),
  };
}
