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
- Task 7 (E2E unit): complete (commit pending). Full flow + add-by-unit step GREEN (egg 2 units=100g, toggle, item-display, total up). unit 29 + e2e green.
- Final review (opus): ready for merge, no Critical/blocker. Fixed #5 (mutationRef in handleUnitSave).
  #1 (expand-window quantity NULL) handled by immediate deploy + contract backfill.
  Open MINOR follow-ups: #2 meal-items PUT lacks unit_grams guard (unreachable from UI, benign 0g);
  #3 no server-side quantity>0 validation on meal-items (pre-existing lax pattern); #4 set_food_unit
  RPC could set unit_name with NULL grams directly (reads as "no unit", benign).
MERGED to main (ff, 24e9535..74344ea) + pushed; Vercel redeployed. Prod smoke: /foods shows "Editar unidade" + egg "1 unidade = 50 g" (enrichment live). CONTRACT migration applied (quantity_g dropped, quantity NOT NULL; verified). FEATURE B LIVE.

=== Feature C1 (gerador de cardápio por IA) — branch feature/menu-generator ===
Plan: docs/superpowers/plans/2026-07-30-gerador-cardapio.md
NOTE: migrations aditivas/retrocompatíveis (favorites table; meals slot/option_label/selected default true, slot=order backfill). OPENAI_API_KEY in .env.local; MUST add to Vercel at deploy.
- Task 1 (migrations + Meal type): complete (controller). food_favorites (RLS) + meals slot/option_label/selected applied to prod DB; advisor clean (only pre-existing WARNs). Meal type extended. tsc clean.
- Task 2 (solver): complete (commit b920c0e, review clean, 4 tests). mealSubTargets + scaleOptionToKcal pure.
- Task 3 (favorites + basics): complete (commit c72c2de, review clean). favorite API + GET /api/favorites + star toggle; data/basics.json 23 items (all in TACO). basics integrity test. vitest 37.
- Task 4 (AI module): complete (commit 31ef069, review clean). openai v7 dep; openai.ts client; menu.ts generateMenu (gpt-4o-mini json_schema) + validateMenu (pure, tested). 39 tests. key not leaked.
- Task 5 (generate + apply-menu routes): complete (commit 1e22ff1, review clean). generate builds proposal (pool fav∪basics, subTargets, generateMenu, solver, macros; 502/400 guards; not saved); apply-menu replaces meals with slot/options. tsc clean, 39 tests.
- Task 6 (selected aggregation + option tabs): complete (commit 6872f8b, review clean). Dashboard/day totals filter selected; DayEditor groups by slot + option-tab; PUT enforces exclusive selected. Fixed delete-promote gap (commit follows).
- Task 7 (MenuGenerator UI): complete (commit c47b39c, review clean). Dialog N/M -> proposal (option tabs, total vs target) -> apply/regenerate; 7 data-testids; integrated above DayEditor. tsc+vitest green.
- Task 8 (E2E): complete (commit pending). Favorite via API + apply fixed proposal + option switch (165->495) GREEN. unit + e2e green.
FEATURE C1 CODE COMPLETE (Tasks 1-8) on branch feature/menu-generator.
Final review (opus): no Critical; fixed #1 (N/M clamp), #2 (atomic-safe PUT selected order), #3 (apply-menu ownership 404). tsc+unit+e2e green. Open MINOR: #4 .env.production is un-ignored/committed (only public vars; OPENAI_API_KEY NOT there) — pre-existing footgun.
MERGED to main (ff, 41494cc..826465b) + pushed; Vercel redeploying. Key not leaked in diffs. Branch deleted. PENDING: user must add OPENAI_API_KEY to Vercel env (server-side) + redeploy for generator to work. FEATURE C1 code LIVE (AI gen needs key).
PROD SMOKE (real OpenAI): generator OK — 5 slots x 3 options, day total 2002 kcal vs 2000 target (solver nailed kcal), sensible foods (aveia+ovo+banana). KNOWN LIMITATION: protein overshot (206 vs 150) — solver only scales kcal; future NNLS solver or all-macro prompt (C2/refinement). All @example.com test users cleaned.
FEATURE C1 COMPLETE + LIVE (Tasks 1-8). Plan A/B/C1 done; C2 (manual meal substitutions) pending.

=== Feature C2 (substituições de refeição) — branch feature/meal-substitutions ===
Plan: docs/superpowers/plans/2026-07-30-substituicoes-refeicao.md (no new migration)
- Task 1 (kcal+protein solver): complete (commit f964319, review clean). scaleOptionToTarget (2-group linear + kcal fallback); C1 generator now uses it (protein no longer overshoots). 41 tests.
- Task 2 (suggestMealOption + validateItems): complete (commit 3034dbf, review clean). Single-meal AI (gpt-4o-mini json_schema) + pure validateItems (drops out-of-pool/excluded, forces includes). 42 tests. key not leaked.
- Task 3 (suggest-option endpoint): complete (commit 196ee53, review clean). POST /api/day-types/[id]/slots/[slot]/suggest-option (subTarget recompute, pool fav∪basics∪include, suggestMealOption, scaleOptionToTarget, creates option selected=false; 404 ownership; 502 on AI fail). tsc+vitest green. Used it.food.id (scaleOptionToTarget type has no food_id).
C2 STATE: Tasks 1-3 DONE on branch feature/meal-substitutions. REMAINING: Task 4 (DayEditor: "+ Nova opção" via POST /api/meals + "Sugerir com IA" via suggest-option, testids add-option/suggest-option, /frontend-design), Task 5 (E2E: add manual option to a slot -> 3 option-tabs). Then final review + merge (no OpenAI key step needed at deploy — already in Vercel). No new migration in C2.
- Task 4 (day editor new option + AI suggest): complete (commit e3c1152, review clean). "+ Nova opção" (POST /api/meals) + "Sugerir com IA" (suggest-option, include/exclude picker); add-option/suggest-option testids. DayEditor now large (+429). tsc+vitest green.
- Task 5 (E2E manual option): complete (commit pending). Adds 3rd manual option (POST /api/meals) -> 3 option-tabs; also hardened block 6 to wait for the selection PUT (waitForResponse) before reload, now VERIFYING selection persistence (495 after reload). Was a test race (goto aborted fire-and-forget PUT), not an app bug. unit + e2e green.
C2 CODE COMPLETE (Tasks 1-5) on branch feature/meal-substitutions.
Final review (controller self-review; opus subagent hit session limit): no Critical/Important. suggest-option (404 ownership, 502 no-litter, selected=false, sanitized include/exclude, IA via validateItems+solver, RLS-scoped); scaleOptionToTarget robust fallbacks; OpenAI key server-side only. Minor: DayEditor.tsx now large (~1100 lines) — future split candidate. Ready for prod merge (OpenAI key already in Vercel — no extra deploy step).
MERGED to main (ff, 8d172d1..412cb54) + pushed; Vercel redeploying. Key not leaked. Branch deleted. FEATURE C2 LIVE (OpenAI key already in Vercel).

=== Feature E1 (preferências alimentares) — branch feat/e1-preferencias ===
Spec: docs/superpowers/specs/2026-08-01-preferencias-alimentares-design.md
Plan: docs/superpowers/plans/2026-08-01-preferencias-alimentares.md
NOTE: migração aditiva (nova tabela user_preferences, RLS) — não toca foods/meals/profiles; prod intacto até merge. OPENAI_API_KEY já em Vercel (sem passo extra no deploy). Prefs = texto livre; match por nome normalizado. IA nunca é fonte de verdade (chat só propõe; PUT grava).
- Task 1 (migração user_preferences): complete (commit 06f47cf, controller via MCP). Tabela + RLS aplicada ao prod DB (rows=0, policies=4, rls=true); advisor security sem alerta novo (só 2 WARNs pré-existentes: set_food_unit, leaked-password). Arquivo supabase/migrations/0008_user_preferences.sql.
- Task 2 (helpers de preferências): complete (commit 30ddf74). avoid filter (nome normalizado), include resolve, prompt snippet — puros/testados.
- Task 3 (chatPreferences IA): complete (commit 12ddded). chatPreferences (IA) + guidance opcional nos geradores.
- Task 4 (endpoints preferências): complete (commit cee051c). GET/PUT /api/preferences + POST /api/preferences/chat (IA só propõe; PUT grava).
- Task 5 (aplicar preferências nos geradores): complete (commit 7fd4266). avoid/include/guidance aplicados no gerador de cardápio e nas substituições.
- Task 6 (página /preferences): complete (commit 3fed5ca). PreferencesEditor.tsx (form editável = fonte da verdade + chat opcional) + link no nav. Testids: prefs-form, prefs-<campo>-input (campos: likes/dislikes/avoid/always_include, add por Enter/blur), prefs-<campo>-remove, prefs-notes, prefs-save (feedback "Preferências salvas."), prefs-chat/prefs-chat-input/prefs-chat-send.
- Task 7 (E2E preferências): complete (commit pending). Bloco 8 anexado ao MESMO teste (reusa usuário logado): /preferences → adiciona "Peixe" em Evitar e "Ovo" em Gosto pelo form → prefs-save → confere "Preferências salvas." + persistência via GET /api/preferences (avoid contém Peixe, likes contém Ovo). SEM IA (chat fica no smoke manual). Ajuste necessário: o clique em weekly-save (bloco 2, fim de página longa) passou a dar timeout de hit-test no dev-server (sticky header + indicador do Next dev tools) mesmo com o botão comprovadamente desobstruído (elementFromPoint = weekly-save em todos os pontos/frames); force click resolve e a gravação persiste ("Padrão salvo."). Mudança só no E2E: `.click({ force: true })` nesse botão.
- E1 CODE COMPLETE (Tasks 1-7) on branch feat/e1-preferencias. Estado: unit 48 testes (9 arquivos, inclui tests/unit/preferences.test.ts) + e2e 1 passed — tudo verde. Testids do form (referência futura): prefs-form; prefs-likes-input / prefs-dislikes-input / prefs-avoid-input / prefs-always_include-input (add por Enter ou blur); prefs-likes-remove / prefs-dislikes-remove / prefs-avoid-remove / prefs-always_include-remove; prefs-notes; prefs-save (feedback "Preferências salvas."); prefs-chat / prefs-chat-input / prefs-chat-send (IA, não exercitado no E2E).
Final review (controller self-review): sem Crítico/Importante. Verificado: (1) generate/route usa filteredPool+filteredMap em TODO o fluxo (IA e solver) — item evitado não reaparece; (2) suggest-option usa prefPool+prefMap+includeWithPrefs, exclude do pedido vence; (3) endpoints 401/502, PUT sanitiza (sanitizePrefs), chat NÃO persiste, messages cortadas em 20; (4) UI: chat manda current=prefs (backend acumula, sem perda), merge substitui pelo acumulado, save re-sincroniza, erro do chat = msg amigável; (5) retrocompatível (EMPTY_PREFS → comportamento atual). Migração aditiva. Sem env novo. unit 48 + e2e 1 verdes. Chat IA + efeito avoid no pool = smoke manual pós-deploy. PRONTO PARA MERGE.
Minor (não bloqueia): applyAvoidToPool usa substring — termo curto pode superfiltrar (documentado no spec; aceitável single-user). PreferencesEditor.tsx cresce; ok.
MERGED to main (ff, 1e67a29..46a17bf) + pushed; Vercel redeployado. Sem segredo no diff. Branch feat/e1-preferencias deletado (local; nunca foi pushado).
PROD SMOKE (OpenAI real): usuário de teste @example.com → favoritou ovo+frango+arroz+aveia+banana; day_type 2000/150. PUT prefs avoid=["ovo"], likes=["frango"]. generate(4 refs,2 opções): 4 slots, alimentos = frango/arroz/brócolis/leite/pão/feijão/macarrão/banana/carne/atum — ZERO com "ovo" (filtro duro OK apesar de ovo favoritado). Chat: "alérgico a amendoim, amo batata doce, não curto fígado" → acumulou sobre o atual: avoid=[ovo,amendoim], likes=[frango,batata doce], dislikes=[figado] — allergy→avoid exatamente como projetado; e NÃO persistiu (GET seguiu avoid=[ovo]). Página /preferences renderiza (nav+form+chat+chip ovo). Usuários @example.com limpos (0 restantes; gmail real intacto). FEATURE E1 LIVE.

=== Feature E2 (cardápio da semana por IA) — branch feat/e2-cardapio-semana ===
Spec: docs/superpowers/specs/2026-08-02-cardapio-semana-design.md
Plan: docs/superpowers/plans/2026-08-02-cardapio-semana.md
NOTE: sem migração, sem env novo. Refactor DRY primeiro (extrair núcleo de generate→generateProposalForDayType e apply-menu→applyProposalToDayType; rotas viram wrappers finos, contrato inalterado — E2E bloco 6 = rede de segurança). Reusa por tipo de dia distinto; 2 opções; revisar/aplicar. Prefs (E1) de graça.
- Task 1 (extrair generateProposalForDayType): complete (commit 496b9c5). src/lib/ai/generate.ts; generate/route vira wrapper fino (contrato idêntico 401/404/400/502 + {proposal}). Reancorou food_id no item (tipo do solver o omite). tsc+48 verdes.
- Task 2 (extrair applyProposalToDayType): complete (commit 8ec228b). src/lib/nutrition/apply.ts; apply-menu/route wrapper fino. tsc+48+E2E(1) verdes — bloco 6 confirma sem regressão.
- Task 3 (distinctDayTypeIds): complete (commit a48de4a, controller). puro/testado (ordem do 1º weekday; vazio→[]). 2 testes.
- Task 4 (week/generate): complete (commit em a078f99, controller). POST /api/week/generate: lê weekly_pattern, distinctDayTypeIds, gera por tipo de dia (resiliente: entrada com error não derruba as outras; 400 sem padrão; 502 só se todas falharem). default options=2.
- Task 5 (week/apply): complete (commit a078f99, controller). POST /api/week/apply: aplica cada entrada com proposal via applyProposalToDayType; retorna {ok,applied,failed}; 400 se nada válido.
- Task 6 (WeekMenuGenerator): complete (commit 25ea8ca). Botão gerar→revisão por tipo de dia (abas de opção, totais)→aplicar; testids week-generate/week-review/week-day-type/week-slot/week-option-tab/week-item/week-apply/week-regenerate. Integrado na dashboard acima do WeekGrid. NÃO extraiu ProposalReview (replicou visual; MenuGenerator intocado). Usa window.confirm no apply (menor: revisão já é a confirmação). tsc+50 verdes.
- Task 7 (E2E week/apply): complete (commit pending, controller). Bloco 9: monta proposta fixa da semana e POST /api/week/apply (applied=1) → /day mostra 1 slot/2 opções, total 165. TEST FIX: getByRole heading "Semana" virou strict-violation (novo h2 "Cardápio da semana" contém "Semana") → adicionado exact:true no assert do bloco 1 (só teste, app OK). unit 50 + e2e 1 verdes.
E2 CODE COMPLETE (Tasks 1-7) on branch feat/e2-cardapio-semana. Refactor preservou contrato (E2E apply-menu verde). Sem migração/env novo.
Final review (controller self-review): sem Crítico/Importante. (1) Refactor preservou contrato — E2E apply-menu (bloco 6) verde + generate mantém 401/404/400/502 e {proposal}. (2) RLS: week/generate lê weekly_pattern+day_types sob RLS; week/apply valida posse por day_type (404 cross-tenant via applyProposalToDayType). (3) round-trip generate→apply OK (item carrega food_id reancorado; macros/food extras ignorados no insert). (4) resiliência: entrada com error não derruba as outras; 502 só se todas falham; 400 sem padrão semanal. (5) prefs (E1) aplicadas dentro de generateProposalForDayType (uma fonte só, semana herda de graça). Menor intencional: window.confirm no aplicar (aplicar sobrescreve — rede de segurança). unit 50 + e2e 1 verdes. week/generate (IA) = smoke manual pós-deploy. PRONTO PARA MERGE.
MERGED to main (ff, 6d1adda..f0b9a8a) + pushed; Vercel redeployado. Sem segredo no diff. Branch feat/e2-cardapio-semana deletado.
PROD SMOKE (OpenAI real): usuário @example.com, 2 tipos de dia (Alto 2200/160, Baixo 1700/150), padrão semanal 0-2=Alto/3-4=Baixo. POST /api/week/generate(4 refs,2 opções): 2 entradas (tipos distintos), cada uma 4 slots × 2 opções, alimentos variados/sensatos, ~23s (~11s/tipo). Sem avoid → ovo aparece (default correto). POST /api/week/apply (proposta fixa, sem IA) nos 2 tipos: applied=2, failed=[]; DB confirma 2 meals/2 items + selected por tipo. Usuários @example.com limpos (0; gmail real intacto). FEATURE E2 LIVE.

=== Feature D (peso como evolução + ajuste de kcal por tendência) — branch feat/d-peso-evolucao ===
Spec: docs/superpowers/specs/2026-08-02-peso-evolucao-design.md
Plan: docs/superpowers/plans/2026-08-02-peso-evolucao.md
NOTE: sem IA. Migração aditiva (weight_logs + profiles.kcal_adjustment default 0) — prod intacto até merge. Histórico=verdade; profiles.weight_kg = espelho do último log (sem rewire da Feature A). Refactor recalc→recalcTargetsForUser (rota wrapper; E2E bloco 2 = rede de segurança). Ajuste passa por distributeWeeklyTargets (travas herdam).
- Task 1 (migração + tipos): complete (commits a99671b + 9712ed6, controller). weight_logs (RLS, 4 policies, unique user+dia) + profiles.kcal_adjustment aplicados ao prod DB. Profile.kcal_adjustment + WeightLog em types.ts; profile GET default e ProfileForm payload incluem kcal_adjustment. tsc 0 + 50 testes.
