import { describe, it, expect } from "vitest";
import { normalizeTacoRow } from "../../supabase/seed/normalize";

describe("normalizeTacoRow", () => {
  it("mapeia uma linha TACO para insert de food da base", () => {
    const row = {
      name: "Arroz, integral, cozido",
      kcal_per_100g: 124,
      protein_per_100g: 2.6,
      carbs_per_100g: 25.8,
      fat_per_100g: 1.0,
    };
    expect(normalizeTacoRow(row)).toEqual({
      user_id: null,
      name: "Arroz, integral, cozido",
      kcal_per_100g: 124,
      protein_per_100g: 2.6,
      carbs_per_100g: 25.8,
      fat_per_100g: 1.0,
      is_custom: false,
    });
  });
});
