import { describe, it, expect } from "vitest";
import { itemMacros, sumMacros, mealMacros, compareToTarget } from "@/lib/nutrition/macros";
import type { Food } from "@/lib/types";

const arroz: Food = {
  id: "1", user_id: null, name: "Arroz", is_custom: false,
  kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0,
};

describe("itemMacros", () => {
  it("escala macros pela quantidade em gramas", () => {
    expect(itemMacros({ quantity_g: 200 }, arroz)).toEqual({
      kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0,
    });
  });
});

describe("mealMacros + sumMacros", () => {
  it("soma os itens de uma refeição", () => {
    const result = mealMacros([
      { quantity_g: 100, food: arroz },
      { quantity_g: 100, food: arroz },
    ]);
    expect(result).toEqual({ kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0 });
  });
});

describe("compareToTarget", () => {
  it("retorna diferença planejado - meta", () => {
    const planned = { kcal: 2000, protein_g: 150, carbs_g: 100, fat_g: 60 };
    const target = { target_kcal: 2200, target_protein_g: 160, target_carbs_g: 90, target_fat_g: 70 };
    expect(compareToTarget(planned, target)).toEqual({
      kcal: -200, protein_g: -10, carbs_g: 10, fat_g: -10,
    });
  });
});
