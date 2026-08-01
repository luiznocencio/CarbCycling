import { describe, it, expect } from "vitest";
import { validateMenu, validateItems, type RawMenu, type PoolFood } from "@/lib/ai/menu";

const raw: RawMenu = {
  slots: [
    { name: "Café", options: [
      { items: [{ food_id: "good", quantity: 100, unit: "g" }, { food_id: "bad", quantity: 50, unit: "g" }] },
      { items: [{ food_id: "good", quantity: 2, unit: "unit" }] },
    ] },
  ],
};

describe("validateMenu", () => {
  it("descarta itens com food_id fora do pool", () => {
    const clean = validateMenu(raw, new Set(["good"]));
    expect(clean.slots[0].options[0].items.map((i) => i.food_id)).toEqual(["good"]);
    expect(clean.slots[0].options[1].items).toHaveLength(1);
  });
  it("lança se um slot ficar sem opções", () => {
    const badRaw: RawMenu = { slots: [{ name: "X", options: [{ items: [{ food_id: "bad", quantity: 1, unit: "g" }] }] }] };
    expect(() => validateMenu(badRaw, new Set(["good"]))).toThrow();
  });
});

const pool: PoolFood[] = [
  { id: "good", name: "Bom", kcal_per_100g: 100, protein_per_100g: 5, carbs_per_100g: 10, fat_per_100g: 2, unit_name: null, unit_grams: null },
  { id: "inc", name: "Fixo", kcal_per_100g: 155, protein_per_100g: 13, carbs_per_100g: 1, fat_per_100g: 11, unit_name: "ovo", unit_grams: 50 },
  { id: "exc", name: "Evitar", kcal_per_100g: 50, protein_per_100g: 1, carbs_per_100g: 10, fat_per_100g: 0, unit_name: null, unit_grams: null },
];

describe("validateItems", () => {
  it("filtra fora-do-pool/excluídos e força includes ausentes", () => {
    const raw = [
      { food_id: "good", quantity: 100, unit: "g" as const },
      { food_id: "exc", quantity: 50, unit: "g" as const },
      { food_id: "bad", quantity: 10, unit: "g" as const },
    ];
    const r = validateItems(raw, pool, ["inc"], ["exc"]);
    const ids = r.map((i) => i.food_id);
    expect(ids).toContain("good");
    expect(ids).not.toContain("exc");
    expect(ids).not.toContain("bad");
    expect(ids).toContain("inc"); // forçado
    const inc = r.find((i) => i.food_id === "inc")!;
    expect(inc.unit).toBe("unit"); // tem unit_grams → default 1 unidade
    expect(inc.quantity).toBe(1);
  });
});
