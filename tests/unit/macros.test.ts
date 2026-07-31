import { describe, it, expect } from "vitest";
import { itemGrams, itemMacros, sumMacros, mealMacros, compareToTarget } from "@/lib/nutrition/macros";
import type { Food } from "@/lib/types";

const arroz: Food = {
  id: "1", user_id: null, name: "Arroz", is_custom: false,
  kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0,
  unit_name: null, unit_grams: null,
};
const ovo: Food = {
  id: "2", user_id: null, name: "Ovo", is_custom: false,
  kcal_per_100g: 155, protein_per_100g: 13, carbs_per_100g: 1.1, fat_per_100g: 11,
  unit_name: "ovo", unit_grams: 50,
};

describe("itemGrams", () => {
  it("gramas diretas", () => expect(itemGrams({ quantity: 200, unit: "g" }, arroz)).toBe(200));
  it("unidade × peso", () => expect(itemGrams({ quantity: 2, unit: "unit" }, ovo)).toBe(100));
  it("unidade sem peso definido = 0", () =>
    expect(itemGrams({ quantity: 2, unit: "unit" }, arroz)).toBe(0));
});

describe("itemMacros", () => {
  it("200g de arroz", () => {
    expect(itemMacros({ quantity: 200, unit: "g" }, arroz)).toEqual({
      kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0,
    });
  });
  it("2 ovos (100g)", () => {
    expect(itemMacros({ quantity: 2, unit: "unit" }, ovo)).toEqual({
      kcal: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11,
    });
  });
});

describe("mealMacros + sumMacros", () => {
  it("soma itens em gramas", () => {
    expect(
      mealMacros([
        { quantity: 100, unit: "g", food: arroz },
        { quantity: 100, unit: "g", food: arroz },
      ]),
    ).toEqual({ kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0 });
  });
});

describe("compareToTarget", () => {
  it("diferença planejado - meta", () => {
    const planned = { kcal: 2000, protein_g: 150, carbs_g: 100, fat_g: 60 };
    const target = { target_kcal: 2200, target_protein_g: 160, target_carbs_g: 90, target_fat_g: 70 };
    expect(compareToTarget(planned, target)).toEqual({
      kcal: -200, protein_g: -10, carbs_g: 10, fat_g: -10,
    });
  });
});
