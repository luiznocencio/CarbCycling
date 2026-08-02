import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh">
      <AppNav />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:pb-8">
        {children}
      </div>
    </div>
  );
}
