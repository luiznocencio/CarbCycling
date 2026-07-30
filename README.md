# Ciclo de Carboidratos

App pessoal (single-user) para montar dietas com ciclo de carboidratos, controlando
macros (kcal, proteína, carboidrato, gordura) por tipo de dia (baixo / médio / alto carbo),
com comparação em tempo real entre o cardápio planejado e a meta do dia.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (Postgres + Auth) · Vercel.

## Rodar localmente

1. `npm install`
2. Crie `.env.local` a partir de `.env.example`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<url do projeto Supabase>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
3. `npm run dev` → http://localhost:3000

## Banco de dados (Supabase)

- Schema: aplique a migration `supabase/migrations/0001_init.sql` (6 tabelas + RLS).
- Seed da base TACO (597 alimentos): `data/taco.json`. Recriar do zero:
  ```
  # exige SUPABASE_SERVICE_ROLE_KEY no .env.local (bypassa RLS)
  npm run seed:taco
  ```
- Auth: em Authentication → Providers → Email, mantenha o provider **habilitado** e
  **"Confirm email" desativado** (uso pessoal).

## Testes

- Unit (Vitest): `npm run test`
- E2E (Playwright): `npm run test:e2e`

## Deploy (Vercel)

1. Importe o repositório na Vercel (New Project → Import Git Repository).
2. Framework: Next.js (auto-detectado).
3. Environment Variables: adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (NÃO adicione a service_role — só é usada no seed local).
4. Deploy. Depois, em Supabase → Authentication → URL Configuration, adicione a URL de
   produção da Vercel em Site URL / Redirect URLs.
