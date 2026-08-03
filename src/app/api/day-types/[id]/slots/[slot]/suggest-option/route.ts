import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { mealSubTargets, scaleOptionToTarget } from "@/lib/nutrition/solver";
import { suggestMealOption, type PoolFood } from "@/lib/ai/menu";
import { classifyFood, mealTypeFromName, enforceCoherence } from "@/lib/nutrition/coherence";
import { itemGrams } from "@/lib/nutrition/macros";
import { loadPreferences, applyAvoidToPool, resolveIncludeIds, prefsPromptSnippet } from "@/lib/ai/preferences";
import basics from "@/../data/basics.json";
import type { Food } from "@/lib/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; slot: string }> },
) {
  const { id, slot } = await params;
  const slotNum = Number(slot);
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const include: string[] = Array.isArray(body.include) ? body.include : [];
  const exclude: string[] = Array.isArray(body.exclude) ? body.exclude : [];

  const { data: dayType } = await supabase.from("day_types").select("*").eq("id", id).maybeSingle();
  if (!dayType) return NextResponse.json({ error: "tipo de dia não encontrado" }, { status: 404 });

  // slots distintos do dia + posição do slot atual → sub-meta
  const { data: dayMeals } = await supabase
    .from("meals").select("slot, name, option_label").eq("day_type_id", id);
  const distinctSlots = [...new Set((dayMeals ?? []).map((m) => m.slot))].sort((a, b) => a - b);
  const n = distinctSlots.length || 1;
  const idx = Math.max(0, distinctSlots.indexOf(slotNum));
  const subTargets = mealSubTargets(dayType, n);
  const sub = subTargets[idx] ?? subTargets[subTargets.length - 1];
  const slotName = (dayMeals ?? []).find((m) => m.slot === slotNum)?.name ?? sub.name;
  const optionCount = (dayMeals ?? []).filter((m) => m.slot === slotNum).length;
  const mealType = mealTypeFromName(slotName, idx, n);

  // pool = favoritos ∪ básicos ∪ include
  const { data: favRows } = await supabase.from("food_favorites").select("food_id");
  const favIds = (favRows ?? []).map((r) => r.food_id);
  const wantIds = [...new Set([...favIds, ...include])];
  const { data: favFoods } = wantIds.length
    ? await supabase.from("foods").select("*").in("id", wantIds)
    : { data: [] as Food[] };
  const { data: basicFoods } = await supabase
    .from("foods").select("*").is("user_id", null).in("name", basics as string[]);
  const poolMap = new Map<string, Food>();
  for (const f of [...(favFoods ?? []), ...(basicFoods ?? [])] as Food[]) poolMap.set(f.id, f);
  const pool: PoolFood[] = [...poolMap.values()].map((f) => ({
    id: f.id, name: f.name,
    kcal_per_100g: f.kcal_per_100g, protein_per_100g: f.protein_per_100g,
    carbs_per_100g: f.carbs_per_100g, fat_per_100g: f.fat_per_100g,
    unit_name: f.unit_name, unit_grams: f.unit_grams,
  }));
  if (pool.length === 0) {
    return NextResponse.json({ error: "Sem alimentos no pool. Favorite alguns alimentos." }, { status: 400 });
  }

  // Preferências: avoid filtra o pool (duro); always_include mescla no include; guidance orienta o prompt.
  // O exclude do pedido VENCE (validateItems descarta os excluídos mesmo se um include tentar forçá-los).
  const prefs = await loadPreferences(supabase);
  const prefPool = applyAvoidToPool(pool, prefs.avoid);
  if (prefPool.length === 0) {
    return NextResponse.json(
      { error: "Pool vazio após preferências — afrouxe os itens evitados ou favorite mais alimentos." },
      { status: 400 },
    );
  }
  const includeWithPrefs = [...new Set([...include, ...resolveIncludeIds(prefPool, prefs.always_include)])];
  // poolMap usado depois para withFood/scaleOptionToTarget reflete SÓ o prefPool — item evitado nunca reaparece.
  const prefMap = new Map<string, Food>();
  for (const pf of prefPool) {
    const f = poolMap.get(pf.id);
    if (f) prefMap.set(pf.id, f);
  }

  let rawItems;
  try {
    rawItems = await suggestMealOption({
      target: sub,
      pool: prefPool,
      include: includeWithPrefs,
      exclude,
      guidance: prefsPromptSnippet(prefs),
      mealType,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao sugerir opção" },
      { status: 502 },
    );
  }

  const withFood = rawItems
    .map((it) => ({ ...it, food: prefMap.get(it.food_id)! }))
    .filter((it) => it.food);
  const coherent = enforceCoherence(withFood, (it) => {
    const grams = itemGrams(it, it.food);
    return {
      category: classifyFood(it.food),
      protein_g: (it.food.protein_per_100g * grams) / 100,
      carbs_g: (it.food.carbs_per_100g * grams) / 100,
    };
  });
  const scaled = scaleOptionToTarget(coherent, { kcal: sub.kcal, protein_g: sub.protein_g });

  const { data: meal, error: mErr } = await supabase
    .from("meals")
    .insert({
      user_id: user.id, day_type_id: id, name: slotName,
      order: slotNum, slot: slotNum, option_label: `Opção ${optionCount + 1}`, selected: false,
    })
    .select().single();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
  if (scaled.length) {
    const rows = scaled.map((it) => ({
      meal_id: meal.id, food_id: it.food.id, quantity: it.quantity, unit: it.unit,
    }));
    const { error: iErr } = await supabase.from("meal_items").insert(rows);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
  }
  return NextResponse.json({ meal });
}
