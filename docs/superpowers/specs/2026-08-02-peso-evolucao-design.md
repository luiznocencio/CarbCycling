# Peso como Registro de Evolução + Ajuste de Kcal por Tendência (Feature D) — Design

## Contexto e objetivo

Hoje o peso é um campo estático em Configurações (`profiles.weight_kg`) que alimenta o BMR (`bmr()`→`tdee()`→`distributeWeeklyTargets()`, Feature A). A Feature D transforma o peso em **registro de evolução**:

1. **"Atualizar peso"** grava um registro datado (série temporal) → histórico + gráfico.
2. O sistema compara o **ritmo real** de perda/ganho com o **previsto pelo plano** e, se desviar, **sugere um ajuste de kcal** que você aplica com **1 clique** (respeitando as travas da Feature A).

Decisões (travadas no brainstorm): **Histórico é a verdade** (peso atual = último registro; Config vira atalho pra registrar) · **BMR + tendência** · **Sugerir + 1 clique**.

## Princípios / restrições

- **Histórico é a fonte da verdade:** a tabela `weight_logs` é canônica; `profiles.weight_kg` vira um **espelho do último registro** (mantido em sincronia) — assim o BMR e toda a Feature A continuam lendo `profiles.weight_kg` sem rewiring.
- **Lógica de tendência pura e testável** (`src/lib/nutrition/weight.ts`): sem IA — é aritmética (mínimos quadrados + calorias por kg). Determinística.
- **Ajuste respeita as travas:** o ajuste sugerido entra como `profiles.kcal_adjustment` e passa pelo mesmo `distributeWeeklyTargets` (que já trava kcal no basal e gordura no mínimo quando `safety_guardrails`).
- **Sugerir, não aplicar sozinho:** o sistema só recomenda; aplicar é 1 clique explícito.
- Next.js 16 (`params`/`cookies()` async; `proxy.ts`). UI pt-BR, mobile-first. RLS por usuário. Supabase project `pxzpxtzueeketotrlslj`.

---

## 1. Migração `0009` — `weight_logs` + `profiles.kcal_adjustment`

```sql
create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default (now() at time zone 'utc')::date,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)          -- 1 registro por dia (upsert = "peso de hoje")
);
alter table public.weight_logs enable row level security;
-- policies select/insert/update/delete: user_id = auth.uid()

alter table public.profiles
  add column if not exists kcal_adjustment integer not null default 0;
```
`kcal_adjustment`: ajuste manual de kcal/dia acumulado (somado ao alvo médio diário). Default 0 = comportamento atual.

---

## 2. Lógica pura — `src/lib/nutrition/weight.ts` (testável)

```ts
export type WeightLog = { logged_on: string; weight_kg: number };

// mínimos quadrados sobre (dias desde o 1º ponto, peso) na janela; retorna kg/semana (negativo = perdendo)
export function trendKgPerWeek(
  logs: WeightLog[], opts: { windowDays: number; asOf: string },
): { slope: number | null; points: number; spanDays: number };

const KCAL_PER_KG = 7700;

export function weightAnalysis(input: {
  tdee: number; adjPct: number; kcalAdjustment: number; logs: WeightLog[]; asOf: string;
}): {
  avgDailyTarget: number;            // round(tdee*(1+adjPct)) + kcalAdjustment
  expectedKgPerWeek: number;         // (avgDailyTarget - tdee) * 7 / 7700
  actualKgPerWeek: number | null;    // da tendência (null se dados insuficientes)
  enoughData: boolean;               // >=2 pontos na janela e span >= 10 dias
  deltaKcalPerDay: number;           // (expected - actual) * 7700/7 (arredondado a 25); 0 se !enoughData
  suggestedDelta: number;            // deltaKcalPerDay se |.| >= 75, senão 0
  status: "on_track" | "eat_less" | "eat_more" | "insufficient_data";
};
```
- **expected** vem do plano: déficit/superávit médio diário (goal/intensity via `GOAL_ADJ`, + `kcal_adjustment`) → kg/semana.
- **actual** = tendência medida (janela ~28 dias).
- **gap** `deltaKcalPerDay = (expected − actual) × 7700/7`: perdendo **mais devagar** que o previsto → delta negativo (comer menos); ganhando de menos (bulking) → delta positivo (comer mais); manutenção subindo → negativo. Arredonda a 25 kcal; só vira sugestão se `|delta| ≥ 75` e `enoughData`.
- `status`: `insufficient_data` (poucos pontos), `on_track` (|delta|<75), `eat_less` (delta<0), `eat_more` (delta>0).

Exemplos de referência (teste): tdee 2500, fat_loss moderate (adj −0.2, kcal_adjustment 0) → avgDaily 2000, expected ≈ −0.45 kg/sem. Logs mostrando −0.1 kg/sem → gap ≈ (−0.45−(−0.1))×1100 ≈ −385 → `eat_less`, suggestedDelta −375. Manutenção (adj 0, expected 0) subindo +0.2 → −220 `eat_less`. Poucos logs → `insufficient_data`, delta 0.

---

## 3. Registrar peso + sincronizar — helper + `kcal_adjustment` na Feature A

### `recordWeight` — `src/lib/nutrition/weight-record.ts` (server-only)
```ts
export async function recordWeight(
  supabase, userId: string, weightKg: number, loggedOn: string, note: string,
): Promise<{ ok: true } | { ok: false; error: string }>;
```
Upsert do `weight_logs` (onConflict `user_id,logged_on`) + **sincroniza** `profiles.weight_kg` com o peso do **registro mais recente** (max `logged_on`). Usado pelo endpoint de peso E pelo save do perfil (weight vira "atalho pra registrar").

### `kcal_adjustment` no cálculo
- `distributeWeeklyTargets` ganha `kcalAdjustment?: number` (default 0) somado ao `avgDailyTarget`:
  `avgDailyTarget = round(tdee*(1+adj)) + kcalAdjustment`.
- **Refactor DRY:** extrair o núcleo da rota `targets/recalculate` para `recalcTargetsForUser(supabase, userId)` em `src/lib/nutrition/recalc.ts` (lê profile+day_types+pattern, roda `distributeWeeklyTargets` com `p.kcal_adjustment`, grava os alvos). A rota `POST /api/targets/recalculate` vira wrapper fino (contrato inalterado — E2E bloco 2 é a rede de segurança).

---

## 4. Endpoints — `src/app/api/weight/`

- `GET /api/weight` → lista `weight_logs` do usuário (ordenado por `logged_on`). Para o gráfico/histórico.
- `POST /api/weight` (body `{ weight_kg, logged_on?, note? }`): valida (`0<weight<500`); `logged_on` default hoje; `recordWeight`. Retorna `{ log, analysis }` onde `analysis` = `weightAnalysis(...)` já calculado (o front mostra a sugestão sem 2ª chamada).
- `DELETE /api/weight/[id]`: remove o registro (RLS); re-sincroniza `profiles.weight_kg` com o novo mais recente (ou mantém se não havia).
- `POST /api/weight/apply-adjustment` (body `{ delta }`): clamp/valida `delta` (inteiro, |delta|≤1000); `profiles.kcal_adjustment += delta`; roda `recalcTargetsForUser`. Retorna `{ kcal_adjustment, summary }`. (Se o perfil/padrão não permitir recalc, 400 com a msg da Feature A.)

`GET /api/profile` passa a retornar `kcal_adjustment` também (default 0).

---

## 5. UX — página `/weight` ("Progresso") + nav + settings

Nova rota `/weight` (client), linkada no nav ("Progresso"). Mobile-first, mesmas classes do app:
- **"Atualizar peso"** (`data-testid="weight-form"`): input de peso (kg) + data opcional (default hoje) + nota opcional → `POST /api/weight` (`weight-save`). Ao salvar, mostra o **card de tendência**.
- **Card de tendência** (`data-testid="weight-trend"`): ritmo real vs previsto em texto claro ("Você está perdendo ~0,1 kg/sem; o plano previa ~0,45."). Se `status` é `eat_less`/`eat_more`, mostra a **sugestão** ("Sugestão: **−375 kcal/dia**") + botão **"Aplicar ajuste"** (`weight-apply-adjustment`) → `POST /api/weight/apply-adjustment` `{ delta: suggestedDelta }`; em sucesso, "Metas atualizadas." + o novo `kcal_adjustment`. Se `insufficient_data`, texto "Registre por ~2 semanas para uma sugestão confiável." Se `on_track`, "No rumo certo — siga assim.".
- **Gráfico** (`data-testid="weight-chart"`): linha simples (SVG inline, sem lib) do peso ao longo do tempo, theme-aware.
- **Histórico** (`data-testid="weight-history"`): tabela data/peso/Δ vs anterior/nota + excluir (`weight-delete`).
- **Settings:** a `ProfileForm` mantém o campo de peso, mas o save de peso passa a **registrar** (via `recordWeight`, chamado no `PUT /api/profile` quando `weight_kg` vem) — "atalho pra registrar" coerente com histórico=verdade. O preview de BMR/TDEE já existente continua.

**Skill:** invoque `/frontend-design` para o gráfico e o card de sugestão ficarem claros no mobile.

---

## 6. Impacto técnico

- **Migração `0009`:** `weight_logs` (RLS) + `profiles.kcal_adjustment`.
- **`src/lib/nutrition/weight.ts`** (novo): `trendKgPerWeek`, `weightAnalysis` (puros, testados).
- **`src/lib/nutrition/weight-record.ts`** (novo): `recordWeight` (upsert + sync).
- **`src/lib/nutrition/recalc.ts`** (novo): `recalcTargetsForUser` (extraído da rota).
- **`src/lib/nutrition/weekly.ts`:** `distributeWeeklyTargets` aceita `kcalAdjustment?`.
- **`targets/recalculate/route.ts`:** wrapper fino sobre `recalcTargetsForUser`.
- **`src/app/api/weight/route.ts`** (GET/POST), **`.../weight/[id]/route.ts`** (DELETE), **`.../weight/apply-adjustment/route.ts`** (POST) — novos.
- **`profile/route.ts`:** GET retorna `kcal_adjustment`; PUT chama `recordWeight` quando `weight_kg` presente (sincroniza + loga).
- **`src/types.ts`:** `Profile.kcal_adjustment: number`; tipo `WeightLog`.
- **`src/app/(app)/weight/page.tsx`** + **`src/components/WeightTracker.tsx`** (novo) + link no nav.
- **Testes:**
  - Unit: `trendKgPerWeek` (slope kg/sem; dados insuficientes → null); `weightAnalysis` (expected do plano; direções eat_less/eat_more/on_track/insufficient nos exemplos de referência; arredondamento a 25; limiar 75). `distributeWeeklyTargets` com `kcalAdjustment` (desloca o avgDailyTarget; travas ainda aplicam).
  - E2E (determinístico, **sem IA**): na página `/weight`, registrar 2 pesos em datas distintas (via `POST /api/weight` ou form), conferir que aparecem no histórico e que `profiles.weight_kg` reflete o mais recente (via `GET /api/profile`). Aplicar ajuste só se houver sugestão; senão, cobrir `apply-adjustment` com um `delta` fixo e conferir `kcal_adjustment` + recalc. O refactor do recalc é coberto pelo E2E bloco 2.

---

## Casos de borda

- **Menos de 2 registros / janela curta:** `status=insufficient_data`, sem sugestão; UI pede mais registros.
- **Peso oscila (ruído):** mínimos quadrados na janela suaviza; limiar de 75 kcal evita sugestões nervosas.
- **Excluir o registro mais recente:** re-sincroniza `profiles.weight_kg` para o novo mais recente (ou não mexe se não sobrar nenhum — mantém o último valor).
- **Registrar peso com data antiga:** upsert daquele dia; `profiles.weight_kg` só muda se aquele vira o mais recente.
- **`apply-adjustment` sem perfil completo / sem padrão semanal:** 400 com a mensagem da Feature A (o recalc não roda).
- **Travas ligadas + sugestão de comer menos abaixo do basal:** `distributeWeeklyTargets` trava no basal (warning), como já faz — a sugestão pode não se refletir 1:1 nas metas (comportamento correto e seguro).
- **kcal_adjustment acumulado:** aplicar várias vezes soma; o usuário pode zerar editando (fora do escopo mínimo, mas o campo é editável via futura tela; por ora o apply soma o delta sugerido).
