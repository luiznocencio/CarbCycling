# Perfil + Metas Inteligentes (Feature A) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o cálculo de metas por peso por um modelo baseado em basal real (3 fórmulas de BMR), com orçamento calórico semanal auto-balanceado por tipo de dia e travas de segurança configuráveis.

**Architecture:** Dois motores puros e testáveis (`bmr.ts`, `weekly.ts`) fazem toda a matemática (determinística, sem IA). Um endpoint `POST /api/targets/recalculate` lê perfil + padrão semanal + tipos de dia, roda os motores e grava as metas em todos os `day_types`. A UI de Configurações é dividida em `ProfileForm` (dados + preview de BMR/TDEE ao vivo) e `WeeklyTargetsPanel` (recálculo + resumo semanal + edição). O antigo `suggestTargets`/"Sugerir metas" por dia é removido.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Vitest · Playwright.

## Global Constraints

- **Next.js 16:** middleware é `src/proxy.ts` (função `proxy`); `cookies()`/`params`/`searchParams` são `await`. Ver `docs/superpowers/NEXT16-DECISIONS.md`.
- **Determinístico, sem IA:** todo o cálculo é matemática pura em `src/lib/nutrition/`.
- **UI em pt-BR, mobile-first.** Código/identificadores/commits em inglês.
- **RLS por usuário:** rotas usam `createServerSupabase()` + `auth.getUser()` em escritas; confiam no RLS (padrão já estabelecido em `src/app/api/foods/`).
- **Supabase project id:** `pxzpxtzueeketotrlslj` (migrations aplicadas via Supabase MCP `apply_migration`).
- **Fórmulas e constantes** (copiadas verbatim do spec):
  - Atividade → TDEE: `sedentary 1.2 · light 1.375 · moderate 1.55 · active 1.725`
  - Ajuste objetivo×intensidade: fat_loss `−0.10/−0.20/−0.25`, maintenance `0`, muscle_gain `+0.07/+0.12/+0.20` (leve/moderado/agressivo)
  - Amplitude do ciclo (r por nível): light `low .92 / med 1.0 / high 1.08`, moderate `.85/1.0/1.15`, aggressive `.78/1.0/1.22`
  - `PROTEIN_G_PER_KG = 2.0` · `CARB_G_PER_KG = {low:1.0, medium:2.5, high:4.0}` · `FAT_MIN_G_PER_KG = 0.5`
  - Travas (quando ligadas): piso de kcal no BMR; gordura ≥ 0.5 g/kg; aviso se ajuste `< −0.25` ou média `< BMR`; aviso se ajuste `> +0.20`.

---

## Estrutura de arquivos

```
src/lib/
  types.ts                       # + Sex, Intensity, BmrFormula; Profile estendido (Task 1)
  nutrition/
    bmr.ts                       # NOVO — 3 fórmulas + híbrido + tdee (Task 2)
    weekly.ts                    # NOVO — distribuição semanal + travas (Task 3)
    targets.ts                   # REMOVIDO (Task 5) — substituído por bmr+weekly
src/app/api/
  profile/route.ts               # estende GET/PUT com campos novos (Task 4)
  targets/recalculate/route.ts   # NOVO — endpoint de recálculo (Task 5)
  day-types/route.ts             # remove branch autoSuggest (Task 5)
  day-types/[id]/route.ts        # remove branch autoSuggest (Task 5)
src/components/
  ProfileForm.tsx                # NOVO — perfil + preview BMR/TDEE (Task 6)
  WeeklyTargetsPanel.tsx         # NOVO — tipos de dia + recálculo + resumo (Task 7)
  DayTypesSettings.tsx           # REMOVIDO (Task 7) — desmembrado em ProfileForm+WeeklyTargetsPanel
src/app/(app)/settings/page.tsx  # compõe ProfileForm + WeeklyTargetsPanel + WeeklyPatternSettings (Task 7)
supabase/migrations/
  0002_profile_bmr.sql           # NOVO (Task 1)
tests/
  unit/bmr.test.ts               # NOVO (Task 2)
  unit/weekly.test.ts            # NOVO (Task 3)
  unit/targets.test.ts           # REMOVIDO (Task 5)
  e2e/flow.spec.ts               # atualizado para o novo fluxo (Task 8)
```

---

## Task 1: Migration do perfil + tipos

**Files:**
- Create: `supabase/migrations/0002_profile_bmr.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: tabela `profiles` existente.
- Produces: colunas novas em `profiles`; tipos `Sex`, `Intensity`, `BmrFormula`; `Profile` estendido (consumido por todas as tasks seguintes).

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/0002_profile_bmr.sql`:
```sql
alter table profiles
  add column sex text check (sex in ('male','female')),
  add column age int check (age > 0 and age < 120),
  add column height_cm numeric check (height_cm > 0),
  add column body_fat_pct numeric check (body_fat_pct >= 0 and body_fat_pct < 75),
  add column bmr_formula text not null default 'auto' check (bmr_formula in ('auto','mifflin','harris','katch')),
  add column intensity text not null default 'moderate' check (intensity in ('light','moderate','aggressive')),
  add column safety_guardrails boolean not null default true;
```

- [ ] **Step 2: Aplicar a migration via Supabase MCP**

Aplique com a ferramenta MCP (carregue via ToolSearch `select:mcp__366da671-5102-4665-8ade-cc7028d3395f__apply_migration`):
`apply_migration(project_id="pxzpxtzueeketotrlslj", name="profile_bmr", query=<conteúdo do arquivo>)`.
Expected: `{"success":true}`. Confirme com `list_tables` (schema public) que `profiles` tem as 7 colunas novas.

- [ ] **Step 3: Estender os tipos**

Em `src/lib/types.ts`, adicione após `ActivityLevel`:
```ts
export type Sex = "male" | "female";
export type Intensity = "light" | "moderate" | "aggressive";
export type BmrFormula = "auto" | "mifflin" | "harris" | "katch";
```
E substitua a interface `Profile` por:
```ts
export interface Profile {
  user_id: string;
  weight_kg: number;
  goal: Goal;
  activity_level: ActivityLevel;
  sex: Sex | null;
  age: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  bmr_formula: BmrFormula;
  intensity: Intensity;
  safety_guardrails: boolean;
}
```

- [ ] **Step 4: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: exit 0 (podem surgir erros em `profile/route.ts`/`DayTypesSettings.tsx` que consomem `Profile` — serão resolvidos nas tasks 4/6/7; se aparecerem, siga; o objetivo aqui é o types.ts compilar isolado — confirme que os erros são só de campos novos ainda não usados, não de sintaxe em types.ts).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/0002_profile_bmr.sql src/lib/types.ts
git commit -m "feat: profile schema for bmr (sex/age/height/bodyfat/formula/intensity/guardrails)"
```

---

## Task 2: Motor de BMR/TDEE (puro, TDD)

**Files:**
- Create: `src/lib/nutrition/bmr.ts`
- Create: `tests/unit/bmr.test.ts`

**Interfaces:**
- Consumes: `Sex`, `ActivityLevel`, `BmrFormula`, `Profile` (Task 1).
- Produces:
  - `bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number`
  - `bmrHarris(sex: Sex, weightKg: number, heightCm: number, age: number): number`
  - `bmrKatch(weightKg: number, bodyFatPct: number): number`
  - `isProfileComplete(p: Pick<Profile,"sex"|"age"|"height_cm"|"weight_kg">): boolean`
  - `bmr(p: Pick<Profile,"sex"|"weight_kg"|"height_cm"|"age"|"body_fat_pct">, formula: BmrFormula): number`
  - `tdee(bmrValue: number, activity: ActivityLevel): number`

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/unit/bmr.test.ts`:
```ts
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
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/bmr.test.ts`
Expected: FAIL — módulo `@/lib/nutrition/bmr` não existe.

- [ ] **Step 3: Implementar `bmr.ts`**

Crie `src/lib/nutrition/bmr.ts`:
```ts
import type { Sex, ActivityLevel, BmrFormula, Profile } from "@/lib/types";

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export function bmrHarris(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const v =
    sex === "male"
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  return Math.round(v);
}

export function bmrKatch(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - bodyFatPct / 100);
  return Math.round(370 + 21.6 * lbm);
}

export function isProfileComplete(
  p: Pick<Profile, "sex" | "age" | "height_cm" | "weight_kg">,
): boolean {
  return p.sex != null && p.age != null && p.height_cm != null && p.weight_kg != null;
}

export function bmr(
  p: Pick<Profile, "sex" | "weight_kg" | "height_cm" | "age" | "body_fat_pct">,
  formula: BmrFormula,
): number {
  const useKatch =
    (formula === "katch" || formula === "auto") && p.body_fat_pct != null;
  if (useKatch) return bmrKatch(p.weight_kg, p.body_fat_pct as number);
  if (formula === "harris") return bmrHarris(p.sex!, p.weight_kg, p.height_cm!, p.age!);
  // 'mifflin', 'auto' sem BF%, ou 'katch' sem BF% (fallback)
  return bmrMifflin(p.sex!, p.weight_kg, p.height_cm!, p.age!);
}

export function tdee(bmrValue: number, activity: ActivityLevel): number {
  return Math.round(bmrValue * ACTIVITY_FACTOR[activity]);
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/unit/bmr.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**
```bash
git add src/lib/nutrition/bmr.ts tests/unit/bmr.test.ts
git commit -m "feat: pure bmr/tdee engine (mifflin, harris, katch, hybrid)"
```

---

## Task 3: Motor de distribuição semanal (puro, TDD)

**Files:**
- Create: `src/lib/nutrition/weekly.ts`
- Create: `tests/unit/weekly.test.ts`

**Interfaces:**
- Consumes: `Goal`, `Intensity`, `CarbLevel` (types).
- Produces:
  - `weeklyKcalByLevel(avgDaily: number, r: Record<CarbLevel, number>, counts: Record<CarbLevel, number>): Record<CarbLevel, number>`
  - `levelTargets(kcalLevel: number, weightKg: number, level: CarbLevel, opts: { guardrails: boolean; bmr: number }): { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number; warnings: string[] }`
  - `distributeWeeklyTargets(input: { tdee: number; weightKg: number; goal: Goal; intensity: Intensity; guardrails: boolean; bmr: number; levelCounts: Record<CarbLevel, number> }): { perLevel: Record<CarbLevel, { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number }>; summary: { avgDailyTarget: number; actualWeeklyAvg: number; adjustmentPct: number; warnings: string[] } }`

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/unit/weekly.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { weeklyKcalByLevel, levelTargets, distributeWeeklyTargets } from "@/lib/nutrition/weekly";

describe("weeklyKcalByLevel", () => {
  it("média ponderada = avgDaily e ciclo monotônico", () => {
    const r = { low: 0.85, medium: 1.0, high: 1.15 };
    const counts = { low: 3, medium: 2, high: 2 };
    const res = weeklyKcalByLevel(2176, r, counts);
    const weighted =
      (counts.low * res.low + counts.medium * res.medium + counts.high * res.high) / 7;
    expect(weighted).toBeCloseTo(2176, 6);
    expect(res.low).toBeLessThan(res.medium);
    expect(res.medium).toBeLessThan(res.high);
    expect(Math.round(res.low)).toBe(1890);
    expect(Math.round(res.high)).toBe(2557);
  });
});

describe("levelTargets", () => {
  it("dia baixo 1890kcal/80kg sem clamp", () => {
    expect(levelTargets(1890, 80, "low", { guardrails: true, bmr: 1768 })).toEqual({
      target_kcal: 1887,
      target_protein_g: 160,
      target_carbs_g: 80,
      target_fat_g: 103,
      warnings: [],
    });
  });
  it("travas ligadas: piso no BMR", () => {
    const t = levelTargets(1600, 80, "low", { guardrails: true, bmr: 1768 });
    expect(t.target_kcal).toBeGreaterThanOrEqual(1768 - 5);
    expect(t.warnings.length).toBeGreaterThan(0);
  });
  it("travas desligadas: sem piso", () => {
    const t = levelTargets(1600, 80, "low", { guardrails: false, bmr: 1768 });
    expect(t.target_kcal).toBeLessThan(1768);
    expect(t.warnings).toEqual([]);
  });
  it("travas ligadas: piso de gordura 0.5g/kg", () => {
    const t = levelTargets(1500, 80, "high", { guardrails: true, bmr: 1000 });
    expect(t.target_fat_g).toBe(40);
    expect(t.warnings.some((w) => w.toLowerCase().includes("gordura"))).toBe(true);
  });
});

describe("distributeWeeklyTargets", () => {
  it("perda moderada, 80kg, 3/2/2 → média ≈ alvo", () => {
    const res = distributeWeeklyTargets({
      tdee: 2720,
      weightKg: 80,
      goal: "fat_loss",
      intensity: "moderate",
      guardrails: true,
      bmr: 1768,
      levelCounts: { low: 3, medium: 2, high: 2 },
    });
    expect(res.summary.avgDailyTarget).toBe(2176);
    expect(res.summary.actualWeeklyAvg).toBeGreaterThan(2150);
    expect(res.summary.actualWeeklyAvg).toBeLessThan(2200);
    expect(res.perLevel.low.target_carbs_g).toBe(80);
    expect(res.perLevel.high.target_carbs_g).toBe(320);
    expect(res.perLevel.high.target_kcal).toBeGreaterThan(res.perLevel.low.target_kcal);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/weekly.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `weekly.ts`**

Crie `src/lib/nutrition/weekly.ts`:
```ts
import type { Goal, Intensity, CarbLevel } from "@/lib/types";

const PROTEIN_G_PER_KG = 2.0;
const FAT_MIN_G_PER_KG = 0.5;
const CARB_G_PER_KG: Record<CarbLevel, number> = { low: 1.0, medium: 2.5, high: 4.0 };

const GOAL_ADJ: Record<Goal, Record<Intensity, number>> = {
  fat_loss: { light: -0.1, moderate: -0.2, aggressive: -0.25 },
  maintenance: { light: 0, moderate: 0, aggressive: 0 },
  muscle_gain: { light: 0.07, moderate: 0.12, aggressive: 0.2 },
};

const AMPLITUDE: Record<Intensity, Record<CarbLevel, number>> = {
  light: { low: 0.92, medium: 1.0, high: 1.08 },
  moderate: { low: 0.85, medium: 1.0, high: 1.15 },
  aggressive: { low: 0.78, medium: 1.0, high: 1.22 },
};

export function weeklyKcalByLevel(
  avgDaily: number,
  r: Record<CarbLevel, number>,
  counts: Record<CarbLevel, number>,
): Record<CarbLevel, number> {
  const total = counts.low + counts.medium + counts.high;
  const rbar =
    total > 0
      ? (counts.low * r.low + counts.medium * r.medium + counts.high * r.high) / total
      : (r.low + r.medium + r.high) / 3;
  return {
    low: (avgDaily * r.low) / rbar,
    medium: (avgDaily * r.medium) / rbar,
    high: (avgDaily * r.high) / rbar,
  };
}

export function levelTargets(
  kcalLevel: number,
  weightKg: number,
  level: CarbLevel,
  opts: { guardrails: boolean; bmr: number },
): { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number; warnings: string[] } {
  const warnings: string[] = [];
  let kcal = kcalLevel;
  if (opts.guardrails && kcal < opts.bmr) {
    warnings.push(
      `Dia ${labelPt(level)} (${Math.round(kcalLevel)} kcal) travado no basal (${opts.bmr} kcal): déficit real menor que o pedido.`,
    );
    kcal = opts.bmr;
  }
  const protein = Math.round(PROTEIN_G_PER_KG * weightKg);
  const carbs = Math.round(CARB_G_PER_KG[level] * weightKg);
  const fatMin = Math.round(FAT_MIN_G_PER_KG * weightKg);
  let fat = Math.round((kcal - protein * 4 - carbs * 4) / 9);
  if (opts.guardrails && fat < fatMin) {
    warnings.push(
      `Dia ${labelPt(level)}: gordura ajustada para o mínimo de ${fatMin} g (0,5 g/kg).`,
    );
    fat = fatMin;
  }
  if (fat < 0) fat = 0;
  return {
    target_kcal: protein * 4 + carbs * 4 + fat * 9,
    target_protein_g: protein,
    target_carbs_g: carbs,
    target_fat_g: fat,
    warnings,
  };
}

function labelPt(level: CarbLevel): string {
  return level === "low" ? "baixo" : level === "medium" ? "médio" : "alto";
}

export function distributeWeeklyTargets(input: {
  tdee: number;
  weightKg: number;
  goal: Goal;
  intensity: Intensity;
  guardrails: boolean;
  bmr: number;
  levelCounts: Record<CarbLevel, number>;
}) {
  const adj = GOAL_ADJ[input.goal][input.intensity];
  const avgDailyTarget = Math.round(input.tdee * (1 + adj));
  const r = AMPLITUDE[input.intensity];
  const kcalByLevel = weeklyKcalByLevel(avgDailyTarget, r, input.levelCounts);

  const levels: CarbLevel[] = ["low", "medium", "high"];
  const perLevel = {} as Record<
    CarbLevel,
    { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number }
  >;
  const warnings: string[] = [];
  for (const lvl of levels) {
    const t = levelTargets(kcalByLevel[lvl], input.weightKg, lvl, {
      guardrails: input.guardrails,
      bmr: input.bmr,
    });
    perLevel[lvl] = {
      target_kcal: t.target_kcal,
      target_protein_g: t.target_protein_g,
      target_carbs_g: t.target_carbs_g,
      target_fat_g: t.target_fat_g,
    };
    warnings.push(...t.warnings);
  }

  const total = input.levelCounts.low + input.levelCounts.medium + input.levelCounts.high;
  const actualWeeklyAvg =
    total > 0
      ? Math.round(
          (input.levelCounts.low * perLevel.low.target_kcal +
            input.levelCounts.medium * perLevel.medium.target_kcal +
            input.levelCounts.high * perLevel.high.target_kcal) /
            total,
        )
      : avgDailyTarget;
  const adjustmentPct = Math.round(((actualWeeklyAvg - input.tdee) / input.tdee) * 1000) / 1000;

  if (input.guardrails && (adj < -0.25 || avgDailyTarget < input.bmr)) {
    warnings.push("Déficit agressivo: média semanal muito abaixo do gasto/basal.");
  }
  if (input.guardrails && adj > 0.2) {
    warnings.push("Superávit alto: acima de +20% do gasto.");
  }

  return {
    perLevel,
    summary: { avgDailyTarget, actualWeeklyAvg, adjustmentPct, warnings },
  };
}
```

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/unit/weekly.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**
```bash
git add src/lib/nutrition/weekly.ts tests/unit/weekly.test.ts
git commit -m "feat: pure weekly calorie-budget distribution engine with guardrails"
```

---

## Task 4: API de perfil (campos novos)

**Files:**
- Modify: `src/app/api/profile/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, tabela `profiles` (7 colunas novas), `Profile` (Task 1).
- Produces: `GET /api/profile` retorna o perfil completo (com defaults para nulos onde faz sentido); `PUT /api/profile` faz upsert de todos os campos. Consumido por `ProfileForm` (Task 6) e pelo endpoint de recálculo (Task 5).

- [ ] **Step 1: Reescrever a rota de perfil**

Substitua `src/app/api/profile/route.ts` por:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  return NextResponse.json(
    data ?? {
      user_id: user.id,
      weight_kg: 70,
      goal: "maintenance",
      activity_level: "moderate",
      sex: null,
      age: null,
      height_cm: null,
      body_fat_pct: null,
      bmr_formula: "auto",
      intensity: "moderate",
      safety_guardrails: true,
    },
  );
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      weight_kg: b.weight_kg,
      goal: b.goal,
      activity_level: b.activity_level,
      sex: b.sex ?? null,
      age: b.age ?? null,
      height_cm: b.height_cm ?? null,
      body_fat_pct: b.body_fat_pct ?? null,
      bmr_formula: b.bmr_formula ?? "auto",
      intensity: b.intensity ?? "moderate",
      safety_guardrails: b.safety_guardrails ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: exit 0 para este arquivo (erros remanescentes só em `DayTypesSettings.tsx`, que será removido na Task 7).

- [ ] **Step 3: Commit**
```bash
git add src/app/api/profile/route.ts
git commit -m "feat: profile api accepts bmr/intensity/guardrails fields"
```

---

## Task 5: Endpoint de recálculo + remover o suggestTargets antigo

**Files:**
- Create: `src/app/api/targets/recalculate/route.ts`
- Modify: `src/app/api/day-types/route.ts`, `src/app/api/day-types/[id]/route.ts`
- Delete: `src/lib/nutrition/targets.ts`, `tests/unit/targets.test.ts`

**Interfaces:**
- Consumes: `bmr`, `tdee`, `isProfileComplete` (Task 2), `distributeWeeklyTargets` (Task 3), tabelas `profiles`/`weekly_pattern`/`day_types`.
- Produces: `POST /api/targets/recalculate` → `{ summary: { avgDailyTarget, actualWeeklyAvg, adjustmentPct, warnings } }` (e grava `target_*` + `auto_suggested=true` em todos os `day_types` do usuário). Consumido por `WeeklyTargetsPanel` (Task 7).

- [ ] **Step 1: Remover o branch `autoSuggest` das rotas de day-types**

Em `src/app/api/day-types/route.ts`, no `POST`, remova o uso de `suggestTargets` e o branch `if (body.autoSuggest)`; grave sempre os targets vindos do body:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("day_types").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const { data, error } = await supabase
    .from("day_types")
    .insert({
      user_id: user.id,
      name: b.name,
      carb_level: b.carb_level,
      auto_suggested: false,
      target_kcal: b.target_kcal ?? 0,
      target_protein_g: b.target_protein_g ?? 0,
      target_carbs_g: b.target_carbs_g ?? 0,
      target_fat_g: b.target_fat_g ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
```

Em `src/app/api/day-types/[id]/route.ts`, no `PUT`, remova o import de `suggestTargets` e o branch `autoSuggest`; grave sempre os campos do body:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const { data, error } = await supabase
    .from("day_types")
    .update({
      name: b.name,
      carb_level: b.carb_level,
      auto_suggested: false,
      target_kcal: b.target_kcal,
      target_protein_g: b.target_protein_g,
      target_carbs_g: b.target_carbs_g,
      target_fat_g: b.target_fat_g,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase.from("day_types").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Deletar o motor antigo e seu teste**
```bash
git rm src/lib/nutrition/targets.ts tests/unit/targets.test.ts
```

- [ ] **Step 3: Criar o endpoint de recálculo**

Crie `src/app/api/targets/recalculate/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { bmr, tdee, isProfileComplete } from "@/lib/nutrition/bmr";
import { distributeWeeklyTargets } from "@/lib/nutrition/weekly";
import type { CarbLevel, DayType, Profile, WeeklyPatternEntry } from "@/lib/types";

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: profile }, { data: dayTypes }, { data: pattern }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("day_types").select("*"),
    supabase.from("weekly_pattern").select("*"),
  ]);

  const p = profile as Profile | null;
  if (!p || !isProfileComplete(p)) {
    return NextResponse.json(
      { error: "Complete seu perfil (sexo, idade, altura) para calcular as metas." },
      { status: 400 },
    );
  }
  const dts = (dayTypes ?? []) as DayType[];
  const entries = (pattern ?? []) as WeeklyPatternEntry[];
  const carbById = new Map(dts.map((d) => [d.id, d.carb_level]));

  const levelCounts: Record<CarbLevel, number> = { low: 0, medium: 0, high: 0 };
  for (const e of entries) {
    const lvl = carbById.get(e.day_type_id);
    if (lvl) levelCounts[lvl] += 1;
  }
  if (levelCounts.low + levelCounts.medium + levelCounts.high === 0) {
    return NextResponse.json(
      { error: "Defina o padrão semanal antes de recalcular." },
      { status: 400 },
    );
  }

  const bmrValue = bmr(p, p.bmr_formula);
  const result = distributeWeeklyTargets({
    tdee: tdee(bmrValue, p.activity_level),
    weightKg: p.weight_kg,
    goal: p.goal,
    intensity: p.intensity,
    guardrails: p.safety_guardrails,
    bmr: bmrValue,
    levelCounts,
  });

  for (const dt of dts) {
    const t = result.perLevel[dt.carb_level];
    const { error } = await supabase
      .from("day_types")
      .update({ ...t, auto_suggested: true })
      .eq("id", dt.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ summary: result.summary });
}
```

- [ ] **Step 4: Verificar tipos e testes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` exit 0 (o único consumidor remanescente de `targets.ts` é `DayTypesSettings.tsx`, tratado na Task 7 — se `tsc` acusar erro lá, é esperado; confirme que não há erro nos arquivos desta task). Vitest: `bmr` e `weekly` verdes, `targets.test.ts` não existe mais.

> Nota para o executor: se `tsc` falhar por causa de `DayTypesSettings.tsx` importando `suggestTargets`, prossiga — a Task 7 remove esse arquivo. Não reintroduza `targets.ts`.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: weekly targets recalculate endpoint; drop per-day suggestTargets"
```

---

## Task 6: ProfileForm (UI, preview de BMR/TDEE ao vivo)

**Files:**
- Create: `src/components/ProfileForm.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/profile` (Task 4), `bmr`/`tdee`/`isProfileComplete` (Task 2), tipos `Profile`/`Sex`/`Intensity`/`BmrFormula`.
- Produces: componente `<ProfileForm />` (default export). `data-testid`: `profile-weight`, `profile-sex`, `profile-age`, `profile-height`, `profile-bodyfat`, `profile-goal`, `profile-intensity`, `profile-activity`, `profile-formula`, `profile-guardrails`, `profile-save`, `bmr-preview`, `tdee-preview`.

**Skill:** invoque `/frontend-design` para o formulário (agrupar dados corporais, objetivo e o card de preview BMR/TDEE), mobile-first, usando os tokens de `globals.css`.

- [ ] **Step 1: Implementar o componente**

Crie `src/components/ProfileForm.tsx` (Client Component). Requisitos concretos:
- Carrega o perfil via `GET /api/profile` no mount; mantém em estado.
- Campos: peso (number), sexo (`select` masculino/feminino), idade (number), altura cm (number), % gordura (number, opcional), objetivo (`select`: Perda de gordura / Manutenção / Ganho de massa → `fat_loss|maintenance|muscle_gain`), intensidade (`select`: Leve/Moderado/Agressivo → `light|moderate|aggressive`), nível de atividade (`select`: Sedentário/Leve/Moderado/Ativo → `sedentary|light|moderate|active`), fórmula (`select`: Automático/Mifflin-St Jeor/Harris-Benedict/Katch-McArdle → `auto|mifflin|harris|katch`), toggle "Respeitar travas de segurança" (`safety_guardrails`).
- **Preview ao vivo:** quando `isProfileComplete` do estado atual, calcula e mostra os três BMR (`bmrMifflin`, `bmrHarris`, e `bmrKatch` se houver % gordura) e o **TDEE da fórmula selecionada** (`tdee(bmr(estado, formula), activity)`), em um card. Se incompleto, mostra "Complete peso, sexo, idade e altura para ver o basal". `data-testid="bmr-preview"` no bloco dos BMR e `data-testid="tdee-preview"` no valor do TDEE.
- Botão "Salvar perfil" (`profile-save`) → `PUT /api/profile` com todos os campos; mostra "Perfil salvo." ao concluir.
- Use os `data-testid` listados nos Interfaces.

Esqueleto (preencha a UI com `/frontend-design`):
```tsx
"use client";
import { useEffect, useState } from "react";
import { bmr, bmrMifflin, bmrHarris, bmrKatch, tdee, isProfileComplete } from "@/lib/nutrition/bmr";
import type { Profile } from "@/lib/types";

export default function ProfileForm() {
  const [p, setP] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setP);
  }, []);
  if (!p) return <p className="text-sm text-muted">Carregando…</p>;

  const complete = isProfileComplete(p);
  const selectedTdee = complete ? tdee(bmr(p, p.bmr_formula), p.activity_level) : null;

  async function save() {
    setSaved(false);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    setSaved(true);
  }
  // ... render fields (com data-testid), card de preview e botão salvar ...
  return null; // substituir pela UI real
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: exit 0 para `ProfileForm.tsx` (erros restantes só em `DayTypesSettings.tsx` até a Task 7).

- [ ] **Step 3: Commit**
```bash
git add src/components/ProfileForm.tsx
git commit -m "feat: profile form with live bmr/tdee preview"
```

---

## Task 7: WeeklyTargetsPanel + recompor a página de Configurações

**Files:**
- Create: `src/components/WeeklyTargetsPanel.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Delete: `src/components/DayTypesSettings.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/day-types`, `PUT/DELETE /api/day-types/[id]`, `POST /api/targets/recalculate` (Task 5), tipo `DayType`.
- Produces: `<WeeklyTargetsPanel />`; página de settings compondo `ProfileForm` + `WeeklyTargetsPanel` + `WeeklyPatternSettings`. `data-testid`: `daytype-name`, `daytype-carblevel`, `daytype-save`, `daytype-row`, `recalc-targets`, `weekly-summary`, `weekly-avg`, `weekly-adjustment`, `weekly-warning`.

**Skill:** invoque `/frontend-design` para o painel (lista de tipos de dia com metas editáveis, botão de recálculo, e o card-resumo da semana com avisos), mobile-first.

- [ ] **Step 1: Implementar o painel**

Crie `src/components/WeeklyTargetsPanel.tsx` (Client Component). Requisitos concretos:
- Carrega `GET /api/day-types`; permite criar (`POST`, campos: nome + carb_level, targets iniciam 0), editar metas por tipo (`PUT`), excluir (`DELETE`). `data-testid` nos campos: `daytype-name`, `daytype-carblevel`, `daytype-save`, e cada linha `daytype-row`.
- Botão **"Recalcular metas da semana"** (`recalc-targets`) → `POST /api/targets/recalculate`. Em sucesso: recarrega os tipos (para refletir as metas gravadas) e mostra o **card-resumo** (`weekly-summary`) com: média diária (`weekly-avg`), ajuste % (`weekly-adjustment`), e cada aviso como `weekly-warning`. Em erro (perfil incompleto / padrão vazio): mostra a mensagem retornada pela API.
- Editar uma meta manualmente salva com `auto_suggested=false` (já é o comportamento do `PUT`).

Esqueleto:
```tsx
"use client";
import { useEffect, useState } from "react";
import type { DayType } from "@/lib/types";

type Summary = { avgDailyTarget: number; actualWeeklyAvg: number; adjustmentPct: number; warnings: string[] };

export default function WeeklyTargetsPanel() {
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setDayTypes(await (await fetch("/api/day-types")).json());
  }
  useEffect(() => { load(); }, []);

  async function recalc() {
    setError(null);
    const res = await fetch("/api/targets/recalculate", { method: "POST" });
    const body = await res.json();
    if (!res.ok) { setError(body.error); setSummary(null); return; }
    setSummary(body.summary as Summary);
    await load();
  }
  // ... render lista de tipos (CRUD), botão recalc, card-resumo/erro ...
  return null; // substituir pela UI real
}
```

- [ ] **Step 2: Recompor a página de settings**

Substitua `src/app/(app)/settings/page.tsx` por:
```tsx
import ProfileForm from "@/components/ProfileForm";
import WeeklyTargetsPanel from "@/components/WeeklyTargetsPanel";
import WeeklyPatternSettings from "@/components/WeeklyPatternSettings";

export default function SettingsPage() {
  return (
    <main className="space-y-8">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Perfil</h1>
        <ProfileForm />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Metas por tipo de dia</h2>
        <WeeklyTargetsPanel />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Padrão semanal</h2>
        <WeeklyPatternSettings />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Remover o componente antigo**
```bash
git rm src/components/DayTypesSettings.tsx
```

- [ ] **Step 4: Verificar tipos e build**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` exit 0 (sem mais referências a `targets.ts`/`DayTypesSettings`); vitest verde (bmr + weekly + macros + taco).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: weekly targets panel + settings recomposed (profile/targets/pattern)"
```

---

## Task 8: Atualizar o E2E para o novo fluxo

**Files:**
- Modify: `tests/e2e/flow.spec.ts`

**Interfaces:**
- Consumes: a UI nova (Tasks 6/7).
- Produces: E2E do fluxo principal verde com o perfil completo + recálculo semanal.

- [ ] **Step 1: Atualizar o trecho de perfil/metas do E2E**

Em `tests/e2e/flow.spec.ts`, substitua o bloco "2. Settings" (que preenchia só peso/objetivo/atividade e clicava `daytype-suggest`) por um que:
1. Preenche o perfil completo: `profile-weight`=80, `profile-sex`=masculino, `profile-age`=30, `profile-height`=178, `profile-goal`=Manutenção, `profile-intensity`=Moderado, `profile-activity`=Moderado; clica `profile-save`; espera "Perfil salvo.".
2. Cria o tipo de dia "Baixo carbo" (`daytype-name`, `daytype-carblevel`=Baixo carbo, `daytype-save`); confirma `daytype-row` com o nome.
3. Define o padrão semanal (`weekday-select-0`=Baixo carbo, `weekly-save`, espera "Padrão salvo.").
4. Clica `recalc-targets`; espera o `weekly-summary` visível e o `weekly-avg` com valor numérico (> 0).

Os demais blocos (alimentos, editor de dia com `day-total-kcal` = "330", dashboard) permanecem iguais. Confirme os rótulos exatos lendo `ProfileForm.tsx`/`WeeklyTargetsPanel.tsx`.

- [ ] **Step 2: Rodar o E2E**

Run: `npx playwright test`
Expected: 1 passed. Depure com trace se falhar (skill `/webapp-testing`).

- [ ] **Step 3: Rodar a suíte completa**

Run: `npx vitest run && npx playwright test`
Expected: unit (bmr + weekly + macros + taco) e E2E verdes.

- [ ] **Step 4: Commit**
```bash
git add tests/e2e/flow.spec.ts
git commit -m "test: e2e covers full profile + weekly recalculate flow"
```

---

## Self-Review

**1. Cobertura do spec:**
- Perfil expandido (7 campos) → Task 1. ✔
- 3 fórmulas BMR + híbrido + TDEE → Task 2 (com valores de referência da seção 2 do spec). ✔
- Orçamento semanal + normalização + amplitude → Task 3 (`weekly.ts`, exemplo da seção 3). ✔
- Travas de segurança + toggle → Task 3 (`levelTargets`/`distributeWeeklyTargets`, guardrails on/off). ✔
- UX: ProfileForm com preview 3×BMR/TDEE → Task 6; WeeklyTargetsPanel com recálculo + resumo + avisos → Task 7; incompleto desabilita → Task 5 (400) + UI Task 7. ✔
- Schema/API/split/testes → Tasks 1/4/5/6/7/8. ✔
- Substituição do `suggestTargets` → Task 5 (delete + remove branches autoSuggest). ✔

**2. Placeholders:** os esqueletos de UI (Tasks 6/7) retornam `null` explicitamente com requisitos concretos + `data-testid` + skill `/frontend-design` — a lógica de dados (fetch/estado/cálculo) está completa; só o JSX visual é delegado. Motores e APIs têm código completo.

**3. Consistência de tipos:** `bmr`, `tdee`, `isProfileComplete`, `distributeWeeklyTargets`, `weeklyKcalByLevel`, `levelTargets` têm assinaturas idênticas entre definição (Tasks 2/3) e consumo (Tasks 5/6/7). `Profile` estendido (Task 1) usado consistentemente. `perLevel` indexado por `CarbLevel` casando com `day_type.carb_level`.

**Nota de dependência:** durante as Tasks 5–6, `tsc` pode acusar erro em `DayTypesSettings.tsx` (que ainda importa `suggestTargets`) até a Task 7 removê-lo. Isso está sinalizado nas tasks; não reintroduza `targets.ts`.
