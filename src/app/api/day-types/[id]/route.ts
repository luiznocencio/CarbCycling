import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const { data, error } = await supabase
    .from("day_types")
    .update({
      name: b.name,
      carb_level: b.carb_level,
      auto_suggested: false,
      target_kcal: b.target_kcal,
      target_protein_g: b.target_protein_g,
      target_carbs_g: b.target_carbs_g,
      target_fat_g: b.target_fat_g,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase.from("day_types").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
