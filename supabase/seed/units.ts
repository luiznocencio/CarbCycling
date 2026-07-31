import { createClient } from "@supabase/supabase-js";
import units from "../../data/units.json";

interface UnitRow { name: string; unit_name: string; unit_grams: number }

// Seed idempotente das unidades caseiras (unit_name/unit_grams) na base TACO em
// `foods` (user_id null). Requer a service_role (bypassa RLS). Rode com:
// `npm run seed:units` (carrega .env.local via --env-file).
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }
  const supabase = createClient(url, serviceKey);
  for (const row of units as UnitRow[]) {
    const { error } = await supabase
      .from("foods")
      .update({ unit_name: row.unit_name, unit_grams: row.unit_grams })
      .is("user_id", null)
      .eq("name", row.name);
    if (error) throw error;
  }
  console.log(`Applied units to ${(units as UnitRow[]).length} TACO foods.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
