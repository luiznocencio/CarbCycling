# Alimentos por Unidade + Enriquecimento (Feature B) — Design

## Contexto e objetivo

O app de ciclo de carboidratos está em produção. Hoje `foods` guarda macros por 100g e
`meal_items` guarda `quantity_g` — tudo em gramas. Montar cardápio com alimentos como
ovo e pão em gramas é pouco prático. Esta feature (B) permite tratar alimentos com
**unidade natural** (1 ovo, 1 fatia de pão) além de gramas, mantendo as gramas como base
de cálculo, e enriquece a base TACO com pesos por unidade.

Terceira e última feature planejada fica de fora deste spec:
- **C)** Gerador automático de cardápio + variações de refeição.

## Princípios / restrições

- **App não chama LLM em runtime.** O enriquecimento é uma preparação de dados única
  (feita pelo Claude nesta sessão) e versionada — o app segue determinístico.
- **Gramas como fonte de verdade do cálculo.** Unidades são uma camada de conveniência;
  os macros sempre derivam de gramas.
- **Funções puras** em `src/lib/nutrition/` (testáveis). UI em pt-BR, mobile-first.
- **RLS por usuário.** App single-user (conforme escopo original do projeto).
- Next.js 16: `proxy.ts`, `params`/`cookies()` assíncronos (ver `docs/superpowers/NEXT16-DECISIONS.md`).

---

## 1. Modelo de dados

### `foods` (colunas novas)
| campo | tipo | descrição |
|---|---|---|
| `unit_name` | text (nulo) | nome da unidade, ex.: "ovo", "fatia", "unidade" |
| `unit_grams` | numeric (nulo, > 0) | gramas de 1 unidade, ex.: 50 |

Um alimento **tem unidade** quando `unit_name` e `unit_grams` estão ambos preenchidos.
Alimentos sem unidade natural (arroz, feijão, óleos, carnes a granel) ficam nulos → só gramas.

### `meal_items` (mudança)
- Renomear `quantity_g` → `quantity` (numeric).
- Adicionar `unit` text não-nulo, default `'g'`, check `unit in ('g','unit')`.
- Migração converte itens existentes: viram `quantity` (o valor antigo em gramas) com `unit='g'`.

**Derivação de gramas** (fonte do cálculo): `unit='g'` → gramas = `quantity`;
`unit='unit'` → gramas = `quantity × food.unit_grams`. Como as gramas são derivadas em
runtime, ajustar `unit_grams` de um alimento reflete em todos os cardápios automaticamente.

### Função de edição de unidade (RLS-safe)
Para permitir editar unidades de alimentos TACO (`user_id null`, que o RLS bloqueia para
escrita) pela interface, sem expor macros/nome:
```sql
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
A função só toca as colunas de unidade e só em alimentos TACO ou do próprio usuário.

---

## 2. Enriquecimento das unidades

Feito pelo Claude nesta sessão (sem API externa), a partir dos 597 nomes reais da TACO:
- Para cada alimento com unidade natural de consumo, atribuir `unit_name` + `unit_grams`
  com porções típicas brasileiras. Exemplos: ovo de galinha inteiro → "ovo"/50g; pão
  francês → "unidade"/50g; pão de forma → "fatia"/25g; banana prata → "unidade"/90g;
  maçã → "unidade"/130g; laranja → "unidade"/180g; fatia de mussarela → "fatia"/20g;
  fatia de presunto → "fatia"/15g; biscoito → "unidade"/6g.
- Alimentos sem unidade natural ficam sem unidade (só gramas).

**Entrega e aplicação:**
- `data/units.json` (versionado): `[{ name, unit_name, unit_grams }]`, casando pelo nome
  exato da TACO.
- `supabase/seed/units.ts` (reprodutível, como o seed da TACO): lê `units.json` e roda
  `update foods set unit_name/unit_grams where user_id is null` casando por `name`. Também
  aplicado uma vez via Supabase MCP nesta feature.

Cobertura estimada: ~80–150 alimentos com unidade. Os pesos são pontos de partida
editáveis (via a função `set_food_unit`, seção 1).

---

## 3. Cálculo — `src/lib/nutrition/macros.ts`

Adicionar helper puro:
```
itemGrams(item: { quantity: number; unit: "g" | "unit" }, food: Pick<Food,"unit_grams">): number
```
- `unit='g'` → `quantity`
- `unit='unit'` → `quantity × (food.unit_grams ?? 0)`

`itemMacros` passa a receber `{ quantity, unit }` (em vez de `{ quantity_g }`) e usa
`itemGrams` para obter as gramas antes de escalar os macros. Como consequência,
`mealMacros` também muda a forma dos itens que recebe (`{ quantity, unit, food }[]` em vez
de `{ quantity_g, food }[]`). `sumMacros` e `compareToTarget` seguem iguais (operam sobre
`Macros`). **Todos os chamadores mudam:** `DayEditor.tsx` e o dashboard `(app)/page.tsx`.

Casos de teste (valores exatos):
- `itemGrams({quantity:200, unit:'g'}, {unit_grams:null})` = 200.
- `itemGrams({quantity:2, unit:'unit'}, {unit_grams:50})` = 100.
- `itemMacros({quantity:2, unit:'unit'}, ovo)` onde ovo = 155 kcal/100g → 2×50g=100g → 155 kcal.

---

## 4. UX

### Banco de alimentos (`FoodBank`)
- Cada alimento mostra a unidade quando definida: "1 ovo = 50g"; senão "sem unidade".
- Controle **"editar unidade"** (campos `unit_name` + `unit_grams`) para alimentos TACO
  **e** próprios, via `PUT /api/foods/[id]/unit` (chama `set_food_unit`). Limpar os campos
  remove a unidade (`null`).
- Em alimentos próprios, a edição completa (nome/macros) continua como hoje; em TACO, só
  a unidade é editável (nome/macros read-only).
- Cadastro de alimento próprio ganha os campos opcionais de unidade.

### Editor de dia (`DayEditor`)
- Ao adicionar um alimento **com unidade**, o campo de quantidade mostra um toggle
  **gramas | unidade**, com default "unidade". Digitar "2" adiciona 2 unidades. Alimentos
  **sem unidade** mostram só gramas.
- Cada item exibe **"2 ovos (100g)"** (quantidade na unidade escolhida + gramas derivadas)
  e os macros. Editar a quantidade respeita a unidade; alternar g|unidade re-deriva as gramas.

---

## 5. Impacto técnico

### Schema
Migration `supabase/migrations/0003_food_units.sql` (aplicada via Supabase MCP):
- `alter table foods add column unit_name text, add column unit_grams numeric check (unit_grams > 0);`
- `alter table meal_items rename column quantity_g to quantity;`
- `alter table meal_items add column unit text not null default 'g' check (unit in ('g','unit'));`
- a função `set_food_unit` (seção 1).

### Enriquecimento
- `data/units.json` (gerado nesta sessão) + `supabase/seed/units.ts` (aplica; reprodutível).

### Tipos (`src/lib/types.ts`)
- `Food` ganha `unit_name: string | null` e `unit_grams: number | null`.
- `MealItem`: `quantity_g` vira `quantity: number` + `unit: "g" | "unit"`.

### Motor de cálculo
- `src/lib/nutrition/macros.ts`: `itemGrams` (novo) + `itemMacros` adaptado. Atualizar
  `tests/unit/macros.test.ts` (casos gramas e unidade).

### APIs
- `src/app/api/meal-items/route.ts`: POST/PUT aceitam `{ quantity, unit }`. Se `unit='unit'`,
  o alimento precisa ter `unit_grams` (senão 400).
- `src/app/api/foods/route.ts` (POST) e `foods/[id]/route.ts` (PUT): aceitam `unit_name`/
  `unit_grams` para alimentos próprios.
- **Novo** `src/app/api/foods/[id]/unit/route.ts` (PUT): chama `set_food_unit` via
  `supabase.rpc("set_food_unit", ...)` — serve TACO e próprios; valida `unit_grams > 0`
  quando `unit_name` presente; ambos nulos = remover unidade.
- `src/app/api/meals/route.ts` (GET): retorna `quantity`+`unit`; o embed de `food` já traz
  `unit_name`/`unit_grams`.

### UI
- `FoodBank.tsx`: exibição + edição de unidade (todos os alimentos), campos de unidade no
  cadastro de próprios.
- `DayEditor.tsx`: toggle gramas|unidade ao adicionar/editar item; exibição "N unidade (Xg)".
  Onde hoje usa `quantity_g`, passa a usar `{ quantity, unit }` + `itemGrams`.
- `src/app/(app)/page.tsx` (dashboard): a agregação por tipo de dia mapeia `meal_items` para
  `mealMacros` — atualizar de `{ quantity_g, food }` para `{ quantity, unit, food }`.

### Testes
- Unit: `itemGrams` e `itemMacros` (gramas e unidade).
- E2E (`tests/e2e/flow.spec.ts`): além do fluxo atual (item em gramas → total 330), um passo
  adicionando um alimento **por unidade** e asserindo o total derivado e a exibição "N (Xg)".

---

## Casos de borda

- **Alimento sem `unit_grams` com `unit='unit'`:** a API rejeita (400); a UI só oferece o
  toggle "unidade" para alimentos que têm unidade.
- **Remover unidade de um alimento em uso:** `meal_items` com `unit='unit'` daquele alimento
  passam a derivar 0g (unit_grams null). A UI avisa e sugere reconverter para gramas — para o
  v1, `itemGrams` retorna 0 nesse caso (sem quebrar); tratamento fino fica como follow-up.
- **Migração:** itens antigos viram `unit='g'` com o valor de gramas preservado; nada muda no
  cálculo existente.
- **Edição de unidade TACO:** só via `set_food_unit` (nunca escrita direta), escopada a
  TACO-ou-próprio.
