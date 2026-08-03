import { describe, it, expect } from "vitest";
import { mealSubTargets, scaleOptionToKcal, scaleOptionToTarget } from "@/lib/nutrition/solver";
import type { Food } from "@/lib/types";
import { mealMacros } from "@/lib/nutrition/macros";

const arroz: Food = {
  id: "1", user_id: null, name: "Arroz", is_custom: false,
  kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0,
  unit_name: null, unit_grams: null,
};

const frango: Food = {
  id: "f", user_id: null, name: "Frango", is_custom: false,
  kcal_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6,
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
    expect(r.map((m) => m.name)).toEqual(["Café da manhã", "Almoço", "Jantar"]);
    expect(r.reduce((s, m) => s + m.kcal, 0)).toBe(2000);
  });
  it("N sem tabela (7) usa split uniforme com nomes genéricos", () => {
    const r = mealSubTargets(day, 7);
    expect(r.map((m) => m.name)).toEqual([
      "Refeição 1", "Refeição 2", "Refeição 3", "Refeição 4", "Refeição 5", "Refeição 6", "Refeição 7",
    ]);
    expect(r[0].kcal).toBeCloseTo(2000 / 7, 1);
  });
  it("nomes default por refeição comum (n=3,4,6)", () => {
    const dt = { target_kcal: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 60 };
    expect(mealSubTargets(dt, 3).map((m) => m.name)).toEqual(["Café da manhã", "Almoço", "Jantar"]);
    expect(mealSubTargets(dt, 4).map((m) => m.name)).toEqual(["Café da manhã", "Almoço", "Lanche", "Jantar"]);
    expect(mealSubTargets(dt, 6).map((m) => m.name)).toEqual(["Café da manhã", "Lanche", "Almoço", "Lanche", "Jantar", "Ceia"]);
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

describe("scaleOptionToTarget", () => {
  it("bate kcal e proteína quando viável (2 grupos)", () => {
    const r = scaleOptionToTarget(
      [
        { quantity: 100, unit: "g" as const, food: frango },
        { quantity: 100, unit: "g" as const, food: arroz },
      ],
      { kcal: 500, protein_g: 40 },
    );
    const m = mealMacros(r);
    expect(Math.abs(m.kcal - 500)).toBeLessThanOrEqual(3);
    expect(Math.abs(m.protein_g - 40)).toBeLessThanOrEqual(2);
  });
  it("inviável (um só grupo) → fallback só-kcal", () => {
    const r = scaleOptionToTarget([{ quantity: 100, unit: "g", food: frango }], {
      kcal: 330,
      protein_g: 10,
    });
    expect(r[0].quantity).toBe(200); // 330/165 = 2
  });
});
