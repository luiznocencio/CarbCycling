import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { applyProposalToDayType, type Proposal } from "@/lib/nutrition/apply";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { proposal } = (await req.json()) as { proposal: Proposal };
  const res = await applyProposalToDayType(supabase, user.id, id, proposal);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
