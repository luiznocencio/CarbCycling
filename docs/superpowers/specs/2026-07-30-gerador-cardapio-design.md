# Gerador de Cardápio por IA (Feature C1) — Design

## Contexto e objetivo

O app de ciclo de carboidratos está em produção com metas por tipo de dia, banco de
alimentos (com unidades) e editor de dia. Falta o "cérebro" que monta o cardápio sozinho.
Esta feature (C1) gera automaticamente o cardápio de um tipo de dia: a IA escolhe alimentos
coerentes (dos preferidos do usuário + básicos) e um solver determinístico ajusta as
quantidades para bater as metas. Cada refeição vem com **várias opções intercambiáveis**
(diversidade sem sair da meta). O usuário revisa e aplica.

**Fora do escopo deste spec** (vira C2, a próxima etapa):
- Criar/editar manualmente uma opção de uma refeição específica, com alimentos escolhidos.

## Princípios / restrições

- **IA em runtime, server-side apenas.** Uma chamada ao `gpt-4o-mini` (OpenAI) por geração,
  numa Route Handler. `OPENAI_API_KEY` é **segredo** (env server-side, nunca `NEXT_PUBLIC`,
  nunca commitada).
- **Gramas/macros como fonte de verdade.** O solver e os motores puros (`itemGrams`,
  `mealMacros`, `compareToTarget`) garantem que os números são sempre válidos e determinísticos,
  independentemente da IA.
- **A IA nunca é a fonte de verdade numérica** — ela escolhe alimentos (por id, só do pool);
  o solver fixa as quantidades. IDs alucinados são descartados.
- **Não-destrutivo até aplicar.** Gerar produz uma proposta; só "Aplicar" altera o banco.
- Next.js 16 (`params`/`cookies()` async; `proxy.ts`). UI pt-BR, mobile-first. RLS por usuário.

---

## 1. Preferidos + básicos (pool de candidatos)

### `food_favorites` (nova tabela)
| campo | tipo | descrição |
|---|---|---|
| user_id | uuid | FK auth.users |
| food_id | uuid | FK foods |
| (pk) | | `primary key (user_id, food_id)` |
RLS: o usuário só lê/escreve as próprias linhas.

- No banco de alimentos, cada alimento ganha um **⭐ toggle** (favoritar/desfavoritar) via
  `POST/DELETE /api/foods/[id]/favorite`.

### Básicos
- `data/basics.json`: lista curada de **nomes** de estáveis comuns da TACO (arroz, frango,
  ovo, aveia, batata, feijão, banana, etc.), versionada. Um teste valida que os nomes existem
  na base.
- No momento da geração, os nomes são resolvidos para `food_id` (query em `foods` com
  `user_id is null` e `name in (...)`).

**Pool de candidatos** da geração = favoritos do usuário ∪ básicos (deduplicado por id),
cada um com `{ id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, unit_name, unit_grams }`.

---

## 2. Modelo de dados — opções por refeição

Reaproveita a estrutura `meals → meal_items` (Feature B intacta). Adiciona colunas a `meals`:

| coluna nova | tipo | descrição |
|---|---|---|
| `slot` | int, default 0 | agrupa as opções de uma mesma refeição (0..N-1) |
| `option_label` | text, default 'Opção 1' | rótulo da opção |
| `selected` | boolean, default true | qual opção conta para os totais do dia |

- Uma **refeição-slot** = todas as linhas `meals` com o mesmo `(day_type_id, slot)`; compartilham
  `name`, diferem por `option_label`/itens; exatamente **uma** tem `selected = true`.
- Linhas `meals` existentes (Feature A/B): a migration seta `slot = "order"`,
  `option_label='Opção 1'`, `selected=true`. Assim cada refeição atual vira um slot de 1 opção —
  comportamento inalterado. Refeições geradas depois setam `slot` e `order` = índice do slot.
- **Totais do dia / dashboard passam a somar só `meals.selected = true`.** Como as linhas
  existentes têm `selected=true`, nada muda para elas.

---

## 3. Geração — IA + solver

Endpoint `POST /api/day-types/[id]/generate` (body `{ meals: N, options: M }`; defaults N=5, M=3).

Passos (server-side):
1. Carrega o `day_type` (metas kcal/P/C/G) e o **pool** (favoritos ∪ básicos, seção 1).
2. **Sub-metas por refeição:** distribui as metas do dia em N slots por um vetor de pesos.
   - Default para N=5 (nomes: Café da manhã, Lanche/pré-treino, Almoço, Lanche/pré-treino, Jantar):
     pesos `[0.20, 0.10, 0.30, 0.15, 0.25]`.
   - Para N≠5: split uniforme `1/N` por slot, nomes "Refeição 1..N".
   - Sub-meta do slot = meta_do_dia × peso (kcal, P, C, G).
3. **1 chamada ao `gpt-4o-mini`** com `response_format: json_schema` estrito. Entrada: nomes +
   sub-metas dos N slots, M, e o pool (id+nome+macros/100g+unidade). Instrução: para cada slot,
   gerar M opções distintas, cada uma um conjunto de itens (só `food_id` do pool) que aproxime a
   sub-meta daquele slot (priorizar bater a proteína; variar as opções entre si).
   Saída (schema): `{ slots: [ { name, options: [ { items: [ { food_id, quantity, unit } ] } ] } ] }`.
4. **Validação:** descarta `food_id` fora do pool; garante `unit ∈ {'g','unit'}` (e só usa
   `unit='unit'` se o alimento tem `unit_grams`); garante ≥1 item por opção (senão preenche com
   um básico proteico). 
5. **Solver determinístico** (`scaleOptionToKcal`): para cada opção, escala as quantidades por um
   fator único = `subMetaKcal / kcalAtual` da opção, fixando o kcal do slot. Os macros ficam
   próximos (a IA mirou as proporções); desvios são reportados.
6. Monta a **proposta** (não salva): N slots × M opções, com itens (detalhes do alimento), macros
   por opção/dia (opção 1 selecionada) via os motores puros, e o desvio vs meta.

**Precisão:** o solver garante o kcal de cada refeição; proteína fica bem próxima (a IA mira a
sub-meta de proteína); carbo/gordura aproximados — o ajuste fino é o editor de dia (já existe).

**Falhas da IA:** timeout/erro/JSON inválido → a rota retorna 502 com mensagem amigável; nada é
salvo. O usuário pode tentar de novo.

---

## 4. Revisar e aplicar

- A geração retorna a proposta; a UI mostra os N slots com abas de opção (Opção 1/2/3), os itens
  de cada opção e o total do dia vs meta (opção 1 de cada slot selecionada por default).
- **"Aplicar"** (`POST /api/day-types/[id]/apply-menu`, body: proposta): substitui as refeições do
  tipo de dia — deleta as `meals` atuais (cascade em `meal_items`) e insere os slots×opções
  (option 1 `selected=true`). Confirma antes (sobrescreve o cardápio atual).
- **"Gerar de novo"** → nova chamada (resultado diferente). **"Descartar"** → fecha sem salvar.
- Depois de aplicar, o editor de dia agrupa por slot, mostra as opções e permite **escolher a
  selecionada** (toggle `selected`) e o **ajuste manual** de quantidades/itens (já existe).

---

## 5. Impacto técnico

### Schema (migrations via Supabase MCP)
- `0006_food_favorites.sql`: tabela `food_favorites` + RLS (own).
- `0007_meal_options.sql`: `alter table meals add column slot int not null default 0`,
  `add column option_label text not null default 'Opção 1'`, `add column selected boolean not null default true`;
  `update meals set slot = "order"` (backfill retrocompatível).

### Env / dependência
- `OPENAI_API_KEY` (server-side, `.env.local` + Vercel). Dependência `openai`.

### Módulos
- `src/lib/nutrition/solver.ts` (puro, testado): `scaleOptionToKcal(items, targetKcal)` e
  `mealSubTargets(dayTarget, n)` (vetor de pesos → sub-metas).
- `src/lib/ai/menu.ts` (server-only): `generateMenu(input): Promise<RawMenu>` — monta prompt,
  chama OpenAI com json_schema, valida ids. **Seam de teste:** a rota `generate` usa `generateMenu`;
  em testes/E2E ela é injetável/stubável (sem chamar a OpenAI de verdade).
- `src/lib/ai/openai.ts`: cliente OpenAI (lê `OPENAI_API_KEY`).

### APIs
- `POST /api/foods/[id]/favorite` e `DELETE` (ou toggle) → `food_favorites`.
- `GET /api/favorites` (ids favoritos) — para o ⭐ no banco de alimentos.
- `POST /api/day-types/[id]/generate` (`{ meals, options }`) → proposta (não salva).
- `POST /api/day-types/[id]/apply-menu` (`{ proposal }`) → substitui as refeições.
- Dashboard/agregações e `GET /api/meals` passam a considerar `selected`.

### UI
- `FoodBank.tsx`: ⭐ toggle por alimento (favoritar).
- Novo `MenuGenerator` (diálogo no editor de dia / página do tipo de dia): inputs N e M, botão
  "Gerar cardápio", tela de proposta com abas de opção + total vs meta, "Aplicar"/"Gerar de novo".
- `DayEditor.tsx`: agrupar `meals` por `slot`, mostrar abas de opção, permitir escolher a
  `selected`. Totais do dia somam a opção selecionada de cada slot.
- Dashboard `(app)/page.tsx`: agregação por tipo de dia soma só `meals.selected`.

### Testes
- Unit: `solver.ts` (`scaleOptionToKcal` — fator exato; `mealSubTargets` — pesos default N=5 e
  uniforme; soma dos pesos = 1); validação de `menu.ts` (descarta ids fora do pool) com uma
  `RawMenu` stub.
- E2E (determinístico, **sem** chamar a OpenAI): favoritar um alimento; e o fluxo de **aplicar uma
  proposta fixa** (a rota `apply-menu` recebe a proposta pronta) → confere que os slots/opções
  aparecem no editor e que trocar a opção selecionada muda o total do dia.
- A chamada real ao `gpt-4o-mini` é **verificada manualmente** no smoke de produção.

### Segurança / custo
- Chave só server-side. `gpt-4o-mini` é barato; app single-user → sem rate-limit adicional.
- A rota `generate` exige `auth.getUser()`; o `day_type` é lido sob RLS (do próprio usuário).

---

## Casos de borda

- **Pool pequeno** (poucos favoritos): os básicos garantem um mínimo; se ainda assim faltar, a
  IA repete alimentos entre opções (aceitável) — o solver mantém as metas.
- **IA retorna opção vazia / ids inválidos:** validação preenche/descarta; opção nunca fica vazia.
- **N≠5:** split uniforme + nomes genéricos.
- **Aplicar sobre um dia já montado:** sobrescreve (com confirmação); manual edits anteriores se perdem.
- **`kcalAtual = 0` numa opção** (itens sem kcal): solver evita divisão por zero (fator 1, aviso).
- **Migração de opções:** refeições existentes viram slots de 1 opção (`selected=true`) — nada muda.
