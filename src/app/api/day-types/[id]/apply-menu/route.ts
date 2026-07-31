import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type ProposalItem = { food_id: string; quantity: number; unit: "g" | "unit" };
type Proposal = {
  slots: { name: string; slot: number; options: { label: string; items: ProposalItem[] }[] }[];
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { proposal } = (await req.json()) as { proposal: Proposal };

  // Substitui: apaga as refeições atuais do tipo de dia (cascade em meal_items)
  const { error: delErr } = await supabase.from("meals").delete().eq("day_type_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

  for (const slot of proposal.slots) {
    for (let oi = 0; oi < slot.options.length; oi++) {
      const opt = slot.options[oi];
      const { data: meal, error: mErr } = await supabase
        .from("meals")
        .insert({
          user_id: user.id, day_type_id: id, name: slot.name,
          order: slot.slot, slot: slot.slot, option_label: opt.label, selected: oi === 0,
        })
        .select().single();
      if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 });
      if (opt.items.length) {
        const rows = opt.items.map((it) => ({
          meal_id: meal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit,
        }));
        const { error: iErr } = await supabase.from("meal_items").insert(rows);
        if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
