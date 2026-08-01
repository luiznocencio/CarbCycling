# Substituições Manuais de Refeição + Solver de Macros (Feature C2) — Design

## Contexto e objetivo

O gerador de cardápio por IA (C1) está em produção: refeições viram *slots* com opções
(`meals` por `slot`, uma `selected`), o editor de dia edita os itens da opção ativa, e o
`solver.ts`/`menu.ts` geram opções. Faltam duas coisas: (1) **criar novas opções** de uma
refeição específica manualmente ou por IA (a C1 só gera o cardápio inteiro de uma vez); e
(2) **apertar a distribuição de macros** — hoje o solver só escala kcal, então a proteína
estoura. Esta feature (C2) entrega as duas.

## Princípios / restrições

- **IA server-side apenas**, `gpt-4o-mini`; `OPENAI_API_KEY` é segredo (env, nunca `NEXT_PUBLIC`, nunca commitada). Já configurada.
- **IA nunca é fonte de verdade numérica:** ids validados contra o pool; o solver fixa as quantidades.
- **Determinístico e testável** onde possível (solver puro). Gramas = fonte de verdade.
- **Sem migração nova** — reusa `meals`/`meal_items`/`food_favorites`.
- Next.js 16 (`params`/`cookies()` async; `proxy.ts`). UI pt-BR, mobile-first. RLS por usuário.

---

## 1. Solver melhor — `src/lib/nutrition/solver.ts`

Nova função pura `scaleOptionToTarget(items, target)` que bate **kcal E proteína** (2 restrições)
via um sistema linear de 2 grupos, com fallback determinístico:

```
scaleOptionToTarget(
  items: { quantity: number; unit: "g" | "unit"; food: Food }[],
  target: { kcal: number; protein_g: number },
): { quantity: number; unit: "g" | "unit"; food: Food }[]
```
Algoritmo:
1. Para cada item, calcula kcal e proteína atuais (via `itemMacros`/`itemGrams`).
2. `targetFrac = (target.protein_g * 4) / target.kcal` (fração de kcal vinda de proteína).
   Cada item tem `frac = (protein_g_do_item*4) / kcal_do_item`.
3. **Grupo A** = itens com `frac > targetFrac` (proteicos); **Grupo B** = o resto.
4. `Ka,Pa` = soma de kcal e proteína(g) do grupo A (nas quantidades atuais); `Kb,Pb` do B.
5. Resolve para os fatores de escala `a` (grupo A) e `b` (grupo B):
   `a·Ka + b·Kb = target.kcal` e `a·Pa + b·Pb = target.protein_g`.
   `det = Ka·Pb − Kb·Pa`.
   - Se `A` vazio, `B` vazio, `det == 0`, ou `a < 0` ou `b < 0` (inviável) → **fallback**
     `scaleOptionToKcal(items, target.kcal)` (só kcal, como hoje).
   - Senão: `a = (K·Pb − P·Kb)/det`, `b = (Ka·P − Pa·K)/det`; escala as quantidades do grupo A
     por `a` e do grupo B por `b` (arredonda a 1 casa). Bate kcal+proteína exatos (modulo arredondamento).

Exemplo de referência (para teste): frango (165 kcal/100g, 31 P) @100g + arroz (124 kcal/100g,
2.6 P) @100g, target `{kcal:500, protein_g:40}` → frango ≈ **107.2g**, arroz ≈ **260.6g**;
`mealMacros` resultante ≈ 500 kcal / 40 P. Caso inviável (só frango) → fallback só-kcal.

`scaleOptionToKcal` permanece (usado como fallback).

### Aplicação no gerador C1
Em `src/app/api/day-types/[id]/generate/route.ts`, trocar
`scaleOptionToKcal(withFood, sub.kcal)` por
`scaleOptionToTarget(withFood, { kcal: sub.kcal, protein_g: sub.protein_g })`.
Resultado: os cardápios gerados passam a bater proteína (corrige o estouro observado no smoke).

---

## 2. Criar novas opções de uma refeição

### Manual — reaproveita a API existente
"+ Nova opção" num slot cria uma opção vazia: `POST /api/meals` com
`{ day_type_id, name: <nome do slot>, slot: <slot>, order: <slot>, option_label: "Opção N+1", selected: false }`
(a rota já aceita esses campos). O editor de dia edita os itens da nova opção como já faz.

### IA de refeição única — `src/lib/ai/menu.ts`
Nova função server-only:
```
suggestMealOption(input: {
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  pool: PoolFood[];            // mesmo formato do generateMenu
  include: string[];           // food_ids a FIXAR (devem aparecer)
  exclude: string[];           // food_ids a EVITAR
}): Promise<{ food_id: string; quantity: number; unit: "g" | "unit" }[]>
```
- Prompt: monte UMA opção de refeição que aproxime `target`, usando SÓ o pool; DEVE incluir os
  `include`; NÃO use os `exclude`. JSON schema estrito de `{ items: [...] }`.
- Validação (`validateItems`, pura, testável): descarta ids fora do pool, ids em `exclude`, e itens
  com `unit`/`quantity` inválidos; **força a presença dos `include`** ausentes (adiciona com uma
  quantidade base, ex.: 50 g ou 1 unidade, para o solver escalar depois).

### Endpoint
`POST /api/day-types/[id]/slots/[slot]/suggest-option` (body `{ include: string[], exclude: string[] }`):
1. Carrega o `day_type` sob RLS (404 se não é do usuário).
2. Sub-meta do slot: `distinctSlots` = slots distintos das `meals` do dia (ordenados); `n` = quantidade;
   `idx` = posição do `slot` em `distinctSlots`; `subTarget = mealSubTargets(dayType, n)[idx]`.
3. Pool = favoritos ∪ básicos ∪ `include` (resolvidos para foods reais). Se `include`/`exclude`
   referenciarem ids inexistentes, ignora.
4. `suggestMealOption({ target: subTarget, pool, include, exclude })` → itens → `scaleOptionToTarget`.
5. **Cria** a opção (uma `meal` nova no slot, `option_label` = próximo, `selected=false`) + `meal_items`,
   e retorna a `meal` criada (com itens). Falha da IA → 502, nada criado.

---

## 3. UX (editor de dia)

Na barra de opções de cada slot:
- **"+ Nova opção"** (`data-testid="add-option"`) → cria a opção vazia (via `POST /api/meals`), que vira
  uma nova aba selecionável/editável.
- **"Sugerir com IA"** (`data-testid="suggest-option"`) → abre um seletor onde o usuário busca alimentos
  e marca **incluir**/**evitar** (ou nenhum); ao confirmar, chama o endpoint `suggest-option`; a opção
  criada aparece como nova aba. Enquanto gera, mostra "Sugerindo..."; 502 → mensagem amigável.
- As opções existentes seguem com editar itens / selecionar / excluir (com a promoção de irmã já feita na C1).

---

## 4. Impacto técnico

- **`src/lib/nutrition/solver.ts`:** + `scaleOptionToTarget` (mantém `scaleOptionToKcal`). Unit tests.
- **`src/lib/ai/menu.ts`:** + `suggestMealOption` + `validateItems` (puro, testado). Reusa `openaiClient`.
- **`src/app/api/day-types/[id]/generate/route.ts`:** usa `scaleOptionToTarget` (com `protein_g`).
- **`src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts`:** novo endpoint (seção 2).
- **`src/components/DayEditor.tsx`:** botões "+ Nova opção" e "Sugerir com IA" + seletor incluir/evitar.
- **Testes:**
  - Unit: `scaleOptionToTarget` (viável bate kcal+proteína no exemplo; inviável → fallback só-kcal);
    `validateItems` (descarta fora do pool/excluídos; força includes ausentes).
  - E2E (determinístico, **sem** IA): adicionar uma **opção manual** a um slot (via UI ou
    `POST /api/meals`) e conferir que a nova aba aparece e é editável/selecionável. A sugestão por IA
    de refeição única fica no **smoke manual**.
- **Sem migração.**

---

## Casos de borda

- **Pool sem alimento proteico** ou **um só grupo:** `scaleOptionToTarget` cai no fallback só-kcal (proteína aproximada).
- **`include` maior que a refeição comporta:** o solver escala tudo para a meta; pode ficar pouco de cada — aceitável.
- **`include`/`exclude` com ids inválidos:** ignorados.
- **Slot com uma só opção:** "+ Nova opção" simplesmente adiciona a 2ª; nada muda nos totais até selecionar.
- **Sub-meta com slots não-contíguos** (após excluir opções): usa a posição do slot entre os slots distintos.
- **Falha da IA no `suggest-option`:** 502, nada criado; o usuário tenta de novo ou monta manual.
