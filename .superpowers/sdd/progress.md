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

- Task 12 (E2E): complete — playwright main-flow test GREEN (signup→settings→foods→day editor→dashboard).
  Found+fixed 1 integration bug: FoodBank stale debounced-search response clobbered the optimistically
  created custom food (added mutationRef guard to discard stale responses). unit 7/7 + e2e green.

- Task 13 (deploy): complete. Live at https://carb-cycling-seven.vercel.app (GitHub->Vercel import,
  NEXT_PUBLIC_* env vars set). Prod smoke: / ->307 /login, /login serves UI, /foods ->307 (auth OK).

Final whole-branch review (opus): verdict = ready for production, no Critical, RLS solid.
Fixed post-review: #1 weekly-pattern replace semantics (can now clear a day); #2 auth guard on
foods PUT/DELETE. Commit 6f4e467. unit 7/7 + e2e green + tsc clean.

Open MINOR follow-ups (non-blocking, from final review):
- #3 server-side validation of numeric macros (foods POST/PUT, day-types); optional DB CHECK >= 0.
- #4 meal-items POST accepts any food_id; meals/weekly-pattern accept non-owned day_type_id
  (integrity only, not exploitable — reads are RLS-scoped).
- #5 editing a day_type name re-suggests targets when it was auto_suggested (client sends inherited
  autoSuggest); only send autoSuggest on explicit "Sugerir metas" click.
- #6 meal-items PUT/DELETE with null id -> no-op returns ok; dead /api/auth public path in proxy;
  E2E creates users without cleanup.

PROJECT COMPLETE (Tasks 1-13). All work on main.

=== Feature A (perfil + metas inteligentes) — branch feature/smarter-targets ===
Plan: docs/superpowers/plans/2026-07-30-perfil-metas-inteligentes.md
- Task 1 (migration + types): complete (controller). Migration profile_bmr applied to prod DB
  (7 new profiles columns, verified); 0002_profile_bmr.sql versioned; types.ts extended
  (Sex/Intensity/BmrFormula, Profile). Known transient: DayTypesSettings.tsx tsc error until Task 7.
- Task 2 (bmr engine): complete (commit 615ddca, review clean, 11 tests). bmr.ts pure.
- Task 3 (weekly distribution engine): complete (commit e2d87d9, review clean, 6 tests). weekly.ts pure.
- Task 4 (profile API): complete (commit 8afee04, review clean). GET/PUT /api/profile with new fields.
- Task 5 (recalculate endpoint + drop suggestTargets): complete (commit 57712e3, review clean). POST /api/targets/recalculate; day-types autoSuggest removed; targets.ts deleted.
- Task 6 (ProfileForm UI): complete (commit a956239, review clean). Live 3xBMR+TDEE preview, all 13 data-testids.
- Task 7 (WeeklyTargetsPanel + settings recomposed): complete (commit 737b1b6, review clean). tsc CLEAN (0 errors); DayTypesSettings removed; 9 data-testids; settings composes ProfileForm+WeeklyTargetsPanel+WeeklyPatternSettings.
- Task 8 (E2E update): complete (commit cdab528). Full new flow GREEN (profile+recalc). Fixed test: new-day-type form is behind "+ Novo tipo de dia" button. unit 21 + e2e green.
FEATURE A COMPLETE (Tasks 1-8) on branch feature/smarter-targets.
Final review (controller self-review; opus subagent hit session limit): no Critical/Important. Ready for prod merge. Minor: recalc endpoint sequential updates (re-run fixes partial state) — by design/low risk single-user.
MERGED to main (ff, 9bf7f88..f125def) + pushed; Vercel redeployed. Prod smoke via browser: /settings shows new ProfileForm; live BMR preview exact (Mifflin 1768, Harris 1844, TDEE 2740). Feature A LIVE.

=== Feature B (alimentos por unidade) — branch feature/food-units ===
Plan: docs/superpowers/plans/2026-07-30-alimentos-por-unidade.md
DECISION: meal_items rename handled via EXPAND-CONTRACT (shared prod DB) — Task 5 migration is additive
(add quantity+unit, keep quantity_g nullable); a final contract migration drops quantity_g AFTER deploy.
- Task 1 (foods unit cols + set_food_unit fn + types): complete (controller). Migration food_units applied
  to prod DB (0003_food_units.sql versioned). Security: revoked EXECUTE from anon (advisor lint cleared);
  authenticated-execute is intentional. Food type +unit_name/unit_grams. macros.test.ts arroz fixture
  patched (unit_name/unit_grams null) to keep tsc green until Task 5. tsc clean, vitest green.
- Task 2 (enrichment): complete (commit 4cf78e3, review clean). 108 foods enriched (units.json + reproducible seed + applied to prod DB; count=108). units-data test 4/4.
- Task 3 (food unit API): complete (commit 603abb9, review clean). PUT /api/foods/[id]/unit (set_food_unit RPC, both-or-neither + grams>0 validation); POST/PUT foods accept unit fields.
- Task 5 (meal units data+engine+api): complete (commits 0004-migration + 7691325, review clean). Expand migration applied (quantity+unit added, quantity_g kept nullable). itemGrams engine; MealItem quantity+unit; meal-items API validates unit needs unit_grams. 29 tests. tsc red only in DayEditor+dashboard (transient → Task 6).
- Task 6 (day editor + dashboard units): complete (commit 50fed64, review clean). tsc CLEAN; item-unit-toggle + item-display; dashboard quantity+unit. Transient resolved.
