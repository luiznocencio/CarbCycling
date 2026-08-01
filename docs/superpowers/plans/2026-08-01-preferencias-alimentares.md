# Preferências Alimentares + Chat de Captura (Feature E1) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Goal:** Um registro de preferências alimentares (gosta/evita/alergia/sempre incluir + notas), capturado por um chat de IA que destila em JSON **e** editável na mão, que passa a alimentar todos os geradores (C1 `generate`, C2 `suggest-option`): `avoid` filtra o pool (duro), `likes`/`dislikes`/`notes` orientam o prompt, `always_include` mescla no include.

**Architecture:** Nova tabela `user_preferences` (1 linha/usuário, RLS). `src/lib/ai/preferences.ts` reúne helpers puros (`normalizeName`, `applyAvoidToPool`, `resolveIncludeIds`, `prefsPromptSnippet`), a leitura (`loadPreferences`) e o chat de IA (`chatPreferences`). Endpoints `GET/PUT /api/preferences` e `POST /api/preferences/chat`. `generateMenu`/`suggestMealOption` ganham `guidance?`. Página `/preferences` com chat + formulário.

**Tech Stack:** Next.js 16 · TypeScript · Tailwind v4 · Supabase · OpenAI `gpt-4o-mini` · Vitest · Playwright.

## Global Constraints

- **Next 16:** `params`/`cookies()` async; middleware é `src/proxy.ts`. Ver `docs/superpowers/NEXT16-DECISIONS.md` e os guias em `node_modules/next/dist/docs/`.
- **IA server-side apenas; `OPENAI_API_KEY` segredo** (env, nunca `NEXT_PUBLIC`, nunca commitada; já em `.env.local` + Vercel — **não mexer**).
- **A IA nunca é fonte de verdade:** o chat só propõe; o registro salvo (via `PUT`) é a verdade; `avoid` é aplicado por **match de nome determinístico** no servidor.
- **RLS por usuário**; rotas usam `createServerSupabase` + `auth.getUser()`.
- **Supabase project id:** `pxzpxtzueeketotrlslj`. Migração aplicada via MCP `apply_migration` **e** salva em `supabase/migrations/`.
- Preferências são **texto livre** (tags), não food_ids. Match por nome normalizado (sem acento, minúsculo, substring).

---

## Estrutura de arquivos

```
supabase/migrations/0008_user_preferences.sql   # nova tabela + RLS (Task 1)
src/lib/ai/preferences.ts                        # helpers puros + loadPreferences + chatPreferences (Tasks 2,3)
src/lib/ai/menu.ts                               # generateMenu/suggestMealOption ganham guidance? (Task 3)
src/app/api/preferences/route.ts                 # GET + PUT (Task 4)
src/app/api/preferences/chat/route.ts            # POST (Task 4)
src/app/api/day-types/[id]/generate/route.ts     # aplica prefs (Task 5)
src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts  # aplica prefs (Task 5)
src/app/(app)/preferences/page.tsx               # página (Task 6)
src/components/PreferencesEditor.tsx             # chat + formulário (Task 6)
src/app/(app)/layout.tsx                         # link no nav (Task 6)
tests/unit/preferences.test.ts                   # helpers puros (Task 2)
tests/e2e/flow.spec.ts                           # persistência do formulário (Task 7)
```

---

## Task 1: Migração `user_preferences`

**Files:**
- Create: `supabase/migrations/0008_user_preferences.sql`

**Interfaces:**
- Produces: tabela `public.user_preferences` (PK `user_id`) com `likes/dislikes/avoid/always_include text[]`, `notes text`, `updated_at timestamptz`, RLS `user_id = auth.uid()` nas 4 operações.

- [ ] **Step 1: Escrever o SQL**

Crie `supabase/migrations/0008_user_preferences.sql`:
```sql
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  likes text[] not null default '{}',
  dislikes text[] not null default '{}',
  avoid text[] not null default '{}',
  always_include text[] not null default '{}',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "prefs_select_own" on public.user_preferences
  for select using (user_id = auth.uid());
create policy "prefs_insert_own" on public.user_preferences
  for insert with check (user_id = auth.uid());
create policy "prefs_update_own" on public.user_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "prefs_delete_own" on public.user_preferences
  for delete using (user_id = auth.uid());
```

- [ ] **Step 2: Aplicar via Supabase MCP**

Aplique com `apply_migration` (name: `user_preferences`, project `pxzpxtzueeketotrlslj`) usando o SQL acima.

- [ ] **Step 3: Verificar**

Via MCP `list_tables` (ou `execute_sql`: `select * from public.user_preferences limit 1`) confirme que a tabela existe e RLS está ligada. `get_advisors(type: security)` não deve acusar tabela sem RLS.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/0008_user_preferences.sql
git commit -m "feat: user_preferences table + RLS"
```

---

## Task 2: Helpers puros + leitura — `src/lib/ai/preferences.ts`

**Files:**
- Create: `src/lib/ai/preferences.ts`, `tests/unit/preferences.test.ts`

**Interfaces:**
- Produces:
  - `type Preferences = { likes: string[]; dislikes: string[]; avoid: string[]; always_include: string[]; notes: string }`
  - `const EMPTY_PREFS: Preferences`
  - `normalizeName(s: string): string` (puro)
  - `applyAvoidToPool<T extends { name: string }>(pool: T[], avoid: string[]): T[]` (puro)
  - `resolveIncludeIds(pool: { id: string; name: string }[], names: string[]): string[]` (puro)
  - `prefsPromptSnippet(p: Preferences): string` (puro)
  - `loadPreferences(supabase): Promise<Preferences>` (lê `user_preferences`; nunca lança)
  - `sanitizePrefs(input: unknown): Preferences` (puro; normaliza p/ o PUT — arrays de string, trim, dedup, limites)

- [ ] **Step 1: Testes que falham**

Crie `tests/unit/preferences.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  normalizeName, applyAvoidToPool, resolveIncludeIds, prefsPromptSnippet,
  sanitizePrefs, EMPTY_PREFS,
} from "@/lib/ai/preferences";

describe("normalizeName", () => {
  it("remove acento e caixa", () => {
    expect(normalizeName("  Peixe, Tilápia ")).toBe("peixe, tilapia");
  });
});

const pool = [
  { id: "a", name: "Peixe, tilápia, crua" },
  { id: "b", name: "Frango, peito, grelhado" },
  { id: "c", name: "Leite, de vaca, desnatado" },
];

describe("applyAvoidToPool", () => {
  it("remove por substring normalizado; ignora termos vazios", () => {
    const r = applyAvoidToPool(pool, ["peixe", "  ", "leite"]);
    expect(r.map((f) => f.id)).toEqual(["b"]);
  });
  it("não remove nada quando avoid vazio", () => {
    expect(applyAvoidToPool(pool, []).length).toBe(3);
  });
});

describe("resolveIncludeIds", () => {
  it("resolve por nome; ignora não-encontrados", () => {
    expect(resolveIncludeIds(pool, ["frango", "inexistente"])).toEqual(["b"]);
  });
});

describe("prefsPromptSnippet", () => {
  it("omite seções vazias e cita o que existe", () => {
    const s = prefsPromptSnippet({ ...EMPTY_PREFS, likes: ["ovo"], avoid: ["peixe"] });
    expect(s).toMatch(/ovo/);
    expect(s).toMatch(/peixe/);
    expect(prefsPromptSnippet(EMPTY_PREFS)).toBe("");
  });
});

describe("sanitizePrefs", () => {
  it("coage arrays, faz trim/dedup e aplica limites", () => {
    const r = sanitizePrefs({
      likes: ["Ovo", "ovo", "  Ovo  ", 5, ""],
      dislikes: "não-array",
      avoid: ["Peixe"],
      always_include: [],
      notes: 123,
    });
    expect(r.likes).toEqual(["Ovo"]); // trim + dedup case-insensitive, descarta vazio/não-string
    expect(r.dislikes).toEqual([]);   // não-array vira []
    expect(r.avoid).toEqual(["Peixe"]);
    expect(typeof r.notes).toBe("string");
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx vitest run tests/unit/preferences.test.ts` — FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

Crie `src/lib/ai/preferences.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type Preferences = {
  likes: string[]; dislikes: string[]; avoid: string[];
  always_include: string[]; notes: string;
};

export const EMPTY_PREFS: Preferences = {
  likes: [], dislikes: [], avoid: [], always_include: [], notes: "",
};

const MAX_ITEMS = 50;
const MAX_LEN = 80;
const MAX_NOTES = 2000;

export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const s = raw.trim().slice(0, MAX_LEN);
    if (!s) continue;
    const key = normalizeName(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function sanitizePrefs(input: unknown): Preferences {
  const o = (input ?? {}) as Record<string, unknown>;
  return {
    likes: cleanList(o.likes),
    dislikes: cleanList(o.dislikes),
    avoid: cleanList(o.avoid),
    always_include: cleanList(o.always_include),
    notes: typeof o.notes === "string" ? o.notes.slice(0, MAX_NOTES) : "",
  };
}

export function applyAvoidToPool<T extends { name: string }>(pool: T[], avoid: string[]): T[] {
  const terms = avoid.map(normalizeName).filter((t) => t.length > 0);
  if (terms.length === 0) return pool;
  return pool.filter((f) => {
    const n = normalizeName(f.name);
    return !terms.some((t) => n.includes(t));
  });
}

export function resolveIncludeIds(pool: { id: string; name: string }[], names: string[]): string[] {
  const terms = names.map(normalizeName).filter((t) => t.length > 0);
  const ids = new Set<string>();
  for (const f of pool) {
    const n = normalizeName(f.name);
    if (terms.some((t) => n.includes(t))) ids.add(f.id);
  }
  return [...ids];
}

export function prefsPromptSnippet(p: Preferences): string {
  const parts: string[] = [];
  if (p.likes.length) parts.push(`gosta de: ${p.likes.join(", ")}`);
  if (p.dislikes.length) parts.push(`não curte: ${p.dislikes.join(", ")}`);
  if (p.avoid.length) parts.push(`evita/não pode: ${p.avoid.join(", ")}`);
  if (p.notes.trim()) parts.push(`observações: ${p.notes.trim()}`);
  if (parts.length === 0) return "";
  return `Preferências do usuário — ${parts.join("; ")}. Priorize o que ele gosta; NÃO use o que ele evita.`;
}

export async function loadPreferences(supabase: SupabaseClient): Promise<Preferences> {
  const { data } = await supabase.from("user_preferences").select("*").maybeSingle();
  if (!data) return EMPTY_PREFS;
  return {
    likes: data.likes ?? [], dislikes: data.dislikes ?? [], avoid: data.avoid ?? [],
    always_include: data.always_include ?? [], notes: data.notes ?? "",
  };
}
```
(Se `@supabase/supabase-js` não exportar `SupabaseClient` no shape usado, tipe o parâmetro como `Awaited<ReturnType<typeof createServerSupabase>>` importando o tipo do server, ou `any` com um comentário — mantenha `loadPreferences` fora dos testes unitários.)

- [ ] **Step 4: Rodar (deve passar)**

Run: `npx vitest run tests/unit/preferences.test.ts` — PASS.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — 0 erros.

- [ ] **Step 6: Commit**
```bash
git add src/lib/ai/preferences.ts tests/unit/preferences.test.ts
git commit -m "feat: preferences helpers (avoid filter, include resolve, prompt snippet)"
```

---

## Task 3: Chat de IA (`chatPreferences`) + `guidance?` nos geradores

**Files:**
- Modify: `src/lib/ai/preferences.ts`, `src/lib/ai/menu.ts`

**Interfaces:**
- Consumes: `openaiClient` (`@/lib/ai/openai`), `Preferences`/`sanitizePrefs` (Task 2).
- Produces:
  - `chatPreferences(input: { messages: { role: "user" | "assistant"; content: string }[]; current: Preferences }): Promise<{ reply: string; preferences: Preferences }>` (server-only).
  - `generateMenu` e `suggestMealOption` aceitam campo **opcional** `guidance?: string` (concatenado ao system prompt). Retrocompatível.

- [ ] **Step 1: `chatPreferences` em `preferences.ts`**

Adicione a `src/lib/ai/preferences.ts`:
```ts
import { openaiClient } from "@/lib/ai/openai";

const CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "preferences"],
  properties: {
    reply: { type: "string" },
    preferences: {
      type: "object",
      additionalProperties: false,
      required: ["likes", "dislikes", "avoid", "always_include", "notes"],
      properties: {
        likes: { type: "array", items: { type: "string" } },
        dislikes: { type: "array", items: { type: "string" } },
        avoid: { type: "array", items: { type: "string" } },
        always_include: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
    },
  },
} as const;

export async function chatPreferences(input: {
  messages: { role: "user" | "assistant"; content: string }[];
  current: Preferences;
}): Promise<{ reply: string; preferences: Preferences }> {
  const client = openaiClient();
  const system =
    "Você ajuda a levantar as preferências alimentares do usuário, em português do Brasil. " +
    "Faça no máximo 1–2 perguntas curtas por vez. A cada turno devolva 'reply' (sua fala) E " +
    "'preferences' = o registro ATUALIZADO, acumulando o que já existe em 'atual' com o que o " +
    "usuário disse (não zere o que não foi contradito). Não invente: registre só o que foi dito. " +
    "Alergias e restrições ('não posso', 'sem lactose') vão em 'avoid'. Alimentos que ele quer " +
    "sempre presentes vão em 'always_include'.";
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ atual: input.current }) },
      ...input.messages,
    ],
    response_format: { type: "json_schema", json_schema: { name: "prefs_chat", strict: true, schema: CHAT_SCHEMA } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  const parsed = JSON.parse(content) as { reply: string; preferences: unknown };
  return { reply: parsed.reply, preferences: sanitizePrefs(parsed.preferences) };
}
```

- [ ] **Step 2: `guidance?` em `menu.ts`**

Em `src/lib/ai/menu.ts`:
- `suggestMealOption`: adicione `guidance?: string` ao tipo do `input` e, ao montar `system`, concatene: `const system = BASE + (input.guidance ? " " + input.guidance : "");` (BASE = a string atual).
- `generateMenu`: idem — adicione `guidance?: string` ao `input` e concatene ao `system` da mesma forma.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx vitest run` — 0 erros; unit verde (os testes de `validateItems`/solver não quebram; `guidance` é opcional).

- [ ] **Step 4: Commit**
```bash
git add src/lib/ai/preferences.ts src/lib/ai/menu.ts
git commit -m "feat: chatPreferences (AI) + optional guidance in generators"
```

---

## Task 4: Endpoints de preferências

**Files:**
- Create: `src/app/api/preferences/route.ts`, `src/app/api/preferences/chat/route.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `loadPreferences`/`sanitizePrefs`/`chatPreferences`/`EMPTY_PREFS` (Tasks 2,3).
- Produces:
  - `GET /api/preferences` → `Preferences` (ou `EMPTY_PREFS`). 401 sem auth.
  - `PUT /api/preferences` → upsert `sanitizePrefs(body)`; retorna o salvo. 401 sem auth.
  - `POST /api/preferences/chat` (body `{ messages, current }`) → `{ reply, preferences }`; 502 em falha da IA. 401 sem auth.

- [ ] **Step 1: `GET`/`PUT` em `route.ts`**

Crie `src/app/api/preferences/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadPreferences, sanitizePrefs } from "@/lib/ai/preferences";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await loadPreferences(supabase));
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefs = sanitizePrefs(await req.json());
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: `POST` em `chat/route.ts`**

Crie `src/app/api/preferences/chat/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { chatPreferences, sanitizePrefs, EMPTY_PREFS } from "@/lib/ai/preferences";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: unknown): m is { role: "user" | "assistant"; content: string } =>
      !!m && typeof (m as { content?: unknown }).content === "string" &&
      ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant"))
    .slice(-20);
  const current = body.current ? sanitizePrefs(body.current) : EMPTY_PREFS;
  try {
    const out = await chatPreferences({ messages, current });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no chat de preferências" },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` — 0 erros.

- [ ] **Step 4: Commit**
```bash
git add "src/app/api/preferences/route.ts" "src/app/api/preferences/chat/route.ts"
git commit -m "feat: preferences endpoints (GET/PUT + AI chat)"
```

---

## Task 5: Fiar preferências nos geradores

**Files:**
- Modify: `src/app/api/day-types/[id]/generate/route.ts`, `src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts`

**Interfaces:**
- Consumes: `loadPreferences`/`applyAvoidToPool`/`resolveIncludeIds`/`prefsPromptSnippet` (Task 2), `guidance?` (Task 3).

- [ ] **Step 1: `generate` (C1)**

Em `src/app/api/day-types/[id]/generate/route.ts`, após montar `pool` (antes de `mealSubTargets`/`generateMenu`):
```ts
import { loadPreferences, applyAvoidToPool, prefsPromptSnippet } from "@/lib/ai/preferences";
// ...
  const prefs = await loadPreferences(supabase);
  const filteredPool = applyAvoidToPool(pool, prefs.avoid);
  if (filteredPool.length === 0) {
    return NextResponse.json(
      { error: "Pool vazio após preferências — afrouxe os itens evitados ou favorite mais alimentos." },
      { status: 400 },
    );
  }
```
- Use `filteredPool` no lugar de `pool` daqui pra frente (no `poolMap`/`generateMenu` — ajuste as referências).
- Passe `guidance: prefsPromptSnippet(prefs)` no objeto de input do `generateMenu`.

- [ ] **Step 2: `suggest-option` (C2)**

Em `src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts`, após montar `pool`:
```ts
import { loadPreferences, applyAvoidToPool, resolveIncludeIds, prefsPromptSnippet } from "@/lib/ai/preferences";
// ...
  const prefs = await loadPreferences(supabase);
  const prefPool = applyAvoidToPool(pool, prefs.avoid);
  if (prefPool.length === 0) {
    return NextResponse.json(
      { error: "Pool vazio após preferências — afrouxe os itens evitados ou favorite mais alimentos." },
      { status: 400 },
    );
  }
  const includeWithPrefs = [...new Set([...include, ...resolveIncludeIds(prefPool, prefs.always_include)])];
```
- Use `prefPool` no lugar de `pool`; passe `include: includeWithPrefs` e `guidance: prefsPromptSnippet(prefs)` ao `suggestMealOption`.
- **`exclude` do pedido vence:** o `validateItems` já descarta os `exclude` mesmo se um include tentar forçá-los — mantenha `exclude` como está.
- Atenção: o `poolMap` usado depois para `withFood`/`scaleOptionToTarget` deve refletir o `prefPool` (itens não removidos). Ajuste para mapear a partir do pool filtrado.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx vitest run` — 0 erros; unit verde.

- [ ] **Step 4: Commit**
```bash
git add "src/app/api/day-types/[id]/generate/route.ts" "src/app/api/day-types/[id]/slots/[slot]/suggest-option/route.ts"
git commit -m "feat: apply user preferences (avoid/include/guidance) in generators"
```

---

## Task 6: Página `/preferences` (chat + formulário) + nav

**Files:**
- Create: `src/app/(app)/preferences/page.tsx`, `src/components/PreferencesEditor.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/preferences`, `POST /api/preferences/chat`.
- Produces: página com `data-testid="prefs-chat"`, `data-testid="prefs-form"` (chips de `likes`/`dislikes`/`avoid`/`always_include` + `textarea` de notes), `data-testid="prefs-save"`.

**Skill:** invoque `/frontend-design` para o chat e os editores de chips ficarem claros no mobile.

- [ ] **Step 1: Componente + página**

- `src/app/(app)/preferences/page.tsx`: server component que renderiza `<PreferencesEditor />` (client). Pode carregar as prefs iniciais via fetch no client (montagem) para simplicidade.
- `src/components/PreferencesEditor.tsx` (client, `"use client"`):
  - Estado: `prefs: Preferences` (carrega de `GET /api/preferences` no mount) + `messages` do chat.
  - **Chat** (`prefs-chat`): lista de mensagens + input + enviar. Cada envio → `POST /api/preferences/chat` com `{ messages, current: prefs }`; a resposta adiciona a fala da IA a `messages` e **mescla** `preferences` no estado do formulário. Enquanto carrega, "Pensando..."; erro → mensagem amigável.
  - **Formulário** (`prefs-form`): quatro editores de chips (adicionar por Enter, remover no X) para `likes`/`dislikes`/`avoid`/`always_include` + `textarea` `notes`. Botão **"Salvar preferências"** (`prefs-save`) → `PUT /api/preferences` com o estado; feedback "Preferências salvas."
  - O formulário é a verdade; o chat só o preenche. Nada é salvo até o usuário clicar em salvar.

- [ ] **Step 2: Link no nav**

Em `src/app/(app)/layout.tsx`, adicione entre "Alimentos" e "Configurações":
```tsx
            <Link href="/preferences" className="text-foreground hover:text-accent">
              Preferências
            </Link>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx vitest run` — 0 erros; unit verde.

- [ ] **Step 4: Commit**
```bash
git add "src/app/(app)/preferences/page.tsx" src/components/PreferencesEditor.tsx "src/app/(app)/layout.tsx"
git commit -m "feat: preferences page (chat + editable form) + nav link"
```

---

## Task 7: E2E (persistência do formulário) + suíte completa

**Files:**
- Modify: `tests/e2e/flow.spec.ts`

**Interfaces:**
- Consumes: a página `/preferences` (Task 6) + `GET /api/preferences`.
- Produces: E2E verde cobrindo salvar o formulário e reler persistido (sem IA).

- [ ] **Step 1: Bloco no E2E**

No `tests/e2e/flow.spec.ts`, adicione um bloco (após o bloco 7 atual): navegue para `/preferences`,
adicione um chip em `avoid` (ex.: "Peixe") e um em `likes` (ex.: "Ovo") pelo `prefs-form`, clique em
`prefs-save`, aguarde "Preferências salvas.", e confirme via API:
```ts
await page.goto("/preferences");
// ... interações do prefs-form (confira os refs/testids reais em PreferencesEditor.tsx) ...
await page.getByTestId("prefs-save").click();
await expect(page.getByText("Preferências salvas.")).toBeVisible();
const prefsRes = await page.request.get("/api/preferences");
const saved = await prefsRes.json();
expect(saved.avoid).toContain("Peixe");
expect(saved.likes).toContain("Ovo");
```
> O chat e o efeito no pool (avoid removendo alimento do gerador) ficam no **smoke manual com IA**.

- [ ] **Step 2: E2E**

Run: `npx playwright test` — 1 passed.

- [ ] **Step 3: Suíte completa**

Run: `npx vitest run && npx playwright test` — unit (macros, bmr, weekly, solver, menu, taco, units-data, basics, **preferences**) e E2E verdes.

- [ ] **Step 4: Atualizar o ledger + commit**

Atualize `.superpowers/sdd/progress.md` marcando a E1 concluída (com follow-ups, se houver).
```bash
git add tests/e2e/flow.spec.ts .superpowers/sdd/progress.md
git commit -m "test: e2e preferences form persistence; ledger E1"
```

---

## Self-Review

**1. Cobertura do spec:**
- Tabela `user_preferences` + RLS → Task 1. ✔
- Helpers (`normalizeName`/`applyAvoidToPool`/`resolveIncludeIds`/`prefsPromptSnippet`/`sanitizePrefs`/`loadPreferences`) → Task 2 (puros testados). ✔
- Chat IA (`chatPreferences`, acumula sobre `current`, structured output) → Task 3. ✔
- `guidance?` retrocompatível nos geradores → Task 3. ✔
- Endpoints GET/PUT/chat (401/502, sanitiza, não persiste no chat) → Task 4. ✔
- Fiar nos geradores: `avoid` filtra pool (400 se esvaziar), `always_include` mescla no include (C2), `guidance` no prompt, `exclude` vence → Task 5. ✔
- UX `/preferences` (chat + formulário editável, form é a verdade) + nav → Task 6. ✔
- Testes: unit dos helpers; E2E persistência do formulário (sem IA); chat + efeito no pool no smoke manual → Tasks 2,7. ✔

**2. Placeholders:** migração, helpers, chat, endpoints e wiring com código completo. UI (Task 6) com
requisitos concretos + `data-testid` + `/frontend-design`.

**3. Consistência de tipos:** `Preferences`/`sanitizePrefs` (Task 2) usados nos endpoints (Task 4) e no
chat (Task 3); `applyAvoidToPool`/`resolveIncludeIds`/`prefsPromptSnippet`/`loadPreferences` (Task 2)
usados no wiring (Task 5); `guidance?` (Task 3) consumido pelos endpoints geradores (Task 5); a página
(Task 6) consome os endpoints (Task 4). Preferências são texto livre; casamento por nome normalizado.

**Nota:** sem env/segredo novo (reusa `OPENAI_API_KEY` já configurada). A migração é aditiva (nova
tabela) — não toca em `foods`/`meals`/`profiles`; produção segue intacta até o merge. Comportamento
retrocompatível: sem linha de prefs, `loadPreferences` → `EMPTY_PREFS` e os geradores agem como hoje.
