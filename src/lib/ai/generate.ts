import type { SupabaseClient } from "@supabase/supabase-js";
import { mealSubTargets, scaleOptionToTarget } from "@/lib/nutrition/solver";
import { mealMacros, itemGrams } from "@/lib/nutrition/macros";
import { classifyFood, mealTypeFromName, enforceCoherence } from "@/lib/nutrition/coherence";
import { generateMenu } from "@/lib/ai/menu";
import { loadPreferences, applyAvoidToPool, prefsPromptSnippet } from "@/lib/ai/preferences";
import basics from "@/../data/basics.json";
import type { DayType, Food } from "@/lib/types";

type ProposalItem = { food_id: string; quantity: number; unit: "g" | "unit"; food: Food };
export type Proposal = {
  slots: { name: string; slot: number; options: { label: string; items: ProposalItem[]; macros: ReturnType<typeof mealMacros> }[] }[];
};
export type ProposalResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; error: string; status: number };

export async function generateProposalForDayType(
  supabase: SupabaseClient,
  dayType: DayType,
  opts: { meals: number; options: number },
): Promise<ProposalResult> {
  const n = opts.meals, m = opts.options;

  // pool = favoritos ∪ básicos
  const { data: favRows } = await supabase.from("food_favorites").select("food_id");
  const favIds = (favRows ?? []).map((r) => r.food_id);
  const { data: favFoods } = favIds.length
    ? await supabase.from("foods").select("*").in("id", favIds)
    : { data: [] as Food[] };
  const { data: basicFoods } = await supabase
    .from("foods").select("*").is("user_id", null).in("name", basics as string[]);
  const poolMap = new Map<string, Food>();
  for (const f of [...(favFoods ?? []), ...(basicFoods ?? [])] as Food[]) poolMap.set(f.id, f);
  const pool = [...poolMap.values()];
  if (pool.length === 0) {
    return { ok: false, error: "Sem alimentos no pool. Favorite alguns alimentos.", status: 400 };
  }

  // Preferências (E1): avoid filtra o pool (duro); guidance orienta o prompt.
  const prefs = await loadPreferences(supabase);
  const filteredPool = applyAvoidToPool(pool, prefs.avoid);
  if (filteredPool.length === 0) {
    return { ok: false, error: "Pool vazio após preferências — afrouxe os itens evitados ou favorite mais alimentos.", status: 400 };
  }
  // poolMap usado no solver reflete SÓ o pool filtrado — evita reintroduzir um item evitado.
  const filteredMap = new Map(filteredPool.map((f) => [f.id, f]));

  const subTargets = mealSubTargets(dayType, n);
  const subWithType = subTargets.map((s, i) => ({ ...s, mealType: mealTypeFromName(s.name, i, subTargets.length) }));
  let raw;
  try {
    raw = await generateMenu({
      subTargets: subWithType, options: m, guidance: prefsPromptSnippet(prefs),
      pool: filteredPool.map((f) => ({
        id: f.id, name: f.name,
        kcal_per_100g: f.kcal_per_100g, protein_per_100g: f.protein_per_100g,
        carbs_per_100g: f.carbs_per_100g, fat_per_100g: f.fat_per_100g,
        unit_name: f.unit_name, unit_grams: f.unit_grams,
      })),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao gerar cardápio", status: 502 };
  }

  const slots = raw.slots.slice(0, n).map((slot, si) => {
    const sub = subTargets[si] ?? subTargets[subTargets.length - 1];
    const options = slot.options.slice(0, m).map((opt, oi) => {
      const withFood = opt.items
        .map((it) => ({ ...it, food: filteredMap.get(it.food_id)! }))
        .filter((it) => it.food);
      const coherent = enforceCoherence(withFood, (it) => {
        const grams = itemGrams(it, it.food);
        return {
          category: classifyFood(it.food),
          protein_g: (it.food.protein_per_100g * grams) / 100,
          carbs_g: (it.food.carbs_per_100g * grams) / 100,
        };
      });
      const scaled: ProposalItem[] = scaleOptionToTarget(coherent, { kcal: sub.kcal, protein_g: sub.protein_g })
        .map((it) => ({ food_id: it.food.id, quantity: it.quantity, unit: it.unit, food: it.food }));
      return { label: `Opção ${oi + 1}`, items: scaled, macros: mealMacros(scaled) };
    });
    return { name: slot.name, slot: si, options };
  });

  return { ok: true, proposal: { slots } };
}
