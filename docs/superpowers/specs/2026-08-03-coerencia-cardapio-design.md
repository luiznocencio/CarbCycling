# Coerência culinária na montagem do cardápio — Design

## Contexto e objetivo

Hoje a geração de cardápio (`generateMenu`/`suggestMealOption` em `src/lib/ai/menu.ts`) só instrui a IA a "montar um cardápio brasileiro, bater os macros, priorizar proteína e variar". **Não há nenhuma regra culinária**: a IA otimiza macro e acaba juntando duas proteínas principais na mesma refeição (ex.: frango + carne), empilhando carboidratos e ignorando o horário (café da manhã vs almoço). Resultado: pratos sem sentido, pouco palatáveis, que minam a adesão.

Objetivo: **o mínimo de lógica culinária** para que cada refeição seja um prato coerente — alimentos que combinam, adequados ao horário, sem redundância de proteína.

## Decisões (travadas no brainstorm)

- **Prato coerente completo:** cada refeição vira um prato brasileiro de verdade (proteína principal + carbo + feijão/legume opcional + vegetal/salada), com alimentos adequados ao horário.
- **1 proteína animal principal por refeição:** carne OU frango OU peixe. Ovo, feijão (leguminosa) e laticínios contam como **complemento** e podem acompanhar → o clássico **arroz + feijão + carne + salada passa inteiro**. Barra frango + carne.
- **Arroz + feijão permitido:** feijão é `leguminosa`, não `carbo`; a guarda limita só **carbos-base** (arroz/macarrão/batata) a 1 por prato — arroz + feijão nunca é bloqueado.

## Princípios / restrições

- **Sem migração, sem IA nova:** mesma `gpt-4o-mini`, só prompt melhor + uma guarda determinística. A categorização é **derivada** do nome/macros da TACO (nenhuma coluna nova).
- **Lógica pura e testável** num módulo só (`src/lib/nutrition/coherence.ts`), **compartilhada** pelos três pontos que geram comida: `generate` (C1), semana (E2, que reusa `generateProposalForDayType`) e `suggest-option` (C2).
- **Guarda é subtrativa:** só **remove** redundância (nunca injeta alimento) — assim o solver (`scaleOptionToTarget`) reescala com segurança o que sobrou pra bater kcal+proteína, sem risco de item fantasma. A *inclusão* (ex.: exigir vegetal no prato principal) fica a cargo do prompt.
- pt-BR, determinístico onde importa. Roda **antes** do solver.

---

## 1. Módulo `src/lib/nutrition/coherence.ts` (puro)

### Categorias e tipo de refeição
```ts
export type FoodCategory =
  | "proteina_animal" | "ovo" | "leguminosa" | "laticinio"
  | "carbo" | "pao" | "vegetal" | "fruta" | "gordura" | "oleaginosa" | "outro";

export type MealType = "cafe" | "lanche" | "principal";
```

### `classifyFood(food): FoodCategory`
Entrada: `{ name, protein_per_100g, carbs_per_100g, fat_per_100g }`. Normaliza o nome (minúsculas, sem acento) e casa por **palavra-chave** (prioridade nesta ordem), com **fallback por macro**:
- `proteina_animal`: frango, peito (de frango), carne, bovina, patinho, boi, acém, músculo, peixe, tilápia, salmão, atum, sardinha, merluza, pescada, porco, suína, lombo, pernil, peru, file/filé, coxa, sobrecoxa, camarão.
- `ovo`: ovo, ovos, clara, gema.
- `leguminosa`: feijão, lentilha, grão-de-bico, ervilha, soja, edamame, tremoço.
- `laticinio`: leite, iogurte, queijo, requeijão, coalhada, ricota, whey (proteína em pó = complemento, não conta como proteína animal principal).
- `carbo`: arroz, batata, mandioca, aipim, macaxeira, inhame, cará, macarrão, massa, cuscuz, aveia, tapioca, polenta, fubá, quinoa, milho, purê.
- `pao`: pão, torrada, biscoito, bolacha, tapioca-pronta (pão fica separado; contado junto de carbo-base na guarda, ver abaixo).
- `vegetal`: brócolis, tomate, alface, couve, cenoura, abobrinha, espinafre, pepino, pimentão, cebola, alho, vagem, chuchu, beterraba, repolho, rúcula, acelga, abóbora, quiabo, berinjela, aspargo.
- `fruta`: banana, maçã, mamão, laranja, morango, abacaxi, uva, manga, melancia, pera, kiwi, melão, goiaba, ameixa.
- `gordura`: azeite, óleo, manteiga, margarina, óleo de coco, banha.
- `oleaginosa`: castanha, amendoim, nozes, amêndoa, pistache, macadâmia, avelã.
- **Fallback por macro** (sem palavra-chave): proteína ≥15 g e carbo <15 → `proteina_animal`; carbo ≥40 → `carbo`; gordura ≥50 → `gordura`; senão `outro`.

### `mealTypeFromName(name, index, total): MealType`
Normaliza o nome: contém "café"/"manhã" → `cafe`; "lanche"/"pré-treino"/"pós-treino"/"ceia" → `lanche`; "almoço"/"jantar" → `principal`. **Fallback por posição** (nomes genéricos "Refeição i"): `index === 0` → `cafe`; senão `principal`.

### `coherenceGuidance(mealType): string`
Texto pt-BR pro prompt, com um preâmbulo de regras gerais + o molde do tipo:
- **Geral:** "Monte pratos que fazem sentido juntos e são palatáveis. No máximo UMA proteína animal principal por refeição (carne OU frango OU peixe) — ovo, feijão e laticínios são complementos e podem acompanhar. Não empilhe carboidratos base (escolha arroz OU macarrão OU batata; arroz + feijão é permitido). Escolha alimentos adequados ao horário da refeição."
- **cafe:** base de carbo (pão/aveia/tapioca) + proteína leve (ovo/iogurte/leite/queijo) + fruta opcional. Nada de arroz+feijão+bife.
- **lanche:** algo leve — fruta + proteína (iogurte/whey/leite) ou oleaginosas.
- **principal:** 1 proteína animal + 1 carbo + feijão opcional + **um vegetal/salada** + gordura boa opcional (azeite).

### `enforceCoherence(items, info): items` — a guarda (subtrativa)
```ts
export function enforceCoherence<T>(
  items: T[],
  info: (it: T) => { category: FoodCategory; protein_g: number; carbs_g: number },
): T[];
```
Preserva a ordem e aplica os limites, **removendo só o excedente**:
- `proteina_animal`: mantém no máximo **1** — a de maior `protein_g` (contribuição real, já com a quantidade); descarta as demais. → mata frango + carne.
- **carbo-base** (`carbo` **+** `pao` juntos): mantém no máximo **1** — a de maior `carbs_g`; descarta as demais. → mata arroz + macarrão + batata.
- **Não** mexe em `leguminosa`, `vegetal`, `fruta`, `laticinio`, `ovo`, `gordura`, `oleaginosa`, `outro` (complementos). → arroz + feijão intacto; salada e azeite intactos.

Type-agnóstica (mesmas regras em qualquer refeição); a adequação ao horário fica no prompt. Nunca esvazia a opção: se sobra só a proteína mantida, o solver a escala pra bater a meta.

---

## 2. Fiar no prompt — `src/lib/ai/menu.ts`

- **`PoolFood` ganha `categoria`** (string pt-BR) — calculada com `classifyFood` no caller e passada à IA junto de cada alimento do pool, pra ela raciocinar por categoria.
- **`generateMenu`:** o `BASE` recebe as regras gerais de coerência (via `coherenceGuidance` genérico) + a `guidance` de preferências. No `user content`, cada refeição em `refeicoes` ganha `tipo` (via `mealTypeFromName`) e uma linha de molde (`coherenceGuidance(tipo)`), e cada `pool[i]` ganha `categoria`.
- **`suggestMealOption`:** idem — recebe o `mealType` do slot (derivado do `slotName`) e injeta `coherenceGuidance(tipo)` no system; pool com `categoria`.

## 3. Fiar a guarda — `generate.ts` e a rota do C2

Ponto de inserção idêntico nos dois: **entre `withFood` e `scaleOptionToTarget`**.
```ts
const coherent = enforceCoherence(withFood, (it) => ({
  category: classifyFood(it.food),
  protein_g: (it.food.protein_per_100g * itemGrams(it, it.food)) / 100,
  carbs_g:   (it.food.carbs_per_100g   * itemGrams(it, it.food)) / 100,
}));
const scaled = scaleOptionToTarget(coherent, { kcal: sub.kcal, protein_g: sub.protein_g });
```
- **`src/lib/ai/generate.ts`** (`generateProposalForDayType`): aplica por opção antes do `scaleOptionToTarget`. Passa `tipo` de cada refeição pro `generateMenu`.
- **Rota `suggest-option`**: aplica antes do `scaleOptionToTarget`; passa o `mealType` do slot pro `suggestMealOption`.
- Como `generateProposalForDayType` é reusado pela **semana (E2)**, a coerência entra na semana de graça.

## 4. Nomes de refeição melhores (para a IA saber o horário)

`mealSubTargets` (`src/lib/nutrition/solver.ts`) hoje só nomeia bem quando `n===5`. Adicionar defaults para os casos comuns melhora o `mealTypeFromName` de graça:
- `n=3`: Café da manhã · Almoço · Jantar
- `n=4`: Café da manhã · Almoço · Lanche · Jantar
- `n=6`: Café da manhã · Lanche · Almoço · Lanche · Jantar · Ceia

(pesos proporcionais razoáveis; `n=5` inalterado; outros `n` seguem "Refeição i" + fallback por posição.)

---

## 5. Impacto técnico

- **`src/lib/nutrition/coherence.ts`** (novo, puro): `classifyFood`, `mealTypeFromName`, `coherenceGuidance`, `enforceCoherence`.
- **`src/lib/ai/menu.ts`:** `PoolFood.categoria`; `generateMenu`/`suggestMealOption` aceitam/injetam tipo de refeição + regras; system prompt reforçado.
- **`src/lib/ai/generate.ts`:** aplica `enforceCoherence` por opção; passa tipos ao `generateMenu`.
- **rota `suggest-option`:** aplica `enforceCoherence`; passa `mealType`.
- **`src/lib/nutrition/solver.ts`:** nomes/pesos default para `n=3,4,6`.
- **Testes:**
  - Unit `classifyFood`: frango/carne/atum→proteina_animal; ovo→ovo; feijão/lentilha→leguminosa; arroz/batata/macarrão/aveia→carbo; pão→pao; brócolis/alface→vegetal; banana→fruta; azeite→gordura; castanha→oleaginosa; item sem keyword rico em carbo→carbo (fallback).
  - Unit `mealTypeFromName`: "Café da manhã"→cafe; "Almoço"/"Jantar"→principal; "Lanche/pré-treino"→lanche; "Refeição 1"(idx0)→cafe; "Refeição 3"→principal.
  - Unit `enforceCoherence`: frango+carne+arroz+salada → cai pra 1 proteína (a de maior proteína) + arroz + salada; arroz+macarrão+batata → 1 carbo (o de maior carbo); **arroz+feijão+carne+brócolis → intacto** (nada removido); só-proteínas → mantém 1.
  - E2E: o fluxo determinístico atual não chama IA; adicionar asserção pura via `enforceCoherence` já cobre. O E2E existente continua verde (sem regressão de contrato).

## Casos de borda

- **Opção só com dois carbos** (arroz + macarrão): guarda mantém 1; solver escala → porção maior de arroz. Palatável e sem redundância.
- **Pool pobre** (usuário só com básicos): os básicos cobrem proteína/carbo/leguminosa/vegetal/gordura → pratos coerentes possíveis. Se faltar vegetal no pool, o prompt pede mas a guarda não inventa — sai sem vegetal (aceitável).
- **Whey/laticínio + carne:** laticínio é complemento → não conta como 2ª proteína animal; mantém ambos (ex.: carne no almoço não some por causa de um iogurte).
- **Abacate:** classificado como `fruta` (não gordura) — decisão simples; não afeta as regras da guarda.
- **`include`/`always_include` (prefs) apontando 2 proteínas:** a guarda ainda reduz a 1 proteína animal — coerência vence a redundância; o usuário vê 1 proteína principal (o include mais proteico permanece). (Comportamento aceitável; documentado.)
