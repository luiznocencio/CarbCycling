import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { recalcTargetsForUser } from "@/lib/nutrition/recalc";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json();
  const delta = Number(b.delta);
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || Math.abs(delta) > 1000) {
    return NextResponse.json({ error: "delta inválido" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("kcal_adjustment")
    .eq("user_id", user.id)
    .maybeSingle();
  const atual = profile?.kcal_adjustment ?? 0;
  const novo = atual + Math.trunc(delta);

  const { error: upErr } = await supabase
    .from("profiles")
    .update({ kcal_adjustment: novo })
    .eq("user_id", user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const res = await recalcTargetsForUser(supabase, user.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  return NextResponse.json({ kcal_adjustment: novo, summary: res.summary });
}
