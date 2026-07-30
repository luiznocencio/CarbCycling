import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

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
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-1.5" aria-label="Início">
            <span className="size-2 rounded-full bg-carb-low" />
            <span className="size-2 rounded-full bg-carb-medium" />
            <span className="size-2 rounded-full bg-carb-high" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-foreground hover:text-accent">
              Semana
            </Link>
            <Link href="/foods" className="text-foreground hover:text-accent">
              Alimentos
            </Link>
            <Link href="/settings" className="text-foreground hover:text-accent">
              Configurações
            </Link>
          </div>
          <SignOutButton />
        </nav>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </div>
  );
}
