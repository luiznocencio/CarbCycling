import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  return NextResponse.json(
    data ?? {
      user_id: user.id,
      weight_kg: 70,
      goal: "maintenance",
      activity_level: "moderate",
      sex: null,
      age: null,
      height_cm: null,
      body_fat_pct: null,
      bmr_formula: "auto",
      intensity: "moderate",
      safety_guardrails: true,
    },
  );
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      weight_kg: b.weight_kg,
      goal: b.goal,
      activity_level: b.activity_level,
      sex: b.sex ?? null,
      age: b.age ?? null,
      height_cm: b.height_cm ?? null,
      body_fat_pct: b.body_fat_pct ?? null,
      bmr_formula: b.bmr_formula ?? "auto",
      intensity: b.intensity ?? "moderate",
      safety_guardrails: b.safety_guardrails ?? true,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
