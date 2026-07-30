# Perfil + Metas Inteligentes (basal real + orçamento semanal) — Design

## Contexto e objetivo

O app de ciclo de carboidratos já está funcional em produção. Hoje a sugestão de
metas usa um cálculo grosseiro (`peso × fator kcal/kg × multiplicador de objetivo`)
e trata cada tipo de dia isoladamente — sem noção de basal real nem de equilíbrio
calórico da semana. Esta feature (A) torna o cálculo **clinicamente sólido** (BMR real)
e introduz um **orçamento semanal com auto-balanço e travas**, para o ciclo não levar
a um déficit ou superávit exagerado.

Esta é a **primeira de três features** planejadas ("uma de cada vez"). Fora do escopo
deste spec (ficam para specs futuros):
- **B)** Alimentos por unidade (1 ovo, 1 fatia de pão) + enriquecimento de dados.
- **C)** Gerador automático de cardápio + variações de refeição.

## Princípios / restrições

- **Determinístico, sem IA.** Todo o cálculo de A é matemática pura, transparente e
  testável. LLMs ficam reservados para B/C.
- **Funções puras isoladas** em `src/lib/nutrition/` (testáveis sem banco/UI).
- UI em **pt-BR, mobile-first**. Código/commits em inglês.
- Isolamento por usuário via **RLS** (padrão já estabelecido no projeto).
- Next.js 16: `proxy.ts`, `cookies()`/`params` assíncronos (ver `docs/superpowers/NEXT16-DECISIONS.md`).

---

## 1. Perfil expandido

### Campos (tabela `profiles`)
Já existem: `weight_kg`, `goal` (`fat_loss|maintenance|muscle_gain`), `activity_level`
(`sedentary|light|moderate|active`).

Adicionar:
| campo | tipo | descrição |
|---|---|---|
| `sex` | text | `male` \| `female` — para Mifflin/Harris |
| `age` | int | anos |
| `height_cm` | numeric | altura em cm |
| `body_fat_pct` | numeric (nulo) | % de gordura, opcional — habilita Katch-McArdle |
| `bmr_formula` | text | `auto` \| `mifflin` \| `harris` \| `katch` (default `auto`) |
| `intensity` | text | `light` \| `moderate` \| `aggressive` (default `moderate`) |
| `safety_guardrails` | boolean | default `true` — se as travas de segurança se aplicam |

Defaults para linhas existentes: `sex`/`age`/`height_cm`/`body_fat_pct` nulos;
`bmr_formula='auto'`, `intensity='moderate'`, `safety_guardrails=true`. Perfil com
`sex`/`age`/`height_cm` nulos é considerado **incompleto** (não dá para calcular BMR).

---

## 2. Motor de basal (BMR) e TDEE — `src/lib/nutrition/bmr.ts`

Todas as funções são puras. BMR em kcal/dia.

**Mifflin-St Jeor:**
- ♂: `10·kg + 6.25·cm − 5·idade + 5`
- ♀: `10·kg + 6.25·cm − 5·idade − 161`

**Harris-Benedict (revisada, Roza & Shizgal 1984):**
- ♂: `88.362 + 13.397·kg + 4.799·cm − 5.677·idade`
- ♀: `447.593 + 9.247·kg + 3.098·cm − 4.330·idade`

**Katch-McArdle** (exige `body_fat_pct`):
- massa magra `LBM = kg · (1 − body_fat_pct/100)`
- `BMR = 370 + 21.6 · LBM`

**Híbrido (`auto`):** usa Katch se `body_fat_pct` presente; senão Mifflin.

**Fator de atividade → TDEE = BMR × fator:**
`sedentary 1.2 · light 1.375 · moderate 1.55 · active 1.725`

### Interface
```
bmrMifflin(sex, weightKg, heightCm, age): number
bmrHarris(sex, weightKg, heightCm, age): number
bmrKatch(weightKg, bodyFatPct): number
bmr(profile, formula): number        // 'auto' resolve para katch|mifflin
tdee(bmrValue, activityLevel): number
```
`bmr()` arredonda para inteiro. Se `formula='katch'` (ou `auto` com BF%) sem
`body_fat_pct`, cai para Mifflin.

### Exemplo de referência (para teste)
♂, 80 kg, 178 cm, 30 anos, moderado, sem BF%:
- Mifflin BMR = `10·80 + 6.25·178 − 5·30 + 5` = `800 + 1112.5 − 150 + 5` = **1767.5 → 1768**; TDEE = `1768 × 1.55` = **2740**.
- Harris BMR = `88.362 + 13.397·80 + 4.799·178 − 5.677·30` = `88.362 + 1071.76 + 854.222 − 170.31` = **1844.03 → 1844**; TDEE = **2858**.

---

## 3. Orçamento semanal + auto-balanço — `src/lib/nutrition/weekly.ts`

### Passo 1 — meta média diária
Ajuste semanal por `goal × intensity`:
| objetivo | leve | moderado | agressivo |
|---|---|---|---|
| fat_loss | −0.10 | −0.20 | −0.25 |
| maintenance | 0 | 0 | 0 |
| muscle_gain | +0.07 | +0.12 | +0.20 |

`avgDaily = tdee × (1 + adj[goal][intensity])`

### Passo 2 — amplitude do ciclo (multiplicadores `r` por nível de carbo)
| intensidade | low | medium | high |
|---|---|---|---|
| light | 0.92 | 1.0 | 1.08 |
| moderate | 0.85 | 1.0 | 1.15 |
| aggressive | 0.78 | 1.0 | 1.22 |

### Passo 3 — distribuir pela semana real (normalização)
1. Contar dias por nível no `weekly_pattern`: `N_low`, `N_med`, `N_high`
   (cada weekday aponta para um `day_type`, que tem `carb_level`). `N_total = N_low+N_med+N_high`.
2. Média ponderada dos multiplicadores: `Rbar = (N_low·r_low + N_med·r_med + N_high·r_high) / N_total`.
3. Para cada nível: `kcal_level = avgDaily × r_level / Rbar`.

Isso garante que a **média ponderada da semana = avgDaily** (o orçamento), com o ciclo
preservado em proporção. Tipos de dia sem dias atribuídos (peso 0) recebem meta pelo seu
`r` mas não afetam a média.

### Passo 4 — macros de cada nível
- `protein_g = 2.0 · kg` (constante)
- `carbs_g = CARB_G_PER_KG[level] · kg`, com `CARB_G_PER_KG = {low:1.0, medium:2.5, high:4.0}`
- `fat_g = (kcal_level − protein_g·4 − carbs_g·4) / 9`, com piso `FAT_MIN_G_PER_KG = 0.5 · kg`
- `target_kcal` de cada tipo = `protein_g·4 + carbs_g·4 + fat_g·9` (recomputado após clamps, para consistência).

### Exemplo de referência (para teste)
TDEE 2720 (ilustrativo — independente do exemplo da seção 2), perda moderada (−20%)
→ `avgDaily = 2176`; padrão 3 baixo / 2 médio / 2 alto:
- `Rbar = (3·0.85 + 2·1.0 + 2·1.15)/7 = 6.85/7 = 0.97857`
- `kcal_low = 2176·0.85/0.97857 ≈ 1890` · `kcal_med ≈ 2224` · `kcal_high ≈ 2557`
- Média ponderada = `(3·1890 + 2·2224 + 2·2557)/7 = 2176` ✓ (= −20%)
- Macros dia baixo (80 kg): P 160 g, C 80 g, F `(1890−640−320)/9 ≈ 103 g`.

### Interface
```
distributeWeeklyTargets(input: {
  tdee: number;
  weightKg: number;
  goal: Goal;
  intensity: Intensity;               // 'light'|'moderate'|'aggressive'
  guardrails: boolean;
  bmr: number;                        // para a trava de piso
  levelCounts: { low: number; medium: number; high: number };
}): {
  perLevel: Record<CarbLevel, { target_kcal, target_protein_g, target_carbs_g, target_fat_g }>;
  summary: {
    avgDailyTarget: number;           // orçamento pretendido
    actualWeeklyAvg: number;          // média real após clamps
    adjustmentPct: number;            // ajuste vs TDEE (real)
    warnings: string[];               // ver seção 4
  };
}
```
Observação: `perLevel` é por **nível de carbo**; a rota aplica esse resultado a cada
`day_type` conforme seu `carb_level`.

---

## 4. Travas de segurança (`safety_guardrails`)

Quando **ligadas** (padrão):
- 🚫 **Piso no BMR:** nenhum `kcal_level` abaixo do BMR. Se a distribuição jogar abaixo,
  trava no BMR (`kcal_level = max(kcal_level, bmr)`) → a média real fica acima do alvo;
  o `summary` reporta `actualWeeklyAvg`/`adjustmentPct` reais + aviso.
- 🚫 **Gordura mínima 0.5 g/kg:** se a gordura calculada ficar abaixo, trava no piso
  (o `target_kcal` daquele dia sobe um pouco) + aviso.
- ⚠️ **Déficit agressivo:** aviso forte se `adjustmentPct < −0.25` ou `avgDaily < bmr`.
- ⚠️ **Superávit alto:** aviso se `adjustmentPct > +0.20`.

Quando **desligadas:** distribuição usa os valores crus (sem clamp de BMR nem de
gordura), e os avisos acima viram apenas informativos (não bloqueiam nem alteram
valores). Permite estratégias agressivas conscientes.

Mensagens (pt-BR) são strings no `summary.warnings`, ex.:
`"Dia baixo (1650 kcal) travado no basal (1768 kcal): déficit real menor que o pedido."`

---

## 5. UX (tela de Configurações)

Reorganizar `/settings` em torno de dois componentes novos (extraídos do atual
`DayTypesSettings`, que ficou grande):

- **`ProfileForm`**: peso, sexo, idade, altura, % gordura (opcional), objetivo,
  intensidade, nível de atividade, toggle "Respeitar travas de segurança", e o seletor
  de fórmula de basal mostrando **os 3 BMR + o TDEE ao vivo** conforme digita.
  Salva via `PUT /api/profile`.
- **`WeeklyTargetsPanel`**: lista os tipos de dia com suas metas (editáveis),
  botão **"Recalcular metas da semana"**, e o **painel-resumo** (média diária, total
  semanal, % vs TDEE, lista de avisos). Ao editar uma meta manualmente, o resumo
  recalcula na hora (marca `auto_suggested=false` naquele tipo).
- Se o perfil estiver **incompleto** (falta sexo/idade/altura), o botão "Recalcular"
  fica desabilitado com a mensagem "Complete seu perfil para calcular as metas".
- O editor de **padrão semanal** (`WeeklyPatternSettings`) permanece; o resumo deixa
  claro que o balanço depende dele.

O antigo botão "Sugerir metas" por tipo de dia é **substituído** pelo fluxo de recálculo
semanal (holístico).

---

## 6. Impacto técnico

### Schema
Migration nova (aplicada via Supabase MCP + versionada em `supabase/migrations/0002_profile_bmr.sql`):
`ALTER TABLE profiles` adicionando os 7 campos da seção 1, com `CHECK` nos enums
(`sex in ('male','female')`, `bmr_formula in (...)`, `intensity in (...)`).

### Módulos puros (novos)
- `src/lib/nutrition/bmr.ts` — seção 2.
- `src/lib/nutrition/weekly.ts` — seção 3 + 4.
- `src/lib/types.ts` — adicionar `Sex`, `Intensity`, `BmrFormula`; estender `Profile`.

### `targets.ts`
O `suggestTargets(weight, goal, activity, carbLevel)` atual é **substituído** pelo fluxo
`bmr.ts` + `weekly.ts`. Remover/atualizar; os testes que asseriam `2720/160/80/196`
passam a refletir o novo modelo.

### API
- `PUT/GET /api/profile` — aceitam/retornam os campos novos.
- **Novo** `POST /api/targets/recalculate` — lê perfil + `weekly_pattern` + `day_types`
  do usuário, calcula BMR→TDEE→distribuição, atualiza `target_*` de todos os `day_types`
  (marca `auto_suggested=true`), retorna o `summary`. Valida perfil completo (400 se não).
  O client usa a mesma função pura (`weekly.ts`) para o preview ao vivo antes de salvar.

### UI
- Novos `ProfileForm` e `WeeklyTargetsPanel`; `DayTypesSettings` desmembrado.
- `/settings/page.tsx` compõe os três painéis (perfil/metas, padrão semanal).

### Testes
- Unit `bmr.ts`: cada fórmula com os valores de referência da seção 2; híbrido; fallback
  sem BF%.
- Unit `weekly.ts`: média ponderada = alvo (exemplo da seção 3); clamp de BMR e de
  gordura com travas ligadas; valores crus com travas desligadas; avisos corretos.
- Atualizar testes existentes de metas e o passo do E2E que exercitava "Sugerir metas"
  (agora "Recalcular metas da semana", asserindo que as metas dos tipos de dia são
  preenchidas e o resumo aparece).

---

## Casos de borda

- **Perfil incompleto:** recálculo desabilitado + mensagem; nada é gravado.
- **Padrão semanal vazio / parcial:** se `N_total = 0`, o recálculo avisa "defina o
  padrão semanal primeiro" (sem dividir por zero). Dias não atribuídos simplesmente não
  entram na média.
- **Tipo de dia sem dias no padrão:** recebe meta pelo seu `r`, mas peso 0 na média.
- **`maintenance`:** ajuste 0 independente da intensidade; a amplitude do ciclo ainda se
  aplica (varia em torno da manutenção).
- **Katch sem BF%:** cai para Mifflin (sem erro).
- **Dados legados:** `day_types` mantêm as metas antigas até o usuário rodar o recálculo.
