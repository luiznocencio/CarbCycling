import { describe, it, expect } from "vitest";
import { distinctDayTypeIds } from "@/lib/nutrition/week";

describe("distinctDayTypeIds", () => {
  it("retorna ids distintos na ordem do 1º weekday", () => {
    const pattern = [
      { weekday: 3, day_type_id: "b" },
      { weekday: 0, day_type_id: "a" },
      { weekday: 1, day_type_id: "a" },
      { weekday: 2, day_type_id: "b" },
      { weekday: 6, day_type_id: "c" },
    ];
    expect(distinctDayTypeIds(pattern)).toEqual(["a", "b", "c"]);
  });
  it("vazio → []", () => {
    expect(distinctDayTypeIds([])).toEqual([]);
  });
});
