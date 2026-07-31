import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const supabase = await createServerSupabase();
  let query = supabase.from("foods").select("*").order("name").limit(50);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, error } = await query;
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
  const { data, error } = await supabase
    .from("foods")
    .insert({
      user_id: user.id,
      is_custom: true,
      name: body.name,
      kcal_per_100g: body.kcal_per_100g,
      protein_per_100g: body.protein_per_100g,
      carbs_per_100g: body.carbs_per_100g,
      fat_per_100g: body.fat_per_100g,
      unit_name: body.unit_name ?? null,
      unit_grams: body.unit_grams ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
