import type { Goal, Intensity, CarbLevel } from "@/lib/types";

const PROTEIN_G_PER_KG = 2.0;
const FAT_MIN_G_PER_KG = 0.5;
const CARB_G_PER_KG: Record<CarbLevel, number> = { low: 1.0, medium: 2.5, high: 4.0 };

const GOAL_ADJ: Record<Goal, Record<Intensity, number>> = {
  fat_loss: { light: -0.1, moderate: -0.2, aggressive: -0.25 },
  maintenance: { light: 0, moderate: 0, aggressive: 0 },
  muscle_gain: { light: 0.07, moderate: 0.12, aggressive: 0.2 },
};

const AMPLITUDE: Record<Intensity, Record<CarbLevel, number>> = {
  light: { low: 0.92, medium: 1.0, high: 1.08 },
  moderate: { low: 0.85, medium: 1.0, high: 1.15 },
  aggressive: { low: 0.78, medium: 1.0, high: 1.22 },
};

export function weeklyKcalByLevel(
  avgDaily: number,
  r: Record<CarbLevel, number>,
  counts: Record<CarbLevel, number>,
): Record<CarbLevel, number> {
  const total = counts.low + counts.medium + counts.high;
  const rbar =
    total > 0
      ? (counts.low * r.low + counts.medium * r.medium + counts.high * r.high) / total
      : (r.low + r.medium + r.high) / 3;
  return {
    low: (avgDaily * r.low) / rbar,
    medium: (avgDaily * r.medium) / rbar,
    high: (avgDaily * r.high) / rbar,
  };
}

export function levelTargets(
  kcalLevel: number,
  weightKg: number,
  level: CarbLevel,
  opts: { guardrails: boolean; bmr: number },
): { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number; warnings: string[] } {
  const warnings: string[] = [];
  let kcal = kcalLevel;
  if (opts.guardrails && kcal < opts.bmr) {
    warnings.push(
      `Dia ${labelPt(level)} (${Math.round(kcalLevel)} kcal) travado no basal (${opts.bmr} kcal): déficit real menor que o pedido.`,
    );
    kcal = opts.bmr;
  }
  const protein = Math.round(PROTEIN_G_PER_KG * weightKg);
  const carbs = Math.round(CARB_G_PER_KG[level] * weightKg);
  const fatMin = Math.round(FAT_MIN_G_PER_KG * weightKg);
  let fat = Math.round((kcal - protein * 4 - carbs * 4) / 9);
  if (opts.guardrails && fat < fatMin) {
    warnings.push(
      `Dia ${labelPt(level)}: gordura ajustada para o mínimo de ${fatMin} g (0,5 g/kg).`,
    );
    fat = fatMin;
  }
  if (fat < 0) fat = 0;
  return {
    target_kcal: protein * 4 + carbs * 4 + fat * 9,
    target_protein_g: protein,
    target_carbs_g: carbs,
    target_fat_g: fat,
    warnings,
  };
}

function labelPt(level: CarbLevel): string {
  return level === "low" ? "baixo" : level === "medium" ? "médio" : "alto";
}

export function distributeWeeklyTargets(input: {
  tdee: number;
  weightKg: number;
  goal: Goal;
  intensity: Intensity;
  guardrails: boolean;
  bmr: number;
  levelCounts: Record<CarbLevel, number>;
}) {
  const adj = GOAL_ADJ[input.goal][input.intensity];
  const avgDailyTarget = Math.round(input.tdee * (1 + adj));
  const r = AMPLITUDE[input.intensity];
  const kcalByLevel = weeklyKcalByLevel(avgDailyTarget, r, input.levelCounts);

  const levels: CarbLevel[] = ["low", "medium", "high"];
  const perLevel = {} as Record<
    CarbLevel,
    { target_kcal: number; target_protein_g: number; target_carbs_g: number; target_fat_g: number }
  >;
  const warnings: string[] = [];
  for (const lvl of levels) {
    const t = levelTargets(kcalByLevel[lvl], input.weightKg, lvl, {
      guardrails: input.guardrails,
      bmr: input.bmr,
    });
    perLevel[lvl] = {
      target_kcal: t.target_kcal,
      target_protein_g: t.target_protein_g,
      target_carbs_g: t.target_carbs_g,
      target_fat_g: t.target_fat_g,
    };
    warnings.push(...t.warnings);
  }

  const total = input.levelCounts.low + input.levelCounts.medium + input.levelCounts.high;
  const actualWeeklyAvg =
    total > 0
      ? Math.round(
          (input.levelCounts.low * perLevel.low.target_kcal +
            input.levelCounts.medium * perLevel.medium.target_kcal +
            input.levelCounts.high * perLevel.high.target_kcal) /
            total,
        )
      : avgDailyTarget;
  const adjustmentPct = Math.round(((actualWeeklyAvg - input.tdee) / input.tdee) * 1000) / 1000;

  if (input.guardrails && (adj < -0.25 || avgDailyTarget < input.bmr)) {
    warnings.push("Déficit agressivo: média semanal muito abaixo do gasto/basal.");
  }
  if (input.guardrails && adj > 0.2) {
    warnings.push("Superávit alto: acima de +20% do gasto.");
  }

  return {
    perLevel,
    summary: { avgDailyTarget, actualWeeklyAvg, adjustmentPct, warnings },
  };
}
