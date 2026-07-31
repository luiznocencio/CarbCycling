import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.selected === true) {
    const { data: current } = await supabase
      .from("meals")
      .select("day_type_id, slot")
      .eq("id", id)
      .maybeSingle();
    if (current) {
      await supabase
        .from("meals")
        .update({ selected: false })
        .eq("day_type_id", current.day_type_id)
        .eq("slot", current.slot);
    }
  }

  const { data, error } = await supabase
    .from("meals")
    .update({
      name: body.name,
      order: body.order,
      selected: body.selected,
      option_label: body.option_label ?? undefined,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
