import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateProposalForDayType } from "@/lib/ai/generate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  // Clamp server-side: evita RangeError/OOM (ex.: meals negativo/enorme) e custo de IA descontrolado.
  const n = Math.min(12, Math.max(1, Math.trunc(Number(body.meals) || 5)));
  const m = Math.min(12, Math.max(1, Math.trunc(Number(body.options) || 3)));

  const { data: dayType } = await supabase.from("day_types").select("*").eq("id", id).maybeSingle();
  if (!dayType) return NextResponse.json({ error: "tipo de dia não encontrado" }, { status: 404 });

  const res = await generateProposalForDayType(supabase, dayType, { meals: n, options: m });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ proposal: res.proposal });
}
