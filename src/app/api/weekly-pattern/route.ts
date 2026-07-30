import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("weekly_pattern")
    .select("*")
    .order("weekday");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const entries: { weekday: number; day_type_id: string }[] = await req.json();
  const rows = entries.map((e) => ({
    user_id: user.id,
    weekday: e.weekday,
    day_type_id: e.day_type_id,
  }));
  const { data, error } = await supabase
    .from("weekly_pattern")
    .upsert(rows, { onConflict: "user_id,weekday" })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
