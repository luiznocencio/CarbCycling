import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { bmr, tdee, isProfileComplete } from "@/lib/nutrition/bmr";
import { distributeWeeklyTargets } from "@/lib/nutrition/weekly";
import type { CarbLevel, DayType, Profile, WeeklyPatternEntry } from "@/lib/types";

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: profile }, { data: dayTypes }, { data: pattern }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("day_types").select("*"),
    supabase.from("weekly_pattern").select("*"),
  ]);

  const p = profile as Profile | null;
  if (!p || !isProfileComplete(p)) {
    return NextResponse.json(
      { error: "Complete seu perfil (sexo, idade, altura) para calcular as metas." },
      { status: 400 },
    );
  }
  const dts = (dayTypes ?? []) as DayType[];
  const entries = (pattern ?? []) as WeeklyPatternEntry[];
  const carbById = new Map(dts.map((d) => [d.id, d.carb_level]));

  const levelCounts: Record<CarbLevel, number> = { low: 0, medium: 0, high: 0 };
  for (const e of entries) {
    const lvl = carbById.get(e.day_type_id);
    if (lvl) levelCounts[lvl] += 1;
  }
  if (levelCounts.low + levelCounts.medium + levelCounts.high === 0) {
    return NextResponse.json(
      { error: "Defina o padrão semanal antes de recalcular." },
      { status: 400 },
    );
  }

  const bmrValue = bmr(p, p.bmr_formula);
  const result = distributeWeeklyTargets({
    tdee: tdee(bmrValue, p.activity_level),
    weightKg: p.weight_kg,
    goal: p.goal,
    intensity: p.intensity,
    guardrails: p.safety_guardrails,
    bmr: bmrValue,
    levelCounts,
  });

  for (const dt of dts) {
    const t = result.perLevel[dt.carb_level];
    const { error } = await supabase
      .from("day_types")
      .update({ ...t, auto_suggested: true })
      .eq("id", dt.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ summary: result.summary });
}
