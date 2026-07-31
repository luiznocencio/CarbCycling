import { describe, it, expect } from "vitest";
import { validateMenu, type RawMenu } from "@/lib/ai/menu";

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
