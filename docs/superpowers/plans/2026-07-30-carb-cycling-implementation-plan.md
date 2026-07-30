# Sistema de Dieta com Ciclo de Carboidratos — Plano de Implementação

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Construir um webapp pessoal (single-user) para montar dietas com ciclo de carboidratos, controlando macros por tipo de dia (baixo/médio/alto carbo) com comparação em tempo real entre cardápio planejado e meta.

**Architecture:** Next.js (App Router) como frontend + backend (Route Handlers). Supabase provê Postgres, Auth email/senha e RLS. Toda soma de kcal/macros é **derivada em tempo real** (nunca armazenada). Lógica de cálculo (macros e sugestão de metas) vive em funções puras testáveis, isoladas da UI e do banco. Deploy na Vercel.

**Tech Stack:** Next.js 14+ (App Router, TypeScript), Tailwind CSS, Supabase (`@supabase/supabase-js` + `@supabase/ssr`), Vitest (unit), Playwright (E2E), Vercel.

## Global Constraints

- **Framework:** Next.js App Router (não Pages Router). TypeScript em todo o código.
- **Banco + Auth:** Supabase apenas. Auth email/senha nativo do Supabase — nenhum código de autenticação escrito à mão.
- **Sem terceiros para nutrição:** nenhuma chamada a API externa de dados nutricionais. Única fonte é a base TACO importada como seed local.
- **Totais nunca armazenados:** kcal/proteína/carbo/gordura de `meal` e `day_type` são sempre calculados a partir de `meal_items × foods`.
- **Padrão semanal editável:** o mapa dia-da-semana → tipo de dia mora em `weekly_pattern` (banco), nunca hardcoded.
- **Mobile-first:** todo layout/CSS começa pelo mobile e escala para desktop.
- **Idioma da UI:** português (pt-BR). Código, nomes de variáveis e commits em inglês.
- **Isolamento por usuário:** toda tabela com `user_id` tem RLS ativa; usuário só enxerga suas próprias linhas (exceto alimentos TACO com `user_id = null`, legíveis por todos).
- **Deploy:** Vercel, com variáveis de ambiente do Supabase.

## Padrão inicial de ciclo (seed, editável na UI)

- Domingo (0), Segunda (1), Terça (2): **baixo carbo**
- Quarta (3), Quinta (4): **médio carbo**
- Sexta (5), Sábado (6): **alto carbo**

## Algoritmo de sugestão de metas (definido aqui — sem placeholders)

Entrada: `weightKg` (número), `goal` (`fat_loss | maintenance | muscle_gain`), `activityLevel` (`sedentary | light | moderate | active`), e o "nível de carbo" do tipo de dia (`low | medium | high`).

Constantes (editáveis no código, mas fixas para o v1):

```ts
const PROTEIN_G_PER_KG = 2.0;
const CARB_G_PER_KG = { low: 1.0, medium: 2.5, high: 4.0 } as const;
const ACTIVITY_KCAL_PER_KG = { sedentary: 28, light: 31, moderate: 34, active: 37 } as const;
const GOAL_KCAL_MULTIPLIER = { fat_loss: 0.8, maintenance: 1.0, muscle_gain: 1.1 } as const;
```

Regra (ciclo isocalórico: proteína constante, carbo varia por tipo de dia, gordura preenche o resto para bater a meta calórica):

1. `maintenanceKcal = weightKg * ACTIVITY_KCAL_PER_KG[activityLevel]`
2. `targetKcal = round(maintenanceKcal * GOAL_KCAL_MULTIPLIER[goal])`
3. `proteinG = round(PROTEIN_G_PER_KG * weightKg)`
4. `carbsG = round(CARB_G_PER_KG[carbLevel] * weightKg)`
5. `fatG = max(0, round((targetKcal - proteinG*4 - carbsG*4) / 9))`

Exemplo de referência (usado em teste): `weightKg=80, activity=moderate, goal=maintenance, carbLevel=low` →
`{ target_kcal: 2720, target_protein_g: 160, target_carbs_g: 80, target_fat_g: 196 }`.

## Backlog futuro (fora deste plano)

- Log do consumido vs. planejado; app nativo; múltiplos perfis; compartilhamento.
- (Nota sobre skill) Expor o banco de alimentos/macros como servidor MCP para o Claude seria um projeto separado — aí sim `/mcp-builder`. Não faz parte deste webapp.

---

## Estrutura de arquivos

Raiz do projeto: **`E:\CODE\carb-cycling\`** (criada na Task 1).

```
carb-cycling/
├─ package.json, tsconfig.json, next.config.mjs, tailwind.config.ts, postcss.config.mjs
├─ .env.local                          # segredos Supabase (nunca commitado)
├─ .env.example                        # template dos nomes de env
├─ vitest.config.ts
├─ playwright.config.ts
├─ supabase/
│  ├─ migrations/0001_init.sql         # schema + RLS (Task 2)
│  └─ seed/taco.ts                     # importador da base TACO (Task 3)
├─ data/taco.json                      # base TACO bruta (Task 3)
├─ src/
│  ├─ lib/
│  │  ├─ supabase/client.ts            # browser client
│  │  ├─ supabase/server.ts            # server client (cookies)
│  │  ├─ supabase/middleware.ts        # refresh de sessão
│  │  ├─ nutrition/macros.ts           # cálculo de totais (Task 5, puro)
│  │  ├─ nutrition/targets.ts          # sugestão TDEE/macros (Task 6, puro)
│  │  └─ types.ts                      # tipos de domínio compartilhados
│  ├─ middleware.ts                    # protege rotas (Task 4)
│  ├─ app/
│  │  ├─ layout.tsx, globals.css       # design tokens (Task 1)
│  │  ├─ login/page.tsx                # login/signup (Task 4)
│  │  ├─ (app)/layout.tsx              # layout autenticado + nav (Task 4)
│  │  ├─ (app)/page.tsx                # dashboard semanal (Task 11)
│  │  ├─ (app)/foods/page.tsx          # banco de alimentos (Task 7)
│  │  ├─ (app)/settings/page.tsx       # perfil + metas + padrão semanal (Tasks 8, 9)
│  │  ├─ (app)/day/[dayTypeId]/page.tsx# editor de dia (Task 10)
│  │  └─ api/                          # Route Handlers por recurso
│  │     ├─ foods/route.ts             # GET busca + POST cria (Task 7)
│  │     ├─ foods/[id]/route.ts        # PUT/DELETE custom (Task 7)
│  │     ├─ profile/route.ts           # GET/PUT perfil (Task 8)
│  │     ├─ day-types/route.ts         # GET/POST (Task 8)
│  │     ├─ day-types/[id]/route.ts    # PUT/DELETE (Task 8)
│  │     ├─ weekly-pattern/route.ts    # GET/PUT (Task 9)
│  │     ├─ meals/route.ts             # GET(by dayType)/POST (Task 10)
│  │     ├─ meals/[id]/route.ts        # PUT/DELETE (Task 10)
│  │     └─ meal-items/route.ts        # POST/PUT/DELETE (Task 10)
│  └─ components/                      # componentes de UI reutilizáveis (Tasks 7–11)
└─ tests/
   ├─ unit/                            # Vitest (Tasks 5, 6)
   └─ e2e/                             # Playwright (Task 12)
```

---

## Task 1: Scaffold do projeto (Next.js + TS + Tailwind + Supabase client + design tokens)

**Files:**
- Create: `carb-cycling/` (projeto Next.js completo via CLI)
- Create: `carb-cycling/.env.example`, `carb-cycling/.env.local`
- Create: `carb-cycling/src/lib/supabase/client.ts`, `carb-cycling/src/lib/supabase/server.ts`
- Create: `carb-cycling/src/lib/types.ts`
- Modify: `carb-cycling/src/app/globals.css` (design tokens), `carb-cycling/src/app/layout.tsx`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `createBrowserSupabase(): SupabaseClient` em `src/lib/supabase/client.ts`
  - `createServerSupabase(): Promise<SupabaseClient>` em `src/lib/supabase/server.ts`
  - Tipos em `src/lib/types.ts`: `Food`, `DayType`, `WeeklyPatternEntry`, `Meal`, `MealItem`, `Profile`, `Macros`, `CarbLevel`, `Goal`, `ActivityLevel` (assinaturas exatas abaixo).

**Skill:** ao criar `globals.css`/tokens, invoque **`/frontend-design`** para definir paleta, tipografia e espaçamentos mobile-first coerentes (não deixe os defaults do Tailwind).

- [ ] **Step 1: Criar o projeto Next.js**

Run (na pasta `E:\CODE`):
```bash
npx create-next-app@latest carb-cycling --ts --tailwind --app --src-dir --import-alias "@/*" --eslint --no-turbopack
```
Aceite os defaults restantes. Expected: pasta `carb-cycling/` criada com `src/app/page.tsx`.

- [ ] **Step 2: Instalar dependências de Supabase e teste**

Run (dentro de `carb-cycling/`):
```bash
npm install @supabase/supabase-js @supabase/ssr && npm install -D vitest @vitejs/plugin-react @playwright/test
```
Expected: pacotes adicionados ao `package.json`, exit 0.

- [ ] **Step 3: Criar `.env.example` e `.env.local`**

Crie `carb-cycling/.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
Copie para `.env.local` e preencha com os valores reais do painel Supabase (Project Settings → API). `.env.local` já está no `.gitignore` do create-next-app.

- [ ] **Step 4: Criar tipos de domínio**

Crie `carb-cycling/src/lib/types.ts`:
```ts
export type CarbLevel = "low" | "medium" | "high";
export type Goal = "fat_loss" | "maintenance" | "muscle_gain";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";

export interface Macros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface Food {
  id: string;
  user_id: string | null;
  name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  is_custom: boolean;
}

export interface DayType {
  id: string;
  user_id: string;
  name: string;
  carb_level: CarbLevel;
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  auto_suggested: boolean;
}

export interface WeeklyPatternEntry {
  id: string;
  user_id: string;
  weekday: number; // 0-6, domingo=0
  day_type_id: string;
}

export interface Meal {
  id: string;
  user_id: string;
  day_type_id: string;
  name: string;
  order: number;
}

export interface MealItem {
  id: string;
  meal_id: string;
  food_id: string;
  quantity_g: number;
}

export interface Profile {
  user_id: string;
  weight_kg: number;
  goal: Goal;
  activity_level: ActivityLevel;
}
```

- [ ] **Step 5: Criar clients Supabase**

Crie `carb-cycling/src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

Crie `carb-cycling/src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // chamado de Server Component: ignorável (middleware faz o refresh)
          }
        },
      },
    },
  );
}
```

- [ ] **Step 6: Aplicar design tokens (frontend-design)**

Invoque **`/frontend-design`** e escreva em `carb-cycling/src/app/globals.css` variáveis CSS de cor/tipografia/espaçamento mobile-first (paleta com destaque por tipo de dia: baixo/médio/alto carbo, e cores de "dentro/fora da meta"). Ajuste `layout.tsx` para `lang="pt-BR"` e aplicar a fonte/base. Mantenha o conteúdo dos tokens coerente entre light/dark.

- [ ] **Step 7: Rodar o dev server e validar boot**

Run:
```bash
npm run dev
```
Expected: server sobe em `http://localhost:3000` sem erro de compilação. Encerre com Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold next.js + supabase clients + domain types"
```

---

## Task 2: Schema do banco + RLS (migration)

**Files:**
- Create: `carb-cycling/supabase/migrations/0001_init.sql`

**Interfaces:**
- Consumes: tipos da Task 1 (mapa 1:1 com as colunas).
- Produces: tabelas `profiles`, `foods`, `day_types`, `weekly_pattern`, `meals`, `meal_items` com RLS. Consumidas por todas as APIs (Tasks 7–11).

> Nota: além das tabelas do spec, criamos `profiles` (peso/objetivo/atividade) — necessária para a sugestão automática (seção "Cálculo automático de metas" do spec) — e adicionamos `carb_level` em `day_types` para alimentar o algoritmo de sugestão.

- [ ] **Step 1: Escrever a migration**

Crie `carb-cycling/supabase/migrations/0001_init.sql`:
```sql
-- PROFILES
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight_kg numeric not null default 70,
  goal text not null default 'maintenance' check (goal in ('fat_loss','maintenance','muscle_gain')),
  activity_level text not null default 'moderate' check (activity_level in ('sedentary','light','moderate','active'))
);

-- FOODS (user_id null = base TACO, legível por todos)
create table foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  kcal_per_100g numeric not null,
  protein_per_100g numeric not null,
  carbs_per_100g numeric not null,
  fat_per_100g numeric not null,
  is_custom boolean not null default false
);
create index foods_name_idx on foods using gin (to_tsvector('portuguese', name));

-- DAY_TYPES
create table day_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  carb_level text not null default 'medium' check (carb_level in ('low','medium','high')),
  target_kcal numeric not null default 0,
  target_protein_g numeric not null default 0,
  target_carbs_g numeric not null default 0,
  target_fat_g numeric not null default 0,
  auto_suggested boolean not null default true
);

-- WEEKLY_PATTERN
create table weekly_pattern (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  day_type_id uuid not null references day_types(id) on delete cascade,
  unique (user_id, weekday)
);

-- MEALS
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_type_id uuid not null references day_types(id) on delete cascade,
  name text not null,
  "order" int not null default 0
);

-- MEAL_ITEMS
create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  food_id uuid not null references foods(id) on delete restrict,
  quantity_g numeric not null check (quantity_g >= 0)
);

-- RLS
alter table profiles enable row level security;
alter table foods enable row level security;
alter table day_types enable row level security;
alter table weekly_pattern enable row level security;
alter table meals enable row level security;
alter table meal_items enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- foods: leitura da base TACO (user_id null) OU dos próprios; escrita só nos próprios
create policy "read taco or own foods" on foods for select using (user_id is null or auth.uid() = user_id);
create policy "insert own foods" on foods for insert with check (auth.uid() = user_id and is_custom = true);
create policy "update own foods" on foods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own foods" on foods for delete using (auth.uid() = user_id);

create policy "own day_types" on day_types for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own weekly_pattern" on weekly_pattern for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own meals" on meals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- meal_items: acesso via ownership da meal-pai
create policy "own meal_items" on meal_items for all
  using (exists (select 1 from meals m where m.id = meal_items.meal_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meals m where m.id = meal_items.meal_id and m.user_id = auth.uid()));
```

- [ ] **Step 2: Aplicar a migration no Supabase**

Abra o painel Supabase → SQL Editor → cole o conteúdo de `0001_init.sql` → Run. Expected: "Success. No rows returned". Confirme em Table Editor que as 6 tabelas existem.

- [ ] **Step 3: Verificar RLS via teste rápido de leitura anônima**

No SQL Editor rode:
```sql
select tablename, rowsecurity from pg_tables where schemaname='public';
```
Expected: `rowsecurity = true` para as 6 tabelas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql && git commit -m "feat: initial schema with rls policies"
```

---

## Task 3: Seed da base TACO

**Files:**
- Create: `carb-cycling/data/taco.json` (base TACO pública, dados brutos)
- Create: `carb-cycling/supabase/seed/taco.ts` (script importador)
- Modify: `carb-cycling/package.json` (script `seed:taco`)

**Interfaces:**
- Consumes: tabela `foods` (Task 2), `createServerSupabase` não serve aqui (precisa service role) — usa client com `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: linhas em `foods` com `user_id = null`, `is_custom = false`.

- [ ] **Step 1: Obter os dados TACO**

Baixe a Tabela TACO (Tabela Brasileira de Composição de Alimentos, dados públicos) e normalize para `carb-cycling/data/taco.json` com o formato:
```json
[
  { "name": "Arroz, integral, cozido", "kcal_per_100g": 124, "protein_per_100g": 2.6, "carbs_per_100g": 25.8, "fat_per_100g": 1.0 }
]
```
Se a fonte vier em CSV/PDF, converta para esse JSON (um objeto por alimento). Mantenha apenas os 4 macros por 100g. Nenhuma chamada a API externa em runtime — este é um arquivo estático versionado.

- [ ] **Step 2: Escrever teste do parser/normalizador**

Extraia a normalização numa função pura para testar. Crie `carb-cycling/tests/unit/taco.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeTacoRow } from "@/../supabase/seed/taco";

describe("normalizeTacoRow", () => {
  it("mapeia uma linha TACO para insert de food TACO", () => {
    const row = { name: "Arroz, integral, cozido", kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0 };
    expect(normalizeTacoRow(row)).toEqual({
      user_id: null,
      name: "Arroz, integral, cozido",
      kcal_per_100g: 124,
      protein_per_100g: 2.6,
      carbs_per_100g: 25.8,
      fat_per_100g: 1.0,
      is_custom: false,
    });
  });
});
```

- [ ] **Step 3: Rodar o teste (deve falhar)**

Adicione `vitest.config.ts` (ver Task 5, Step 2 — se ainda não existir, crie agora) e rode:
```bash
npx vitest run tests/unit/taco.test.ts
```
Expected: FAIL — `normalizeTacoRow is not exported` / módulo não encontrado.

- [ ] **Step 4: Escrever o script de seed**

Crie `carb-cycling/supabase/seed/taco.ts`:
```ts
import { createClient } from "@supabase/supabase-js";
import taco from "../../data/taco.json";

interface TacoRow {
  name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

export function normalizeTacoRow(row: TacoRow) {
  return {
    user_id: null as string | null,
    name: row.name,
    kcal_per_100g: row.kcal_per_100g,
    protein_per_100g: row.protein_per_100g,
    carbs_per_100g: row.carbs_per_100g,
    fat_per_100g: row.fat_per_100g,
    is_custom: false,
  };
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const rows = (taco as TacoRow[]).map(normalizeTacoRow);
  // idempotência simples: apaga TACO anterior antes de reinserir
  await supabase.from("foods").delete().is("user_id", null);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("foods").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  console.log(`Seeded ${rows.length} TACO foods.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Rodar o teste (deve passar)**

```bash
npx vitest run tests/unit/taco.test.ts
```
Expected: PASS.

- [ ] **Step 6: Rodar o seed contra o Supabase**

Adicione ao `package.json` scripts: `"seed:taco": "tsx supabase/seed/taco.ts"` e instale o runner: `npm install -D tsx`. Preencha `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` (Project Settings → API → service_role). Rode:
```bash
npx dotenv -e .env.local -- npm run seed:taco
```
(Se não tiver `dotenv-cli`: `npm install -D dotenv-cli`.) Expected: `Seeded N TACO foods.` Confirme a contagem no Table Editor.

- [ ] **Step 7: Commit**

```bash
git add data/taco.json supabase/seed/taco.ts tests/unit/taco.test.ts package.json && git commit -m "feat: import taco base as seed"
```

---

## Task 4: Autenticação (login/signup + proteção de rotas)

**Files:**
- Create: `carb-cycling/src/lib/supabase/middleware.ts`, `carb-cycling/src/middleware.ts`
- Create: `carb-cycling/src/app/login/page.tsx`
- Create: `carb-cycling/src/app/(app)/layout.tsx`
- Modify: `carb-cycling/src/app/(app)/page.tsx` (mover a home para o grupo autenticado)

**Interfaces:**
- Consumes: `createBrowserSupabase`, `createServerSupabase` (Task 1).
- Produces: sessão autenticada disponível em Server Components via `createServerSupabase().auth.getUser()`; grupo de rotas `(app)/` protegido.

**Skill:** invoque **`/frontend-design`** ao montar `login/page.tsx` e a navegação do `(app)/layout.tsx`.

- [ ] **Step 1: Middleware de refresh de sessão**

Crie `carb-cycling/src/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/_next") || path.startsWith("/api/auth");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}
```

Crie `carb-cycling/src/middleware.ts`:
```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Página de login/signup**

Crie `carb-cycling/src/app/login/page.tsx` (Client Component):
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fn = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) return setError(error.message);
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold mb-4">
        {mode === "login" ? "Entrar" : "Criar conta"}
      </h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded p-2" type="email" placeholder="E-mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full border rounded p-2" type="password" placeholder="Senha"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="w-full bg-black text-white rounded p-2" type="submit">
          {mode === "login" ? "Entrar" : "Cadastrar"}
        </button>
      </form>
      <button className="mt-3 text-sm underline"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Criar uma conta" : "Já tenho conta"}
      </button>
    </main>
  );
}
```

- [ ] **Step 3: Layout autenticado com nav**

Mova `src/app/page.tsx` para `src/app/(app)/page.tsx`. Crie `carb-cycling/src/app/(app)/layout.tsx`:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-dvh">
      <nav className="flex gap-4 p-4 border-b text-sm">
        <Link href="/">Semana</Link>
        <Link href="/foods">Alimentos</Link>
        <Link href="/settings">Configurações</Link>
      </nav>
      <div className="p-4">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Validar auth manualmente**

Rode `npm run dev`. Expected: acessar `/` sem sessão redireciona para `/login`; criar conta e logar leva de volta a `/`. (No Supabase, em Auth → Providers, confirme que "Confirm email" está desativado para uso pessoal, ou confirme o e-mail.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: email/password auth with route protection"
```

---

## Task 5: Motor de cálculo de macros (função pura, TDD)

**Files:**
- Create: `carb-cycling/vitest.config.ts` (se ainda não criado na Task 3)
- Create: `carb-cycling/src/lib/nutrition/macros.ts`
- Create: `carb-cycling/tests/unit/macros.test.ts`

**Interfaces:**
- Consumes: tipos `Food`, `MealItem`, `Macros` (Task 1).
- Produces:
  - `itemMacros(item: {quantity_g:number}, food: Food): Macros`
  - `sumMacros(list: Macros[]): Macros`
  - `mealMacros(items: {quantity_g:number, food: Food}[]): Macros`
  - `compareToTarget(planned: Macros, target: {target_kcal:number;target_protein_g:number;target_carbs_g:number;target_fat_g:number}): { kcal:number; protein_g:number; carbs_g:number; fat_g:number }` (diferença planejado − meta; negativo = abaixo da meta)

- [ ] **Step 1: Escrever os testes que falham**

Crie `carb-cycling/tests/unit/macros.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { itemMacros, sumMacros, mealMacros, compareToTarget } from "@/lib/nutrition/macros";
import type { Food } from "@/lib/types";

const arroz: Food = {
  id: "1", user_id: null, name: "Arroz", is_custom: false,
  kcal_per_100g: 124, protein_per_100g: 2.6, carbs_per_100g: 25.8, fat_per_100g: 1.0,
};

describe("itemMacros", () => {
  it("escala macros pela quantidade em gramas", () => {
    expect(itemMacros({ quantity_g: 200 }, arroz)).toEqual({
      kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0,
    });
  });
});

describe("mealMacros + sumMacros", () => {
  it("soma os itens de uma refeição", () => {
    const result = mealMacros([
      { quantity_g: 100, food: arroz },
      { quantity_g: 100, food: arroz },
    ]);
    expect(result).toEqual({ kcal: 248, protein_g: 5.2, carbs_g: 51.6, fat_g: 2.0 });
  });
});

describe("compareToTarget", () => {
  it("retorna diferença planejado - meta", () => {
    const planned = { kcal: 2000, protein_g: 150, carbs_g: 100, fat_g: 60 };
    const target = { target_kcal: 2200, target_protein_g: 160, target_carbs_g: 90, target_fat_g: 70 };
    expect(compareToTarget(planned, target)).toEqual({
      kcal: -200, protein_g: -10, carbs_g: 10, fat_g: -10,
    });
  });
});
```

- [ ] **Step 2: Config do Vitest**

Crie `carb-cycling/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```
Adicione ao `package.json`: `"test": "vitest run"`.

- [ ] **Step 3: Rodar os testes (devem falhar)**

```bash
npx vitest run tests/unit/macros.test.ts
```
Expected: FAIL — módulo `@/lib/nutrition/macros` não existe.

- [ ] **Step 4: Implementar o motor**

Crie `carb-cycling/src/lib/nutrition/macros.ts`:
```ts
import type { Food, Macros } from "@/lib/types";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function itemMacros(item: { quantity_g: number }, food: Food): Macros {
  const f = item.quantity_g / 100;
  return {
    kcal: round1(food.kcal_per_100g * f),
    protein_g: round1(food.protein_per_100g * f),
    carbs_g: round1(food.carbs_per_100g * f),
    fat_g: round1(food.fat_per_100g * f),
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (acc, m) => ({
      kcal: round1(acc.kcal + m.kcal),
      protein_g: round1(acc.protein_g + m.protein_g),
      carbs_g: round1(acc.carbs_g + m.carbs_g),
      fat_g: round1(acc.fat_g + m.fat_g),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

export function mealMacros(items: { quantity_g: number; food: Food }[]): Macros {
  return sumMacros(items.map((it) => itemMacros(it, it.food)));
}

export function compareToTarget(
  planned: Macros,
  target: { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number },
) {
  return {
    kcal: round1(planned.kcal - target.target_kcal),
    protein_g: round1(planned.protein_g - target.target_protein_g),
    carbs_g: round1(planned.carbs_g - target.target_carbs_g),
    fat_g: round1(planned.fat_g - target.target_fat_g),
  };
}
```

- [ ] **Step 5: Rodar os testes (devem passar)**

```bash
npx vitest run tests/unit/macros.test.ts
```
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/nutrition/macros.ts tests/unit/macros.test.ts package.json && git commit -m "feat: pure macro calculation engine"
```

---

## Task 6: Motor de sugestão de metas / TDEE (função pura, TDD)

**Files:**
- Create: `carb-cycling/src/lib/nutrition/targets.ts`
- Create: `carb-cycling/tests/unit/targets.test.ts`

**Interfaces:**
- Consumes: tipos `Goal`, `ActivityLevel`, `CarbLevel` (Task 1).
- Produces: `suggestTargets(input: { weightKg:number; goal: Goal; activityLevel: ActivityLevel; carbLevel: CarbLevel }): { target_kcal:number; target_protein_g:number; target_carbs_g:number; target_fat_g:number }`

- [ ] **Step 1: Escrever o teste que falha**

Crie `carb-cycling/tests/unit/targets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { suggestTargets } from "@/lib/nutrition/targets";

describe("suggestTargets", () => {
  it("dia baixo carbo, manutenção, 80kg moderado", () => {
    expect(
      suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "low" }),
    ).toEqual({ target_kcal: 2720, target_protein_g: 160, target_carbs_g: 80, target_fat_g: 196 });
  });

  it("dia alto carbo tem mais carbo e menos gordura que o baixo", () => {
    const low = suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "low" });
    const high = suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "high" });
    expect(high.target_carbs_g).toBeGreaterThan(low.target_carbs_g);
    expect(high.target_fat_g).toBeLessThan(low.target_fat_g);
    expect(high.target_protein_g).toBe(low.target_protein_g);
  });

  it("perda de gordura reduz kcal vs manutenção", () => {
    const cut = suggestTargets({ weightKg: 80, goal: "fat_loss", activityLevel: "moderate", carbLevel: "medium" });
    const maint = suggestTargets({ weightKg: 80, goal: "maintenance", activityLevel: "moderate", carbLevel: "medium" });
    expect(cut.target_kcal).toBeLessThan(maint.target_kcal);
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

```bash
npx vitest run tests/unit/targets.test.ts
```
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o motor**

Crie `carb-cycling/src/lib/nutrition/targets.ts`:
```ts
import type { Goal, ActivityLevel, CarbLevel } from "@/lib/types";

const PROTEIN_G_PER_KG = 2.0;
const CARB_G_PER_KG: Record<CarbLevel, number> = { low: 1.0, medium: 2.5, high: 4.0 };
const ACTIVITY_KCAL_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 28, light: 31, moderate: 34, active: 37,
};
const GOAL_KCAL_MULTIPLIER: Record<Goal, number> = {
  fat_loss: 0.8, maintenance: 1.0, muscle_gain: 1.1,
};

export function suggestTargets(input: {
  weightKg: number;
  goal: Goal;
  activityLevel: ActivityLevel;
  carbLevel: CarbLevel;
}) {
  const maintenanceKcal = input.weightKg * ACTIVITY_KCAL_PER_KG[input.activityLevel];
  const target_kcal = Math.round(maintenanceKcal * GOAL_KCAL_MULTIPLIER[input.goal]);
  const target_protein_g = Math.round(PROTEIN_G_PER_KG * input.weightKg);
  const target_carbs_g = Math.round(CARB_G_PER_KG[input.carbLevel] * input.weightKg);
  const target_fat_g = Math.max(
    0,
    Math.round((target_kcal - target_protein_g * 4 - target_carbs_g * 4) / 9),
  );
  return { target_kcal, target_protein_g, target_carbs_g, target_fat_g };
}
```

- [ ] **Step 4: Rodar o teste (deve passar)**

```bash
npx vitest run tests/unit/targets.test.ts
```
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition/targets.ts tests/unit/targets.test.ts && git commit -m "feat: pure tdee target-suggestion engine"
```

---

## Task 7: Banco de alimentos (API + UI)

**Files:**
- Create: `carb-cycling/src/app/api/foods/route.ts` (GET busca, POST cria custom)
- Create: `carb-cycling/src/app/api/foods/[id]/route.ts` (PUT, DELETE)
- Create: `carb-cycling/src/app/(app)/foods/page.tsx`
- Create: `carb-cycling/src/components/FoodBank.tsx`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 1), tabela `foods` + RLS (Task 2), tipo `Food` (Task 1).
- Produces: endpoint `GET /api/foods?q=<termo>` → `Food[]`; `POST /api/foods` (body: name + 4 macros) → `Food`; `PUT/DELETE /api/foods/[id]`. Consumido pelo editor de dia (Task 10) para escolher alimentos.

**Skill:** invoque **`/frontend-design`** ao construir `FoodBank.tsx` (lista, busca, formulário de novo alimento, mobile-first).

- [ ] **Step 1: Route Handler de busca + criação**

Crie `carb-cycling/src/app/api/foods/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const supabase = await createServerSupabase();
  let query = supabase.from("foods").select("*").order("name").limit(50);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabase
    .from("foods")
    .insert({
      user_id: user.id,
      is_custom: true,
      name: body.name,
      kcal_per_100g: body.kcal_per_100g,
      protein_per_100g: body.protein_per_100g,
      carbs_per_100g: body.carbs_per_100g,
      fat_per_100g: body.fat_per_100g,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Route Handler de update/delete**

Crie `carb-cycling/src/app/api/foods/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const body = await req.json();
  const { data, error } = await supabase
    .from("foods")
    .update({
      name: body.name,
      kcal_per_100g: body.kcal_per_100g,
      protein_per_100g: body.protein_per_100g,
      carbs_per_100g: body.carbs_per_100g,
      fat_per_100g: body.fat_per_100g,
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
  const { error } = await supabase.from("foods").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Componente FoodBank (frontend-design)**

Invoque **`/frontend-design`** e crie `carb-cycling/src/components/FoodBank.tsx` (Client Component) com: campo de busca (debounce → `GET /api/foods?q=`), lista de resultados mostrando macros/100g e um badge "TACO" vs "Meu", e um formulário para cadastrar alimento próprio (`POST /api/foods`). Alimentos com `is_custom` permitem editar/excluir (`PUT`/`DELETE`). `data-testid` obrigatórios para E2E: `food-search`, `food-name-input`, `food-kcal-input`, `food-protein-input`, `food-carbs-input`, `food-fat-input`, `food-save`, e cada linha com `data-testid="food-row"`.

- [ ] **Step 4: Página do banco de alimentos**

Crie `carb-cycling/src/app/(app)/foods/page.tsx`:
```tsx
import FoodBank from "@/components/FoodBank";

export default function FoodsPage() {
  return (
    <main>
      <h1 className="text-lg font-semibold mb-3">Banco de alimentos</h1>
      <FoodBank />
    </main>
  );
}
```

- [ ] **Step 5: Validar manualmente**

Rode `npm run dev`, acesse `/foods`. Expected: busca retorna alimentos TACO; cadastrar um alimento próprio o faz aparecer na lista com badge "Meu"; editar e excluir funcionam.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: food bank api and ui (taco search + custom crud)"
```

---

## Task 8: Perfil + tipos de dia + sugestão de metas (API + UI)

**Files:**
- Create: `carb-cycling/src/app/api/profile/route.ts` (GET, PUT)
- Create: `carb-cycling/src/app/api/day-types/route.ts` (GET, POST)
- Create: `carb-cycling/src/app/api/day-types/[id]/route.ts` (PUT, DELETE)
- Create: `carb-cycling/src/components/DayTypesSettings.tsx`
- Create: `carb-cycling/src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 1), tabelas `profiles`/`day_types` (Task 2), `suggestTargets` (Task 6), tipos `Profile`/`DayType` (Task 1).
- Produces: `GET/PUT /api/profile`; `GET/POST /api/day-types`; `PUT/DELETE /api/day-types/[id]`. A UI oferece botão "Sugerir metas" que roda `suggestTargets` no servidor. Consumido pela Task 9 (padrão semanal referencia `day_types`) e Task 10/11 (metas).

**Skill:** invoque **`/frontend-design`** ao construir `DayTypesSettings.tsx` e a página de settings.

- [ ] **Step 1: API de perfil**

Crie `carb-cycling/src/app/api/profile/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  return NextResponse.json(data ?? { user_id: user.id, weight_kg: 70, goal: "maintenance", activity_level: "moderate" });
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, weight_kg: body.weight_kg, goal: body.goal, activity_level: body.activity_level })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: API de tipos de dia (com sugestão)**

Crie `carb-cycling/src/app/api/day-types/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { suggestTargets } from "@/lib/nutrition/targets";

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
  const body = await req.json();
  // se autoSuggest, calcula metas a partir do perfil
  let targets = {
    target_kcal: body.target_kcal ?? 0,
    target_protein_g: body.target_protein_g ?? 0,
    target_carbs_g: body.target_carbs_g ?? 0,
    target_fat_g: body.target_fat_g ?? 0,
  };
  if (body.autoSuggest) {
    const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    targets = suggestTargets({
      weightKg: p?.weight_kg ?? 70,
      goal: p?.goal ?? "maintenance",
      activityLevel: p?.activity_level ?? "moderate",
      carbLevel: body.carb_level,
    });
  }
  const { data, error } = await supabase
    .from("day_types")
    .insert({ user_id: user.id, name: body.name, carb_level: body.carb_level, auto_suggested: !!body.autoSuggest, ...targets })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 3: API PUT/DELETE de tipo de dia**

Crie `carb-cycling/src/app/api/day-types/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { suggestTargets } from "@/lib/nutrition/targets";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  let patch: Record<string, unknown> = {
    name: body.name,
    carb_level: body.carb_level,
    target_kcal: body.target_kcal,
    target_protein_g: body.target_protein_g,
    target_carbs_g: body.target_carbs_g,
    target_fat_g: body.target_fat_g,
    auto_suggested: false,
  };
  if (body.autoSuggest) {
    const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    patch = {
      name: body.name,
      carb_level: body.carb_level,
      auto_suggested: true,
      ...suggestTargets({
        weightKg: p?.weight_kg ?? 70,
        goal: p?.goal ?? "maintenance",
        activityLevel: p?.activity_level ?? "moderate",
        carbLevel: body.carb_level,
      }),
    };
  }
  const { data, error } = await supabase.from("day_types").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("day_types").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: UI de perfil + tipos de dia (frontend-design)**

Invoque **`/frontend-design`** e crie `carb-cycling/src/components/DayTypesSettings.tsx`: (a) formulário de perfil (peso, objetivo, atividade → `PUT /api/profile`); (b) lista de tipos de dia com metas editáveis; (c) botão "Sugerir metas" por tipo de dia (envia `autoSuggest: true`) e edição manual dos 4 macros; (d) criar/excluir tipo de dia. `data-testid`: `profile-weight`, `profile-goal`, `profile-activity`, `profile-save`, `daytype-name`, `daytype-carblevel`, `daytype-suggest`, `daytype-save`, `daytype-row`.

- [ ] **Step 5: Página de settings**

Crie `carb-cycling/src/app/(app)/settings/page.tsx`:
```tsx
import DayTypesSettings from "@/components/DayTypesSettings";
import WeeklyPatternSettings from "@/components/WeeklyPatternSettings";

export default function SettingsPage() {
  return (
    <main className="space-y-8">
      <section>
        <h1 className="text-lg font-semibold mb-3">Perfil e metas por tipo de dia</h1>
        <DayTypesSettings />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-3">Padrão semanal</h2>
        <WeeklyPatternSettings />
      </section>
    </main>
  );
}
```
> `WeeklyPatternSettings` é criado na Task 9. Se executar as tasks fora de ordem, comente o import até a Task 9 estar pronta.

- [ ] **Step 6: Validar manualmente**

Rode `npm run dev`, acesse `/settings`. Expected: salvar perfil (80kg, manutenção, moderado), criar tipo "baixo carbo" com `carb_level=low` e clicar "Sugerir metas" preenche `2720/160/80/196`. Editar manualmente marca `auto_suggested=false`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: profile + day types with auto-suggested targets"
```

---

## Task 9: Padrão semanal (API + UI)

**Files:**
- Create: `carb-cycling/src/app/api/weekly-pattern/route.ts` (GET, PUT)
- Create: `carb-cycling/src/components/WeeklyPatternSettings.tsx`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 1), tabelas `weekly_pattern`/`day_types` (Task 2), tipo `WeeklyPatternEntry` (Task 1), API `GET /api/day-types` (Task 8).
- Produces: `GET /api/weekly-pattern` → `WeeklyPatternEntry[]`; `PUT /api/weekly-pattern` (body: `{ weekday:number; day_type_id:string }[]`) faz upsert por `(user_id, weekday)`. Consumido pelo dashboard (Task 11) para mapear cada dia da semana ao seu tipo.

- [ ] **Step 1: API do padrão semanal**

Crie `carb-cycling/src/app/api/weekly-pattern/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("weekly_pattern").select("*").order("weekday");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const entries: { weekday: number; day_type_id: string }[] = await req.json();
  const rows = entries.map((e) => ({ user_id: user.id, weekday: e.weekday, day_type_id: e.day_type_id }));
  const { data, error } = await supabase
    .from("weekly_pattern")
    .upsert(rows, { onConflict: "user_id,weekday" })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: UI do padrão semanal (frontend-design)**

Invoque **`/frontend-design`** e crie `carb-cycling/src/components/WeeklyPatternSettings.tsx`: carrega `GET /api/day-types` e `GET /api/weekly-pattern`, exibe os 7 dias (Domingo→Sábado) cada um com um `<select>` dos tipos de dia, e um botão "Salvar padrão" (`PUT /api/weekly-pattern`). Pré-preenche com o padrão inicial se vazio (Dom-Ter=baixo, Qua-Qui=médio, Sex-Sáb=alto, casando pelos nomes dos tipos de dia existentes). `data-testid`: `weekday-select-0`..`weekday-select-6`, `weekly-save`.

- [ ] **Step 3: Validar manualmente**

Rode `npm run dev`, `/settings`. Expected: escolher tipos por dia e salvar persiste; recarregar mantém as escolhas.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: editable weekly carb-cycling pattern"
```

---

## Task 10: Editor de dia — refeições e itens com totais em tempo real (API + UI)

**Files:**
- Create: `carb-cycling/src/app/api/meals/route.ts` (GET por dayType, POST)
- Create: `carb-cycling/src/app/api/meals/[id]/route.ts` (PUT, DELETE)
- Create: `carb-cycling/src/app/api/meal-items/route.ts` (POST, PUT, DELETE)
- Create: `carb-cycling/src/components/DayEditor.tsx`
- Create: `carb-cycling/src/app/(app)/day/[dayTypeId]/page.tsx`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 1), tabelas `meals`/`meal_items`/`foods`/`day_types` (Task 2), `mealMacros`/`sumMacros`/`compareToTarget` (Task 5), `GET /api/foods` (Task 7), tipos (Task 1).
- Produces: `GET /api/meals?dayTypeId=` → refeições com itens e food embutido; `POST /api/meals`; `PUT/DELETE /api/meals/[id]`; `POST/PUT/DELETE /api/meal-items`. Total do dia calculado no cliente com `mealMacros`/`sumMacros`. Consumido implicitamente pelo dashboard (Task 11) que refaz a soma por dia.

**Skill:** invoque **`/frontend-design`** ao construir `DayEditor.tsx` (barra de progresso planejado vs meta, mobile-first).

- [ ] **Step 1: API de refeições (GET aninhado + POST)**

Crie `carb-cycling/src/app/api/meals/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const dayTypeId = new URL(req.url).searchParams.get("dayTypeId");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_items(*, food:foods(*))")
    .eq("day_type_id", dayTypeId)
    .order("order");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabase
    .from("meals")
    .insert({ user_id: user.id, day_type_id: body.day_type_id, name: body.name, order: body.order ?? 0 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: API PUT/DELETE de refeição**

Crie `carb-cycling/src/app/api/meals/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const body = await req.json();
  const { data, error } = await supabase
    .from("meals")
    .update({ name: body.name, order: body.order })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: API de itens de refeição**

Crie `carb-cycling/src/app/api/meal-items/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const body = await req.json();
  const { data, error } = await supabase
    .from("meal_items")
    .insert({ meal_id: body.meal_id, food_id: body.food_id, quantity_g: body.quantity_g })
    .select("*, food:foods(*)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const body = await req.json();
  const { data, error } = await supabase
    .from("meal_items")
    .update({ quantity_g: body.quantity_g })
    .eq("id", body.id)
    .select("*, food:foods(*)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("meal_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Componente DayEditor (frontend-design)**

Invoque **`/frontend-design`** e crie `carb-cycling/src/components/DayEditor.tsx` (Client Component). Recebe `dayType: DayType`. Carrega `GET /api/meals?dayTypeId=`. Permite: adicionar refeição (`POST /api/meals`), adicionar alimento a uma refeição via busca (`GET /api/foods?q=`) + quantidade (`POST /api/meal-items`), editar quantidade (`PUT`), remover item/refeição. Após cada mudança, recalcula com `mealMacros` por refeição e `sumMacros` no dia, e mostra `compareToTarget` contra as metas do `dayType` (barra por macro, verde dentro / vermelho fora). Tudo derivado no cliente — **nada de total gravado no banco**. `data-testid`: `add-meal`, `meal-name-input`, `item-food-search`, `item-qty-input`, `item-add`, `day-total-kcal`, `day-total-protein`, `day-total-carbs`, `day-total-fat`.

- [ ] **Step 5: Página do editor de dia**

Crie `carb-cycling/src/app/(app)/day/[dayTypeId]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DayEditor from "@/components/DayEditor";

export default async function DayPage({ params }: { params: Promise<{ dayTypeId: string }> }) {
  const { dayTypeId } = await params;
  const supabase = await createServerSupabase();
  const { data: dayType } = await supabase.from("day_types").select("*").eq("id", dayTypeId).maybeSingle();
  if (!dayType) notFound();
  return (
    <main>
      <h1 className="text-lg font-semibold mb-3">{dayType.name}</h1>
      <DayEditor dayType={dayType} />
    </main>
  );
}
```

- [ ] **Step 6: Validar manualmente**

Rode `npm run dev`, abra `/day/<id de um day_type>`. Expected: adicionar refeição "Almoço", adicionar 200g de Arroz mostra na hora `+248 kcal` no total do dia; a barra vs meta atualiza sem reload; excluir item reverte a soma.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: day editor with real-time macro totals vs target"
```

---

## Task 11: Dashboard semanal (API-less server component + UI)

**Files:**
- Create: `carb-cycling/src/app/(app)/page.tsx` (substitui a home placeholder)
- Create: `carb-cycling/src/components/WeekGrid.tsx`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 1), `weekly_pattern` + `day_types` + `meals`/`meal_items`/`foods` (Task 2), `mealMacros`/`sumMacros`/`compareToTarget` (Task 5). Padrão semanal (Task 9), metas (Task 8), refeições (Task 10).
- Produces: tela raiz `/` — grade dos 7 dias, cada um com seu tipo, kcal/macros planejados vs meta e sinalização visual de dias fora da meta. Link de cada dia para `/day/[dayTypeId]`.

**Skill:** invoque **`/frontend-design`** ao construir `WeekGrid.tsx` (cards por dia, cores por tipo de dia, indicador dentro/fora da meta, mobile-first: stack vertical no celular, grade no desktop).

- [ ] **Step 1: Carregar dados e computar totais no server**

Crie `carb-cycling/src/app/(app)/page.tsx`:
```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { mealMacros, sumMacros, compareToTarget } from "@/lib/nutrition/macros";
import WeekGrid, { type DayCard } from "@/components/WeekGrid";
import type { DayType } from "@/lib/types";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const [{ data: pattern }, { data: dayTypes }] = await Promise.all([
    supabase.from("weekly_pattern").select("*"),
    supabase.from("day_types").select("*"),
  ]);
  const dtById = new Map<string, DayType>((dayTypes ?? []).map((d) => [d.id, d]));

  // total planejado por day_type (soma de todas as suas refeições)
  const totalsByDayType = new Map<string, ReturnType<typeof sumMacros>>();
  for (const dt of dayTypes ?? []) {
    const { data: meals } = await supabase
      .from("meals")
      .select("meal_items(quantity_g, food:foods(*))")
      .eq("day_type_id", dt.id);
    const mealTotals = (meals ?? []).map((m: any) =>
      mealMacros(m.meal_items.map((it: any) => ({ quantity_g: it.quantity_g, food: it.food }))),
    );
    totalsByDayType.set(dt.id, sumMacros(mealTotals));
  }

  const cards: DayCard[] = WEEKDAYS.map((label, weekday) => {
    const entry = (pattern ?? []).find((p) => p.weekday === weekday);
    const dt = entry ? dtById.get(entry.day_type_id) : undefined;
    const planned = dt ? totalsByDayType.get(dt.id)! : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const diff = dt ? compareToTarget(planned, dt) : null;
    return { weekday, label, dayType: dt ?? null, planned, diff };
  });

  return (
    <main>
      <h1 className="text-lg font-semibold mb-3">Semana</h1>
      <WeekGrid cards={cards} />
    </main>
  );
}
```

- [ ] **Step 2: Componente WeekGrid (frontend-design)**

Invoque **`/frontend-design`** e crie `carb-cycling/src/components/WeekGrid.tsx`. Exporte o tipo:
```tsx
import Link from "next/link";
import type { DayType, Macros } from "@/lib/types";

export interface DayCard {
  weekday: number;
  label: string;
  dayType: DayType | null;
  planned: Macros;
  diff: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}
```
Renderize um card por dia com: nome do dia, nome/cor do tipo de dia, kcal planejado vs `target_kcal`, e um selo "fora da meta" quando `|diff.kcal|` exceder uma tolerância (ex.: 100 kcal) ou qualquer macro exceder tolerância. Card é `<Link href={\`/day/${dayType.id}\`}>` quando há tipo definido. `data-testid`: `day-card-0`..`day-card-6`, e `off-target` nos cards fora da meta.

- [ ] **Step 3: Validar manualmente**

Rode `npm run dev`, acesse `/`. Expected: 7 cards; dias com tipo mostram planejado vs meta; um dia com cardápio abaixo da meta exibe o selo "fora da meta"; clicar no card leva ao editor daquele tipo de dia.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: weekly dashboard with planned-vs-target signaling"
```

---

## Task 12: Testes E2E (Playwright / webapp-testing)

**Files:**
- Create: `carb-cycling/playwright.config.ts`
- Create: `carb-cycling/tests/e2e/flow.spec.ts`
- Modify: `carb-cycling/package.json` (script `test:e2e`)

**Interfaces:**
- Consumes: app rodando (`npm run dev`) e todas as telas (Tasks 4–11).
- Produces: um teste E2E do fluxo principal, verde a verde.

**Skill:** invoque **`/webapp-testing`** para conduzir a escrita/execução do Playwright (seletores por `data-testid`, screenshots de falha, waits corretos).

- [ ] **Step 1: Config do Playwright**

Crie `carb-cycling/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```
Adicione ao `package.json`: `"test:e2e": "playwright test"`. Rode `npx playwright install chromium`.

- [ ] **Step 2: Escrever o teste do fluxo principal**

Invoque **`/webapp-testing`** e crie `carb-cycling/tests/e2e/flow.spec.ts` cobrindo: (1) signup/login com um e-mail de teste; (2) em `/settings` salvar perfil e criar um tipo de dia "baixo carbo" com sugestão automática, asserindo que os campos de meta ficam preenchidos; (3) em `/foods` cadastrar um alimento próprio e vê-lo na lista; (4) em `/day/<id>` adicionar refeição + item e asserir que `day-total-kcal` reflete a soma; (5) em `/` asserir que o card do dia mapeado aparece. Use os `data-testid` definidos nas Tasks 7–11. Estrutura mínima:
```ts
import { test, expect } from "@playwright/test";

test("fluxo principal: login → meta → alimento → cardápio → dashboard", async ({ page }) => {
  const email = `test_${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByText("Criar uma conta").click();
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Senha").fill("Senha123!");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page).toHaveURL("/");
  // ... continua com settings, foods, day editor, dashboard usando os data-testid
});
```

- [ ] **Step 3: Rodar o E2E**

```bash
npm run test:e2e
```
Expected: o teste passa (verde). Se falhar, use o trace do Playwright (`npx playwright show-trace`) para depurar — conforme guia da skill `/webapp-testing`.

- [ ] **Step 4: Rodar toda a suíte de testes**

```bash
npm run test && npm run test:e2e
```
Expected: unit (Vitest) e E2E (Playwright) verdes.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: e2e main flow with playwright"
```

---

## Task 13: Deploy na Vercel

**Files:**
- Create: `carb-cycling/README.md` (instruções de setup + deploy)

**Interfaces:**
- Consumes: repositório completo (Tasks 1–12), projeto Supabase configurado.
- Produces: app público com link próprio na Vercel.

- [ ] **Step 1: Escrever README de setup**

Crie `carb-cycling/README.md` documentando: variáveis de ambiente (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e `SUPABASE_SERVICE_ROLE_KEY` só para o seed local), como aplicar a migration `0001_init.sql`, e como rodar `npm run seed:taco`.

- [ ] **Step 2: Push do repositório**

Crie um repositório no GitHub e faça push:
```bash
git remote add origin <url-do-repo> && git push -u origin main
```

- [ ] **Step 3: Importar na Vercel e configurar env**

No painel da Vercel: New Project → importe o repo → em Environment Variables adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (não adicione a service_role — só é usada no seed local). Deploy.

- [ ] **Step 4: Configurar redirect URL no Supabase**

Em Supabase → Authentication → URL Configuration, adicione a URL de produção da Vercel em "Site URL" e "Redirect URLs".

- [ ] **Step 5: Smoke test em produção**

Acesse a URL da Vercel. Expected: login funciona, dashboard/foods/settings/editor carregam, com dados persistidos no Supabase.

- [ ] **Step 6: Commit**

```bash
git add README.md && git commit -m "docs: setup and deploy instructions" && git push
```

---

## Self-Review (feita pelo autor do plano)

**Cobertura do spec:**
- Planejamento semanal por tipo de dia → Tasks 9 (padrão) + 11 (dashboard). ✔
- Banco de alimentos TACO + próprios → Tasks 3 (seed) + 7 (CRUD/busca). ✔
- Metas por tipo de dia com sugestão automática editável → Tasks 6 (motor) + 8 (UI/API). ✔
- Comparação em tempo real cardápio vs meta → Tasks 5 (motor) + 10 (editor) + 11 (dashboard). ✔
- Login email/senha → Task 4. ✔
- Modelo de dados (foods, day_types, weekly_pattern, meals, meal_items) → Task 2 (+ `profiles` e `carb_level`, justificados). ✔
- Totais derivados, nunca armazenados → Tasks 5/10/11 calculam em runtime. ✔
- Padrão semanal editável (não hardcoded) → Task 9. ✔
- Mobile-first + sem API externa → Global Constraints + `/frontend-design` nas tasks de UI + seed TACO local. ✔
- Deploy Vercel → Task 13. ✔

**Consistência de tipos:** `Macros`, `Food`, `DayType`, `suggestTargets`, `mealMacros`/`sumMacros`/`compareToTarget` usados de forma idêntica entre Tasks 5/6/10/11. `carb_level` presente no schema (Task 2), no tipo (Task 1) e consumido por `suggestTargets` (Task 6/8). ✔

**Placeholders:** algoritmo de TDEE totalmente especificado (sem "em aberto"); todos os passos de código trazem o código real. ✔

**Nota sobre skills:** `/frontend-design` nas Tasks 1, 4, 7, 8, 9, 10, 11; `/webapp-testing` na Task 12. `/mcp-builder` **não usada** — fora do escopo deste webapp (registrada no backlog como projeto futuro separado, caso queira expor os dados via MCP).
