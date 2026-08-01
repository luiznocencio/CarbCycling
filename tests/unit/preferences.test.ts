import { describe, it, expect } from "vitest";
import {
  normalizeName, applyAvoidToPool, resolveIncludeIds, prefsPromptSnippet,
  sanitizePrefs, EMPTY_PREFS,
} from "@/lib/ai/preferences";

describe("normalizeName", () => {
  it("remove acento e caixa", () => {
    expect(normalizeName("  Peixe, Tilápia ")).toBe("peixe, tilapia");
  });
});

const pool = [
  { id: "a", name: "Peixe, tilápia, crua" },
  { id: "b", name: "Frango, peito, grelhado" },
  { id: "c", name: "Leite, de vaca, desnatado" },
];

describe("applyAvoidToPool", () => {
  it("remove por substring normalizado; ignora termos vazios", () => {
    const r = applyAvoidToPool(pool, ["peixe", "  ", "leite"]);
    expect(r.map((f) => f.id)).toEqual(["b"]);
  });
  it("não remove nada quando avoid vazio", () => {
    expect(applyAvoidToPool(pool, []).length).toBe(3);
  });
});

describe("resolveIncludeIds", () => {
  it("resolve por nome; ignora não-encontrados", () => {
    expect(resolveIncludeIds(pool, ["frango", "inexistente"])).toEqual(["b"]);
  });
});

describe("prefsPromptSnippet", () => {
  it("omite seções vazias e cita o que existe", () => {
    const s = prefsPromptSnippet({ ...EMPTY_PREFS, likes: ["ovo"], avoid: ["peixe"] });
    expect(s).toMatch(/ovo/);
    expect(s).toMatch(/peixe/);
    expect(prefsPromptSnippet(EMPTY_PREFS)).toBe("");
  });
});

describe("sanitizePrefs", () => {
  it("coage arrays, faz trim/dedup e aplica limites", () => {
    const r = sanitizePrefs({
      likes: ["Ovo", "ovo", "  Ovo  ", 5, ""],
      dislikes: "não-array",
      avoid: ["Peixe"],
      always_include: [],
      notes: 123,
    });
    expect(r.likes).toEqual(["Ovo"]); // trim + dedup case-insensitive, descarta vazio/não-string
    expect(r.dislikes).toEqual([]);   // não-array vira []
    expect(r.avoid).toEqual(["Peixe"]);
    expect(typeof r.notes).toBe("string");
  });
});
