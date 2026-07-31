# Gerador de Cardápio por IA (Feature C1) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** Gerar automaticamente o cardápio de um tipo de dia — a IA (gpt-4o-mini) escolhe alimentos do pool (preferidos + básicos) e um solver determinístico escala as quantidades para bater as metas, com várias opções intercambiáveis por refeição; o usuário revisa e aplica.

**Architecture:** Motor puro `solver.ts` (sub-metas por refeição + escala por kcal). Módulo server-only `menu.ts` chama a OpenAI com JSON schema estrito e valida a saída contra o pool (`validateMenu`, puro). Rota `generate` monta a proposta (não salva); `apply-menu` substitui as refeições. Opções são modeladas como linhas `meals` agrupadas por `slot`, com `selected` marcando a que conta nos totais.

**Tech Stack:** Next.js 16 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · OpenAI `gpt-4o-mini` · Vitest · Playwright.

## Global Constraints

- **Next 16:** `params`/`cookies()` async; middleware é `src/proxy.ts`. Ver `docs/superpowers/NEXT16-DECISIONS.md`.
- **IA server-side apenas; `OPENAI_API_KEY` é SEGREDO** — env server-side, nunca `NEXT_PUBLIC`, nunca commitada. Já está em `.env.local` (gitignored).
- **IA nunca é fonte de verdade numérica:** `food_id` fora do pool é descartado; o **solver** fixa as quantidades; os motores puros calculam os macros.
- **Gramas = fonte de verdade** (`itemGrams`/`mealMacros` da Feature B).
- **Não-destrutivo até aplicar.** Gerar → proposta; só "Aplicar" grava.
- **Defaults:** N=5 refeições, nomes `["Café da manhã","Lanche/pré-treino","Almoço","Lanche/pré-treino","Jantar"]`, pesos `[0.20,0.10,0.30,0.15,0.25]`; M=3 opções. N≠5 → split uniforme `1/N`, nomes "Refeição i".
- **Solver = escala por kcal** (fator único por opção). **Opções são macro-equivalentes** (mesma sub-meta). **Totais do dia somam só `meals.selected = true`.**
- **RLS por usuário**; rotas usam `createServerSupabase` + `auth.getUser()` em escritas.
- **Supabase project id:** `pxzpxtzueeketotrlslj` (migrations via MCP).

---

## Estrutura de arquivos

```
supabase/migrations/
  0006_food_favorites.sql      # tabela favoritos + RLS (Task 1)
  0007_meal_options.sql        # meals slot/option_label/selected (Task 1)
data/basics.json               # nomes de básicos (Task 3)
src/lib/types.ts               # Meal +slot/option_label/selected (Task 1)
src/lib/nutrition/solver.ts    # mealSubTargets + scaleOptionToKcal (Task 2)
src/lib/ai/openai.ts           # cliente OpenAI (Task 4)
src/lib/ai/menu.ts             # generateMenu + validateMenu (Task 4)
src/app/api/foods/[id]/favorite/route.ts   # POST/DELETE (Task 3)
src/app/api/favorites/route.ts             # GET ids (Task 3)
src/app/api/day-types/[id]/generate/route.ts    # POST proposta (Task 5)
src/app/api/day-types/[id]/apply-menu/route.ts  # POST substitui (Task 5)
src/app/api/meals/route.ts     # GET considera selected (Task 6)
src/app/(app)/page.tsx         # dashboard soma selected (Task 6)
src/components/FoodBank.tsx     # ⭐ favoritar (Task 3)
src/components/DayEditor.tsx    # slots + abas de opção + selected (Task 6)
src/components/MenuGenerator.tsx # diálogo gerar → proposta → aplicar (Task 7)
tests/unit/solver.test.ts       # (Task 2)
tests/unit/menu.test.ts         # validateMenu (Task 4)
tests/e2e/flow.spec.ts          # favoritar + aplicar proposta fixa (Task 8)
```

---

## Task 1: Migrations (favoritos + opções) + tipo `Meal`

**Files:**
- Create: `supabase/migrations/0006_food_favorites.sql`, `supabase/migrations/0007_meal_options.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: tabela `food_favorites`; `meals.slot`/`option_label`/`selected`; `Meal` estendido:
  `slot: number; option_label: string; selected: boolean`.

- [ ] **Step 1: Migration de favoritos**

Crie `supabase/migrations/0006_food_favorites.sql`:
```sql
create table food_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid not null references foods(id) on delete cascade,
  primary key (user_id, food_id)
);
alter table food_favorites enable row level security;
create policy "own favorites" on food_favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Migration de opções**

Crie `supabase/migrations/0007_meal_options.sql`:
```sql
alter table meals add column slot int not null default 0;
alter table meals add column option_label text not null default 'Opção 1';
alter table meals add column selected boolean not null default true;
update meals set slot = "order";
```

- [ ] **Step 3: Aplicar as duas via MCP**

Carregue `select:mcp__366da671-5102-4665-8ade-cc7028d3395f__apply_migration` e aplique cada uma
(`project_id="pxzpxtzueeketotrlslj"`, names `food_favorites` e `meal_options`). Expected: `{"success":true}` em ambas. Rode o advisor de segurança
(`select:mcp__366da671-5102-4665-8ade-cc7028d3395f__get_advisors`, type security) e confirme que a nova tabela tem RLS (sem lint novo de RLS).

- [ ] **Step 4: Estender o tipo `Meal`**

Em `src/lib/types.ts`, na interface `Meal`, adicione:
```ts
  slot: number;
  option_label: string;
  selected: boolean;
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: exit 0 (aditivo).

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/0006_food_favorites.sql supabase/migrations/0007_meal_options.sql src/lib/types.ts
git commit -m "feat: schema for favorites + meal options (slot/selected)"
```

---

## Task 2: Solver (puro, TDD)

**Files:**
- Create: `src/lib/nutrition/solver.ts`, `tests/unit/solver.test.ts`

**Interfaces:**
- Consumes: `Food`, `Macros` (types), `mealMacros`/`itemMacros` (`@/lib/nutrition/macros`).
- Produces:
  - `mealSubTargets(dayTarget: { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number }, n: number): { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[]`
  - `scaleOptionToKcal(items: { quantity: number; unit: "g" | "unit"; food: Food }[], targetKcal: number): { quantity: number; unit: "g" | "unit"; food: Food }[]`

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/unit/solver.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mealSubTargets, scaleOptionToKcal } from "@/lib/nutrition/solver";
import type { Food } from "@/lib/types";

const arroz: Food = {
  id: "1", user_id: null, name: "Arroz", is_custom: false,
  kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0,
  unit_name: null, unit_grams: null,
};

describe("mealSubTargets", () => {
  const day = { target_kcal: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 60 };
  it("N=5 usa nomes e pesos default", () => {
    const r = mealSubTargets(day, 5);
    expect(r.map((m) => m.name)).toEqual([
      "Café da manhã", "Lanche/pré-treino", "Almoço", "Lanche/pré-treino", "Jantar",
    ]);
    expect(r[0]).toEqual({ name: "Café da manhã", kcal: 400, protein_g: 30, carbs_g: 40, fat_g: 12 });
    expect(r[2].kcal).toBe(600);
    expect(r.reduce((s, m) => s + m.kcal, 0)).toBe(2000);
  });
  it("N=3 split uniforme com nomes genéricos", () => {
    const r = mealSubTargets(day, 3);
    expect(r.map((m) => m.name)).toEqual(["Refeição 1", "Refeição 2", "Refeição 3"]);
    expect(r[0].kcal).toBeCloseTo(2000 / 3, 1);
  });
});

describe("scaleOptionToKcal", () => {
  it("escala por fator único para bater o kcal alvo", () => {
    const scaled = scaleOptionToKcal([{ quantity: 100, unit: "g", food: arroz }], 248);
    expect(scaled[0].quantity).toBe(200);
  });
  it("kcal atual 0 → não escala (evita divisão por zero)", () => {
    const zero: Food = { ...arroz, kcal_per_100g: 0 };
    const scaled = scaleOptionToKcal([{ quantity: 50, unit: "g", food: zero }], 300);
    expect(scaled[0].quantity).toBe(50);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/solver.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `solver.ts`**

Crie `src/lib/nutrition/solver.ts`:
```ts
import type { Food } from "@/lib/types";
import { mealMacros } from "@/lib/nutrition/macros";

const round1 = (n: number) => Math.round(n * 10) / 10;

const DEFAULT_5_NAMES = [
  "Café da manhã", "Lanche/pré-treino", "Almoço", "Lanche/pré-treino", "Jantar",
];
const DEFAULT_5_WEIGHTS = [0.2, 0.1, 0.3, 0.15, 0.25];

export function mealSubTargets(
  dayTarget: { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number },
  n: number,
) {
  const names = n === 5 ? DEFAULT_5_NAMES : Array.from({ length: n }, (_, i) => `Refeição ${i + 1}`);
  const weights = n === 5 ? DEFAULT_5_WEIGHTS : Array.from({ length: n }, () => 1 / n);
  return names.map((name, i) => ({
    name,
    kcal: round1(dayTarget.target_kcal * weights[i]),
    protein_g: round1(dayTarget.target_protein_g * weights[i]),
    carbs_g: round1(dayTarget.target_carbs_g * weights[i]),
    fat_g: round1(dayTarget.target_fat_g * weights[i]),
  }));
}

export function scaleOptionToKcal(
  items: { quantity: number; unit: "g" | "unit"; food: Food }[],
  targetKcal: number,
): { quantity: number; unit: "g" | "unit"; food: Food }[] {
  const currentKcal = mealMacros(items).kcal;
  if (currentKcal <= 0) return items;
  const factor = targetKcal / currentKcal;
  return items.map((it) => ({ ...it, quantity: round1(it.quantity * factor) }));
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/unit/solver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/nutrition/solver.ts tests/unit/solver.test.ts
git commit -m "feat: pure menu solver (meal sub-targets + kcal scaling)"
```

---

## Task 3: Favoritos (API + ⭐ no banco) + básicos

**Files:**
- Create: `src/app/api/foods/[id]/favorite/route.ts`, `src/app/api/favorites/route.ts`, `data/basics.json`
- Modify: `src/components/FoodBank.tsx`

**Interfaces:**
- Consumes: `createServerSupabase`, `food_favorites` (Task 1).
- Produces: `POST/DELETE /api/foods/[id]/favorite`; `GET /api/favorites` → `{ ids: string[] }`; `data/basics.json` (array de nomes TACO). ⭐ toggle no FoodBank.

- [ ] **Step 1: API de favoritos**

Crie `src/app/api/foods/[id]/favorite/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase
    .from("food_favorites")
    .upsert({ user_id: user.id, food_id: id }, { onConflict: "user_id,food_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase
    .from("food_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("food_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

Crie `src/app/api/favorites/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("food_favorites").select("food_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ids: (data ?? []).map((r) => r.food_id) });
}
```

- [ ] **Step 2: Gerar `data/basics.json`**

Leia `data/taco.json`. Crie `data/basics.json`: um array JSON de **nomes exatos da TACO** de ~15–25 estáveis comuns (ex.: "Arroz, integral, cozido", "Frango, peito, sem pele, grelhado", "Ovo, de galinha, inteiro, cozido/10minutos", "Aveia, flocos, crua", "Batata, doce, cozida", "Feijão, carioca, cozido", "Banana, prata, crua", "Pão, de forma, integral", "Leite, ...", "Whey..." se existir). Só nomes que EXISTEM em `data/taco.json`.

- [ ] **Step 3: ⭐ no FoodBank (frontend-design)**

Invoque `/frontend-design`. Em `src/components/FoodBank.tsx`: no mount, carregue `GET /api/favorites` para um `Set<string>` de ids favoritos. Em cada `food-row`, um botão ⭐ (`data-testid="food-favorite"`) que alterna: se favorito → `DELETE /api/foods/${id}/favorite`; senão → `POST`. Atualize o Set otimisticamente. Estrela cheia/vazia conforme o estado.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` 0 erros; vitest verde.

- [ ] **Step 5: Commit**
```bash
git add src/app/api/foods/[id]/favorite src/app/api/favorites data/basics.json src/components/FoodBank.tsx
git commit -m "feat: food favorites api + star toggle + basics list"
```

---

## Task 4: Módulo de IA (OpenAI + validação)

**Files:**
- Create: `src/lib/ai/openai.ts`, `src/lib/ai/menu.ts`, `tests/unit/menu.test.ts`
- Modify: `package.json` (dependência `openai`)

**Interfaces:**
- Consumes: `OPENAI_API_KEY` (env). Tipos `Food`.
- Produces:
  - Tipos `RawMenu = { slots: { name: string; options: { items: { food_id: string; quantity: number; unit: "g" | "unit" }[] }[] }[] }`.
  - `validateMenu(raw: RawMenu, poolIds: Set<string>): RawMenu` (puro — descarta itens com `food_id` fora do pool e `unit` inválida; lança `Error` se algum slot ficar sem opções).
  - `generateMenu(input: { subTargets: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[]; options: number; pool: { id: string; name: string; kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number; unit_name: string | null; unit_grams: number | null }[] }): Promise<RawMenu>` (server-only; chama OpenAI, valida).

- [ ] **Step 1: Instalar dependência**

Run: `npm install openai`
Expected: `openai` no `package.json`.

- [ ] **Step 2: Teste de `validateMenu` (falha primeiro)**

Crie `tests/unit/menu.test.ts`:
```ts
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
```

- [ ] **Step 3: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/menu.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar `openai.ts` + `menu.ts`**

Crie `src/lib/ai/openai.ts`:
```ts
import OpenAI from "openai";

export function openaiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");
  return new OpenAI({ apiKey });
}
```

Crie `src/lib/ai/menu.ts`:
```ts
import { openaiClient } from "@/lib/ai/openai";

export type RawItem = { food_id: string; quantity: number; unit: "g" | "unit" };
export type RawMenu = {
  slots: { name: string; options: { items: RawItem[] }[] }[];
};

export function validateMenu(raw: RawMenu, poolIds: Set<string>): RawMenu {
  const slots = raw.slots.map((slot) => {
    const options = slot.options
      .map((opt) => ({
        items: opt.items.filter(
          (it) => poolIds.has(it.food_id) && (it.unit === "g" || it.unit === "unit") && it.quantity > 0,
        ),
      }))
      .filter((opt) => opt.items.length > 0);
    if (options.length === 0) throw new Error(`Refeição "${slot.name}" sem opções válidas`);
    return { name: slot.name, options };
  });
  return { slots };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["slots"],
  properties: {
    slots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "options"],
        properties: {
          name: { type: "string" },
          options: {
            type: "array",
            items: {
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
            },
          },
        },
      },
    },
  },
} as const;

export async function generateMenu(input: {
  subTargets: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[];
  options: number;
  pool: { id: string; name: string; kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number; unit_name: string | null; unit_grams: number | null }[];
}): Promise<RawMenu> {
  const client = openaiClient();
  const system =
    "Você é nutricionista. Monte um cardápio brasileiro. Para CADA refeição, gere exatamente " +
    `${input.options} opções DISTINTAS. Cada opção é uma lista de itens que APROXIMA a meta de macros ` +
    "daquela refeição (priorize bater a PROTEÍNA). Use SOMENTE alimentos do pool, referenciando food_id. " +
    "quantity é em gramas quando unit='g', ou número de unidades quando unit='unit' (só use unit='unit' " +
    "se o alimento tiver unit_grams). Varie os alimentos entre as opções.";
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ refeicoes: input.subTargets, pool: input.pool }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "menu", strict: true, schema: SCHEMA } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  const raw = JSON.parse(content) as RawMenu;
  return validateMenu(raw, new Set(input.pool.map((f) => f.id)));
}
```

- [ ] **Step 5: Rodar o teste (deve passar)**

Run: `npx vitest run tests/unit/menu.test.ts`
Expected: PASS (o teste só exercita `validateMenu`; `generateMenu` não é chamado).

- [ ] **Step 6: Commit**
```bash
git add src/lib/ai package.json package-lock.json tests/unit/menu.test.ts
git commit -m "feat: openai menu module with strict json schema + validation"
```

---

## Task 5: Rotas de gerar e aplicar

**Files:**
- Create: `src/app/api/day-types/[id]/generate/route.ts`, `src/app/api/day-types/[id]/apply-menu/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `mealSubTargets`/`scaleOptionToKcal` (Task 2), `generateMenu` (Task 4), `food_favorites`/`day_types`/`meals`/`meal_items`, `data/basics.json`, motores de macro.
- Produces:
  - `POST /api/day-types/[id]/generate` (`{ meals: number; options: number }`) → `{ proposal }` onde `proposal = { slots: { name: string; slot: number; options: { label: string; items: { food_id: string; quantity: number; unit: "g"|"unit"; food: Food }[]; macros: Macros }[] }[] }`. NÃO grava.
  - `POST /api/day-types/[id]/apply-menu` (`{ proposal }`) → substitui as refeições do tipo de dia.

- [ ] **Step 1: Rota `generate`**

Crie `src/app/api/day-types/[id]/generate/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { mealSubTargets, scaleOptionToKcal } from "@/lib/nutrition/solver";
import { mealMacros } from "@/lib/nutrition/macros";
import { generateMenu } from "@/lib/ai/menu";
import basics from "@/../data/basics.json";
import type { Food } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const n: number = body.meals ?? 5;
  const m: number = body.options ?? 3;

  const { data: dayType } = await supabase.from("day_types").select("*").eq("id", id).maybeSingle();
  if (!dayType) return NextResponse.json({ error: "tipo de dia não encontrado" }, { status: 404 });

  // pool = favoritos ∪ básicos
  const { data: favRows } = await supabase.from("food_favorites").select("food_id");
  const favIds = (favRows ?? []).map((r) => r.food_id);
  const { data: favFoods } = favIds.length
    ? await supabase.from("foods").select("*").in("id", favIds)
    : { data: [] as Food[] };
  const { data: basicFoods } = await supabase
    .from("foods").select("*").is("user_id", null).in("name", basics as string[]);
  const poolMap = new Map<string, Food>();
  for (const f of [...(favFoods ?? []), ...(basicFoods ?? [])] as Food[]) poolMap.set(f.id, f);
  const pool = [...poolMap.values()];
  if (pool.length === 0) {
    return NextResponse.json({ error: "Sem alimentos no pool. Favorite alguns alimentos." }, { status: 400 });
  }

  const subTargets = mealSubTargets(dayType, n);
  let raw;
  try {
    raw = await generateMenu({
      subTargets,
      options: m,
      pool: pool.map((f) => ({
        id: f.id, name: f.name,
        kcal_per_100g: f.kcal_per_100g, protein_per_100g: f.protein_per_100g,
        carbs_per_100g: f.carbs_per_100g, fat_per_100g: f.fat_per_100g,
        unit_name: f.unit_name, unit_grams: f.unit_grams,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao gerar cardápio" },
      { status: 502 },
    );
  }

  // solver + macros por opção
  const slots = raw.slots.slice(0, n).map((slot, si) => {
    const sub = subTargets[si] ?? subTargets[subTargets.length - 1];
    const options = slot.options.slice(0, m).map((opt, oi) => {
      const withFood = opt.items
        .map((it) => ({ ...it, food: poolMap.get(it.food_id)! }))
        .filter((it) => it.food);
      const scaled = scaleOptionToKcal(withFood, sub.kcal);
      return { label: `Opção ${oi + 1}`, items: scaled, macros: mealMacros(scaled) };
    });
    return { name: slot.name, slot: si, options };
  });

  return NextResponse.json({ proposal: { slots } });
}
```

- [ ] **Step 2: Rota `apply-menu`**

Crie `src/app/api/day-types/[id]/apply-menu/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type ProposalItem = { food_id: string; quantity: number; unit: "g" | "unit" };
type Proposal = {
  slots: { name: string; slot: number; options: { label: string; items: ProposalItem[] }[] }[];
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { proposal } = (await req.json()) as { proposal: Proposal };

  // Substitui: apaga as refeições atuais do tipo de dia (cascade em meal_items)
  const { error: delErr } = await supabase.from("meals").delete().eq("day_type_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  for (const slot of proposal.slots) {
    for (let oi = 0; oi < slot.options.length; oi++) {
      const opt = slot.options[oi];
      const { data: meal, error: mErr } = await supabase
        .from("meals")
        .insert({
          user_id: user.id, day_type_id: id, name: slot.name,
          order: slot.slot, slot: slot.slot, option_label: opt.label, selected: oi === 0,
        })
        .select().single();
      if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
      if (opt.items.length) {
        const rows = opt.items.map((it) => ({
          meal_id: meal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit,
        }));
        const { error: iErr } = await supabase.from("meal_items").insert(rows);
        if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: exit 0. (As UIs ainda não usam essas rotas; sem erro.)

- [ ] **Step 4: Commit**
```bash
git add src/app/api/day-types
git commit -m "feat: generate (proposal) and apply-menu (replace) routes"
```

---

## Task 6: Agregação por `selected` + opções no editor de dia

**Files:**
- Modify: `src/app/api/meals/route.ts`, `src/app/(app)/page.tsx`, `src/components/DayEditor.tsx`

**Interfaces:**
- Consumes: `meals.slot`/`option_label`/`selected` (Task 1), `mealMacros`/`itemGrams`.
- Produces: totais somam só `selected`; editor agrupa por `slot` com abas de opção + escolha da selecionada.

- [ ] **Step 1: `GET /api/meals` traz slot/option_label/selected**

Em `src/app/api/meals/route.ts` (GET), o `select("*, meal_items(*, food:foods(*))")` já traz as
colunas novas via `*`. Confirme lendo o arquivo (sem mudança necessária além de garantir o order:
`.order("slot").order("option_label")`). Ajuste o `.order(...)` se hoje ordena por `"order"`.

- [ ] **Step 2: Dashboard soma só `selected`**

Em `src/app/(app)/page.tsx`, a query por tipo de dia dos `meals` deve filtrar `selected`:
troque `.eq("day_type_id", dt.id)` por `.eq("day_type_id", dt.id).eq("selected", true)` na leitura das
`meals` usadas para somar os totais.

- [ ] **Step 3: `DayEditor` agrupa por slot (frontend-design)**

Invoque `/frontend-design`. Em `src/components/DayEditor.tsx`:
- Agrupe as `meals` recebidas por `slot`. Cada grupo mostra o `name` do slot e **abas de opção**
  (`option_label`), destacando a `selected`. `data-testid` por aba: `option-tab`; a selecionada tem
  `aria-pressed`/estilo ativo.
- Clicar numa aba de opção define aquela `meal` como selecionada: `PUT /api/meals/${id}` com
  `{ selected: true }` — e as outras opções do mesmo slot viram `selected: false`. (Ver Step 4.)
- Os itens/edição continuam por opção (a `meal` da aba ativa). Os totais do dia usam a opção
  `selected` de cada slot.

- [ ] **Step 4: `PUT /api/meals/[id]` aceita `selected` (exclusivo por slot)**

Em `src/app/api/meals/[id]/route.ts` (PUT), aceite `selected`: ao marcar uma `meal` como
`selected=true`, desmarque as demais do mesmo `(day_type_id, slot)`:
```ts
  if (body.selected === true) {
    const { data: current } = await supabase.from("meals").select("day_type_id, slot").eq("id", id).maybeSingle();
    if (current) {
      await supabase.from("meals").update({ selected: false })
        .eq("day_type_id", current.day_type_id).eq("slot", current.slot);
    }
  }
```
E inclua `selected: body.selected` (quando definido) e `option_label: body.option_label ?? undefined`
no `.update(...)` já existente (mantendo `name`/`order`).

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` 0 erros; vitest verde.

- [ ] **Step 6: Commit**
```bash
git add src/app/api/meals src/app/(app)/page.tsx src/components/DayEditor.tsx
git commit -m "feat: selected-option aggregation + meal option tabs in day editor"
```

---

## Task 7: UI do gerador (diálogo → proposta → aplicar)

**Files:**
- Create: `src/components/MenuGenerator.tsx`
- Modify: `src/app/(app)/day/[dayTypeId]/page.tsx` (botão "Gerar cardápio")

**Interfaces:**
- Consumes: `POST /api/day-types/[id]/generate`, `POST /api/day-types/[id]/apply-menu` (Task 5), `compareToTarget`/`sumMacros`.
- Produces: `<MenuGenerator dayType={...} />` — diálogo com N e M, proposta com abas de opção e total vs meta, "Aplicar"/"Gerar de novo". `data-testid`: `generate-open`, `generate-meals`, `generate-options`, `generate-run`, `proposal`, `proposal-apply`, `proposal-regenerate`.

**Skill:** invoque `/frontend-design` para o diálogo e a tela de proposta, mobile-first.

- [ ] **Step 1: Implementar `MenuGenerator`**

Crie `src/components/MenuGenerator.tsx` (Client Component). Recebe `dayType: DayType`. Comportamento:
- Botão "Gerar cardápio" (`generate-open`) abre um painel com inputs numéricos N (`generate-meals`, default 5) e M (`generate-options`, default 3) e o botão "Gerar" (`generate-run`).
- "Gerar" → `POST /api/day-types/${dayType.id}/generate` com `{ meals, options }`. Enquanto carrega, mostra "Gerando..."; em erro (400/502) mostra a mensagem retornada.
- Sucesso → renderiza a **proposta** (`data-testid="proposal"`): por slot, abas de opção mostrando os itens (nome + quantidade/unidade) e os macros da opção; o total do dia (soma da opção 1 de cada slot) vs a meta do `dayType` (use `compareToTarget`).
- "Aplicar" (`proposal-apply`) → `POST /api/day-types/${dayType.id}/apply-menu` com `{ proposal }`; em sucesso, recarrega a página do dia (ou `router.refresh()`). Confirme antes ("Isso substitui o cardápio atual").
- "Gerar de novo" (`proposal-regenerate`) → repete o generate.

- [ ] **Step 2: Botão na página do tipo de dia**

Em `src/app/(app)/day/[dayTypeId]/page.tsx`, renderize `<MenuGenerator dayType={dayType} />` acima do `<DayEditor />`.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` 0 erros; vitest verde.

- [ ] **Step 4: Commit**
```bash
git add src/components/MenuGenerator.tsx "src/app/(app)/day/[dayTypeId]/page.tsx"
git commit -m "feat: menu generator dialog (generate -> review -> apply)"
```

---

## Task 8: E2E (determinístico, sem chamar a IA)

**Files:**
- Modify: `tests/e2e/flow.spec.ts`

**Interfaces:**
- Consumes: ⭐ favoritar (Task 3), `apply-menu` (Task 5), abas de opção (Task 6).
- Produces: E2E verde cobrindo favoritar + aplicar uma proposta fixa + trocar opção muda o total.

- [ ] **Step 1: Passos no E2E**

Em `tests/e2e/flow.spec.ts`, no bloco de alimentos, adicione: favoritar um alimento (`food-favorite`)
e confirmar o estado. Depois do editor de dia, adicione um bloco que aplica uma **proposta fixa** sem
IA: via `page.request.post('/api/day-types/<id>/apply-menu', { data: { proposal } })` com uma proposta
de 1 slot e 2 opções (itens usando o alimento próprio já criado no teste, `food_id` conhecido), navegue
ao editor do dia e assere que as **abas de opção** (`option-tab`) aparecem; clique na 2ª opção e assere
que o `day-total-kcal` muda para o valor da 2ª opção.
Obtenha o `dayTypeId` e o `food_id` a partir das respostas de API já feitas no teste (guarde-os).
Confirme rótulos/refs lendo `DayEditor.tsx`.

> A chamada real ao `gpt-4o-mini` (rota `generate`) NÃO é exercitada aqui — é verificada no smoke manual.

- [ ] **Step 2: Rodar o E2E**

Run: `npx playwright test`
Expected: 1 passed.

- [ ] **Step 3: Suíte completa**

Run: `npx vitest run && npx playwright test`
Expected: unit (macros, bmr, weekly, solver, menu, taco, units-data) e E2E verdes.

- [ ] **Step 4: Commit**
```bash
git add tests/e2e/flow.spec.ts
git commit -m "test: e2e favorites + apply fixed menu proposal + option switch"
```

---

## Self-Review

**1. Cobertura do spec:**
- Preferidos (tabela + API + ⭐) → Tasks 1, 3. ✔
- Básicos (`basics.json`) → Task 3. ✔
- Opções por refeição (meals slot/option_label/selected) → Task 1; agregação selected + abas → Task 6. ✔
- Sub-metas + solver → Task 2. ✔
- IA (OpenAI json_schema + validação, ids do pool) → Task 4. ✔
- Rotas generate/apply → Task 5. ✔
- UI do gerador (N, M, proposta, aplicar) → Task 7. ✔
- Não-destrutivo até aplicar → Task 5 (generate não grava; apply substitui). ✔
- Testes: solver + validateMenu unit; E2E determinístico (favoritar + aplicar proposta fixa + trocar opção) → Tasks 2,4,8. ✔
- Env/segredo → Global Constraints + Task 4 (chave só server-side). ✔

**2. Placeholders:** motores/migrations/rotas/IA com código completo. UIs (Tasks 3,6,7) com requisitos
concretos + `data-testid` + `/frontend-design`. `basics.json` (Task 3) tem regra + formato exatos.

**3. Consistência de tipos:** `mealSubTargets`/`scaleOptionToKcal` (Task 2), `RawMenu`/`validateMenu`/
`generateMenu` (Task 4) e o formato `proposal` (Task 5) casam entre definição e consumo (Tasks 5/7/8).
`Meal` estendido (Task 1) usado na agregação/editor (Task 6). O `proposal` de `generate` (com `food`
embutido) é aceito por `apply-menu` (que só usa `food_id`/`quantity`/`unit`).

**Nota:** a `OPENAI_API_KEY` precisa ser adicionada nas env vars da Vercel no deploy (Task de deploy,
fora deste plano de código) — senão a rota `generate` retorna 502 em produção.
