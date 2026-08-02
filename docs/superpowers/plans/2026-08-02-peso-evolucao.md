# Peso como Evolução + Ajuste de Kcal por Tendência (Feature D) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** "Atualizar peso" grava registros datados (histórico = verdade; `profiles.weight_kg` = espelho do último). O sistema compara o ritmo real (mínimos quadrados) com o previsto pelo plano (déficit/superávit × 7700 kcal/kg) e sugere um ajuste de kcal aplicável com 1 clique, respeitando as travas da Feature A.

**Architecture:** Migração `weight_logs` + `profiles.kcal_adjustment`. Lógica pura em `src/lib/nutrition/weight.ts` (`trendKgPerWeek`, `weightAnalysis`). Helper `recordWeight` (upsert + sync). `distributeWeeklyTargets` ganha `kcalAdjustment`; recálculo extraído para `recalcTargetsForUser` (rota vira wrapper). Endpoints `/api/weight` (GET/POST), `/api/weight/[id]` (DELETE), `/api/weight/apply-adjustment` (POST). Página `/weight`.

**Tech Stack:** Next.js 16 · TypeScript · Tailwind v4 · Supabase · Vitest · Playwright. (Sem IA nesta feature.)

## Global Constraints

- **Next 16:** `params`/`cookies()` async; `proxy.ts`. Guias em `node_modules/next/dist/docs/`.
- **Histórico = verdade:** `weight_logs` canônica; `profiles.weight_kg` espelha o registro mais recente.
- **Lógica pura/determinística** (sem IA); travas via `distributeWeeklyTargets` (basal/gordura mínima) inalteradas.
- **Refactor sem regressão:** `targets/recalculate` mantém contrato (E2E bloco 2 é a rede de segurança).
- **RLS por usuário**; rotas `createServerSupabase` + `auth.getUser()`.
- **Supabase project id:** `pxzpxtzueeketotrlslj`. Migração via MCP `apply_migration` **e** arquivo `supabase/migrations/0009_*`.

---

## Estrutura de arquivos

```
supabase/migrations/0009_weight_logs.sql        # tabela + coluna (Task 1)
src/lib/types.ts                                 # Profile.kcal_adjustment + WeightLog (Task 1)
src/lib/nutrition/weekly.ts                      # distributeWeeklyTargets + goalAdjustment (Task 2)
src/lib/nutrition/weight.ts                      # trendKgPerWeek + weightAnalysis (Task 3, novo)
src/lib/nutrition/weight-record.ts               # recordWeight (Task 4, novo)
src/lib/nutrition/recalc.ts                      # recalcTargetsForUser (Task 4, novo)
src/app/api/targets/recalculate/route.ts         # wrapper fino (Task 4)
src/app/api/weight/route.ts                      # GET/POST (Task 5)
src/app/api/weight/[id]/route.ts                 # DELETE (Task 5)
src/app/api/weight/apply-adjustment/route.ts     # POST (Task 5)
src/app/api/profile/route.ts                     # GET expõe kcal_adjustment; PUT loga peso (Task 5)
src/components/WeightTracker.tsx                 # UI (Task 6, novo)
src/app/(app)/weight/page.tsx                     # página (Task 6, novo)
src/app/(app)/layout.tsx                          # link "Progresso" (Task 6)
tests/unit/weekly.test.ts | weight.test.ts        # (Tasks 2,3)
tests/e2e/flow.spec.ts                            # registrar peso + apply-adjustment (Task 7)
```

---

## Task 1: Migração `0009` + tipos

**Files:** Create `supabase/migrations/0009_weight_logs.sql`; Modify `src/lib/types.ts`.

- [ ] **Step 1: SQL**
```sql
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default (now() at time zone 'utc')::date,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);
alter table public.weight_logs enable row level security;
create policy "wl_select_own" on public.weight_logs for select using (user_id = auth.uid());
create policy "wl_insert_own" on public.weight_logs for insert with check (user_id = auth.uid());
create policy "wl_update_own" on public.weight_logs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "wl_delete_own" on public.weight_logs for delete using (user_id = auth.uid());

alter table public.profiles add column if not exists kcal_adjustment integer not null default 0;
```

- [ ] **Step 2: Aplicar via MCP** `apply_migration` (name `weight_logs`, project `pxzpxtzueeketotrlslj`).
- [ ] **Step 3: Verificar** `execute_sql`: tabela existe, RLS on, 4 policies; `get_advisors(security)` sem alerta novo. `select kcal_adjustment from profiles limit 1` funciona.
- [ ] **Step 4: Tipos** em `src/lib/types.ts`: adicione `kcal_adjustment: number;` ao `interface Profile`; e `export interface WeightLog { id: string; user_id: string; logged_on: string; weight_kg: number; note: string; created_at: string; }`.
- [ ] **Step 5: Verificar + commit** `npx tsc --noEmit` (pode acusar `kcal_adjustment` faltando onde Profile é construído — resolvido nas próximas tasks; se quebrar em `profile/route.ts` GET default, adicione `kcal_adjustment: 0` lá já). Commit:
```bash
git add supabase/migrations/0009_weight_logs.sql src/lib/types.ts
git commit -m "feat: weight_logs table + profiles.kcal_adjustment + types"
```

---

## Task 2: `kcalAdjustment` em `distributeWeeklyTargets` + `goalAdjustment` exportado

**Files:** Modify `src/lib/nutrition/weekly.ts`, `tests/unit/weekly.test.ts`.

- [ ] **Step 1: Teste que falha** (em `tests/unit/weekly.test.ts`): importe `distributeWeeklyTargets` e `goalAdjustment`. Adicione:
```ts
it("kcalAdjustment desloca o avgDailyTarget", () => {
  const base = distributeWeeklyTargets({ tdee: 2500, weightKg: 80, goal: "maintenance", intensity: "moderate", guardrails: false, bmr: 1700, levelCounts: { low: 1, medium: 1, high: 1 } });
  const adj = distributeWeeklyTargets({ tdee: 2500, weightKg: 80, goal: "maintenance", intensity: "moderate", guardrails: false, bmr: 1700, levelCounts: { low: 1, medium: 1, high: 1 }, kcalAdjustment: -300 });
  expect(adj.summary.avgDailyTarget).toBe(base.summary.avgDailyTarget - 300);
});
it("goalAdjustment expõe o ajuste do plano", () => {
  expect(goalAdjustment("fat_loss", "moderate")).toBe(-0.2);
  expect(goalAdjustment("maintenance", "light")).toBe(0);
});
```

- [ ] **Step 2: Rodar (falha)** `npx vitest run tests/unit/weekly.test.ts`.

- [ ] **Step 3: Implementar** em `src/lib/nutrition/weekly.ts`:
  - Exporte `export function goalAdjustment(goal: Goal, intensity: Intensity): number { return GOAL_ADJ[goal][intensity]; }`.
  - Em `distributeWeeklyTargets`, adicione `kcalAdjustment?: number` ao input e troque
    `const avgDailyTarget = Math.round(input.tdee * (1 + adj));`
    por `const avgDailyTarget = Math.round(input.tdee * (1 + adj)) + (input.kcalAdjustment ?? 0);`.
    (O resto — `weeklyKcalByLevel`, travas — usa `avgDailyTarget`, então herda o deslocamento. Retrocompatível: sem `kcalAdjustment` = comportamento atual.)

- [ ] **Step 4: Rodar (passa) + suíte** `npx vitest run`. **Step 5: Commit**
```bash
git add src/lib/nutrition/weekly.ts tests/unit/weekly.test.ts
git commit -m "feat: kcalAdjustment in distributeWeeklyTargets + goalAdjustment export"
```

---

## Task 3: Lógica pura de tendência — `src/lib/nutrition/weight.ts`

**Files:** Create `src/lib/nutrition/weight.ts`, `tests/unit/weight.test.ts`.

**Interfaces:** `trendKgPerWeek(logs, { windowDays, asOf })`; `weightAnalysis({ tdee, adjPct, kcalAdjustment, logs, asOf })` (ver spec §2).

- [ ] **Step 1: Testes que falham** (`tests/unit/weight.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { trendKgPerWeek, weightAnalysis } from "@/lib/nutrition/weight";

const mk = (d: string, w: number) => ({ logged_on: d, weight_kg: w });

describe("trendKgPerWeek", () => {
  it("calcula kg/semana (perda)", () => {
    const r = trendKgPerWeek(
      [mk("2026-07-01", 80), mk("2026-07-08", 79.5), mk("2026-07-15", 79)],
      { windowDays: 28, asOf: "2026-07-15" },
    );
    expect(r.slope).not.toBeNull();
    expect(r.slope!).toBeCloseTo(-0.5, 1); // ~-0.5 kg/sem
  });
  it("poucos pontos → slope null", () => {
    expect(trendKgPerWeek([mk("2026-07-15", 80)], { windowDays: 28, asOf: "2026-07-15" }).slope).toBeNull();
  });
});

describe("weightAnalysis", () => {
  it("perdendo devagar demais → eat_less", () => {
    const logs = [mk("2026-07-01", 80), mk("2026-07-15", 79.8)]; // ~-0.1 kg/sem
    const a = weightAnalysis({ tdee: 2500, adjPct: -0.2, kcalAdjustment: 0, logs, asOf: "2026-07-15" });
    expect(a.avgDailyTarget).toBe(2000);
    expect(a.expectedKgPerWeek).toBeCloseTo(-0.45, 1);
    expect(a.status).toBe("eat_less");
    expect(a.suggestedDelta).toBeLessThan(0);
    expect(a.suggestedDelta % 25).toBe(0);
  });
  it("dados insuficientes → insufficient_data, delta 0", () => {
    const a = weightAnalysis({ tdee: 2500, adjPct: 0, kcalAdjustment: 0, logs: [mk("2026-07-15", 80)], asOf: "2026-07-15" });
    expect(a.status).toBe("insufficient_data");
    expect(a.suggestedDelta).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar (falha)**.

- [ ] **Step 3: Implementar** `src/lib/nutrition/weight.ts`:
```ts
export type WeightLog = { logged_on: string; weight_kg: number };
const KCAL_PER_KG = 7700;
const dayNum = (d: string) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);

export function trendKgPerWeek(
  logs: WeightLog[], opts: { windowDays: number; asOf: string },
): { slope: number | null; points: number; spanDays: number } {
  const end = dayNum(opts.asOf);
  const inWin = logs
    .filter((l) => { const d = dayNum(l.logged_on); return d <= end && d > end - opts.windowDays; })
    .map((l) => ({ x: dayNum(l.logged_on), y: l.weight_kg }))
    .sort((a, b) => a.x - b.x);
  if (inWin.length < 2) return { slope: null, points: inWin.length, spanDays: 0 };
  const x0 = inWin[0].x;
  const pts = inWin.map((p) => ({ x: p.x - x0, y: p.y }));
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  const spanDays = pts[n - 1].x;
  if (den === 0) return { slope: null, points: n, spanDays };
  return { slope: (num / den) * 7, points: n, spanDays };
}

export function weightAnalysis(input: {
  tdee: number; adjPct: number; kcalAdjustment: number; logs: WeightLog[]; asOf: string;
}) {
  const avgDailyTarget = Math.round(input.tdee * (1 + input.adjPct)) + input.kcalAdjustment;
  const expectedKgPerWeek = ((avgDailyTarget - input.tdee) * 7) / KCAL_PER_KG;
  const t = trendKgPerWeek(input.logs, { windowDays: 28, asOf: input.asOf });
  const enoughData = t.slope != null && t.points >= 2 && t.spanDays >= 10;
  const actualKgPerWeek = enoughData ? t.slope : null;
  let deltaKcalPerDay = 0, suggestedDelta = 0;
  let status: "on_track" | "eat_less" | "eat_more" | "insufficient_data" = "insufficient_data";
  if (enoughData && actualKgPerWeek != null) {
    const raw = ((expectedKgPerWeek - actualKgPerWeek) * KCAL_PER_KG) / 7;
    deltaKcalPerDay = Math.round(raw / 25) * 25;
    if (Math.abs(deltaKcalPerDay) >= 75) {
      suggestedDelta = deltaKcalPerDay;
      status = deltaKcalPerDay < 0 ? "eat_less" : "eat_more";
    } else {
      status = "on_track";
    }
  }
  return { avgDailyTarget, expectedKgPerWeek, actualKgPerWeek, enoughData, deltaKcalPerDay, suggestedDelta, status };
}
```

- [ ] **Step 4: Rodar (passa) + suíte** `npx vitest run` (52+). **Step 5: Commit**
```bash
git add src/lib/nutrition/weight.ts tests/unit/weight.test.ts
git commit -m "feat: pure weight trend + kcal suggestion (trendKgPerWeek, weightAnalysis)"
```

---

## Task 4: `recordWeight` + extrair `recalcTargetsForUser` + wrapper do recalculate

**Files:** Create `src/lib/nutrition/weight-record.ts`, `src/lib/nutrition/recalc.ts`; Modify `src/app/api/targets/recalculate/route.ts`.

- [ ] **Step 1: `recordWeight`** (`src/lib/nutrition/weight-record.ts`):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
export async function recordWeight(
  supabase: SupabaseClient, userId: string, weightKg: number, loggedOn: string, note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("weight_logs")
    .upsert({ user_id: userId, logged_on: loggedOn, weight_kg: weightKg, note }, { onConflict: "user_id,logged_on" });
  if (error) return { ok: false, error: error.message };
  // sincroniza profiles.weight_kg com o registro mais recente
  const { data: latest } = await supabase.from("weight_logs")
    .select("weight_kg").eq("user_id", userId).order("logged_on", { ascending: false }).limit(1).maybeSingle();
  if (latest) await supabase.from("profiles").update({ weight_kg: latest.weight_kg }).eq("user_id", userId);
  return { ok: true };
}
export async function resyncProfileWeight(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: latest } = await supabase.from("weight_logs")
    .select("weight_kg").eq("user_id", userId).order("logged_on", { ascending: false }).limit(1).maybeSingle();
  if (latest) await supabase.from("profiles").update({ weight_kg: latest.weight_kg }).eq("user_id", userId);
}
```

- [ ] **Step 2: Extrair `recalcTargetsForUser`** (`src/lib/nutrition/recalc.ts`): mova o corpo da rota `targets/recalculate` (lê profile/day_types/pattern, valida, roda `distributeWeeklyTargets` **passando `kcalAdjustment: p.kcal_adjustment`**, grava alvos). Assinatura:
```ts
export async function recalcTargetsForUser(
  supabase: SupabaseClient, userId: string,
): Promise<{ ok: true; summary: unknown } | { ok: false; error: string; status: number }>;
```
Mesmas validações (400 perfil incompleto / 400 sem padrão) retornadas como `{ok:false,error,status}`.

- [ ] **Step 3: Wrapper** `targets/recalculate/route.ts`: auth 401 → `recalcTargetsForUser(supabase, user.id)` → mapeia. **Contrato inalterado** (200 `{summary}`, 400s).

- [ ] **Step 4: Verificar (inclui E2E — recalc é usado no bloco 2)** `npx tsc --noEmit && npx vitest run && npx playwright test` → tudo verde, **E2E 1 passed**.

- [ ] **Step 5: Commit**
```bash
git add src/lib/nutrition/weight-record.ts src/lib/nutrition/recalc.ts "src/app/api/targets/recalculate/route.ts"
git commit -m "refactor: recalcTargetsForUser (uses kcal_adjustment); recordWeight helper"
```

---

## Task 5: Endpoints de peso + ajuste + profile

**Files:** Create `src/app/api/weight/route.ts`, `src/app/api/weight/[id]/route.ts`, `src/app/api/weight/apply-adjustment/route.ts`; Modify `src/app/api/profile/route.ts`.

- [ ] **Step 1: `/api/weight` (GET/POST)**
  - GET: auth → `select * from weight_logs order by logged_on` (RLS) → array.
  - POST: auth → valida `weight_kg` (número, 0<w<500), `logged_on` default hoje (`new Date().toISOString().slice(0,10)`), `note` string. `recordWeight(...)` (400 em erro). Depois calcula `analysis`: lê profile; se completo, `tdee(bmr(p,p.bmr_formula), p.activity_level)`, `adjPct = goalAdjustment(p.goal, p.intensity)`; lê logs; `weightAnalysis({ tdee, adjPct, kcalAdjustment: p.kcal_adjustment, logs, asOf: hoje })`. Retorna `{ log: {logged_on, weight_kg}, analysis }` (analysis null se perfil incompleto).
- [ ] **Step 2: `/api/weight/[id]` (DELETE)** auth → `delete from weight_logs where id=[id]` (RLS garante posse) → `resyncProfileWeight` → `{ ok: true }`.
- [ ] **Step 3: `/api/weight/apply-adjustment` (POST)** auth → `delta` inteiro, `|delta|<=1000`; lê `kcal_adjustment` atual; `update profiles set kcal_adjustment = atual + delta`; `recalcTargetsForUser` → se `!ok` retorna status/erro; senão `{ kcal_adjustment: novo, summary }`.
- [ ] **Step 4: `profile/route.ts`** GET: inclua `kcal_adjustment` no default (0) e no retorno. PUT: quando `b.weight_kg` presente e válido, chame `recordWeight(supabase, user.id, weight, hoje, "")` (registra + sincroniza) — mantenha o upsert do profile para os demais campos, mas **não** confie só nele para o peso; e persista `kcal_adjustment` se vier (senão preserve). Garanta que o upsert do profile não zere `kcal_adjustment` (leia o atual ou use `b.kcal_adjustment ?? atual`).
- [ ] **Step 5: Verificar** `npx tsc --noEmit && npx vitest run`. **Step 6: Commit**
```bash
git add "src/app/api/weight/route.ts" "src/app/api/weight/[id]/route.ts" "src/app/api/weight/apply-adjustment/route.ts" "src/app/api/profile/route.ts"
git commit -m "feat: weight endpoints (log/history/delete) + apply-adjustment + profile sync"
```

---

## Task 6: UI — página `/weight` (WeightTracker) + nav

**Files:** Create `src/components/WeightTracker.tsx`, `src/app/(app)/weight/page.tsx`; Modify `src/app/(app)/layout.tsx`.

**Skill:** invoque `/frontend-design` para o gráfico e o card de sugestão.

- [ ] **Step 1: Componente + página** — leia `ProfileForm.tsx`/`PreferencesEditor.tsx` para casar estilo. `WeightTracker.tsx` (client):
  - Carrega `GET /api/weight` no mount.
  - **Form** `data-testid="weight-form"`: input peso (`weight-input`), data opcional (default hoje), nota opcional; botão `weight-save` → `POST /api/weight`. Ao salvar, atualiza a lista e guarda `analysis`.
  - **Card de tendência** `data-testid="weight-trend"`: texto do ritmo real vs previsto; se `analysis.status` é `eat_less`/`eat_more`, mostra "Sugestão: {suggestedDelta} kcal/dia" + botão `weight-apply-adjustment` → `POST /api/weight/apply-adjustment` `{ delta: analysis.suggestedDelta }`; sucesso → "Metas atualizadas." Se `insufficient_data`/`on_track`, texto adequado.
  - **Gráfico** `data-testid="weight-chart"`: SVG inline (polyline) do peso × data, theme-aware (use `stroke="currentColor"`/vars). Sem libs.
  - **Histórico** `data-testid="weight-history"`: tabela data/peso/Δ/nota + excluir (`weight-delete` → `DELETE /api/weight/[id]`).
  - `page.tsx`: server component com heading "Progresso" + `<WeightTracker />`.
- [ ] **Step 2: Nav** em `layout.tsx`: link `<Link href="/weight">Progresso</Link>` (entre "Semana" e "Alimentos", ou perto de Preferências).
- [ ] **Step 3: Verificar** `npx tsc --noEmit && npx vitest run`. **Step 4: Commit**
```bash
git add src/components/WeightTracker.tsx "src/app/(app)/weight/page.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat: weight tracker page (log + chart + history + trend suggestion) + nav"
```

---

## Task 7: E2E + suíte + ledger

**Files:** Modify `tests/e2e/flow.spec.ts`.

- [ ] **Step 1: Bloco no E2E** (ao fim, reusa o usuário logado):
```ts
// 10. D: registrar peso (histórico) + apply-adjustment
await page.request.post("/api/weight", { data: { weight_kg: 80, logged_on: "2026-07-01" } });
await page.request.post("/api/weight", { data: { weight_kg: 79.6, logged_on: "2026-07-20" } });
const hist = await (await page.request.get("/api/weight")).json();
expect(hist.length).toBeGreaterThanOrEqual(2);
// profiles.weight_kg reflete o mais recente (79.6)
const prof = await (await page.request.get("/api/profile")).json();
expect(Number(prof.weight_kg)).toBe(79.6);
// apply-adjustment com delta fixo altera kcal_adjustment
const adj = await page.request.post("/api/weight/apply-adjustment", { data: { delta: -150 } });
expect(adj.ok()).toBeTruthy();
const adjBody = await adj.json();
expect(adjBody.kcal_adjustment).toBe(-150);
// UI da página carrega
await page.goto("/weight");
await expect(page.getByTestId("weight-form")).toBeVisible();
await expect(page.getByTestId("weight-history")).toBeVisible();
```
(O bloco 2 já criou perfil completo + padrão semanal, então `apply-adjustment` consegue recalcular. Confirme os testids reais lendo `WeightTracker.tsx`.)

- [ ] **Step 2: E2E** `npx playwright test` → 1 passed. Ajuste seletores ao componente real (não ao app).
- [ ] **Step 3: Suíte** `npx vitest run && npx playwright test` — tudo verde.
- [ ] **Step 4: Ledger + commit** Atualize `.superpowers/sdd/progress.md` (seção D, Tasks 1–7 + hashes).
```bash
git add tests/e2e/flow.spec.ts .superpowers/sdd/progress.md
git commit -m "test: e2e weight log + apply-adjustment; ledger D"
```

---

## Self-Review

**1. Cobertura do spec:**
- `weight_logs` + `kcal_adjustment` (migração+tipos) → Task 1. ✔
- `kcalAdjustment` no cálculo + `goalAdjustment` → Task 2. ✔
- Tendência pura (`trendKgPerWeek`, `weightAnalysis`, expected do plano, direções, arredondamento, limiar) → Task 3. ✔
- `recordWeight` (upsert+sync) + refactor recalc (kcal_adjustment) → Task 4 (E2E cobre recalc). ✔
- Endpoints GET/POST/DELETE/apply-adjustment + profile (loga peso, expõe kcal_adjustment) → Task 5. ✔
- UI /weight (form+gráfico+histórico+sugestão 1 clique) + nav → Task 6. ✔
- Testes: unit weekly+weight; E2E registrar peso + apply-adjustment; recalc sem regressão → Tasks 2,3,7. ✔

**2. Placeholders:** migração, lógica pura, helpers, refactor e endpoints com código/assinaturas completas. UI (Task 6) com requisitos + `data-testid` + `/frontend-design`.

**3. Consistência de tipos:** `Profile.kcal_adjustment` (Task 1) usado em `distributeWeeklyTargets`/`recalcTargetsForUser` (Tasks 2,4) e nos endpoints (Task 5); `WeightLog` (Task 1) em `weight.ts` (Task 3) e nos endpoints; `weightAnalysis` recebe `adjPct` de `goalAdjustment` (Task 2) computado no endpoint (Task 5); `recordWeight`/`resyncProfileWeight` (Task 4) usados no POST/DELETE de peso e no PUT de perfil (Task 5). Refactor do recalc preserva contrato (E2E bloco 2).

**Nota:** migração aditiva (nova tabela + coluna default 0) — produção intacta até o merge; sem IA/segredo novo. `profiles.weight_kg` vira espelho do último log (histórico = verdade) sem rewire da Feature A.
