import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import DayEditor from "@/components/DayEditor";
import type { DayType } from "@/lib/types";

export default async function DayPage({
  params,
}: {
  params: Promise<{ dayTypeId: string }>;
}) {
  const { dayTypeId } = await params;
  const supabase = await createServerSupabase();
  const { data: dayType } = await supabase
    .from("day_types")
    .select("*")
    .eq("id", dayTypeId)
    .maybeSingle();
  if (!dayType) notFound();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">{dayType.name}</h1>
      <DayEditor dayType={dayType as DayType} />
    </main>
  );
}
