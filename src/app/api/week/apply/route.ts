import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { applyProposalToDayType, type Proposal } from "@/lib/nutrition/apply";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const entries: { day_type_id: string; proposal: Proposal }[] = Array.isArray(body.week)
    ? body.week.filter(
        (e: unknown) =>
          !!e &&
          typeof (e as { day_type_id?: unknown }).day_type_id === "string" &&
          !!(e as { proposal?: unknown }).proposal,
      )
    : [];
  if (entries.length === 0) {
    return NextResponse.json({ error: "Nada para aplicar." }, { status: 400 });
  }
  let applied = 0;
  const failed: { day_type_id: string; error: string }[] = [];
  for (const e of entries) {
    const res = await applyProposalToDayType(supabase, user.id, e.day_type_id, e.proposal);
    if (res.ok) applied++;
    else failed.push({ day_type_id: e.day_type_id, error: res.error });
  }
  return NextResponse.json({ ok: true, applied, failed });
}
