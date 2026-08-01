# Preferências Alimentares + Chat de Captura (Feature E1) — Design

## Contexto e objetivo

Os geradores por IA (C1 `generate`, C2 `suggest-option`) montam refeições a partir de um
*pool* (favoritos ∪ básicos ∪ include) sem qualquer noção do que o usuário **gosta, evita ou
não pode comer**. Esta feature (E1) introduz um registro de **preferências** que:

1. É capturado por um **chat curto** (a IA conversa e destila o que você diz num JSON estruturado),
   e também é **editável na mão** numa tela.
2. Passa a **alimentar todos os geradores**: `avoid` filtra o pool (duro); `likes`/`dislikes`/`notes`
   entram no prompt (suave); `always_include` é mesclado no `include`.

É a fundação da E2 (cardápio da semana) — com preferências, a semana gerada fica muito melhor.

## Princípios / restrições

- **IA server-side apenas**, `gpt-4o-mini`; `OPENAI_API_KEY` é segredo (env, nunca `NEXT_PUBLIC`,
  nunca commitada). Já configurada em `.env.local` e na Vercel — **não mexer nela**.
- **A IA nunca é fonte de verdade:** o chat só *propõe* o JSON; o que vale é o registro salvo, que o
  usuário revisa e edita. O `avoid` é aplicado por **match de nome determinístico** no servidor,
  não por confiança na IA.
- **Single-user**, mas RLS por usuário em tudo (`user_id = auth.uid()`).
- Next.js 16 (`params`/`cookies()` async; middleware é `src/proxy.ts`). UI pt-BR, mobile-first.
- Preferências são **texto livre** (tags), não food_ids — o chat produz linguagem natural. O
  casamento com o pool é feito por **normalização de nome** (sem acento, minúsculo, substring).

---

## 1. Migração — tabela `user_preferences`

Uma linha por usuário (upsert por `user_id`). RLS: SELECT/INSERT/UPDATE/DELETE só `user_id = auth.uid()`.

```sql
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  likes text[] not null default '{}',
  dislikes text[] not null default '{}',
  avoid text[] not null default '{}',
  always_include text[] not null default '{}',
  notes text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
-- policies: using/with check (user_id = auth.uid()) para as 4 operações
```

- `likes` / `dislikes` — **suaves** (prompt).
- `avoid` — **duro** (alergia/nunca): remove do pool os alimentos cujo nome casa.
- `always_include` — nomes que devem aparecer; resolvidos best-effort para food_ids e mesclados no `include`.
- `notes` — texto livre ("sem lactose", "cozinha rápida", "prefiro frango e ovo").

---

## 2. Helper compartilhado — `src/lib/ai/preferences.ts`

Puro e testável onde dá; a leitura do banco fica isolada.

```ts
export type Preferences = {
  likes: string[]; dislikes: string[]; avoid: string[];
  always_include: string[]; notes: string;
};

export const EMPTY_PREFS: Preferences;

// leitura sob RLS; nunca lança — retorna EMPTY_PREFS se não houver linha
export async function loadPreferences(supabase): Promise<Preferences>;

// normaliza p/ match: minúsculo, sem acento, trim
export function normalizeName(s: string): string;   // puro

// remove do pool os foods cujo nome casa (substring normalizado) com QUALQUER termo de `avoid`
export function applyAvoidToPool<T extends { name: string }>(
  pool: T[], avoid: string[],
): T[];                                              // puro, testável

// resolve nomes de `always_include` para food_ids presentes no pool (match normalizado)
export function resolveIncludeIds(
  pool: { id: string; name: string }[], names: string[],
): string[];                                         // puro, testável

// bloco de texto pt-BR p/ injetar no system prompt (gosta/evita/observações)
export function prefsPromptSnippet(p: Preferences): string;  // puro
```

`applyAvoidToPool`: para cada food, se `normalizeName(food.name)` **contém** algum
`normalizeName(termo)` não-vazio de `avoid`, descarta. (Ex.: avoid `"peixe"` remove
"Peixe, tilápia..."; avoid `"leite"` remove "Leite, de vaca...".) Termos vazios são ignorados.

`prefsPromptSnippet`: gera algo como
`"Preferências do usuário — gosta de: X, Y; evita/não curte: Z; observações: ...". Priorize o que ele gosta; não use o que ele evita."`
(omitindo seções vazias). Só orientação — o filtro duro já foi aplicado no pool.

---

## 3. Chat de captura — `src/lib/ai/preferences.ts` (IA) + endpoint

### Função IA `extractPreferences`
```ts
export async function chatPreferences(input: {
  messages: { role: "user" | "assistant"; content: string }[];
  current: Preferences;   // registro atual, p/ a IA acumular em vez de zerar
}): Promise<{ reply: string; preferences: Preferences }>;
```
- **System:** "Você ajuda a levantar preferências alimentares em pt-BR. Faça no máx. 1–2 perguntas
  curtas por vez. A cada turno devolva `reply` (sua fala) **e** `preferences` = o registro
  ATUALIZADO acumulando o que já havia em `current` com o que o usuário disse. Não invente; só
  registre o que foi dito. Alergias/restrições vão em `avoid`."
- **response_format:** `json_schema` estrito `{ reply: string, preferences: {likes[],dislikes[],avoid[],always_include[],notes} }`.
- Server-only (`openaiClient()`), `gpt-4o-mini`.

### Endpoints — `src/app/api/preferences/`
- `GET /api/preferences` → registro atual (ou `EMPTY_PREFS`). Auth 401.
- `PUT /api/preferences` → **upsert** do registro editado (valida arrays de string, trim, dedup,
  limita tamanho — ex.: ≤50 itens por lista, strings ≤80 chars, `notes` ≤2000). Auth 401.
- `POST /api/preferences/chat` (body `{ messages, current }`) → chama `chatPreferences`, retorna
  `{ reply, preferences }`. **Não persiste** — o usuário salva via `PUT`. Falha da IA → 502.

---

## 4. Fiar nos geradores existentes

Em **ambos** os endpoints, após montar o pool e antes de chamar a IA/solver:

### `src/app/api/day-types/[id]/generate/route.ts` (C1)
1. `const prefs = await loadPreferences(supabase)`.
2. `pool = applyAvoidToPool(pool, prefs.avoid)` (se esvaziar o pool → 400 com mensagem clara).
3. Passa `prefsPromptSnippet(prefs)` para `generateMenu` (novo campo opcional `guidance` no input,
   concatenado ao system prompt).
4. `always_include`: `resolveIncludeIds(pool, prefs.always_include)` — o gerador não tem `include`
   hoje; a orientação de incluir vai via `guidance` (o C1 é o cardápio inteiro, include forçado
   por refeição não se aplica bem). **Escopo E1:** no C1 o `always_include` entra só como orientação
   no prompt; o include forçado permanece no C2.

### `src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts` (C2)
1. `const prefs = await loadPreferences(supabase)`.
2. `pool = applyAvoidToPool(pool, prefs.avoid)`.
3. `include = [...include, ...resolveIncludeIds(pool, prefs.always_include)]` (dedup).
4. `exclude` do usuário **vence**: itens em `exclude` continuam removidos mesmo que a pref mande incluir.
5. Passa `prefsPromptSnippet(prefs)` para `suggestMealOption` (novo campo opcional `guidance`).

`generateMenu` e `suggestMealOption` ganham um campo **opcional** `guidance?: string` concatenado
ao system prompt — retrocompatível (sem prefs = comportamento atual).

---

## 5. UX — página `/preferences`

Nova rota linkada no menu/nav (e/ou em `/settings`). Mobile-first, duas seções empilhadas:

- **Chat** (`data-testid="prefs-chat"`): histórico de mensagens + input + enviar. Cada envio chama
  `POST /api/preferences/chat` com o histórico e o `current` (estado do formulário); a resposta
  atualiza a fala da IA **e** preenche/mescla os campos do formulário abaixo. Enquanto responde,
  "Pensando..."; 502 → mensagem amigável.
- **Formulário editável** (`data-testid="prefs-form"`): quatro editores de lista de tags
  (`likes`/`dislikes`/`avoid`/`always_include`) — adicionar/remover chips — e um `textarea` de `notes`.
  Botão **"Salvar preferências"** (`data-testid="prefs-save"`) → `PUT`; feedback "Preferências salvas."
- O usuário pode ignorar o chat e preencher tudo na mão — o chat é conveniência, o formulário é a verdade.

---

## 6. Impacto técnico

- **Migração:** `user_preferences` + RLS (seção 1).
- **`src/lib/ai/preferences.ts`** (novo): tipos, `loadPreferences`, `normalizeName`,
  `applyAvoidToPool`, `resolveIncludeIds`, `prefsPromptSnippet` (puros) + `chatPreferences` (IA).
- **`src/lib/ai/menu.ts`:** `generateMenu` e `suggestMealOption` aceitam `guidance?: string`.
- **`src/app/api/preferences/route.ts`** (novo): GET + PUT.
- **`src/app/api/preferences/chat/route.ts`** (novo): POST.
- **`generate` e `suggest-option`:** aplicam prefs (seção 4).
- **`src/app/preferences/page.tsx`** + componente de chat/formulário (novo). Link no nav.
- **Testes:**
  - Unit: `normalizeName` (acentos/caixa); `applyAvoidToPool` (remove por substring; ignora termos
    vazios; não remove o que não casa); `resolveIncludeIds` (resolve por nome; ignora não-encontrados);
    `prefsPromptSnippet` (omite seções vazias); validação do `PUT` (dedup/limites).
  - E2E (determinístico, **sem** IA): abrir `/preferences`, preencher o formulário (adicionar um
    `avoid` e um `like`), salvar, recarregar e confirmar persistência via `GET /api/preferences`.
    O chat e o efeito no pool (avoid removendo alimento do gerador) ficam no **smoke manual com IA**.
  - Smoke manual: conversar no chat → campos preenchem; salvar; gerar cardápio (C1) e confirmar que
    um alimento em `avoid` **não** aparece; `suggest-option` (C2) idem + `always_include` presente.

---

## Casos de borda

- **`avoid` esvazia o pool** (ex.: evita tudo): o gerador retorna 400 "Pool vazio após preferências —
  afrouxe os itens evitados ou favorite mais alimentos". Nada é gerado.
- **Termo de `avoid` genérico demais** (ex.: "a"): match por substring pode remover muita coisa —
  aceitável; o usuário vê o efeito e ajusta. `normalizeName` faz trim; termos vazios são ignorados.
- **`always_include` sem correspondência no pool:** ignorado (resolve para vazio); não quebra.
- **`exclude` (C2) vs `always_include`:** `exclude` do pedido vence.
- **Sem linha de preferências:** `loadPreferences` → `EMPTY_PREFS`; geradores se comportam como hoje.
- **Chat que zera preferências:** a IA acumula sobre `current`; ainda assim o usuário só perde algo se
  **salvar** — o `PUT` é explícito.
- **Falha da IA no chat:** 502; o formulário continua utilizável na mão.
