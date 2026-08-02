import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { recordWeight } from "@/lib/nutrition/weight-record";
import { bmr, tdee, isProfileComplete } from "@/lib/nutrition/bmr";
import { goalAdjustment } from "@/lib/nutrition/weekly";
import { weightAnalysis } from "@/lib/nutrition/weight";
import type { Profile } from "@/lib/types";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("weight_logs")
    .select("*")
    .order("logged_on");
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json();
  const weight = Number(b.weight_kg);
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
    return NextResponse.json({ error: "peso inválido" }, { status: 400 });
  }
  const loggedOn =
    typeof b.logged_on === "string" && b.logged_on
      ? b.logged_on
      : new Date().toISOString().slice(0, 10);
  const note = typeof b.note === "string" ? b.note : "";

  const rec = await recordWeight(supabase, user.id, weight, loggedOn, note);
  if (!rec.ok) return NextResponse.json({ error: rec.error }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const p = profile as Profile | null;

  let analysis: ReturnType<typeof weightAnalysis> | null = null;
  if (p && isProfileComplete(p)) {
    const b0 = bmr(p, p.bmr_formula);
    const t = tdee(b0, p.activity_level);
    const adjPct = goalAdjustment(p.goal, p.intensity);
    const { data: logs } = await supabase
      .from("weight_logs")
      .select("logged_on, weight_kg")
      .order("logged_on");
    analysis = weightAnalysis({
      tdee: t,
      adjPct,
      kcalAdjustment: p.kcal_adjustment,
      logs: logs ?? [],
      asOf: loggedOn,
    });
  }

  return NextResponse.json({
    log: { logged_on: loggedOn, weight_kg: weight },
    analysis,
  });
}
