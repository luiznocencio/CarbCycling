# Alimentos por Unidade + Enriquecimento (Feature B) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar tarefa a tarefa. Passos usam checkbox (`- [ ]`).

**Goal:** Permitir tratar alimentos por unidade natural (1 ovo, 1 fatia) além de gramas, com a base TACO enriquecida com pesos por unidade, mantendo gramas como fonte de cálculo.

**Architecture:** `foods` ganha `unit_name`/`unit_grams` (opcionais); `meal_items` passa a guardar `quantity`+`unit` e as gramas são derivadas em runtime. O motor puro ganha `itemGrams`. Unidades da base TACO (imutável por RLS) são editadas por uma função `security definer` (`set_food_unit`). O enriquecimento é uma preparação de dados única (versionada em `units.json`).

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Vitest · Playwright.

## Global Constraints

- **Next 16:** `params`/`cookies()` assíncronos; middleware é `src/proxy.ts`. Ver `docs/superpowers/NEXT16-DECISIONS.md`.
- **App não chama LLM em runtime** — enriquecimento é dado versionado.
- **Gramas = fonte de verdade** do cálculo; unidade é conveniência (`itemGrams` deriva).
- **RLS por usuário**; app single-user. Rotas: `createServerSupabase` + `auth.getUser()` em escritas (padrão de `src/app/api/foods/`).
- **UI pt-BR, mobile-first.** Código/commits em inglês.
- **Supabase project id:** `pxzpxtzueeketotrlslj` (migrations via MCP `apply_migration`; dados via `execute_sql`).
- **Derivação de gramas (verbatim):** `unit='g'` → gramas = `quantity`; `unit='unit'` → gramas = `quantity × food.unit_grams` (0 se `unit_grams` nulo).

---

## Estrutura de arquivos

```
supabase/migrations/
  0003_food_units.sql          # foods unit cols + set_food_unit fn (Task 1)
  0004_meal_item_units.sql     # meal_items rename+unit (Task 5)
supabase/seed/units.ts         # aplica units.json (Task 2)
data/units.json                # enriquecimento gerado (Task 2)
src/lib/types.ts               # Food +unit; MealItem quantity_g→quantity+unit (Tasks 1,5)
src/lib/nutrition/macros.ts    # + itemGrams; itemMacros/mealMacros adaptados (Task 5)
src/app/api/foods/[id]/unit/route.ts   # PUT set_food_unit (Task 3)
src/app/api/foods/route.ts             # POST aceita unit_name/unit_grams (Task 3)
src/app/api/foods/[id]/route.ts        # PUT aceita unit_name/unit_grams (Task 3)
src/app/api/meal-items/route.ts        # quantity+unit (Task 5)
src/app/api/meals/route.ts             # GET retorna quantity+unit (Task 5)
src/components/FoodBank.tsx            # exibir/editar unidade (Task 4)
src/components/DayEditor.tsx           # toggle g|unidade + exibição (Task 6)
src/app/(app)/page.tsx                 # agregação usa quantity+unit (Task 6)
tests/unit/macros.test.ts             # itemGrams + itemMacros unidade (Task 5)
tests/unit/units-data.test.ts         # integridade de units.json (Task 2)
tests/e2e/flow.spec.ts                # item por unidade (Task 7)
```

---

## Task 1: Migration de unidades em `foods` + função + tipo

**Files:**
- Create: `supabase/migrations/0003_food_units.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: tabela `foods`.
- Produces: `foods.unit_name`/`unit_grams`; função `set_food_unit`; `Food` com `unit_name: string | null` e `unit_grams: number | null`.

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/0003_food_units.sql`:
```sql
alter table foods
  add column unit_name text,
  add column unit_grams numeric check (unit_grams > 0);

create or replace function set_food_unit(p_food_id uuid, p_unit_name text, p_unit_grams numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update foods
    set unit_name = p_unit_name, unit_grams = p_unit_grams
    where id = p_food_id and (user_id is null or user_id = auth.uid());
end;
$$;
revoke all on function set_food_unit(uuid, text, numeric) from public;
grant execute on function set_food_unit(uuid, text, numeric) to authenticated;
```

- [ ] **Step 2: Aplicar via MCP**

Carregue `select:mcp__366da671-5102-4665-8ade-cc7028d3395f__apply_migration` e rode
`apply_migration(project_id="pxzpxtzueeketotrlslj", name="food_units", query=<conteúdo>)`.
Expected: `{"success":true}`. Confirme com `list_tables` que `foods` tem `unit_name`/`unit_grams`.

- [ ] **Step 3: Estender o tipo `Food`**

Em `src/lib/types.ts`, na interface `Food`, adicione (após `is_custom`):
```ts
  unit_name: string | null;
  unit_grams: number | null;
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: exit 0 (o tipo é aditivo; nada quebra).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/0003_food_units.sql src/lib/types.ts
git commit -m "feat: food unit columns + set_food_unit rls-safe function"
```

---

## Task 2: Enriquecimento das unidades (units.json + seed + aplicar)

**Files:**
- Create: `data/units.json`
- Create: `supabase/seed/units.ts`
- Create: `tests/unit/units-data.test.ts`
- Modify: `package.json` (script `seed:units`)

**Interfaces:**
- Consumes: `data/taco.json` (597 nomes), tabela `foods` (Task 1).
- Produces: `data/units.json` aplicado à base TACO (`unit_name`/`unit_grams` onde faz sentido).

- [ ] **Step 1: Gerar `data/units.json`**

Leia `data/taco.json`. Para cada alimento com **unidade natural de consumo**, produza uma
entrada `{ "name": <nome EXATO da TACO>, "unit_name": <ex.: "ovo"|"fatia"|"unidade">, "unit_grams": <número> }`.
Regras (porções brasileiras típicas; use bom senso por item):
- Ovos de galinha inteiros → "ovo", 50. Pão francês → "unidade", 50. Pão de forma/de sanduíche → "fatia", 25.
- Frutas unitárias (banana, maçã, laranja, pera, kiwi, ovo de codorna, etc.) → "unidade" com peso típico (banana prata ~90, maçã ~130, laranja ~180, ovo de codorna ~10).
- Fatias de frios/queijos (mussarela, presunto, queijo prato) → "fatia" (~15–20).
- Biscoitos/bolachas unitárias → "unidade" (~6–8). Pães de queijo → "unidade" (~20).
- **Não** atribua unidade a granéis (arroz, feijão, farinhas, açúcar, óleos, carnes/peixes a granel, líquidos): deixe-os fora do JSON (ficam só gramas).
Formato do arquivo: um array JSON puro. Alvo: ~80–150 entradas. Só inclua alimentos cujo nome EXISTE em `data/taco.json`.

- [ ] **Step 2: Escrever o teste de integridade**

Crie `tests/unit/units-data.test.ts`:
```ts
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
```

- [ ] **Step 3: Rodar o teste (deve passar com o JSON gerado)**

Run: `npx vitest run tests/unit/units-data.test.ts`
Expected: PASS (4 testes). Se falhar por nome inexistente/duplicado, corrija `units.json`.

- [ ] **Step 4: Escrever o seed reprodutível**

Crie `supabase/seed/units.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
import units from "../../data/units.json";

interface UnitRow { name: string; unit_name: string; unit_grams: number }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }
  const supabase = createClient(url, serviceKey);
  for (const row of units as UnitRow[]) {
    const { error } = await supabase
      .from("foods")
      .update({ unit_name: row.unit_name, unit_grams: row.unit_grams })
      .is("user_id", null)
      .eq("name", row.name);
    if (error) throw error;
  }
  console.log(`Applied units to ${(units as UnitRow[]).length} TACO foods.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```
Adicione ao `package.json` scripts: `"seed:units": "tsx --env-file=.env.local supabase/seed/units.ts"`.

- [ ] **Step 5: Aplicar as unidades na base (via MCP)**

Carregue `select:mcp__366da671-5102-4665-8ade-cc7028d3395f__execute_sql` e aplique em uma
instrução (dollar-quoting, colando o array de `units.json`):
```sql
update foods f
  set unit_name = u.unit_name, unit_grams = u.unit_grams
from jsonb_to_recordset($units$<COLE_O_ARRAY_units.json>$units$::jsonb)
  as u(name text, unit_name text, unit_grams numeric)
where f.user_id is null and f.name = u.name;
```
Depois rode `select count(*) as with_unit from foods where user_id is null and unit_grams is not null;`
Expected: contagem ≈ nº de entradas do `units.json`. Verifique um exemplo:
`select name, unit_name, unit_grams from foods where name ilike 'Ovo, de galinha%' limit 3;`

- [ ] **Step 6: Commit**
```bash
git add data/units.json supabase/seed/units.ts tests/unit/units-data.test.ts package.json
git commit -m "feat: enrich taco foods with household units (seed + data)"
```

---

## Task 3: API de unidade dos alimentos

**Files:**
- Create: `src/app/api/foods/[id]/unit/route.ts`
- Modify: `src/app/api/foods/route.ts`, `src/app/api/foods/[id]/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, função `set_food_unit` (Task 1), tabela `foods`.
- Produces: `PUT /api/foods/[id]/unit` (body `{ unit_name, unit_grams }`, ambos ou nenhum) → `{ ok: true }`; `POST /api/foods` e `PUT /api/foods/[id]` passam a persistir `unit_name`/`unit_grams` em alimentos próprios.

- [ ] **Step 1: Endpoint de unidade (serve TACO e próprios)**

Crie `src/app/api/foods/[id]/unit/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const unitName = b.unit_name != null && String(b.unit_name).trim() !== "" ? String(b.unit_name).trim() : null;
  const unitGrams = b.unit_grams != null && b.unit_grams !== "" ? Number(b.unit_grams) : null;
  if ((unitName === null) !== (unitGrams === null)) {
    return NextResponse.json({ error: "Informe nome e peso da unidade, ou limpe os dois." }, { status: 400 });
  }
  if (unitGrams !== null && !(unitGrams > 0)) {
    return NextResponse.json({ error: "Peso da unidade deve ser maior que zero." }, { status: 400 });
  }
  const { error } = await supabase.rpc("set_food_unit", {
    p_food_id: id,
    p_unit_name: unitName,
    p_unit_grams: unitGrams,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `POST /api/foods` aceita unidade (alimentos próprios)**

Em `src/app/api/foods/route.ts`, no `POST`, inclua os campos de unidade no insert:
```ts
    .insert({
      user_id: user.id,
      is_custom: true,
      name: body.name,
      kcal_per_100g: body.kcal_per_100g,
      protein_per_100g: body.protein_per_100g,
      carbs_per_100g: body.carbs_per_100g,
      fat_per_100g: body.fat_per_100g,
      unit_name: body.unit_name ?? null,
      unit_grams: body.unit_grams ?? null,
    })
```

- [ ] **Step 3: `PUT /api/foods/[id]` aceita unidade (alimentos próprios)**

Em `src/app/api/foods/[id]/route.ts`, no `PUT`, inclua no update:
```ts
    .update({
      name: body.name,
      kcal_per_100g: body.kcal_per_100g,
      protein_per_100g: body.protein_per_100g,
      carbs_per_100g: body.carbs_per_100g,
      fat_per_100g: body.fat_per_100g,
      unit_name: body.unit_name ?? null,
      unit_grams: body.unit_grams ?? null,
    })
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/app/api/foods
git commit -m "feat: food unit api (set_food_unit endpoint + custom food unit fields)"
```

---

## Task 4: Banco de alimentos — exibir e editar unidade

**Files:**
- Modify: `src/components/FoodBank.tsx`

**Interfaces:**
- Consumes: `PUT /api/foods/[id]/unit` (Task 3), `POST/PUT /api/foods` com unidade, tipo `Food` (Task 1).
- Produces: UI que mostra a unidade de cada alimento e permite editá-la (TACO e próprios). `data-testid`: `food-unit-name-input`, `food-unit-grams-input`, `food-unit-save`, `food-unit-display`.

**Skill:** invoque `/frontend-design` para os controles de unidade ficarem coerentes com o card atual, mobile-first.

- [ ] **Step 1: Implementar exibição + edição de unidade**

Em `src/components/FoodBank.tsx`:
- Em cada `food-row`, mostre a unidade quando definida: um `data-testid="food-unit-display"` com texto tipo `1 ovo = 50 g`; quando ausente, "sem unidade".
- Adicione um controle "Editar unidade" em cada linha (TACO **e** próprios) que abre inputs `food-unit-name-input` (texto) e `food-unit-grams-input` (número) + botão `food-unit-save` → `PUT /api/foods/${food.id}/unit` com `{ unit_name, unit_grams }`. Ao salvar, atualize o estado local do alimento (`unit_name`/`unit_grams`). Limpar ambos os campos remove a unidade.
- No formulário de cadastro de alimento próprio, adicione os mesmos dois campos opcionais de unidade (enviados no `POST`).
- Mantenha o restante (busca, badges, CRUD de próprios) como está.

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` 0 erros; vitest verde.

- [ ] **Step 3: Commit**
```bash
git add src/components/FoodBank.tsx
git commit -m "feat: food bank shows and edits units (taco + custom)"
```

---

## Task 5: Unidades em `meal_items` — dados, motor e APIs

> **Transitório sinalizado:** esta task renomeia `meal_items.quantity_g` e muda a assinatura de `itemMacros`/`mealMacros`. Após ela, `tsc` acusa erro APENAS em `src/components/DayEditor.tsx` e `src/app/(app)/page.tsx` (que ainda usam `quantity_g`) — resolvido na Task 6. Não reverta a mudança de assinatura.

**Files:**
- Create: `supabase/migrations/0004_meal_item_units.sql`
- Modify: `src/lib/types.ts`, `src/lib/nutrition/macros.ts`, `tests/unit/macros.test.ts`, `src/app/api/meal-items/route.ts`, `src/app/api/meals/route.ts`

**Interfaces:**
- Consumes: `Food` com `unit_grams` (Task 1).
- Produces:
  - `MealItem`: `quantity: number` + `unit: "g" | "unit"` (era `quantity_g`).
  - `itemGrams(item: { quantity: number; unit: "g" | "unit" }, food: Pick<Food,"unit_grams">): number`
  - `itemMacros(item: { quantity: number; unit: "g" | "unit" }, food: Food): Macros`
  - `mealMacros(items: { quantity: number; unit: "g" | "unit"; food: Food }[]): Macros`
  - `meal-items` POST/PUT com `{ quantity, unit, ... }`; `meals` GET retorna `quantity`+`unit`.

- [ ] **Step 1: Migration do `meal_items`**

Crie `supabase/migrations/0004_meal_item_units.sql`:
```sql
alter table meal_items rename column quantity_g to quantity;
alter table meal_items add column unit text not null default 'g' check (unit in ('g','unit'));
```
Aplique via MCP `apply_migration(project_id="pxzpxtzueeketotrlslj", name="meal_item_units", query=<conteúdo>)`.
Expected: `{"success":true}`.

- [ ] **Step 2: Atualizar o tipo `MealItem`**

Em `src/lib/types.ts`, na interface `MealItem`, troque `quantity_g: number;` por:
```ts
  quantity: number;
  unit: "g" | "unit";
```

- [ ] **Step 3: Escrever/atualizar os testes do motor**

Substitua o conteúdo de `tests/unit/macros.test.ts` por (mantém compareToTarget/sum; adapta item/meal; adiciona itemGrams e caso por unidade):
```ts
import { describe, it, expect } from "vitest";
import { itemGrams, itemMacros, sumMacros, mealMacros, compareToTarget } from "@/lib/nutrition/macros";
import type { Food } from "@/lib/types";

const arroz: Food = {
  id: "1", user_id: null, name: "Arroz", is_custom: false,
  kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0,
  unit_name: null, unit_grams: null,
};
const ovo: Food = {
  id: "2", user_id: null, name: "Ovo", is_custom: false,
  kcal_per_100g: 155, protein_per_100g: 13, carbs_per_100g: 1.1, fat_per_100g: 11,
  unit_name: "ovo", unit_grams: 50,
};

describe("itemGrams", () => {
  it("gramas diretas", () => expect(itemGrams({ quantity: 200, unit: "g" }, arroz)).toBe(200));
  it("unidade × peso", () => expect(itemGrams({ quantity: 2, unit: "unit" }, ovo)).toBe(100));
  it("unidade sem peso definido = 0", () =>
    expect(itemGrams({ quantity: 2, unit: "unit" }, arroz)).toBe(0));
});

describe("itemMacros", () => {
  it("200g de arroz", () => {
    expect(itemMacros({ quantity: 200, unit: "g" }, arroz)).toEqual({
      kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0,
    });
  });
  it("2 ovos (100g)", () => {
    expect(itemMacros({ quantity: 2, unit: "unit" }, ovo)).toEqual({
      kcal: 155, protein_g: 13, carbs_g: 1.1, fat_g: 11,
    });
  });
});

describe("mealMacros + sumMacros", () => {
  it("soma itens em gramas", () => {
    expect(
      mealMacros([
        { quantity: 100, unit: "g", food: arroz },
        { quantity: 100, unit: "g", food: arroz },
      ]),
    ).toEqual({ kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0 });
  });
});

describe("compareToTarget", () => {
  it("diferença planejado - meta", () => {
    const planned = { kcal: 2000, protein_g: 150, carbs_g: 100, fat_g: 60 };
    const target = { target_kcal: 2200, target_protein_g: 160, target_carbs_g: 90, target_fat_g: 70 };
    expect(compareToTarget(planned, target)).toEqual({
      kcal: -200, protein_g: -10, carbs_g: 10, fat_g: -10,
    });
  });
});
```

- [ ] **Step 4: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/macros.test.ts`
Expected: FAIL (`itemGrams` não existe; `itemMacros` ainda espera `quantity_g`).

- [ ] **Step 5: Adaptar `macros.ts`**

Em `src/lib/nutrition/macros.ts`, substitua `itemMacros` e `mealMacros` e adicione `itemGrams`
(mantendo `round1`, `sumMacros`, `compareToTarget` como estão):
```ts
export function itemGrams(
  item: { quantity: number; unit: "g" | "unit" },
  food: Pick<Food, "unit_grams">,
): number {
  return item.unit === "unit" ? item.quantity * (food.unit_grams ?? 0) : item.quantity;
}

export function itemMacros(
  item: { quantity: number; unit: "g" | "unit" },
  food: Food,
): Macros {
  const f = itemGrams(item, food) / 100;
  return {
    kcal: round1(food.kcal_per_100g * f),
    protein_g: round1(food.protein_per_100g * f),
    carbs_g: round1(food.carbs_per_100g * f),
    fat_g: round1(food.fat_per_100g * f),
  };
}

export function mealMacros(
  items: { quantity: number; unit: "g" | "unit"; food: Food }[],
): Macros {
  return sumMacros(items.map((it) => itemMacros(it, it.food)));
}
```

- [ ] **Step 6: Rodar (deve passar)**

Run: `npx vitest run tests/unit/macros.test.ts`
Expected: PASS.

- [ ] **Step 7: `meal-items` API com quantity+unit**

Em `src/app/api/meal-items/route.ts`, no `POST`, valide e grave `quantity`+`unit`:
```ts
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const unit: "g" | "unit" = body.unit === "unit" ? "unit" : "g";
  if (unit === "unit") {
    const { data: food } = await supabase.from("foods").select("unit_grams").eq("id", body.food_id).maybeSingle();
    if (!food?.unit_grams) {
      return NextResponse.json({ error: "Este alimento não tem unidade definida." }, { status: 400 });
    }
  }
  const { data, error } = await supabase
    .from("meal_items")
    .insert({ meal_id: body.meal_id, food_id: body.food_id, quantity: body.quantity, unit })
    .select("*, food:foods(*)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
```
No `PUT`, aceite `quantity` (e opcionalmente `unit`):
```ts
export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const patch: { quantity: number; unit?: "g" | "unit" } = { quantity: body.quantity };
  if (body.unit === "g" || body.unit === "unit") patch.unit = body.unit;
  const { data, error } = await supabase
    .from("meal_items")
    .update(patch)
    .eq("id", body.id)
    .select("*, food:foods(*)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
```
O `DELETE` (por `?id=`) permanece igual.

> Nota: a rota `meals` GET usa `select("*, meal_items(*, food:foods(*))")` — o `*` já traz
> `quantity`+`unit` automaticamente; nenhuma mudança necessária ali, mas confirme lendo o arquivo.

- [ ] **Step 8: Verificar motor + APIs (transitório esperado nas UIs)**

Run: `npx vitest run` e `npx tsc --noEmit`
Expected: vitest verde. `tsc`: erros APENAS em `src/components/DayEditor.tsx` e `src/app/(app)/page.tsx` (usam `quantity_g`) — resolvidos na Task 6. Confirme que não há erro nos arquivos desta task.

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "feat: meal_items store quantity+unit; itemGrams engine; unit-aware apis"
```

---

## Task 6: Editor de dia + dashboard usam unidade (resolve o transitório)

**Files:**
- Modify: `src/components/DayEditor.tsx`, `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `meal-items` API com `quantity`+`unit` (Task 5), `itemGrams`/`mealMacros` (Task 5), `Food.unit_grams`.
- Produces: `tsc` limpo; editor com toggle g|unidade e exibição "N (Xg)"; dashboard agregando com `quantity`+`unit`. `data-testid`: `item-unit-toggle`, `item-display`.

**Skill:** invoque `/frontend-design` para o toggle e a exibição do item ficarem claros no mobile.

- [ ] **Step 1: Adaptar o `DayEditor`**

Em `src/components/DayEditor.tsx`:
- Onde hoje envia/lê `quantity_g` nos itens, passe a usar `quantity` + `unit`.
- Ao adicionar um item: se o alimento selecionado tem `unit_grams`, mostrar um toggle
  `data-testid="item-unit-toggle"` (gramas | unidade) com **default "unidade"**; o campo
  `item-qty-input` passa a ser a quantidade na unidade escolhida. Alimentos sem `unit_grams`
  → só gramas (`unit='g'`, sem toggle). `POST /api/meal-items` com `{ meal_id, food_id, quantity, unit }`.
- Exibir cada item com `data-testid="item-display"` no formato: `unit='unit'` → `"{quantity} {food.unit_name} ({itemGrams}g)"`; `unit='g'` → `"{quantity} g"`. Use `itemGrams(item, item.food)` para as gramas.
- Editar a quantidade: `PUT /api/meal-items` com `{ id, quantity }` (mantém a unidade), respeitando a unidade atual do item.
- Os totais por refeição/dia continuam via `mealMacros(items)` — agora os itens têm `quantity`+`unit`.

- [ ] **Step 2: Adaptar a agregação do dashboard**

Em `src/app/(app)/page.tsx`, a query e o map dos `meal_items`:
- Troque a seleção `meal_items(quantity_g, food:foods(*))` por `meal_items(quantity, unit, food:foods(*))`.
- No `mealMacros`, mapeie `{ quantity: it.quantity, unit: it.unit, food: it.food }` (o tipo local `MealItemRow` passa a ter `quantity: number; unit: "g" | "unit"`).

- [ ] **Step 3: Verificar tudo limpo**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` 0 erros (transitório resolvido); vitest verde.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat: day editor unit toggle + display; dashboard aggregation with units"
```

---

## Task 7: E2E — adicionar item por unidade

**Files:**
- Modify: `tests/e2e/flow.spec.ts`

**Interfaces:**
- Consumes: a UI de unidades (Tasks 4/6).
- Produces: E2E verde cobrindo adição por unidade.

- [ ] **Step 1: Adicionar um passo por unidade ao fluxo**

Em `tests/e2e/flow.spec.ts`, no bloco do editor de dia (após o item em gramas que já assere
`day-total-kcal`), adicione: buscar um alimento TACO **com unidade** (ex.: "Ovo, de galinha, inteiro, cozido")
via `item-food-search`, selecioná-lo, garantir que o toggle `item-unit-toggle` aparece e está em
"unidade", preencher `item-qty-input` com "2", clicar `item-add`, e asserir que o `item-display`
do item novo contém a unidade e as gramas derivadas (ex.: contém `ovo` e `(100`), e que o
`day-total-kcal` aumentou em relação ao valor anterior.

Confirme o nome exato do alimento com unidade consultando `data/units.json`/a base, e os
rótulos/refs lendo `DayEditor.tsx`.

- [ ] **Step 2: Rodar o E2E**

Run: `npx playwright test`
Expected: 1 passed. Depure com trace se necessário.

- [ ] **Step 3: Suíte completa**

Run: `npx vitest run && npx playwright test`
Expected: unit (macros + bmr + weekly + taco + units-data) e E2E verdes.

- [ ] **Step 4: Commit**
```bash
git add tests/e2e/flow.spec.ts
git commit -m "test: e2e adds a meal item by unit"
```

---

## Self-Review

**1. Cobertura do spec:**
- `foods` unit cols + `set_food_unit` → Task 1. ✔
- Enriquecimento (units.json + seed reprodutível + aplicar) → Task 2. ✔
- `meal_items` quantity+unit + derivação de gramas → Task 5 (migration + tipo + motor). ✔
- `itemGrams`/`itemMacros` → Task 5 (com casos gramas e unidade). ✔
- API de unidade (endpoint set_food_unit; unidade em próprios) → Task 3; meal-items quantity+unit → Task 5. ✔
- UX banco de alimentos (exibir/editar unidade TACO+próprios) → Task 4; editor com toggle+exibição → Task 6. ✔
- Dashboard consumindo meal_items → Task 6. ✔
- Casos de borda (unit sem unit_grams → 0 / 400; migração preserva dados) → Tasks 5. ✔
- E2E por unidade → Task 7. ✔

**2. Placeholders:** motores/migrations/APIs com código completo. As UIs (Tasks 4/6) trazem
requisitos concretos + `data-testid` + skill `/frontend-design`; a geração de `units.json` (Task 2)
tem regras e formato exatos + teste de integridade que a valida.

**3. Consistência de tipos:** `itemGrams`/`itemMacros`/`mealMacros` com assinaturas idênticas
entre definição (Task 5) e consumo (Task 6). `MealItem` (`quantity`+`unit`) e `Food` (`unit_name`/
`unit_grams`) usados de forma consistente. O embed `food:foods(*)` traz `unit_grams` para o `itemGrams`.

**Nota de dependência:** Task 5 deixa `tsc` vermelho SÓ em `DayEditor.tsx` e `(app)/page.tsx` até a
Task 6 (sinalizado). Não reintroduzir `quantity_g`.
