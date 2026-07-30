import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json(
    data ?? {
      user_id: user.id,
      weight_kg: 70,
      goal: "maintenance",
      activity_level: "moderate",
    },
  );
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      weight_kg: body.weight_kg,
      goal: body.goal,
      activity_level: body.activity_level,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
