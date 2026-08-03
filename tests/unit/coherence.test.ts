import { describe, it, expect } from "vitest";
import { classifyFood } from "@/lib/nutrition/coherence";

const f = (name: string, p = 0, c = 0, g = 0) => ({
  name, protein_per_100g: p, carbs_per_100g: c, fat_per_100g: g,
});

describe("classifyFood", () => {
  it("classifica por palavra-chave", () => {
    expect(classifyFood(f("Frango, peito, sem pele, grelhado", 31, 0, 3))).toBe("proteina_animal");
    expect(classifyFood(f("Carne, bovina, patinho, sem gordura, grelhado", 35, 0, 5))).toBe("proteina_animal");
    expect(classifyFood(f("Atum, conserva em óleo", 26, 0, 8))).toBe("proteina_animal");
    expect(classifyFood(f("Ovo, de galinha, inteiro, cozido/10minutos", 13, 1, 10))).toBe("ovo");
    expect(classifyFood(f("Feijão, carioca, cozido", 5, 14, 0))).toBe("leguminosa");
    expect(classifyFood(f("Lentilha, cozida", 6, 16, 0))).toBe("leguminosa");
    expect(classifyFood(f("Arroz, integral, cozido", 3, 26, 1))).toBe("carbo");
    expect(classifyFood(f("Batata, inglesa, cozida", 1, 12, 0))).toBe("carbo");
    expect(classifyFood(f("Macarrão, trigo, cru", 10, 75, 1))).toBe("carbo");
    expect(classifyFood(f("Aveia, flocos, crua", 14, 66, 8))).toBe("carbo");
    expect(classifyFood(f("Pão, trigo, forma, integral", 9, 49, 4))).toBe("pao");
    expect(classifyFood(f("Brócolis, cozido", 3, 4, 0))).toBe("vegetal");
    expect(classifyFood(f("Tomate, salada", 1, 3, 0))).toBe("vegetal");
    expect(classifyFood(f("Banana, prata, crua", 1, 26, 0))).toBe("fruta");
    expect(classifyFood(f("Azeite, de oliva, extra virgem", 0, 0, 100))).toBe("gordura");
    expect(classifyFood(f("Castanha-do-Brasil, crua", 14, 4, 66))).toBe("oleaginosa");
    expect(classifyFood(f("Leite, de vaca, desnatado, UHT", 3, 5, 0))).toBe("laticinio");
    expect(classifyFood(f("Iogurte, natural, desnatado", 4, 6, 0))).toBe("laticinio");
  });

  it("fallback por macro quando não há palavra-chave", () => {
    expect(classifyFood(f("XYZ desconhecido", 30, 2, 2))).toBe("proteina_animal");
    expect(classifyFood(f("XYZ desconhecido", 2, 50, 1))).toBe("carbo");
    expect(classifyFood(f("XYZ desconhecido", 1, 1, 60))).toBe("gordura");
    expect(classifyFood(f("XYZ desconhecido", 1, 2, 1))).toBe("outro");
  });
});
