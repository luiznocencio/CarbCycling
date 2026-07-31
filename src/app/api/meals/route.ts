import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const dayTypeId = new URL(req.url).searchParams.get("dayTypeId");
  if (!dayTypeId) {
    return NextResponse.json(
      { error: "dayTypeId é obrigatório" },
      { status: 400 },
    );
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("meals")
    .select("*, meal_items(*, food:foods(*))")
    .eq("day_type_id", dayTypeId)
    .order("slot")
    .order("option_label");
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
    .from("meals")
    .insert({
      user_id: user.id,
      day_type_id: body.day_type_id,
      name: body.name,
      order: body.order ?? 0,
      slot: body.slot ?? body.order ?? 0,
      option_label: body.option_label ?? "Opção 1",
      selected: body.selected ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
