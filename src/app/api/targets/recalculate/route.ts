import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { recalcTargetsForUser } from "@/lib/nutrition/recalc";

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = await recalcTargetsForUser(supabase, user.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  return NextResponse.json({ summary: res.summary });
}
