import type { SupabaseClient } from "@supabase/supabase-js";

type ProposalItem = { food_id: string; quantity: number; unit: "g" | "unit" };
export type Proposal = {
  slots: { name: string; slot: number; options: { label: string; items: ProposalItem[] }[] }[];
};
export type ApplyResult = { ok: true } | { ok: false; error: string; status: number };

export async function applyProposalToDayType(
  supabase: SupabaseClient, userId: string, dayTypeId: string, proposal: Proposal,
): Promise<ApplyResult> {
  if (!proposal || !Array.isArray(proposal.slots)) {
    return { ok: false, error: "proposta inválida", status: 400 };
  }
  const { data: dayType } = await supabase.from("day_types").select("id").eq("id", dayTypeId).maybeSingle();
  if (!dayType) return { ok: false, error: "tipo de dia não encontrado", status: 404 };

  const { error: delErr } = await supabase.from("meals").delete().eq("day_type_id", dayTypeId);
  if (delErr) return { ok: false, error: delErr.message, status: 400 };

  for (const slot of proposal.slots) {
    for (let oi = 0; oi < slot.options.length; oi++) {
      const opt = slot.options[oi];
      const { data: meal, error: mErr } = await supabase
        .from("meals")
        .insert({
          user_id: userId, day_type_id: dayTypeId, name: slot.name,
          order: slot.slot, slot: slot.slot, option_label: opt.label, selected: oi === 0,
        })
        .select().single();
      if (mErr) return { ok: false, error: mErr.message, status: 400 };
      if (opt.items.length) {
        const rows = opt.items.map((it) => ({
          meal_id: meal.id, food_id: it.food_id, quantity: it.quantity, unit: it.unit,
        }));
        const { error: iErr } = await supabase.from("meal_items").insert(rows);
        if (iErr) return { ok: false, error: iErr.message, status: 400 };
      }
    }
  }
  return { ok: true };
}
