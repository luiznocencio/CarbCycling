# Cardápio da Semana por IA (Feature E2) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** Gerar a semana inteira de uma vez — 1 cardápio por **tipo de dia distinto** do padrão semanal (reaproveitado nos dias iguais), 2 opções por refeição, com tela de revisão e "Aplicar semana". Preferências (E1) entram de graça (reusa o núcleo do gerador).

**Architecture:** Refactor DRY primeiro — extrair o núcleo do C1 `generate` → `generateProposalForDayType` (`src/lib/ai/generate.ts`) e do `apply-menu` → `applyProposalToDayType` (`src/lib/nutrition/apply.ts`); os endpoints atuais viram wrappers finos (contrato inalterado). Helper puro `distinctDayTypeIds` (`src/lib/nutrition/week.ts`). Novos endpoints `POST /api/week/generate` (resiliente por tipo de dia) e `POST /api/week/apply`. Componente `WeekMenuGenerator` na dashboard.

**Tech Stack:** Next.js 16 · TypeScript · Tailwind v4 · Supabase · OpenAI `gpt-4o-mini` · Vitest · Playwright.

## Global Constraints

- **Next 16:** `params`/`cookies()` async; `proxy.ts`. Ver `docs/superpowers/NEXT16-DECISIONS.md` e guias em `node_modules/next/dist/docs/`.
- **IA server-side apenas; `OPENAI_API_KEY` segredo** (já em `.env.local` + Vercel; não mexer).
- **IA nunca é fonte de verdade:** `validateMenu`/`validateItems` + solver fixam; `avoid` filtra pool.
- **Sem migração nova** — reusa `weekly_pattern`/`day_types`/`meals`/`meal_items`/`food_favorites`/`user_preferences`.
- **Refactor sem regressão:** `generate`/`apply-menu` mantêm status/mensagens atuais (404/400/502); E2E e `MenuGenerator` seguem verdes.
- **RLS por usuário**; rotas usam `createServerSupabase` + `auth.getUser()`.
- **Supabase project id:** `pxzpxtzueeketotrlslj`.

---

## Estrutura de arquivos

```
src/lib/ai/generate.ts                       # generateProposalForDayType (Task 1, novo)
src/lib/nutrition/apply.ts                   # applyProposalToDayType (Task 2, novo)
src/lib/nutrition/week.ts                    # distinctDayTypeIds puro (Task 3, novo)
src/app/api/day-types/[id]/generate/route.ts # vira wrapper fino (Task 1)
src/app/api/day-types/[id]/apply-menu/route.ts # vira wrapper fino (Task 2)
src/app/api/week/generate/route.ts           # novo (Task 4)
src/app/api/week/apply/route.ts              # novo (Task 5)
src/components/WeekMenuGenerator.tsx         # novo (Task 6)
src/app/(app)/page.tsx                        # integra o componente (Task 6)
tests/unit/week.test.ts                      # distinctDayTypeIds (Task 3)
tests/e2e/flow.spec.ts                       # week/apply determinístico (Task 7)
```

---

## Task 1: Extrair `generateProposalForDayType` + wrapper do generate

**Files:**
- Create: `src/lib/ai/generate.ts`
- Modify: `src/app/api/day-types/[id]/generate/route.ts`

**Interfaces:**
- Consumes: `mealSubTargets`/`scaleOptionToTarget` (`@/lib/nutrition/solver`), `mealMacros` (`@/lib/nutrition/macros`), `generateMenu` (`@/lib/ai/menu`), `loadPreferences`/`applyAvoidToPool`/`prefsPromptSnippet` (`@/lib/ai/preferences`), `basics`, `Food`/`DayType`.
- Produces: `generateProposalForDayType(supabase, dayType, { meals, options }): Promise<ProposalResult>`.

- [ ] **Step 1: Criar `src/lib/ai/generate.ts`**

Mova a lógica do route atual para a função (é o mesmo corpo entre a montagem do pool e o `return`):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { mealSubTargets, scaleOptionToTarget } from "@/lib/nutrition/solver";
import { mealMacros } from "@/lib/nutrition/macros";
import { generateMenu } from "@/lib/ai/menu";
import { loadPreferences, applyAvoidToPool, prefsPromptSnippet } from "@/lib/ai/preferences";
import basics from "@/../data/basics.json";
import type { DayType, Food } from "@/lib/types";

type ProposalItem = { food_id: string; quantity: number; unit: "g" | "unit"; food: Food };
export type Proposal = {
  slots: { name: string; slot: number; options: { label: string; items: ProposalItem[]; macros: ReturnType<typeof mealMacros> }[] }[];
};
export type ProposalResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; error: string; status: number };

export async function generateProposalForDayType(
  supabase: SupabaseClient,
  dayType: DayType,
  opts: { meals: number; options: number },
): Promise<ProposalResult> {
  const n = opts.meals, m = opts.options;

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
    return { ok: false, error: "Sem alimentos no pool. Favorite alguns alimentos.", status: 400 };
  }

  // Preferências (E1): avoid filtra o pool (duro); guidance orienta o prompt.
  const prefs = await loadPreferences(supabase);
  const filteredPool = applyAvoidToPool(pool, prefs.avoid);
  if (filteredPool.length === 0) {
    return { ok: false, error: "Pool vazio após preferências — afrouxe os itens evitados ou favorite mais alimentos.", status: 400 };
  }
  const filteredMap = new Map(filteredPool.map((f) => [f.id, f]));

  const subTargets = mealSubTargets(dayType, n);
  let raw;
  try {
    raw = await generateMenu({
      subTargets, options: m, guidance: prefsPromptSnippet(prefs),
      pool: filteredPool.map((f) => ({
        id: f.id, name: f.name,
        kcal_per_100g: f.kcal_per_100g, protein_per_100g: f.protein_per_100g,
        carbs_per_100g: f.carbs_per_100g, fat_per_100g: f.fat_per_100g,
        unit_name: f.unit_name, unit_grams: f.unit_grams,
      })),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao gerar cardápio", status: 502 };
  }

  const slots = raw.slots.slice(0, n).map((slot, si) => {
    const sub = subTargets[si] ?? subTargets[subTargets.length - 1];
    const options = slot.options.slice(0, m).map((opt, oi) => {
      const withFood = opt.items
        .map((it) => ({ ...it, food: filteredMap.get(it.food_id)! }))
        .filter((it) => it.food);
      const scaled = scaleOptionToTarget(withFood, { kcal: sub.kcal, protein_g: sub.protein_g });
      return { label: `Opção ${oi + 1}`, items: scaled, macros: mealMacros(scaled) };
    });
    return { name: slot.name, slot: si, options };
  });

  return { ok: true, proposal: { slots } };
}
```
(Confirme o shape de `mealMacros`/`scaleOptionToTarget` lendo `macros.ts`/`solver.ts`; use os mesmos tipos que o route usa hoje. Se `SupabaseClient` não casar, use `Awaited<ReturnType<typeof import("@/lib/supabase/server").createServerSupabase>>`.)

- [ ] **Step 2: `generate/route.ts` vira wrapper fino**

Substitua o corpo pós-auth por:
```ts
  const n = Math.min(12, Math.max(1, Math.trunc(Number(body.meals) || 5)));
  const m = Math.min(12, Math.max(1, Math.trunc(Number(body.options) || 3)));
  const { data: dayType } = await supabase.from("day_types").select("*").eq("id", id).maybeSingle();
  if (!dayType) return NextResponse.json({ error: "tipo de dia não encontrado" }, { status: 404 });
  const res = await generateProposalForDayType(supabase, dayType, { meals: n, options: m });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ proposal: res.proposal });
```
Ajuste imports (remove o que migrou; importa `generateProposalForDayType`). **Contrato externo inalterado** (mesmos 404/400/502, mesmo `{proposal}`).

- [ ] **Step 3: Verificar**

Run: `cd /e/CODE/carb-cycling && npx tsc --noEmit && npx vitest run`
Expected: 0 erros; unit verde (48).

- [ ] **Step 4: Commit**
```bash
git add src/lib/ai/generate.ts "src/app/api/day-types/[id]/generate/route.ts"
git commit -m "refactor: extract generateProposalForDayType; generate route is a thin wrapper"
```

---

## Task 2: Extrair `applyProposalToDayType` + wrapper do apply-menu

**Files:**
- Create: `src/lib/nutrition/apply.ts`
- Modify: `src/app/api/day-types/[id]/apply-menu/route.ts`

**Interfaces:**
- Produces: `applyProposalToDayType(supabase, userId, dayTypeId, proposal): Promise<ApplyResult>`.

- [ ] **Step 1: Criar `src/lib/nutrition/apply.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

type ProposalItem = { food_id: string; quantity: number; unit: "g" | "unit" };
export type Proposal = {
  slots: { name: string; slot: number; options: { label: string; items: ProposalItem[] }[] }[];
};
export type ApplyResult = { ok: true } | { ok: false; error: string; status: number };

export async function applyProposalToDayType(
  supabase: SupabaseClient, userId: string, dayTypeId: string, proposal: Proposal,
): Promise<ApplyResult> {
  if (!proposal || !Array.isArray(proposal.slots)) {
    return { ok: false, error: "proposta inválida", status: 400 };
  }
  const { data: dayType } = await supabase.from("day_types").select("id").eq("id", dayTypeId).maybeSingle();
  if (!dayType) return { ok: false, error: "tipo de dia não encontrado", status: 404 };

  const { error: delErr } = await supabase.from("meals").delete().eq("day_type_id", dayTypeId);
  if (delErr) return { ok: false, error: delErr.message, status: 400 };

  for (const slot of proposal.slots) {
    for (let oi = 0; oi < slot.options.length; oi++) {
      const opt = slot.options[oi];
      const { data: meal, error: mErr } = await supabase
        .from("meals")
        .insert({
          user_id: userId, day_type_id: dayTypeId, name: slot.name,
          order: slot.slot, slot: slot.slot, option_label: opt.label, selected: oi === 0,
        })
        .select().single();
      if (mErr) return { ok: false, error: mErr.message, status: 400 };
      if (opt.items.length) {
        const rows = opt.items.map((it) => ({
          meal_id: meal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit,
        }));
        const { error: iErr } = await supabase.from("meal_items").insert(rows);
        if (iErr) return { ok: false, error: iErr.message, status: 400 };
      }
    }
  }
  return { ok: true };
}
```

- [ ] **Step 2: `apply-menu/route.ts` vira wrapper fino**

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { applyProposalToDayType, type Proposal } from "@/lib/nutrition/apply";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { proposal } = (await req.json()) as { proposal: Proposal };
  const res = await applyProposalToDayType(supabase, user.id, id, proposal);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verificar (inclui E2E — apply-menu é exercitado no bloco 6)**

Run: `cd /e/CODE/carb-cycling && npx tsc --noEmit && npx vitest run && npx playwright test`
Expected: tsc 0; unit verde; **E2E 1 passed** (o bloco 6 usa apply-menu → confirma que o wrapper preserva o comportamento).

- [ ] **Step 4: Commit**
```bash
git add src/lib/nutrition/apply.ts "src/app/api/day-types/[id]/apply-menu/route.ts"
git commit -m "refactor: extract applyProposalToDayType; apply-menu route is a thin wrapper"
```

---

## Task 3: Helper puro `distinctDayTypeIds`

**Files:**
- Create: `src/lib/nutrition/week.ts`, `tests/unit/week.test.ts`

**Interfaces:**
- Produces: `distinctDayTypeIds(pattern: { weekday: number; day_type_id: string }[]): string[]` (distintos, na ordem do 1º weekday em que aparecem).

- [ ] **Step 1: Teste que falha**

Crie `tests/unit/week.test.ts`:
```ts
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
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/week.test.ts` — FAIL.

- [ ] **Step 3: Implementar**

Crie `src/lib/nutrition/week.ts`:
```ts
export function distinctDayTypeIds(
  pattern: { weekday: number; day_type_id: string }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of [...pattern].sort((a, b) => a.weekday - b.weekday)) {
    if (!e.day_type_id || seen.has(e.day_type_id)) continue;
    seen.add(e.day_type_id);
    out.push(e.day_type_id);
  }
  return out;
}
```

- [ ] **Step 4: Rodar (deve passar) + suíte**

Run: `npx vitest run` — PASS (49+).

- [ ] **Step 5: Commit**
```bash
git add src/lib/nutrition/week.ts tests/unit/week.test.ts
git commit -m "feat: distinctDayTypeIds pure helper"
```

---

## Task 4: Endpoint `POST /api/week/generate`

**Files:**
- Create: `src/app/api/week/generate/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `distinctDayTypeIds` (Task 3), `generateProposalForDayType` (Task 1), `DayType`.
- Produces: `POST /api/week/generate` (body `{ meals?, options? }`) → `{ week: [{ day_type_id, name, proposal? , error? }] }`.

- [ ] **Step 1: Criar a rota**

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { distinctDayTypeIds } from "@/lib/nutrition/week";
import { generateProposalForDayType } from "@/lib/ai/generate";
import type { DayType } from "@/lib/types";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const n = Math.min(12, Math.max(1, Math.trunc(Number(body.meals) || 5)));
  const m = Math.min(12, Math.max(1, Math.trunc(Number(body.options) || 2)));

  const { data: pattern } = await supabase.from("weekly_pattern").select("weekday, day_type_id");
  const ids = distinctDayTypeIds(pattern ?? []);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Defina o padrão semanal primeiro (nenhum dia atribuído)." }, { status: 400 });
  }
  const { data: dayTypes } = await supabase.from("day_types").select("*").in("id", ids);
  const dtById = new Map((dayTypes ?? []).map((d) => [d.id, d as DayType]));

  const week: { day_type_id: string; name: string; proposal?: unknown; error?: string }[] = [];
  let anyOk = false, firstErr = "Falha ao gerar a semana", firstStatus = 502;
  for (const id of ids) {
    const dt = dtById.get(id);
    if (!dt) { week.push({ day_type_id: id, name: "?", error: "tipo de dia não encontrado" }); continue; }
    const res = await generateProposalForDayType(supabase, dt, { meals: n, options: m });
    if (res.ok) { anyOk = true; week.push({ day_type_id: id, name: dt.name, proposal: res.proposal }); }
    else { firstErr = res.error; firstStatus = res.status; week.push({ day_type_id: id, name: dt.name, error: res.error }); }
  }
  if (!anyOk) return NextResponse.json({ error: firstErr }, { status: firstStatus });
  return NextResponse.json({ week });
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` — 0 erros.

- [ ] **Step 3: Commit**
```bash
git add "src/app/api/week/generate/route.ts"
git commit -m "feat: POST /api/week/generate (per-distinct-day-type, resilient)"
```

---

## Task 5: Endpoint `POST /api/week/apply`

**Files:**
- Create: `src/app/api/week/apply/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `applyProposalToDayType`/`Proposal` (Task 2).
- Produces: `POST /api/week/apply` (body `{ week: { day_type_id, proposal }[] }`) → `{ ok, applied, failed }`.

- [ ] **Step 1: Criar a rota**

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { applyProposalToDayType, type Proposal } from "@/lib/nutrition/apply";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const entries: { day_type_id: string; proposal: Proposal }[] =
    Array.isArray(body.week) ? body.week.filter((e: unknown) =>
      !!e && typeof (e as { day_type_id?: unknown }).day_type_id === "string" &&
      !!(e as { proposal?: unknown }).proposal) : [];
  if (entries.length === 0) {
    return NextResponse.json({ error: "Nada para aplicar." }, { status: 400 });
  }
  let applied = 0;
  const failed: { day_type_id: string; error: string }[] = [];
  for (const e of entries) {
    const res = await applyProposalToDayType(supabase, user.id, e.day_type_id, e.proposal);
    if (res.ok) applied++;
    else failed.push({ day_type_id: e.day_type_id, error: res.error });
  }
  return NextResponse.json({ ok: true, applied, failed });
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` — 0 erros.

- [ ] **Step 3: Commit**
```bash
git add "src/app/api/week/apply/route.ts"
git commit -m "feat: POST /api/week/apply (applies each day-type proposal)"
```

---

## Task 6: `WeekMenuGenerator` na dashboard

**Files:**
- Create: `src/components/WeekMenuGenerator.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `POST /api/week/generate`, `POST /api/week/apply`. Tipos `Macros`/`DayType`.
- Produces: botão `data-testid="week-generate"`, revisão `data-testid="week-review"`, botão `data-testid="week-apply"`.

**Skill:** invoque `/frontend-design` para a revisão da semana ficar legível no mobile.

- [ ] **Step 1: Implementar**

Leia `src/components/MenuGenerator.tsx` para reaproveitar o visual (TotalBar, abas de opção, tolerância). Crie `WeekMenuGenerator.tsx` (client `"use client"`):
- Botão **"Gerar semana com IA"** (`week-generate`) → `POST /api/week/generate` (body `{ meals: 5, options: 2 }`). Enquanto gera, "Gerando a semana…" e desabilita. 400 (sem padrão) / 502 → mensagem amigável.
- **Revisão** (`week-review`): para cada entrada de `week`, uma seção com `name` do tipo de dia; se tem `proposal`, renderiza por slot as 2 opções em abas + totais (kcal/proteína) — reaproveite as barras/abas do `MenuGenerator` (extraia um `ProposalReview` se ajudar, mantendo o `MenuGenerator` funcionando). Se a entrada tem `error`, mostra o motivo e marca "não será aplicada".
- Botão **"Aplicar semana"** (`week-apply`) → `POST /api/week/apply` com `{ week: entradas com proposal → { day_type_id, proposal } }`. Em sucesso: feedback "Semana aplicada." + `router.refresh()`. Mostra `failed[]` se houver. Desabilita enquanto aplica.
- **"Gerar novamente"** repete o generate.
- Integre em `src/app/(app)/page.tsx` (server component) renderizando `<WeekMenuGenerator />` acima ou abaixo do `<WeekGrid />`.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npx vitest run` — 0 erros; unit verde.

- [ ] **Step 3: Commit**
```bash
git add src/components/WeekMenuGenerator.tsx "src/app/(app)/page.tsx"
git commit -m "feat: WeekMenuGenerator on dashboard (generate + review + apply week)"
```

---

## Task 7: E2E (week/apply determinístico) + suíte + ledger

**Files:**
- Modify: `tests/e2e/flow.spec.ts`

**Interfaces:**
- Consumes: `POST /api/week/apply` (Task 5), o `dayTypeId`/padrão semanal já criados no fluxo.
- Produces: E2E verde cobrindo aplicar uma semana (sem IA).

- [ ] **Step 1: Bloco no E2E**

Ao fim do teste, adicione um bloco: monte uma **proposta fixa** de semana para o `dayTypeId` já existente e chame `week/apply`:
```ts
// 9. E2: aplicar semana (proposta fixa, sem IA)
const weekProposal = {
  week: [
    { day_type_id: dayTypeId, proposal: { slots: [
      { name: "Café", slot: 0, options: [
        { label: "Opção 1", items: [{ food_id: foodId, quantity: 100, unit: "g" }] },
        { label: "Opção 2", items: [{ food_id: foodId, quantity: 200, unit: "g" }] },
      ] },
    ] } },
  ],
};
const weekRes = await page.request.post("/api/week/apply", { data: weekProposal });
expect(weekRes.ok()).toBeTruthy();
const weekBody = await weekRes.json();
expect(weekBody.applied).toBe(1);
// confere no editor do dia: 2 abas de opção; Opção 1 (100g de frango, 165 kcal/100g) selecionada
await page.goto(`/day/${dayTypeId}`);
await expect(page.getByTestId("option-tab")).toHaveCount(2);
await expect
  .poll(async () =>
    Number((await page.getByTestId("day-total-kcal").innerText()).replace(/\D/g, "")),
  )
  .toBe(165);
```
(Use o `foodId`/`dayTypeId` já definidos no teste. `foodId` = 165 kcal/100g. Confirme os refs lendo o bloco anterior.)

- [ ] **Step 2: E2E**

Run: `npx playwright test` — 1 passed.

- [ ] **Step 3: Suíte completa**

Run: `npx vitest run && npx playwright test` — unit (…, week, preferences) e E2E verdes.

- [ ] **Step 4: Atualizar o ledger + commit**

Atualize `.superpowers/sdd/progress.md` (seção E2) com as Tasks 1–7 e hashes.
```bash
git add tests/e2e/flow.spec.ts .superpowers/sdd/progress.md
git commit -m "test: e2e week apply; ledger E2"
```

---

## Self-Review

**1. Cobertura do spec:**
- Extrair generate → `generateProposalForDayType` + wrapper (contrato inalterado) → Task 1. ✔
- Extrair apply → `applyProposalToDayType` + wrapper → Task 2 (E2E confirma). ✔
- `distinctDayTypeIds` puro/testado → Task 3. ✔
- `week/generate` (resiliente por tipo de dia; 400 sem padrão; 502 só se todas falharem) → Task 4. ✔
- `week/apply` (aplica válidas, reporta falhas; 400 se nada) → Task 5. ✔
- UX dashboard (gerar/revisar/aplicar, prefs de graça) → Task 6. ✔
- Testes: unit week; E2E week/apply sem IA; generate/apply-menu sem regressão → Tasks 2,3,7. ✔
- Sem migração → confirmado. ✔

**2. Placeholders:** helpers e rotas com código completo. UI (Task 6) com requisitos + `data-testid` + `/frontend-design`.

**3. Consistência de tipos:** `Proposal` de `apply.ts` (Task 2) reusado no `week/apply` (Task 5) e no wrapper; `generateProposalForDayType` (Task 1) consumido pelo generate wrapper e por `week/generate` (Task 4); `distinctDayTypeIds` (Task 3) alimenta `week/generate`. O `proposal` retornado por `generate.ts` inclui `macros` (para a revisão), mas o `apply` só usa `label`/`items`/`slot`/`name` — compatível (campos extras ignorados). Prefs aplicadas dentro de `generateProposalForDayType` (uma fonte só).

**Nota:** o refactor toca 2 rotas em produção (generate, apply-menu) mas preserva contrato — a rede de segurança é o E2E (apply-menu) + unit. Sem env/segredo/migração novos.
