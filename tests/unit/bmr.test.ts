import { describe, it, expect } from "vitest";
import { bmrMifflin, bmrHarris, bmrKatch, bmr, tdee, isProfileComplete } from "@/lib/nutrition/bmr";

describe("bmrMifflin", () => {
  it("homem 80kg/178cm/30a", () => expect(bmrMifflin("male", 80, 178, 30)).toBe(1768));
  it("mulher 60kg/165cm/30a", () => expect(bmrMifflin("female", 60, 165, 30)).toBe(1320));
});

describe("bmrHarris", () => {
  it("homem 80kg/178cm/30a", () => expect(bmrHarris("male", 80, 178, 30)).toBe(1844));
});

describe("bmrKatch", () => {
  it("80kg com 15% de gordura", () => expect(bmrKatch(80, 15)).toBe(1839));
});

describe("bmr (híbrido/seleção)", () => {
  const base = { sex: "male" as const, weight_kg: 80, height_cm: 178, age: 30 };
  it("auto sem BF% usa mifflin", () =>
    expect(bmr({ ...base, body_fat_pct: null }, "auto")).toBe(1768));
  it("auto com BF% usa katch", () =>
    expect(bmr({ ...base, body_fat_pct: 15 }, "auto")).toBe(1839));
  it("katch sem BF% cai para mifflin", () =>
    expect(bmr({ ...base, body_fat_pct: null }, "katch")).toBe(1768));
  it("harris selecionado", () =>
    expect(bmr({ ...base, body_fat_pct: null }, "harris")).toBe(1844));
});

describe("tdee", () => {
  it("bmr 1768 moderado", () => expect(tdee(1768, "moderate")).toBe(2740));
});

describe("isProfileComplete", () => {
  it("completo", () =>
    expect(isProfileComplete({ sex: "male", age: 30, height_cm: 178, weight_kg: 80 })).toBe(true));
  it("faltando altura", () =>
    expect(isProfileComplete({ sex: "male", age: 30, height_cm: null, weight_kg: 80 })).toBe(false));
});
