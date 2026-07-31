import { describe, it, expect } from "vitest";
import { mealSubTargets, scaleOptionToKcal } from "@/lib/nutrition/solver";
import type { Food } from "@/lib/types";

const arroz: Food = {
  id: "1", user_id: null, name: "Arroz", is_custom: false,
  kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0,
  unit_name: null, unit_grams: null,
};

describe("mealSubTargets", () => {
  const day = { target_kcal: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 60 };
  it("N=5 usa nomes e pesos default", () => {
    const r = mealSubTargets(day, 5);
    expect(r.map((m) => m.name)).toEqual([
      "Café da manhã", "Lanche/pré-treino", "Almoço", "Lanche/pré-treino", "Jantar",
    ]);
    expect(r[0]).toEqual({ name: "Café da manhã", kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 12 });
    expect(r[2].kcal).toBe(600);
    expect(r.reduce((s, m) => s + m.kcal, 0)).toBe(2000);
  });
  it("N=3 split uniforme com nomes genéricos", () => {
    const r = mealSubTargets(day, 3);
    expect(r.map((m) => m.name)).toEqual(["Refeição 1", "Refeição 2", "Refeição 3"]);
    expect(r[0].kcal).toBeCloseTo(2000 / 3, 1);
  });
});

describe("scaleOptionToKcal", () => {
  it("escala por fator único para bater o kcal alvo", () => {
    const scaled = scaleOptionToKcal([{ quantity: 100, unit: "g", food: arroz }], 248);
    expect(scaled[0].quantity).toBe(200);
  });
  it("kcal atual 0 → não escala (evita divisão por zero)", () => {
    const zero: Food = { ...arroz, kcal_per_100g: 0 };
    const scaled = scaleOptionToKcal([{ quantity: 50, unit: "g", food: zero }], 300);
    expect(scaled[0].quantity).toBe(50);
  });
});
