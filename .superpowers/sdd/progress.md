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
- Task 7 (food bank): complete (commit 619f273). GET/POST /api/foods, PUT/DELETE /api/foods/[id] (Next16 async params). FoodBank.tsx (debounced search, TACO/Meu badge, custom food CRUD form, required data-testids). /foods page. build+lint+tests green; no real-login smoke test yet (email confirm pending, per Task 12).

- Task 8 (profile + day types): complete. GET/PUT /api/profile (defaults 70kg/maintenance/moderate), GET/POST /api/day-types (autoSuggest via suggestTargets), PUT/DELETE /api/day-types/[id] (Next16 async params; autoSuggest recalculates + auto_suggested flag, manual edit clears it). DayTypesSettings.tsx (profile form + day type CRUD with client-side "Sugerir metas" preview using suggestTargets, pt-BR labels, required data-testids). /settings page created.
- Task 9 (weekly pattern): complete. GET/PUT /api/weekly-pattern (upsert onConflict user_id,weekday — unique constraint confirmed in DB). WeeklyPatternSettings.tsx (7 weekday selects Dom→Sáb, pre-fills Dom-Ter/Qua-Qui/Sex-Sáb = baixo/médio/alto by carb_level when pattern is empty). build+lint+tests green; no real-login smoke test yet (pending Task 12).

- Task 10 (day editor): complete. GET/POST /api/meals (nested meal_items+food, order by "order"), PUT/DELETE /api/meals/[id] (Next16 async params), POST/PUT/DELETE /api/meal-items (all writes check auth.getUser(), 401 if absent, matching day-types pattern). DayEditor.tsx (Client Component): add meal, add item via debounced food search + grams, inline quantity edit (onBlur commit), remove item/meal; totals derived client-side each render via mealMacros/sumMacros/compareToTarget (nothing persisted), macro bars green(on-target)/red(off-target) with 10% tolerance band vs dayType targets, required data-testids (add-meal, meal-name-input, item-food-search, item-qty-input, item-add, day-total-kcal/protein/carbs/fat). /day/[dayTypeId] page (Server Component, notFound if day_type missing). build+lint+tests green; no real-login smoke test yet (pending Task 12).
- Task 11 (weekly dashboard): complete. `(app)/page.tsx` (Server Component) loads weekly_pattern + day_types in parallel, then per day_type sums all its meals (meal_items+food embed) via mealMacros/sumMacros, maps weekday 0-6 (Dom-Sáb) to day_type via weekly_pattern, computes compareToTarget per day. WeekGrid.tsx renders 7 cards (mobile stack -> up to 7-col grid on xl), carb-level dot+chip (carb-low/medium/high, static class map for Tailwind JIT), kcal bar planned-vs-target colored on-target/off-target, "Fora da meta" badge (data-testid="off-target") when |kcal diff|>100 or any macro diff>15g, card is Link to /day/[dayTypeId] when a type is assigned, dashed placeholder card (no Link) pointing to /settings when a weekday has no type. data-testid day-card-0..6. build+lint+tests green; no real-login smoke test yet (pending Task 12).

Remaining: 12 (e2e), 13 (deploy).
Pending external: user must disable "Confirm email" in Supabase Auth for real login + E2E (Task 12).
