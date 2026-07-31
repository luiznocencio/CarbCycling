import { createServerSupabase } from "@/lib/supabase/server";
import { mealMacros, sumMacros, compareToTarget } from "@/lib/nutrition/macros";
import WeekGrid, { type DayCard } from "@/components/WeekGrid";
import type { DayType, Food, WeeklyPatternEntry } from "@/lib/types";

const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

type MealItemRow = { quantity: number; unit: "g" | "unit"; food: Food };
type MealRow = { meal_items: MealItemRow[] };

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const [{ data: pattern }, { data: dayTypes }] = await Promise.all([
    supabase.from("weekly_pattern").select("*"),
    supabase.from("day_types").select("*"),
  ]);

  const patternEntries = (pattern ?? []) as WeeklyPatternEntry[];
  const allDayTypes = (dayTypes ?? []) as DayType[];
  const dtById = new Map<string, DayType>(allDayTypes.map((d) => [d.id, d]));

  // total planejado por day_type (soma de todas as suas refeições)
  const totalsEntries = await Promise.all(
    allDayTypes.map(async (dt) => {
      const { data: meals } = await supabase
        .from("meals")
        .select("meal_items(quantity, unit, food:foods(*))")
        .eq("day_type_id", dt.id);
      const mealTotals = ((meals ?? []) as unknown as MealRow[]).map((m) =>
        mealMacros(
          m.meal_items.map((it) => ({
            quantity: it.quantity,
            unit: it.unit,
            food: it.food,
          })),
        ),
      );
      return [dt.id, sumMacros(mealTotals)] as const;
    }),
  );
  const totalsByDayType = new Map(totalsEntries);

  const cards: DayCard[] = WEEKDAYS.map((label, weekday) => {
    const entry = patternEntries.find((p) => p.weekday === weekday);
    const dt = entry ? dtById.get(entry.day_type_id) : undefined;
    const planned = dt
      ? totalsByDayType.get(dt.id)!
      : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const diff = dt ? compareToTarget(planned, dt) : null;
    return { weekday, label, dayType: dt ?? null, planned, diff };
  });

  return (
    <main>
      <h1 className="mb-3 text-lg font-semibold text-foreground">Semana</h1>
      <WeekGrid cards={cards} />
    </main>
  );
}
