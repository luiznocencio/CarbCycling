import { createClient } from "@supabase/supabase-js";
import taco from "../../data/taco.json";
import { normalizeTacoRow, type TacoRow } from "./normalize";

// Seed idempotente da base TACO em `foods` (user_id null). Requer a service_role
// (bypassa RLS). Rode com: `npm run seed:taco` (carrega .env.local via --env-file).
// Obs.: a base já foi semeada uma vez via Supabase MCP; este script existe para
// reprodutibilidade (recriar o banco do zero).
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local",
    );
  }
  const supabase = createClient(url, serviceKey);
  const rows = (taco as TacoRow[]).map(normalizeTacoRow);
  await supabase.from("foods").delete().is("user_id", null);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("foods").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  console.log(`Seeded ${rows.length} TACO foods.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
