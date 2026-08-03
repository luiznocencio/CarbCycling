# Coerência culinária na montagem do cardápio — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** Fazer o cardápio gerado ser um prato coerente — 1 proteína animal principal + 1 carbo-base + feijão/vegetal como complementos, adequado ao horário — eliminando redundância (frango+carne, carbos empilhados).

**Architecture:** Módulo puro `src/lib/nutrition/coherence.ts` (classificação de alimento + tipo de refeição + guarda subtrativa) plugado nos três geradores (C1 `generate`, semana E2, C2 `suggest-option`): o prompt ganha tipo/molde/categorias e a guarda `enforceCoherence` roda entre `withFood` e o solver. Sem migração, sem IA nova.

**Tech Stack:** TypeScript · Next.js 16 · OpenAI (gpt-4o-mini) · Vitest · Playwright.

## Global Constraints

- **Sem migração, sem IA nova:** mesma `gpt-4o-mini`; categorização derivada do nome/macros (nenhuma coluna nova).
- **Guarda subtrativa:** só remove excedente, nunca injeta alimento. Roda **antes** de `scaleOptionToTarget`.
- **1 proteína animal principal por refeição;** ovo/feijão/laticínio são complementos. **Arroz + feijão sempre permitido** (feijão = leguminosa, não carbo). Carbo-base (`carbo`+`pao`) limitado a 1.
- **Compartilhado** por `generate.ts` (C1/E2) e rota `suggest-option` (C2).
- **Next 16:** rotas com `params` async. pt-BR na UI/prompt.
- Rodar do dir do projeto: `cd /e/CODE/carb-cycling && ...`. Windows/PowerShell (Bash tool ok).

---

## Estrutura de arquivos

```
src/lib/nutrition/coherence.ts      # NOVO: classifyFood, mealTypeFromName, coherenceGuidance, enforceCoherence (Tasks 1-4)
tests/unit/coherence.test.ts        # NOVO: unit das 4 funções (Tasks 1-4)
src/lib/ai/menu.ts                  # MOD: PoolFood.categoria; prompts recebem tipo/molde/categorias (Task 5)
src/lib/ai/generate.ts              # MOD: aplica enforceCoherence por opção; passa tipos (Task 6)
src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts  # MOD: enforceCoherence + mealType (Task 6)
src/lib/nutrition/solver.ts         # MOD: nomes/pesos default p/ n=3,4,6 (Task 7)
tests/unit/solver.test.ts           # MOD: cobre nomes default (Task 7)
```

---

## Task 1: `classifyFood`

**Files:**
- Create: `src/lib/nutrition/coherence.ts`
- Test: `tests/unit/coherence.test.ts`

**Interfaces:**
- Produces:
  - `type FoodCategory = "proteina_animal" | "ovo" | "leguminosa" | "laticinio" | "carbo" | "pao" | "vegetal" | "fruta" | "gordura" | "oleaginosa" | "outro"`
  - `classifyFood(food: { name: string; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number }): FoodCategory`

- [ ] **Step 1: Escrever teste que falha** — crie `tests/unit/coherence.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar (falha)** — `cd /e/CODE/carb-cycling && npx vitest run tests/unit/coherence.test.ts`. Esperado: FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — crie `src/lib/nutrition/coherence.ts`:

```ts
export type FoodCategory =
  | "proteina_animal" | "ovo" | "leguminosa" | "laticinio"
  | "carbo" | "pao" | "vegetal" | "fruta" | "gordura" | "oleaginosa" | "outro";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ordem = prioridade. Cada regra: se algum termo aparece no nome normalizado.
const KEYWORDS: [FoodCategory, string[]][] = [
  ["ovo", ["ovo", "ovos", "clara", "gema"]],
  ["leguminosa", ["feijao", "lentilha", "grao-de-bico", "grao de bico", "ervilha", "soja", "edamame", "tremoco", "vagem"]],
  ["oleaginosa", ["castanha", "amendoim", "noz", "nozes", "amendoa", "pistache", "macadamia", "avela"]],
  ["gordura", ["azeite", "oleo", "manteiga", "margarina", "banha"]],
  ["laticinio", ["leite", "iogurte", "queijo", "requeijao", "coalhada", "ricota", "whey"]],
  ["proteina_animal", [
    "frango", "peito", "carne", "bovina", "patinho", "boi", "acem", "musculo",
    "peixe", "tilapia", "salmao", "atum", "sardinha", "merluza", "pescada",
    "porco", "suina", "lombo", "pernil", "peru", "file", "filé", "coxa", "sobrecoxa", "camarao",
  ]],
  ["pao", ["pao", "torrada", "biscoito", "bolacha"]],
  ["carbo", [
    "arroz", "batata", "mandioca", "aipim", "macaxeira", "inhame", "cara",
    "macarrao", "massa", "cuscuz", "aveia", "tapioca", "polenta", "fuba",
    "quinoa", "milho", "pure",
  ]],
  ["fruta", ["banana", "maca", "mamao", "laranja", "morango", "abacaxi", "uva", "manga", "melancia", "pera", "kiwi", "melao", "goiaba", "ameixa", "abacate"]],
  ["vegetal", [
    "brocolis", "tomate", "alface", "couve", "cenoura", "abobrinha", "espinafre",
    "pepino", "pimentao", "cebola", "alho", "chuchu", "beterraba", "repolho",
    "rucula", "acelga", "abobora", "quiabo", "berinjela", "aspargo",
  ]],
];

export function classifyFood(food: {
  name: string; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number;
}): FoodCategory {
  const n = norm(food.name);
  for (const [cat, terms] of KEYWORDS) {
    if (terms.some((t) => n.includes(t))) return cat;
  }
  // fallback por macro
  const { protein_per_100g: p, carbs_per_100g: c, fat_per_100g: g } = food;
  if (p >= 15 && c < 15) return "proteina_animal";
  if (c >= 40) return "carbo";
  if (g >= 50) return "gordura";
  return "outro";
}
```

- [ ] **Step 4: Rodar (passa)** — `npx vitest run tests/unit/coherence.test.ts`. Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/coherence.ts tests/unit/coherence.test.ts
git commit -m "feat: classifyFood — categoria de alimento por nome/macro"
```

---

## Task 2: `mealTypeFromName`

**Files:**
- Modify: `src/lib/nutrition/coherence.ts`
- Test: `tests/unit/coherence.test.ts`

**Interfaces:**
- Produces:
  - `type MealType = "cafe" | "lanche" | "principal"`
  - `mealTypeFromName(name: string, index: number, total: number): MealType`

- [ ] **Step 1: Teste que falha** — adicione a `tests/unit/coherence.test.ts` (importe também `mealTypeFromName`):

```ts
import { mealTypeFromName } from "@/lib/nutrition/coherence";

describe("mealTypeFromName", () => {
  it("por nome", () => {
    expect(mealTypeFromName("Café da manhã", 0, 5)).toBe("cafe");
    expect(mealTypeFromName("Almoço", 2, 5)).toBe("principal");
    expect(mealTypeFromName("Jantar", 4, 5)).toBe("principal");
    expect(mealTypeFromName("Lanche/pré-treino", 1, 5)).toBe("lanche");
    expect(mealTypeFromName("Ceia", 5, 6)).toBe("lanche");
  });
  it("fallback por posição (nomes genéricos)", () => {
    expect(mealTypeFromName("Refeição 1", 0, 4)).toBe("cafe");
    expect(mealTypeFromName("Refeição 3", 2, 4)).toBe("principal");
  });
});
```

- [ ] **Step 2: Rodar (falha)** — `npx vitest run tests/unit/coherence.test.ts`. Esperado: FAIL (`mealTypeFromName` indefinido).

- [ ] **Step 3: Implementar** — adicione a `src/lib/nutrition/coherence.ts`:

```ts
export type MealType = "cafe" | "lanche" | "principal";

export function mealTypeFromName(name: string, index: number, _total: number): MealType {
  const n = norm(name);
  if (n.includes("cafe") || n.includes("manha")) return "cafe";
  if (n.includes("lanche") || n.includes("pre-treino") || n.includes("pos-treino") || n.includes("ceia"))
    return "lanche";
  if (n.includes("almoco") || n.includes("jantar")) return "principal";
  // fallback por posição: primeira = café; demais = principal
  return index === 0 ? "cafe" : "principal";
}
```

- [ ] **Step 4: Rodar (passa)** — `npx vitest run tests/unit/coherence.test.ts`. Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/coherence.ts tests/unit/coherence.test.ts
git commit -m "feat: mealTypeFromName — café/lanche/principal por nome ou posição"
```

---

## Task 3: `coherenceGuidance`

**Files:**
- Modify: `src/lib/nutrition/coherence.ts`
- Test: `tests/unit/coherence.test.ts`

**Interfaces:**
- Consumes: `MealType` (Task 2).
- Produces: `coherenceGuidance(mealType: MealType): string` e `coherenceRulesGeneral(): string`.

- [ ] **Step 1: Teste que falha** — adicione (importe `coherenceGuidance`, `coherenceRulesGeneral`):

```ts
import { coherenceGuidance, coherenceRulesGeneral } from "@/lib/nutrition/coherence";

describe("coherenceGuidance", () => {
  it("regras gerais mencionam 1 proteína e arroz+feijão", () => {
    const g = coherenceRulesGeneral();
    expect(g).toMatch(/proteína animal/i);
    expect(g).toMatch(/arroz \+ feijão/i);
  });
  it("molde por tipo", () => {
    expect(coherenceGuidance("cafe")).toMatch(/café da manhã/i);
    expect(coherenceGuidance("principal")).toMatch(/vegetal|salada/i);
    expect(coherenceGuidance("lanche")).toMatch(/leve/i);
  });
});
```

- [ ] **Step 2: Rodar (falha)** — `npx vitest run tests/unit/coherence.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar** — adicione a `coherence.ts`:

```ts
export function coherenceRulesGeneral(): string {
  return (
    "Monte pratos que fazem sentido juntos e são palatáveis. No máximo UMA proteína animal " +
    "principal por refeição (carne OU frango OU peixe) — ovo, feijão e laticínios são complementos " +
    "e podem acompanhar. Não empilhe carboidratos base (escolha arroz OU macarrão OU batata; " +
    "arroz + feijão é permitido). Escolha alimentos adequados ao horário da refeição."
  );
}

export function coherenceGuidance(mealType: MealType): string {
  switch (mealType) {
    case "cafe":
      return "Café da manhã: base de carboidrato (pão/aveia/tapioca) + proteína leve (ovo/iogurte/leite/queijo) + fruta opcional. Nada de arroz+feijão+bife no café.";
    case "lanche":
      return "Lanche: algo leve — fruta + proteína (iogurte/whey/leite) ou oleaginosas.";
    case "principal":
      return "Almoço/Jantar: 1 proteína animal + 1 carboidrato + feijão opcional + um vegetal/salada + gordura boa opcional (azeite).";
  }
}
```

- [ ] **Step 4: Rodar (passa)** — `npx vitest run tests/unit/coherence.test.ts`. Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/coherence.ts tests/unit/coherence.test.ts
git commit -m "feat: coherenceGuidance — regras gerais + molde por tipo de refeição"
```

---

## Task 4: `enforceCoherence` (a guarda)

**Files:**
- Modify: `src/lib/nutrition/coherence.ts`
- Test: `tests/unit/coherence.test.ts`

**Interfaces:**
- Consumes: `FoodCategory` (Task 1).
- Produces:
  - `enforceCoherence<T>(items: T[], info: (it: T) => { category: FoodCategory; protein_g: number; carbs_g: number }): T[]`

- [ ] **Step 1: Teste que falha** — adicione (importe `enforceCoherence`):

```ts
import { enforceCoherence } from "@/lib/nutrition/coherence";
import type { FoodCategory } from "@/lib/nutrition/coherence";

type I = { id: string; cat: FoodCategory; p: number; c: number };
const run = (items: I[]) =>
  enforceCoherence(items, (it) => ({ category: it.cat, protein_g: it.p, carbs_g: it.c })).map((x) => x.id);

describe("enforceCoherence", () => {
  it("frango+carne → mantém só a proteína de maior proteína", () => {
    const r = run([
      { id: "frango", cat: "proteina_animal", p: 30, c: 0 },
      { id: "carne", cat: "proteina_animal", p: 45, c: 0 },
      { id: "arroz", cat: "carbo", p: 3, c: 40 },
      { id: "salada", cat: "vegetal", p: 1, c: 3 },
    ]);
    expect(r).toEqual(["carne", "arroz", "salada"]);
  });
  it("arroz+macarrão+batata → 1 carbo (o de maior carbo)", () => {
    const r = run([
      { id: "arroz", cat: "carbo", p: 3, c: 40 },
      { id: "macarrao", cat: "carbo", p: 8, c: 60 },
      { id: "batata", cat: "carbo", p: 1, c: 20 },
    ]);
    expect(r).toEqual(["macarrao"]);
  });
  it("arroz+feijão+carne+brócolis → intacto", () => {
    const r = run([
      { id: "carne", cat: "proteina_animal", p: 40, c: 0 },
      { id: "arroz", cat: "carbo", p: 3, c: 40 },
      { id: "feijao", cat: "leguminosa", p: 5, c: 14 },
      { id: "brocolis", cat: "vegetal", p: 3, c: 4 },
    ]);
    expect(r).toEqual(["carne", "arroz", "feijao", "brocolis"]);
  });
  it("pão conta como carbo-base junto de aveia → mantém 1", () => {
    const r = run([
      { id: "aveia", cat: "carbo", p: 14, c: 66 },
      { id: "pao", cat: "pao", p: 9, c: 49 },
    ]);
    expect(r).toEqual(["aveia"]);
  });
  it("só proteínas → mantém 1", () => {
    const r = run([
      { id: "frango", cat: "proteina_animal", p: 30, c: 0 },
      { id: "ovo", cat: "ovo", p: 13, c: 1 },
    ]);
    // ovo é complemento (não é proteina_animal) → mantém ambos
    expect(r).toEqual(["frango", "ovo"]);
  });
});
```

- [ ] **Step 2: Rodar (falha)** — `npx vitest run tests/unit/coherence.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar** — adicione a `coherence.ts`:

```ts
// Categorias limitadas a 1 por refeição e critério de "melhor" (qual manter).
export function enforceCoherence<T>(
  items: T[],
  info: (it: T) => { category: FoodCategory; protein_g: number; carbs_g: number },
): T[] {
  const meta = items.map((it) => ({ it, ...info(it) }));

  // grupo carbo-base = carbo + pao; critério: maior carbs_g
  const isCarbBase = (c: FoodCategory) => c === "carbo" || c === "pao";

  const keptProtein = bestIndex(meta, (m) => m.category === "proteina_animal", (m) => m.protein_g);
  const keptCarb = bestIndex(meta, (m) => isCarbBase(m.category), (m) => m.carbs_g);

  return meta
    .filter((m, i) => {
      if (m.category === "proteina_animal") return i === keptProtein;
      if (isCarbBase(m.category)) return i === keptCarb;
      return true; // complementos: leguminosa, vegetal, fruta, laticinio, ovo, gordura, oleaginosa, outro
    })
    .map((m) => m.it);
}

function bestIndex<T>(
  meta: T[], match: (m: T) => boolean, score: (m: T) => number,
): number {
  let best = -1, bestScore = -Infinity;
  meta.forEach((m, i) => {
    if (match(m) && score(m) > bestScore) { best = i; bestScore = score(m); }
  });
  return best;
}
```

- [ ] **Step 4: Rodar (passa) + suíte** — `npx vitest run tests/unit/coherence.test.ts` (PASS) e `npx vitest run` (tudo verde). `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/coherence.ts tests/unit/coherence.test.ts
git commit -m "feat: enforceCoherence — guarda subtrativa (1 proteína animal, 1 carbo-base)"
```

---

## Task 5: Reforçar o prompt — `src/lib/ai/menu.ts`

**Files:**
- Modify: `src/lib/ai/menu.ts`

**Interfaces:**
- Consumes: `classifyFood`, `mealTypeFromName`, `coherenceGuidance`, `coherenceRulesGeneral` (Tasks 1-3).
- Produces (assinaturas atualizadas — Task 6 depende delas):
  - `generateMenu` passa a aceitar `subTargets` com campo opcional `mealType?: MealType` por refeição.
  - `suggestMealOption` passa a aceitar `mealType?: MealType`.
  - `PoolFood` ganha `categoria?: string` (opcional; se ausente, o BASE calcula a partir dos macros/nome — mas os callers vão preencher).

- [ ] **Step 1: Implementar** — em `src/lib/ai/menu.ts`:

  1. No topo, importe:
  ```ts
  import { classifyFood, coherenceGuidance, coherenceRulesGeneral, type MealType } from "@/lib/nutrition/coherence";
  ```

  2. `generateMenu`: (a) reforce o `BASE`; (b) anexe categoria a cada food e tipo/molde a cada refeição no `user content`.
  ```ts
  export async function generateMenu(input: {
    subTargets: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; mealType?: MealType }[];
    options: number;
    pool: { id: string; name: string; kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number; unit_name: string | null; unit_grams: number | null }[];
    guidance?: string;
  }): Promise<RawMenu> {
    const client = openaiClient();
    const BASE =
      "Você é nutricionista. Monte um cardápio brasileiro. Para CADA refeição, gere exatamente " +
      `${input.options} opções DISTINTAS. Cada opção é uma lista de itens que APROXIMA a meta de macros ` +
      "daquela refeição (priorize bater a PROTEÍNA). Use SOMENTE alimentos do pool, referenciando food_id. " +
      "quantity é em gramas quando unit='g', ou número de unidades quando unit='unit' (só use unit='unit' " +
      "se o alimento tiver unit_grams). Varie os alimentos entre as opções. " +
      coherenceRulesGeneral() +
      " Cada refeição tem 'tipo' e 'molde'; siga o molde do tipo. Cada alimento traz 'categoria' — use para montar pratos coerentes.";
    const system = BASE + (input.guidance ? " " + input.guidance : "");
    const refeicoes = input.subTargets.map((s) => ({
      name: s.name, kcal: s.kcal, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g,
      tipo: s.mealType ?? null,
      molde: s.mealType ? coherenceGuidance(s.mealType) : null,
    }));
    const pool = input.pool.map((f) => ({ ...f, categoria: classifyFood(f) }));
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ refeicoes, pool }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "menu", strict: true, schema: SCHEMA } },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("Resposta vazia da IA");
    const raw = JSON.parse(content) as RawMenu;
    return validateMenu(raw, new Set(input.pool.map((f) => f.id)));
  }
  ```

  3. `suggestMealOption`: aceite `mealType?` e injete molde + regras + categorias.
  ```ts
  export async function suggestMealOption(input: {
    target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
    pool: PoolFood[];
    include: string[];
    exclude: string[];
    guidance?: string;
    mealType?: MealType;
  }): Promise<RawItem[]> {
    const client = openaiClient();
    const excludeSet = new Set(input.exclude);
    const usablePool = input.pool.filter((f) => !excludeSet.has(f.id));
    const BASE =
      "Você é nutricionista. Monte UMA opção de refeição brasileira que APROXIME a meta de macros " +
      "(priorize bater a proteína). Use SOMENTE food_id do pool. Inclua OBRIGATORIAMENTE os food_id de 'incluir'. " +
      "quantity é em gramas (unit='g') ou nº de unidades (unit='unit', só se o alimento tiver unit_grams). " +
      coherenceRulesGeneral() +
      (input.mealType ? " " + coherenceGuidance(input.mealType) : "") +
      " Cada alimento traz 'categoria' — use para montar um prato coerente.";
    const system = BASE + (input.guidance ? " " + input.guidance : "");
    const poolWithCat = usablePool.map((f) => ({ ...f, categoria: classifyFood(f) }));
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ meta: input.target, incluir: input.include, pool: poolWithCat }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "meal_option", strict: true, schema: OPTION_SCHEMA } },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("Resposta vazia da IA");
    const raw = JSON.parse(content) as { items: RawItem[] };
    const items = validateItems(raw.items ?? [], input.pool, input.include, input.exclude);
    if (items.length === 0) throw new Error("A IA não retornou itens válidos");
    return items;
  }
  ```

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` → 0 erros. `npx vitest run` → verde (nenhum teste de menu quebra; as mudanças são aditivas). O `classifyFood(f)` recebe um objeto com `name`+macros — `PoolFood` tem esses campos, ok.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/menu.ts
git commit -m "feat: prompt de cardápio com regras de coerência, tipo/molde e categoria dos alimentos"
```

---

## Task 6: Aplicar a guarda — `generate.ts` e rota `suggest-option`

**Files:**
- Modify: `src/lib/ai/generate.ts`
- Modify: `src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts`

**Interfaces:**
- Consumes: `enforceCoherence`, `classifyFood`, `mealTypeFromName` (Tasks 1,2,4); `itemGrams` (`@/lib/nutrition/macros`); `generateMenu`/`suggestMealOption` atualizados (Task 5).

- [ ] **Step 1: `generate.ts`** — em `src/lib/ai/generate.ts`:

  1. Importe:
  ```ts
  import { classifyFood, mealTypeFromName, enforceCoherence } from "@/lib/nutrition/coherence";
  import { itemGrams } from "@/lib/nutrition/macros";
  ```

  2. Passe `mealType` a cada sub-meta antes de chamar `generateMenu`:
  ```ts
  const subTargets = mealSubTargets(dayType, n);
  const subWithType = subTargets.map((s, i) => ({ ...s, mealType: mealTypeFromName(s.name, i, subTargets.length) }));
  ```
  e use `subTargets: subWithType` na chamada `generateMenu({ ... })`.

  3. Na montagem das opções, aplique `enforceCoherence` **antes** do `scaleOptionToTarget`:
  ```ts
  const withFood = opt.items
    .map((it) => ({ ...it, food: filteredMap.get(it.food_id)! }))
    .filter((it) => it.food);
  const coherent = enforceCoherence(withFood, (it) => {
    const grams = itemGrams(it, it.food);
    return {
      category: classifyFood(it.food),
      protein_g: (it.food.protein_per_100g * grams) / 100,
      carbs_g: (it.food.carbs_per_100g * grams) / 100,
    };
  });
  const scaled: ProposalItem[] = scaleOptionToTarget(coherent, { kcal: sub.kcal, protein_g: sub.protein_g })
    .map((it) => ({ food_id: it.food.id, quantity: it.quantity, unit: it.unit, food: it.food }));
  ```
  (Observação: `itemGrams(it, food)` — `it` tem `quantity` e `unit`; confira a assinatura real de `itemGrams` em `macros.ts` e ajuste os argumentos se necessário.)

- [ ] **Step 2: Rota `suggest-option`** — em `src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts`:

  1. Importe:
  ```ts
  import { classifyFood, mealTypeFromName, enforceCoherence } from "@/lib/nutrition/coherence";
  import { itemGrams } from "@/lib/nutrition/macros";
  ```

  2. Derive o `mealType` do slot e passe ao `suggestMealOption`:
  ```ts
  const mealType = mealTypeFromName(slotName, idx, n);
  // ...
  rawItems = await suggestMealOption({
    target: sub, pool: prefPool, include: includeWithPrefs, exclude,
    guidance: prefsPromptSnippet(prefs), mealType,
  });
  ```

  3. Aplique `enforceCoherence` entre `withFood` e `scaleOptionToTarget`:
  ```ts
  const withFood = rawItems
    .map((it) => ({ ...it, food: prefMap.get(it.food_id)! }))
    .filter((it) => it.food);
  const coherent = enforceCoherence(withFood, (it) => {
    const grams = itemGrams(it, it.food);
    return {
      category: classifyFood(it.food),
      protein_g: (it.food.protein_per_100g * grams) / 100,
      carbs_g: (it.food.carbs_per_100g * grams) / 100,
    };
  });
  const scaled = scaleOptionToTarget(coherent, { kcal: sub.kcal, protein_g: sub.protein_g });
  ```

- [ ] **Step 3: Verificar** — `npx tsc --noEmit` → 0. `npx vitest run` → verde. `npx playwright test` → **1 passed** (o E2E determinístico não usa IA, mas exercita `generate`/`apply` e o dashboard — garante que a fiação não quebrou o contrato). Se `.next` stale atrapalhar o tsc, `npx next typegen` (não commitar `.next`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/generate.ts "src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts"
git commit -m "feat: aplica enforceCoherence no generate (C1/semana) e no suggest-option (C2)"
```

---

## Task 7: Nomes de refeição melhores para n=3,4,6

**Files:**
- Modify: `src/lib/nutrition/solver.ts`
- Test: `tests/unit/solver.test.ts`

**Interfaces:**
- Consumes/Produces: `mealSubTargets` (assinatura inalterada; só melhora os `name` default).

- [ ] **Step 1: Teste que falha** — adicione a `tests/unit/solver.test.ts`:

```ts
it("nomes default por refeição comum (n=3,4,6)", () => {
  const dt = { target_kcal: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 60 };
  expect(mealSubTargets(dt, 3).map((m) => m.name)).toEqual(["Café da manhã", "Almoço", "Jantar"]);
  expect(mealSubTargets(dt, 4).map((m) => m.name)).toEqual(["Café da manhã", "Almoço", "Lanche", "Jantar"]);
  expect(mealSubTargets(dt, 6).map((m) => m.name)).toEqual(["Café da manhã", "Lanche", "Almoço", "Lanche", "Jantar", "Ceia"]);
});
```
(Se o arquivo ainda não importa `mealSubTargets`, adicione o import de `@/lib/nutrition/solver`.)

- [ ] **Step 2: Rodar (falha)** — `npx vitest run tests/unit/solver.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar** — em `src/lib/nutrition/solver.ts`, substitua o bloco de `names`/`weights` por tabelas por `n` (mantendo `n=5` e o fallback):

```ts
const NAMES_BY_N: Record<number, string[]> = {
  3: ["Café da manhã", "Almoço", "Jantar"],
  4: ["Café da manhã", "Almoço", "Lanche", "Jantar"],
  5: ["Café da manhã", "Lanche/pré-treino", "Almoço", "Lanche/pré-treino", "Jantar"],
  6: ["Café da manhã", "Lanche", "Almoço", "Lanche", "Jantar", "Ceia"],
};
const WEIGHTS_BY_N: Record<number, number[]> = {
  3: [0.25, 0.4, 0.35],
  4: [0.25, 0.35, 0.1, 0.3],
  5: [0.2, 0.1, 0.3, 0.15, 0.25],
  6: [0.2, 0.1, 0.28, 0.1, 0.22, 0.1],
};
```
e no corpo de `mealSubTargets`:
```ts
const names = NAMES_BY_N[n] ?? Array.from({ length: n }, (_, i) => `Refeição ${i + 1}`);
const weights = WEIGHTS_BY_N[n] ?? Array.from({ length: n }, () => 1 / n);
```
(Remova as consts antigas `DEFAULT_5_NAMES`/`DEFAULT_5_WEIGHTS` e a lógica `n === 5 ? ...`.)

- [ ] **Step 4: Rodar (passa) + suíte** — `npx vitest run tests/unit/solver.test.ts` (PASS) e `npx vitest run` (tudo verde — confira que testes existentes de `n=5` continuam ok; os pesos de n=5 são idênticos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/solver.ts tests/unit/solver.test.ts
git commit -m "feat: nomes/pesos default de refeição para n=3,4,6 (melhora o tipo de refeição)"
```

---

## Self-Review

**1. Cobertura do spec:**
- Categorizar alimento (`classifyFood`) → Task 1. ✔
- Tipo de refeição (`mealTypeFromName`) → Task 2. ✔
- Moldes/regras no prompt (`coherenceGuidance`/`coherenceRulesGeneral`) → Task 3, fiado na Task 5. ✔
- Guarda subtrativa (`enforceCoherence`: 1 proteína animal, 1 carbo-base, arroz+feijão intacto) → Task 4, aplicada Task 6. ✔
- Prompt reforçado com tipo/molde/categoria → Task 5. ✔
- Fiar nos 3 geradores (C1/E2 via `generate.ts`; C2 via rota) → Task 6 (E2 herda por reuso). ✔
- Nomes default n=3,4,6 → Task 7. ✔
- Testes: unit das 4 funções + solver; E2E existente verde → Tasks 1-4,6,7. ✔

**2. Placeholders:** nenhum — todo passo com código/comandos concretos. Única nota de verificação: conferir a assinatura real de `itemGrams` (Task 6) — instrução explícita de ajustar os argumentos se diferir.

**3. Consistência de tipos:** `FoodCategory` (Task 1) usado em `enforceCoherence` (Task 4) e no wiring (Task 6); `MealType` (Task 2) usado em `coherenceGuidance` (Task 3), `generateMenu`/`suggestMealOption` (Task 5) e no wiring (Task 6); `enforceCoherence(items, info)` com `info → {category, protein_g, carbs_g}` idêntico entre Task 4 (teste) e Task 6 (uso). `mealSubTargets` inalterada (Task 7).

**Nota:** sem migração/segredo novo; guarda é subtrativa (não quebra o solver). Feature melhora C1, C2 e a semana (E2) de uma vez.
