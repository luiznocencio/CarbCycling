import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("day_types").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const { data, error } = await supabase
    .from("day_types")
    .insert({
      user_id: user.id,
      name: b.name,
      carb_level: b.carb_level,
      auto_suggested: false,
      target_kcal: b.target_kcal ?? 0,
      target_protein_g: b.target_protein_g ?? 0,
      target_carbs_g: b.target_carbs_g ?? 0,
      target_fat_g: b.target_fat_g ?? 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
