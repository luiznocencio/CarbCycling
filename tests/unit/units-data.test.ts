import { describe, it, expect } from "vitest";
import units from "../../data/units.json";
import taco from "../../data/taco.json";

type UnitRow = { name: string; unit_name: string; unit_grams: number };

describe("units.json", () => {
  const rows = units as UnitRow[];
  const tacoNames = new Set((taco as { name: string }[]).map((t) => t.name));

  it("tem entradas", () => expect(rows.length).toBeGreaterThan(30));

  it("todo campo é bem-formado", () => {
    for (const r of rows) {
      expect(typeof r.name).toBe("string");
      expect(r.unit_name.trim().length).toBeGreaterThan(0);
      expect(r.unit_grams).toBeGreaterThan(0);
    }
  });

  it("todo name existe na base TACO", () => {
    for (const r of rows) expect(tacoNames.has(r.name)).toBe(true);
  });

  it("sem nomes duplicados", () => {
    const names = rows.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
