import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const unit: "g" | "unit" = body.unit === "unit" ? "unit" : "g";
  if (unit === "unit") {
    const { data: food } = await supabase.from("foods").select("unit_grams").eq("id", body.food_id).maybeSingle();
    if (!food?.unit_grams) {
      return NextResponse.json({ error: "Este alimento não tem unidade definida." }, { status: 400 });
    }
  }
  const { data, error } = await supabase
    .from("meal_items")
    .insert({ meal_id: body.meal_id, food_id: body.food_id, quantity: body.quantity, unit })
    .select("*, food:foods(*)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const patch: { quantity: number; unit?: "g" | "unit" } = { quantity: body.quantity };
  if (body.unit === "g" || body.unit === "unit") patch.unit = body.unit;
  const { data, error } = await supabase
    .from("meal_items")
    .update(patch)
    .eq("id", body.id)
    .select("*, food:foods(*)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  const { error } = await supabase.from("meal_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
