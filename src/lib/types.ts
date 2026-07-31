export type CarbLevel = "low" | "medium" | "high";
export type Goal = "fat_loss" | "maintenance" | "muscle_gain";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";
export type Sex = "male" | "female";
export type Intensity = "light" | "moderate" | "aggressive";
export type BmrFormula = "auto" | "mifflin" | "harris" | "katch";

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
  unit_name: string | null;
  unit_grams: number | null;
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
  slot: number;
  option_label: string;
  selected: boolean;
}

export interface MealItem {
  id: string;
  meal_id: string;
  food_id: string;
  quantity: number;
  unit: "g" | "unit";
}

export interface Profile {
  user_id: string;
  weight_kg: number;
  goal: Goal;
  activity_level: ActivityLevel;
  sex: Sex | null;
  age: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  bmr_formula: BmrFormula;
  intensity: Intensity;
  safety_guardrails: boolean;
}
