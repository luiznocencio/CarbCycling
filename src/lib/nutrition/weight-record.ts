import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordWeight(
  supabase: SupabaseClient,
  userId: string,
  weightKg: number,
  loggedOn: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("weight_logs")
    .upsert(
      { user_id: userId, logged_on: loggedOn, weight_kg: weightKg, note },
      { onConflict: "user_id,logged_on" },
    );
  if (error) return { ok: false, error: error.message };
  // sincroniza profiles.weight_kg com o registro mais recente
  const { data: latest } = await supabase
    .from("weight_logs")
    .select("weight_kg")
    .eq("user_id", userId)
    .order("logged_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    await supabase.from("profiles").update({ weight_kg: latest.weight_kg }).eq("user_id", userId);
  }
  return { ok: true };
}

export async function resyncProfileWeight(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: latest } = await supabase
    .from("weight_logs")
    .select("weight_kg")
    .eq("user_id", userId)
    .order("logged_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    await supabase.from("profiles").update({ weight_kg: latest.weight_kg }).eq("user_id", userId);
  }
}
