import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { distinctDayTypeIds } from "@/lib/nutrition/week";
import { generateProposalForDayType } from "@/lib/ai/generate";
import type { DayType } from "@/lib/types";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const n = Math.min(12, Math.max(1, Math.trunc(Number(body.meals) || 5)));
  const m = Math.min(12, Math.max(1, Math.trunc(Number(body.options) || 2)));

  const { data: pattern } = await supabase.from("weekly_pattern").select("weekday, day_type_id");
  const ids = distinctDayTypeIds(pattern ?? []);
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Defina o padrão semanal primeiro (nenhum dia atribuído)." },
      { status: 400 },
    );
  }
  const { data: dayTypes } = await supabase.from("day_types").select("*").in("id", ids);
  const dtById = new Map((dayTypes ?? []).map((d) => [d.id, d as DayType]));

  const week: { day_type_id: string; name: string; proposal?: unknown; error?: string }[] = [];
  let anyOk = false;
  let firstErr = "Falha ao gerar a semana";
  let firstStatus = 502;
  for (const id of ids) {
    const dt = dtById.get(id);
    if (!dt) {
      week.push({ day_type_id: id, name: "?", error: "tipo de dia não encontrado" });
      continue;
    }
    const res = await generateProposalForDayType(supabase, dt, { meals: n, options: m });
    if (res.ok) {
      anyOk = true;
      week.push({ day_type_id: id, name: dt.name, proposal: res.proposal });
    } else {
      firstErr = res.error;
      firstStatus = res.status;
      week.push({ day_type_id: id, name: dt.name, error: res.error });
    }
  }
  if (!anyOk) return NextResponse.json({ error: firstErr }, { status: firstStatus });
  return NextResponse.json({ week });
}
