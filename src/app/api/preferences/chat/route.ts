import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { chatPreferences, sanitizePrefs, EMPTY_PREFS } from "@/lib/ai/preferences";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: unknown): m is { role: "user" | "assistant"; content: string } =>
      !!m && typeof (m as { content?: unknown }).content === "string" &&
      ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant"))
    .slice(-20);
  const current = body.current ? sanitizePrefs(body.current) : EMPTY_PREFS;
  try {
    const out = await chatPreferences({ messages, current });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no chat de preferências" },
      { status: 502 },
    );
  }
}
