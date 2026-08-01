import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { mealSubTargets, scaleOptionToTarget } from "@/lib/nutrition/solver";
import { mealMacros } from "@/lib/nutrition/macros";
import { generateMenu } from "@/lib/ai/menu";
import basics from "@/../data/basics.json";
import type { Food } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  // Clamp server-side: evita RangeError/OOM (ex.: meals negativo/enorme) e custo de IA descontrolado.
  const n = Math.min(12, Math.max(1, Math.trunc(Number(body.meals) || 5)));
  const m = Math.min(12, Math.max(1, Math.trunc(Number(body.options) || 3)));

  const { data: dayType } = await supabase.from("day_types").select("*").eq("id", id).maybeSingle();
  if (!dayType) return NextResponse.json({ error: "tipo de dia não encontrado" }, { status: 404 });

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
    return NextResponse.json({ error: "Sem alimentos no pool. Favorite alguns alimentos." }, { status: 400 });
  }

  const subTargets = mealSubTargets(dayType, n);
  let raw;
  try {
    raw = await generateMenu({
      subTargets,
      options: m,
      pool: pool.map((f) => ({
        id: f.id, name: f.name,
        kcal_per_100g: f.kcal_per_100g, protein_per_100g: f.protein_per_100g,
        carbs_per_100g: f.carbs_per_100g, fat_per_100g: f.fat_per_100g,
        unit_name: f.unit_name, unit_grams: f.unit_grams,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao gerar cardápio" },
      { status: 502 },
    );
  }

  // solver + macros por opção
  const slots = raw.slots.slice(0, n).map((slot, si) => {
    const sub = subTargets[si] ?? subTargets[subTargets.length - 1];
    const options = slot.options.slice(0, m).map((opt, oi) => {
      const withFood = opt.items
        .map((it) => ({ ...it, food: poolMap.get(it.food_id)! }))
        .filter((it) => it.food);
      const scaled = scaleOptionToTarget(withFood, { kcal: sub.kcal, protein_g: sub.protein_g });
      return { label: `Opção ${oi + 1}`, items: scaled, macros: mealMacros(scaled) };
    });
    return { name: slot.name, slot: si, options };
  });

  return NextResponse.json({ proposal: { slots } });
}
