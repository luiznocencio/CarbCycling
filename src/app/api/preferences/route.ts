import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadPreferences, sanitizePrefs } from "@/lib/ai/preferences";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await loadPreferences(supabase));
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prefs = sanitizePrefs(await req.json());
  const { data, error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, ...prefs, updated_at: new Date().toISOString() })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
