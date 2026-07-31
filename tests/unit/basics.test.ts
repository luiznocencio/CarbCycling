import { describe, it, expect } from "vitest";
import basics from "../../data/basics.json";
import taco from "../../data/taco.json";

describe("data/basics.json", () => {
  const tacoNames = new Set((taco as { name: string }[]).map((f) => f.name));

  it("é um array de strings não vazio", () => {
    expect(Array.isArray(basics)).toBe(true);
    expect(basics.length).toBeGreaterThan(0);
    for (const name of basics as unknown[]) {
      expect(typeof name).toBe("string");
    }
  });

  it("tem entre 15 e 25 nomes", () => {
    expect((basics as string[]).length).toBeGreaterThanOrEqual(15);
    expect((basics as string[]).length).toBeLessThanOrEqual(25);
  });

  it("todos os nomes existem em data/taco.json", () => {
    const missing = (basics as string[]).filter((name) => !tacoNames.has(name));
    expect(missing).toEqual([]);
  });

  it("não tem nomes duplicados", () => {
    const names = basics as string[];
    expect(new Set(names).size).toBe(names.length);
  });
});
