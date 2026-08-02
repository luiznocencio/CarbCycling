import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resyncProfileWeight } from "@/lib/nutrition/weight-record";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from("weight_logs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await resyncProfileWeight(supabase, user.id);
  return NextResponse.json({ ok: true });
}
