# Progress ledger — carb-cycling

Infra (controller, via Supabase MCP):
- Supabase project `pxzpxtzueeketotrlslj` (carb-cycling, sa-east-1) created.
- Schema migration `init_schema_with_rls` applied: 6 tables + RLS, 0 security lints.
- TACO seeded into `foods` (user_id null): 597 rows confirmed.

Tasks:
- Task 1: complete (commit eed88b4) — scaffold, supabase clients, types, tokens, Next16 notes.
- Task 5 (macro engine): complete (commit f4f453b, review clean, 3 tests).
- Task 6 (targets/TDEE engine): complete (commit da809c6, review clean, 3 tests).
- Task 3 (TACO seed): DB done via MCP (597 rows); repo artifacts (normalize + script + test) added.

Stack note: Next.js 16 — middleware.ts is now src/proxy.ts (fn `proxy`); see docs/superpowers/NEXT16-DECISIONS.md.

- Task 4 (auth): complete (commits 48daef9, ede8244, review clean). proxy.ts recognized; redirect 307→/login verified; build OK. Added SignOutButton (needed).

Remaining: Task 7 (food bank), 8 (profile+day types), 9 (weekly pattern), 10 (day editor), 11 (dashboard), 12 (e2e), 13 (deploy).
Pending external: user must disable "Confirm email" in Supabase Auth for real login + E2E (Task 12).
