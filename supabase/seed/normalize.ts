export interface TacoRow {
  name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

/** Mapeia uma linha da base TACO para um insert de `foods` (alimento da base, sem dono). */
export function normalizeTacoRow(row: TacoRow) {
  return {
    user_id: null as string | null,
    name: row.name,
    kcal_per_100g: row.kcal_per_100g,
    protein_per_100g: row.protein_per_100g,
    carbs_per_100g: row.carbs_per_100g,
    fat_per_100g: row.fat_per_100g,
    is_custom: false,
  };
}
