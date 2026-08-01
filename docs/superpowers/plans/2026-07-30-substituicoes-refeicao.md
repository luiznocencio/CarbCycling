# Substituições Manuais de Refeição + Solver (Feature C2) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** Permitir criar novas opções de uma refeição (manual e por IA com ingredientes fixados/evitados) e apertar a distribuição de macros com um solver que bate kcal + proteína (usado também pelo gerador C1).

**Architecture:** `solver.ts` ganha `scaleOptionToTarget` (sistema linear de 2 grupos, fallback só-kcal). `menu.ts` ganha `suggestMealOption` (IA de refeição única) + `validateItems` (puro). Um endpoint `suggest-option` cria uma opção por IA num slot; opções manuais reusam `POST /api/meals`. O editor de dia ganha os botões.

**Tech Stack:** Next.js 16 · TypeScript · Tailwind v4 · Supabase · OpenAI `gpt-4o-mini` · Vitest · Playwright.

## Global Constraints

- **Next 16:** `params`/`cookies()` async; `proxy.ts`. Ver `docs/superpowers/NEXT16-DECISIONS.md`.
- **IA server-side apenas; `OPENAI_API_KEY` segredo** (env, nunca `NEXT_PUBLIC`, nunca commitada; já em `.env.local` + Vercel).
- **IA nunca é fonte de verdade numérica:** ids validados contra o pool + `exclude`; solver fixa quantidades.
- **Gramas = fonte de verdade** (`itemGrams`/`mealMacros`). Determinístico onde possível (solver puro).
- **Sem migração nova** — reusa `meals`/`meal_items`/`food_favorites`.
- **RLS por usuário**; rotas usam `createServerSupabase` + `auth.getUser()`.
- **Supabase project id:** `pxzpxtzueeketotrlslj`.

---

## Estrutura de arquivos

```
src/lib/nutrition/solver.ts     # + scaleOptionToTarget (Task 1)
src/lib/ai/menu.ts              # + suggestMealOption + validateItems (Task 2)
src/app/api/day-types/[id]/generate/route.ts          # usa scaleOptionToTarget (Task 1)
src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts  # novo (Task 3)
src/components/DayEditor.tsx     # + Nova opção / Sugerir com IA (Task 4)
tests/unit/solver.test.ts       # + scaleOptionToTarget (Task 1)
tests/unit/menu.test.ts         # + validateItems (Task 2)
tests/e2e/flow.spec.ts          # opção manual num slot (Task 5)
```

---

## Task 1: Solver kcal+proteína + aplicar no gerador

**Files:**
- Modify: `src/lib/nutrition/solver.ts`, `tests/unit/solver.test.ts`, `src/app/api/day-types/[id]/generate/route.ts`

**Interfaces:**
- Consumes: `Food` (types), `itemMacros`/`mealMacros` (`@/lib/nutrition/macros`), `scaleOptionToKcal` (mesmo arquivo).
- Produces: `scaleOptionToTarget(items: { quantity: number; unit: "g" | "unit"; food: Food }[], target: { kcal: number; protein_g: number }): { quantity: number; unit: "g" | "unit"; food: Food }[]`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/unit/solver.test.ts`, adicione (após os imports existentes, incluindo `scaleOptionToTarget` no import de `@/lib/nutrition/solver` e `mealMacros` de `@/lib/nutrition/macros`):
```ts
import { mealMacros } from "@/lib/nutrition/macros";

const frango: Food = {
  id: "f", user_id: null, name: "Frango", is_custom: false,
  kcal_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6,
  unit_name: null, unit_grams: null,
};

describe("scaleOptionToTarget", () => {
  it("bate kcal e proteína quando viável (2 grupos)", () => {
    const r = scaleOptionToTarget(
      [
        { quantity: 100, unit: "g" as const, food: frango },
        { quantity: 100, unit: "g" as const, food: arroz },
      ],
      { kcal: 500, protein_g: 40 },
    );
    const m = mealMacros(r);
    expect(Math.abs(m.kcal - 500)).toBeLessThanOrEqual(3);
    expect(Math.abs(m.protein_g - 40)).toBeLessThanOrEqual(2);
  });
  it("inviável (um só grupo) → fallback só-kcal", () => {
    const r = scaleOptionToTarget([{ quantity: 100, unit: "g", food: frango }], {
      kcal: 330,
      protein_g: 10,
    });
    expect(r[0].quantity).toBe(200); // 330/165 = 2
  });
});
```
(O fixture `arroz` já existe no arquivo. Se o `mealMacros` já estiver importado, não duplique.)

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/solver.test.ts`
Expected: FAIL — `scaleOptionToTarget` não existe.

- [ ] **Step 3: Implementar `scaleOptionToTarget`**

Em `src/lib/nutrition/solver.ts`, adicione o import de `itemMacros` (junte ao import de `mealMacros`
existente: `import { mealMacros, itemMacros } from "@/lib/nutrition/macros";`) e a função:
```ts
export function scaleOptionToTarget(
  items: { quantity: number; unit: "g" | "unit"; food: Food }[],
  target: { kcal: number; protein_g: number },
): { quantity: number; unit: "g" | "unit"; food: Food }[] {
  if (items.length === 0) return items;
  const targetFrac = target.kcal > 0 ? (target.protein_g * 4) / target.kcal : 0;
  const groupA: typeof items = [];
  const groupB: typeof items = [];
  for (const it of items) {
    const m = itemMacros(it, it.food);
    const frac = m.kcal > 0 ? (m.protein_g * 4) / m.kcal : 0;
    (frac > targetFrac ? groupA : groupB).push(it);
  }
  if (groupA.length === 0 || groupB.length === 0) {
    return scaleOptionToKcal(items, target.kcal);
  }
  const macA = mealMacros(groupA);
  const macB = mealMacros(groupB);
  const Ka = macA.kcal, Pa = macA.protein_g, Kb = macB.kcal, Pb = macB.protein_g;
  const det = Ka * Pb - Kb * Pa;
  if (det === 0) return scaleOptionToKcal(items, target.kcal);
  const a = (target.kcal * Pb - target.protein_g * Kb) / det;
  const b = (Ka * target.protein_g - Pa * target.kcal) / det;
  if (!isFinite(a) || !isFinite(b) || a < 0 || b < 0) {
    return scaleOptionToKcal(items, target.kcal);
  }
  const inA = new Set(groupA);
  return items.map((it) => ({ ...it, quantity: round1(it.quantity * (inA.has(it) ? a : b)) }));
}
```
(`round1` e `scaleOptionToKcal` já existem no arquivo.)

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/unit/solver.test.ts`
Expected: PASS.

- [ ] **Step 5: Usar no gerador C1**

Em `src/app/api/day-types/[id]/generate/route.ts`:
- No import de `@/lib/nutrition/solver`, adicione `scaleOptionToTarget`.
- Troque a linha `const scaled = scaleOptionToKcal(withFood, sub.kcal);` por:
```ts
      const scaled = scaleOptionToTarget(withFood, { kcal: sub.kcal, protein_g: sub.protein_g });
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` 0 erros; vitest verde.

- [ ] **Step 7: Commit**
```bash
git add src/lib/nutrition/solver.ts tests/unit/solver.test.ts "src/app/api/day-types/[id]/generate/route.ts"
git commit -m "feat: kcal+protein solver (scaleOptionToTarget) used by generator"
```

---

## Task 2: IA de refeição única (suggestMealOption + validateItems)

**Files:**
- Modify: `src/lib/ai/menu.ts`, `tests/unit/menu.test.ts`

**Interfaces:**
- Consumes: `openaiClient` (`@/lib/ai/openai`), tipos existentes de `menu.ts`.
- Produces:
  - `type PoolFood = { id: string; name: string; kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number; unit_name: string | null; unit_grams: number | null }`
  - `validateItems(rawItems: RawItem[], pool: PoolFood[], include: string[], exclude: string[]): RawItem[]` (puro; descarta ids fora do pool, ids em `exclude`, itens inválidos; força os `include` ausentes com quantidade base).
  - `suggestMealOption(input: { target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }; pool: PoolFood[]; include: string[]; exclude: string[] }): Promise<RawItem[]>` (server-only).

- [ ] **Step 1: Teste de `validateItems` (falha primeiro)**

Em `tests/unit/menu.test.ts`, adicione (importe `validateItems` e `type PoolFood` de `@/lib/ai/menu`):
```ts
import { validateItems, type PoolFood } from "@/lib/ai/menu";

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
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/menu.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar em `menu.ts`**

Em `src/lib/ai/menu.ts`, adicione (reusando `RawItem`, `openaiClient` já importados/definidos):
```ts
export type PoolFood = {
  id: string; name: string;
  kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number;
  unit_name: string | null; unit_grams: number | null;
};

export function validateItems(
  rawItems: RawItem[],
  pool: PoolFood[],
  include: string[],
  exclude: string[],
): RawItem[] {
  const byId = new Map(pool.map((f) => [f.id, f]));
  const excludeSet = new Set(exclude);
  const items = rawItems.filter(
    (it) =>
      byId.has(it.food_id) &&
      !excludeSet.has(it.food_id) &&
      (it.unit === "g" || it.unit === "unit") &&
      it.quantity > 0,
  );
  const present = new Set(items.map((i) => i.food_id));
  for (const id of include) {
    const f = byId.get(id);
    if (f && !present.has(id) && !excludeSet.has(id)) {
      items.push(
        f.unit_grams
          ? { food_id: id, quantity: 1, unit: "unit" }
          : { food_id: id, quantity: 50, unit: "g" },
      );
    }
  }
  return items;
}

const OPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["food_id", "quantity", "unit"],
        properties: {
          food_id: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: ["g", "unit"] },
        },
      },
    },
  },
} as const;

export async function suggestMealOption(input: {
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  pool: PoolFood[];
  include: string[];
  exclude: string[];
}): Promise<RawItem[]> {
  const client = openaiClient();
  const excludeSet = new Set(input.exclude);
  const usablePool = input.pool.filter((f) => !excludeSet.has(f.id));
  const system =
    "Você é nutricionista. Monte UMA opção de refeição brasileira que APROXIME a meta de macros " +
    "(priorize bater a proteína). Use SOMENTE food_id do pool. Inclua OBRIGATORIAMENTE os food_id de 'incluir'. " +
    "quantity é em gramas (unit='g') ou nº de unidades (unit='unit', só se o alimento tiver unit_grams).";
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({ meta: input.target, incluir: input.include, pool: usablePool }),
      },
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

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/unit/menu.test.ts`
Expected: PASS (`suggestMealOption` não é chamado no teste).

- [ ] **Step 5: Commit**
```bash
git add src/lib/ai/menu.ts tests/unit/menu.test.ts
git commit -m "feat: single-meal AI suggestion (suggestMealOption + validateItems)"
```

---

## Task 3: Endpoint suggest-option

**Files:**
- Create: `src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `mealSubTargets`/`scaleOptionToTarget` (Task 1), `suggestMealOption`/`PoolFood` (Task 2), `data/basics.json`, `food_favorites`/`day_types`/`meals`/`meal_items`, `Food`.
- Produces: `POST /api/day-types/[id]/slots/[slot]/suggest-option` (body `{ include: string[]; exclude: string[] }`) → cria uma opção (meal + meal_items, `selected=false`) no slot e a retorna; 502 em falha da IA.

- [ ] **Step 1: Criar a rota**

Crie `src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { mealSubTargets, scaleOptionToTarget } from "@/lib/nutrition/solver";
import { suggestMealOption, type PoolFood } from "@/lib/ai/menu";
import basics from "@/../data/basics.json";
import type { Food } from "@/lib/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; slot: string }> },
) {
  const { id, slot } = await params;
  const slotNum = Number(slot);
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const include: string[] = Array.isArray(body.include) ? body.include : [];
  const exclude: string[] = Array.isArray(body.exclude) ? body.exclude : [];

  const { data: dayType } = await supabase.from("day_types").select("*").eq("id", id).maybeSingle();
  if (!dayType) return NextResponse.json({ error: "tipo de dia não encontrado" }, { status: 404 });

  // slots distintos do dia + posição do slot atual → sub-meta
  const { data: dayMeals } = await supabase
    .from("meals").select("slot, name, option_label").eq("day_type_id", id);
  const distinctSlots = [...new Set((dayMeals ?? []).map((m) => m.slot))].sort((a, b) => a - b);
  const n = distinctSlots.length || 1;
  const idx = Math.max(0, distinctSlots.indexOf(slotNum));
  const subTargets = mealSubTargets(dayType, n);
  const sub = subTargets[idx] ?? subTargets[subTargets.length - 1];
  const slotName = (dayMeals ?? []).find((m) => m.slot === slotNum)?.name ?? sub.name;
  const optionCount = (dayMeals ?? []).filter((m) => m.slot === slotNum).length;

  // pool = favoritos ∪ básicos ∪ include
  const { data: favRows } = await supabase.from("food_favorites").select("food_id");
  const favIds = (favRows ?? []).map((r) => r.food_id);
  const wantIds = [...new Set([...favIds, ...include])];
  const { data: favFoods } = wantIds.length
    ? await supabase.from("foods").select("*").in("id", wantIds)
    : { data: [] as Food[] };
  const { data: basicFoods } = await supabase
    .from("foods").select("*").is("user_id", null).in("name", basics as string[]);
  const poolMap = new Map<string, Food>();
  for (const f of [...(favFoods ?? []), ...(basicFoods ?? [])] as Food[]) poolMap.set(f.id, f);
  const pool: PoolFood[] = [...poolMap.values()].map((f) => ({
    id: f.id, name: f.name,
    kcal_per_100g: f.kcal_per_100g, protein_per_100g: f.protein_per_100g,
    carbs_per_100g: f.carbs_per_100g, fat_per_100g: f.fat_per_100g,
    unit_name: f.unit_name, unit_grams: f.unit_grams,
  }));
  if (pool.length === 0) {
    return NextResponse.json({ error: "Sem alimentos no pool. Favorite alguns alimentos." }, { status: 400 });
  }

  let rawItems;
  try {
    rawItems = await suggestMealOption({ target: sub, pool, include, exclude });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao sugerir opção" },
      { status: 502 },
    );
  }

  const withFood = rawItems
    .map((it) => ({ ...it, food: poolMap.get(it.food_id)! }))
    .filter((it) => it.food);
  const scaled = scaleOptionToTarget(withFood, { kcal: sub.kcal, protein_g: sub.protein_g });

  const { data: meal, error: mErr } = await supabase
    .from("meals")
    .insert({
      user_id: user.id, day_type_id: id, name: slotName,
      order: slotNum, slot: slotNum, option_label: `Opção ${optionCount + 1}`, selected: false,
    })
    .select().single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
  if (scaled.length) {
    const rows = scaled.map((it) => ({
      meal_id: meal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit,
    }));
    const { error: iErr } = await supabase.from("meal_items").insert(rows);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
  }
  return NextResponse.json({ meal });
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
git add "src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts"
git commit -m "feat: suggest-option endpoint (single-meal AI option in a slot)"
```

---

## Task 4: Editor de dia — "+ Nova opção" e "Sugerir com IA"

**Files:**
- Modify: `src/components/DayEditor.tsx`

**Interfaces:**
- Consumes: `POST /api/meals` (opção manual), `POST /api/day-types/[id]/slots/[slot]/suggest-option` (Task 3), tipos `Meal`/`Food`.
- Produces: na barra de opções de cada slot, botões `data-testid="add-option"` e `data-testid="suggest-option"` + seletor de incluir/evitar.

**Skill:** invoque `/frontend-design` para os botões e o seletor ficarem claros no mobile.

- [ ] **Step 1: Implementar**

Em `src/components/DayEditor.tsx`, na barra de opções de cada slot (onde ficam as abas):
- **"+ Nova opção"** (`add-option`): `POST /api/meals` com `{ day_type_id, name: <nome do slot>, slot: <slot>, order: <slot>, option_label: "Opção " + (nºOpções+1), selected: false }`. Ao criar, adiciona a nova `meal` ao estado local e seleciona a nova aba (para edição). O nome do slot e o nº de opções saem das `meals` já agrupadas por slot.
- **"Sugerir com IA"** (`suggest-option`): abre um seletor (busca de alimentos reusando `GET /api/foods?q=`) onde o usuário marca alimentos como **incluir** ou **evitar** (listas de `food_id`), com um botão "Sugerir". Ao confirmar: `POST /api/day-types/${dayTypeId}/slots/${slot}/suggest-option` com `{ include, exclude }`. Enquanto carrega, "Sugerindo..."; em erro (400/502) mostra a mensagem. Em sucesso, adiciona a `meal` retornada ao estado e mostra a nova aba. (Os itens vêm no reload das meals ou você refaz o fetch das meals do dia.)
- Mantenha tudo o que já existe (abas, selecionar, editar itens, excluir com promoção de irmã).

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` 0 erros; vitest verde.

- [ ] **Step 3: Commit**
```bash
git add src/components/DayEditor.tsx
git commit -m "feat: add manual option + AI suggest-option in day editor"
```

---

## Task 5: E2E — nova opção manual num slot

**Files:**
- Modify: `tests/e2e/flow.spec.ts`

**Interfaces:**
- Consumes: as abas de opção (C1) + "+ Nova opção" (Task 4) / `POST /api/meals`.
- Produces: E2E verde cobrindo a criação de uma opção manual e a troca entre opções.

- [ ] **Step 1: Passo no E2E**

No bloco 6 do E2E (que já aplica uma proposta fixa de 1 slot com 2 opções e confere as abas), adicione:
após aplicar e ver 2 `option-tab`, **crie uma 3ª opção manual** no slot 0 via API
`page.request.post('/api/meals', { data: { day_type_id: dayTypeId, name: "Teste", slot: 0, order: 0, option_label: "Opção 3", selected: false } })`,
recarregue a página do dia (`await page.goto('/day/' + dayTypeId)`) e assere que agora há **3** `option-tab`
(`await expect(page.getByTestId("option-tab")).toHaveCount(3)`). Selecionar a nova (vazia) deixa o
total do dia em 0 para aquele slot; então volte para a Opção 2 e confirme o total 495 novamente.
Confirme rótulos/refs lendo `DayEditor.tsx`.

> A sugestão por IA (`suggest-option`) NÃO é exercitada no E2E — é verificada no smoke manual.

- [ ] **Step 2: Rodar o E2E**

Run: `npx playwright test`
Expected: 1 passed.

- [ ] **Step 3: Suíte completa**

Run: `npx vitest run && npx playwright test`
Expected: unit (macros, bmr, weekly, solver, menu, taco, units-data, basics) e E2E verdes.

- [ ] **Step 4: Commit**
```bash
git add tests/e2e/flow.spec.ts
git commit -m "test: e2e adds a manual meal option to a slot"
```

---

## Self-Review

**1. Cobertura do spec:**
- Solver kcal+proteína (2 grupos + fallback) → Task 1 (com exemplo testado). ✔
- Aplicar no gerador C1 → Task 1 Step 5. ✔
- Opção manual (reusa `POST /api/meals`) → Task 4. ✔
- IA de refeição única (`suggestMealOption` + `validateItems`, include/exclude, força includes) → Task 2. ✔
- Endpoint `suggest-option` (sub-meta recalculada, pool fav∪básicos∪include, cria opção, 502) → Task 3. ✔
- UX (Nova opção / Sugerir com IA + seletor) → Task 4. ✔
- Testes: solver + validateItems unit; E2E opção manual → Tasks 1,2,5. ✔
- Sem migração → confirmado (nenhuma task cria migration). ✔

**2. Placeholders:** solver, `validateItems`, `suggestMealOption` e o endpoint com código completo.
UI (Task 4) com requisitos concretos + `data-testid` + `/frontend-design`.

**3. Consistência de tipos:** `scaleOptionToTarget` (Task 1) usado no gerador (Task 1) e no endpoint
(Task 3); `suggestMealOption`/`validateItems`/`PoolFood` (Task 2) usados no endpoint (Task 3); o
endpoint cria `meals`/`meal_items` no formato já existente; `sub` (de `mealSubTargets`) tem
`kcal`/`protein_g`/`carbs_g`/`fat_g` — consumidos por `scaleOptionToTarget` (`kcal`/`protein_g`) e
`suggestMealOption` (`target` completo).

**Nota:** o solver novo entra no gerador C1 (já em produção) — melhora os macros gerados; comportamento
retrocompatível (fallback preserva o caso só-kcal). Sem env/segredo novo.
