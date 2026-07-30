import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { suggestTargets } from "@/lib/nutrition/targets";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("day_types").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();

  let targets = {
    target_kcal: body.target_kcal ?? 0,
    target_protein_g: body.target_protein_g ?? 0,
    target_carbs_g: body.target_carbs_g ?? 0,
    target_fat_g: body.target_fat_g ?? 0,
  };
  if (body.autoSuggest) {
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    targets = suggestTargets({
      weightKg: p?.weight_kg ?? 70,
      goal: p?.goal ?? "maintenance",
      activityLevel: p?.activity_level ?? "moderate",
      carbLevel: body.carb_level,
    });
  }

  const { data, error } = await supabase
    .from("day_types")
    .insert({
      user_id: user.id,
      name: body.name,
      carb_level: body.carb_level,
      auto_suggested: !!body.autoSuggest,
      ...targets,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
