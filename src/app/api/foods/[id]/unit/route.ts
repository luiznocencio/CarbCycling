import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const unitName = b.unit_name != null && String(b.unit_name).trim() !== "" ? String(b.unit_name).trim() : null;
  const unitGrams = b.unit_grams != null && b.unit_grams !== "" ? Number(b.unit_grams) : null;
  if ((unitName === null) !== (unitGrams === null)) {
    return NextResponse.json({ error: "Informe nome e peso da unidade, ou limpe os dois." }, { status: 400 });
  }
  if (unitGrams !== null && !(unitGrams > 0)) {
    return NextResponse.json({ error: "Peso da unidade deve ser maior que zero." }, { status: 400 });
  }
  const { error } = await supabase.rpc("set_food_unit", {
    p_food_id: id,
    p_unit_name: unitName,
    p_unit_grams: unitGrams,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
