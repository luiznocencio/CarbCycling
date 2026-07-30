import type { Sex, ActivityLevel, BmrFormula, Profile } from "@/lib/types";

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export function bmrHarris(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const v =
    sex === "male"
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  return Math.round(v);
}

export function bmrKatch(weightKg: number, bodyFatPct: number): number {
  const lbm = weightKg * (1 - bodyFatPct / 100);
  return Math.round(370 + 21.6 * lbm);
}

export function isProfileComplete(
  p: Pick<Profile, "sex" | "age" | "height_cm" | "weight_kg">,
): boolean {
  return p.sex != null && p.age != null && p.height_cm != null && p.weight_kg != null;
}

export function bmr(
  p: Pick<Profile, "sex" | "weight_kg" | "height_cm" | "age" | "body_fat_pct">,
  formula: BmrFormula,
): number {
  const useKatch =
    (formula === "katch" || formula === "auto") && p.body_fat_pct != null;
  if (useKatch) return bmrKatch(p.weight_kg, p.body_fat_pct as number);
  if (formula === "harris") return bmrHarris(p.sex!, p.weight_kg, p.height_cm!, p.age!);
  // 'mifflin', 'auto' sem BF%, ou 'katch' sem BF% (fallback)
  return bmrMifflin(p.sex!, p.weight_kg, p.height_cm!, p.age!);
}

export function tdee(bmrValue: number, activity: ActivityLevel): number {
  return Math.round(bmrValue * ACTIVITY_FACTOR[activity]);
}
