# Cardápio da Semana por IA (Feature E2) — Design

## Contexto e objetivo

Hoje o gerador de IA (C1) monta o cardápio de **um** tipo de dia por vez (`POST /api/day-types/[id]/generate` → revisar → `apply-menu`). O usuário quer **gerar a semana inteira de uma vez**. Como a semana é modelada por um **padrão semanal** (`weekly_pattern`: weekday 0–6 → `day_type_id`), e vários dias compartilham o mesmo tipo, a E2 **reusa por tipo de dia**: gera 1 cardápio por **tipo de dia distinto** usado na semana e reaproveita nos dias iguais. Uma tela de revisão mostra a proposta por tipo de dia; **"Aplicar semana"** grava tudo.

Decisões (travadas no brainstorm): **reusa por tipo de dia** · **2 opções por refeição** no modo semanal · **revisar e aplicar tudo**. As **preferências (E1)** entram de graça, porque a E2 reaproveita o núcleo do gerador (que já carrega prefs).

## Princípios / restrições

- **IA server-side apenas**, `gpt-4o-mini`; `OPENAI_API_KEY` é segredo (já em `.env.local` + Vercel — não mexer).
- **A IA nunca é fonte de verdade numérica:** ids validados contra o pool (`validateMenu`); o solver (`scaleOptionToTarget`) fixa as quantidades. Prefs `avoid` filtram o pool (duro).
- **Sem migração nova** — reusa `weekly_pattern`/`day_types`/`meals`/`meal_items`/`food_favorites`/`user_preferences`.
- **DRY:** extrair o núcleo do C1 `generate` e do `apply-menu` em helpers reaproveitados pelas rotas de dia **e** de semana (uma fonte só para a lógica + wiring de prefs).
- Next.js 16 (`params`/`cookies()` async; `proxy.ts`). UI pt-BR, mobile-first. RLS por usuário.
- **Reuso por tipo de dia:** dias com o mesmo `day_type_id` recebem o **mesmo** cardápio (aplicar num tipo de dia vale para todos os weekdays mapeados a ele — é como o modelo já funciona).

---

## 1. Extrair o núcleo do gerador — `src/lib/ai/generate.ts` (novo, server-only)

Move a lógica hoje embutida em `src/app/api/day-types/[id]/generate/route.ts` para uma função reusável:

```ts
export type ProposalResult =
  | { ok: true; proposal: { slots: { name: string; slot: number; options: {...}[] }[] } }
  | { ok: false; error: string; status: number };

export async function generateProposalForDayType(
  supabase,
  dayType: DayType,
  opts: { meals: number; options: number },
): Promise<ProposalResult>;
```
Corpo (idêntico ao que o route faz hoje): pool = favoritos ∪ básicos → `loadPreferences` → `applyAvoidToPool` (400 "Pool vazio após preferências…" se esvaziar; 400 "Sem alimentos no pool…" se pool base vazio) → `mealSubTargets(dayType, meals)` → `generateMenu({ subTargets, options, guidance: prefsPromptSnippet(prefs), pool })` (502 se a IA falhar) → por opção: `scaleOptionToTarget` + `mealMacros`. Retorna `{ ok:true, proposal:{slots} }` ou `{ ok:false, error, status }` (nunca lança para o chamador de semana conseguir tratar por tipo de dia).

### `generate/route.ts` (C1) passa a ser um wrapper fino
`POST /api/day-types/[id]/generate`: auth → carrega `day_type` (404) → `res = generateProposalForDayType(supabase, dayType, { meals: n, options: m })` → se `!res.ok` retorna `{error}` com `res.status`; senão `{ proposal: res.proposal }`. Mantém o clamp de `n`/`m` (1..12). **Comportamento externo inalterado.**

---

## 2. Extrair o núcleo do apply — `src/lib/nutrition/apply.ts` (novo, server-only)

Move a lógica de `src/app/api/day-types/[id]/apply-menu/route.ts`:

```ts
export type ApplyResult = { ok: true } | { ok: false; error: string; status: number };

export async function applyProposalToDayType(
  supabase, userId: string, dayTypeId: string, proposal: Proposal,
): Promise<ApplyResult>;
```
Corpo (idêntico ao route hoje): valida `proposal.slots` (400 "proposta inválida"); confere posse do `day_type` sob RLS (404); **substitui** (`delete meals where day_type_id` → cascade em `meal_items`); insere `meals` (primeira opção `selected:true`) + `meal_items`. Retorna `{ok:true}` ou `{ok:false,error,status}`.

### `apply-menu/route.ts` vira wrapper fino
`POST /api/day-types/[id]/apply-menu`: auth → `applyProposalToDayType(supabase, user.id, id, proposal)` → mapeia resultado. **Comportamento externo inalterado.**

---

## 3. Helper puro — `distinctDayTypeIds` (testável)

Em `src/lib/nutrition/week.ts` (novo):
```ts
export function distinctDayTypeIds(
  pattern: { weekday: number; day_type_id: string }[],
): string[]; // ids distintos, na ordem do 1º weekday em que aparecem (0=domingo…6=sábado)
```
Puro, testado. Usado pela rota de semana para saber quais tipos de dia gerar.

---

## 4. Endpoint — `POST /api/week/generate`

Body `{ meals?: number; options?: number }` (default `meals=5`, `options=2`; mesmo clamp 1..12).
1. Auth (401).
2. `pattern` = `weekly_pattern` do usuário; `ids = distinctDayTypeIds(pattern)`. Se vazio → 400 "Defina o padrão semanal primeiro (nenhum dia atribuído)."
3. Carrega os `day_types` desses `ids` (sob RLS).
4. Para cada tipo de dia (na ordem de `ids`): `generateProposalForDayType(supabase, dayType, { meals, options })`. Coleta `{ day_type_id, name, proposal }` em sucesso ou `{ day_type_id, name, error }` em falha (não derruba os outros).
5. Se **todos** falharem → 502 com o primeiro erro. Senão → 200 `{ week: [ {day_type_id, name, proposal?} | {day_type_id, name, error?} ] }`.

Custo: ~1 chamada de IA por tipo de dia distinto (normalmente ≤3), cada uma gera todos os slots×opções. Barato.

---

## 5. Endpoint — `POST /api/week/apply`

Body `{ week: { day_type_id: string; proposal: Proposal }[] }`.
1. Auth (401).
2. Para cada entrada com `proposal`: `applyProposalToDayType(supabase, user.id, day_type_id, proposal)`.
3. Coleta sucessos/erros. Retorna 200 `{ ok: true, applied: N, failed: [{ day_type_id, error }] }` (aplica os válidos; reporta os que falharam — ex.: day_type alheio → 404 na entrada). Se **nenhuma** entrada válida → 400.

Aplicar **substitui** as refeições dos tipos de dia envolvidos (mesma semântica do `apply-menu`). Como reusa por tipo de dia, todos os weekdays mapeados àquele tipo passam a refletir o novo cardápio.

---

## 6. UX — `WeekMenuGenerator` na dashboard (Semana)

Novo client component `src/components/WeekMenuGenerator.tsx`, renderizado na página `/` (Semana) acima/abaixo do `WeekGrid`. A página `/` é server component; passa nada obrigatório (o componente busca via API).

- Botão **"Gerar semana com IA"** (`data-testid="week-generate"`). Opcional: um seletor simples de nº de refeições (default 5); opções fixas em 2 no semanal.
- Ao clicar → `POST /api/week/generate`. Enquanto gera, "Gerando a semana…" (pode demorar alguns segundos por tipo de dia). Em 400 (sem padrão) / 502 → mensagem amigável.
- **Revisão** (`data-testid="week-review"`): uma seção por tipo de dia retornado, com o nome do tipo e, por refeição (slot), as **2 opções** em abas + os totais (kcal/proteína) vs meta do tipo — reaproveitando o visual de `MenuGenerator` (extrair um subcomponente `ProposalReview` compartilhado, ou replicar as `TotalBar`/abas). Entradas com `error` mostram o motivo (ex.: "Pool vazio após preferências") e são puladas na aplicação.
- Botão **"Aplicar semana"** (`data-testid="week-apply"`) → `POST /api/week/apply` com as entradas que têm `proposal`. Em sucesso, `router.refresh()` (a dashboard recomputa os totais) e feedback "Semana aplicada." Mostra `failed[]` se houver.
- **"Gerar novamente"** repete o generate.

**Skill:** invoque `/frontend-design` para a revisão da semana ficar legível no mobile (seções colapsáveis por tipo de dia se ajudar).

---

## 7. Impacto técnico

- **`src/lib/ai/generate.ts`** (novo): `generateProposalForDayType` (move a lógica do route; centraliza wiring de prefs).
- **`src/lib/nutrition/apply.ts`** (novo): `applyProposalToDayType` (move a lógica do route).
- **`src/lib/nutrition/week.ts`** (novo): `distinctDayTypeIds` (puro, testado).
- **`generate/route.ts`** e **`apply-menu/route.ts`:** viram wrappers finos (comportamento externo inalterado).
- **`src/app/api/week/generate/route.ts`** e **`src/app/api/week/apply/route.ts`:** novos.
- **`src/components/WeekMenuGenerator.tsx`** (novo) + integração em `src/app/(app)/page.tsx`. Possível `ProposalReview` extraído de `MenuGenerator`.
- **Testes:**
  - Unit: `distinctDayTypeIds` (distintos preservando ordem do 1º weekday; ignora repetidos; vazio→[]). Os núcleos de solver/menu já são testados.
  - E2E (determinístico, **sem** IA): reusa o usuário logado do fluxo; com o padrão semanal já definido (bloco 2), monta uma **proposta fixa** de semana e chama `POST /api/week/apply` (`{ week: [{ day_type_id, proposal }] }`), depois abre `/day/[id]` e confere que as refeições/opções foram aplicadas (ex.: 2 abas de opção + total esperado). O `week/generate` (IA) fica no **smoke manual**.
  - Refactor sem regressão: `generate`/`apply-menu` continuam com os testes/E2E atuais verdes.
- **Sem migração.**

---

## Casos de borda

- **Padrão semanal vazio** (nenhum dia atribuído): `week/generate` → 400 com instrução.
- **Um tipo de dia com pool vazio / avoid esvazia o pool:** aquela entrada volta com `error`; as outras geram normalmente; o apply pula as com erro.
- **IA falha em um tipo de dia:** entrada com `error` (502 interno tratado); demais seguem. Só 502 geral se todas falharem.
- **Aplicar substitui** o cardápio dos tipos envolvidos (esperado; a revisão é a confirmação). Tipos de dia **não** presentes na semana não são tocados.
- **day_type alheio numa entrada do apply:** 404 naquela entrada (RLS + checagem de posse); não afeta as válidas.
- **Muitos tipos de dia distintos:** custo linear (~1 chamada de IA cada); aceitável (o padrão realista é ≤3).
- **Refactor:** os wrappers finos preservam status/mensagens atuais (404/400/502) — sem mudança de contrato para o front existente (`MenuGenerator`, E2E).
