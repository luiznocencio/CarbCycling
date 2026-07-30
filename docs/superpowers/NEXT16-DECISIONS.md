# Decisões de stack e deltas do Next 16 (LEIA antes de implementar)

O plano de implementação foi escrito assumindo Next 14/15. O projeto real usa
**Next.js 16.2.12 + React 19.2 + Tailwind v4**. Onde o plano divergir do que está
aqui, **este arquivo vence**. Confirme detalhes em `node_modules/next/dist/docs/`.

## Infra já pronta (NÃO refazer)
- Projeto Supabase criado; schema (6 tabelas + RLS) já aplicado via migration MCP.
- Base TACO já semeada no banco: 597 linhas em `foods` com `user_id = null`,
  `is_custom = false`. `data/taco.json` está versionado no repo para reprodutibilidade.
- `.env.local` já tem `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Clients Supabase já existem: `src/lib/supabase/client.ts` (browser) e
  `src/lib/supabase/server.ts` (server, async `cookies()`).
- Tipos de domínio em `src/lib/types.ts`.

## Deltas obrigatórios do Next 16
1. **`middleware.ts` → `proxy.ts`.** O arquivo de middleware agora se chama
   `src/proxy.ts` e a função exportada é `proxy` (não `middleware`). Runtime é
   `nodejs` (edge não suportado em proxy). O `export const config = { matcher: [...] }`
   continua válido. Ex.:
   ```ts
   import { type NextRequest } from "next/server";
   import { updateSession } from "@/lib/supabase/middleware";
   export async function proxy(request: NextRequest) {
     return updateSession(request);
   }
   export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
   ```
   (O helper interno pode continuar em `src/lib/supabase/middleware.ts` — só o
   arquivo de convenção na raiz do `src/` muda para `proxy.ts`.)
2. **APIs de request são 100% assíncronas.** `cookies()`, `headers()` → `await`.
   Em `page.tsx`/`layout.tsx`/`route.ts`, `params` e `searchParams` são `Promise`:
   `{ params }: { params: Promise<{ id: string }> }` e `const { id } = await params;`.
   O plano já escreve assim — mantenha.
3. **`next lint` foi removido.** Não use `next lint`. Lint é `eslint` direto
   (script `npm run lint` já configurado). `next build` não roda lint.
4. **Turbopack é padrão** em `next dev`/`next build`. Scripts já corretos (sem flags).
5. **Tailwind v4** (config em CSS, sem `tailwind.config.ts`). Tokens em
   `src/app/globals.css` via `@theme inline`. Cores disponíveis como utilitárias:
   `carb-low|carb-medium|carb-high`, `on-target`, `off-target`, `card`, `muted`,
   `border`, `accent` (ex.: `bg-card`, `text-muted`, `border-border`).

## Convenções do projeto
- UI em português (pt-BR). Código/identificadores/commits em inglês.
- Mobile-first sempre.
- Totais de kcal/macros SEMPRE derivados em runtime (nunca gravados) — use os
  motores puros de `src/lib/nutrition/`.
- Toda tabela com `user_id` tem RLS; as APIs usam `createServerSupabase()` e
  confiam no RLS + `auth.getUser()` para escopo por usuário.
