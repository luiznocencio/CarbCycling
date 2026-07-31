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

  // Marca o alvo PRIMEIRO; só então desmarca as irmãs do mesmo slot. Nesta ordem o slot
  // nunca fica com 0 opções selecionadas se o segundo write falhar (evita subcontar o dia).
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

  if (body.selected === true) {
    await supabase
      .from("meals")
      .update({ selected: false })
      .eq("day_type_id", data.day_type_id)
      .eq("slot", data.slot)
      .neq("id", id);
  }
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
  // Captura o slot antes de excluir, para promover uma irmã se a opção excluída era a selecionada.
  const { data: meal } = await supabase
    .from("meals")
    .select("day_type_id, slot, selected")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (meal?.selected) {
    const { data: sibling } = await supabase
      .from("meals")
      .select("id")
      .eq("day_type_id", meal.day_type_id)
      .eq("slot", meal.slot)
      .order("option_label")
      .limit(1)
      .maybeSingle();
    if (sibling) {
      await supabase.from("meals").update({ selected: true }).eq("id", sibling.id);
    }
  }
  return NextResponse.json({ ok: true });
}
