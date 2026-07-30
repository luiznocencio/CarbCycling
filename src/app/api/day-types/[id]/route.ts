import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { suggestTargets } from "@/lib/nutrition/targets";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();

  let patch: Record<string, unknown> = {
    name: body.name,
    carb_level: body.carb_level,
    target_kcal: body.target_kcal,
    target_protein_g: body.target_protein_g,
    target_carbs_g: body.target_carbs_g,
    target_fat_g: body.target_fat_g,
    auto_suggested: false,
  };
  if (body.autoSuggest) {
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    patch = {
      name: body.name,
      carb_level: body.carb_level,
      auto_suggested: true,
      ...suggestTargets({
        weightKg: p?.weight_kg ?? 70,
        goal: p?.goal ?? "maintenance",
        activityLevel: p?.activity_level ?? "moderate",
        carbLevel: body.carb_level,
      }),
    };
  }

  const { data, error } = await supabase
    .from("day_types")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase.from("day_types").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
