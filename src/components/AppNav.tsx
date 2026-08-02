"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

type IconProps = { className?: string };

function IconWeek({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </svg>
  );
}
function IconProgress({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 19V5M4 19h16" />
      <path d="M7.5 14.5l3.5-4 3 2.5 4.5-6" />
      <path d="M18.5 7v3.5H15" />
    </svg>
  );
}
function IconFood({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 8.5C10.8 6.6 8.7 6 7.2 6.8 5.2 7.9 4.8 11 6 14c1 2.5 2.6 4.5 4 4.5s1.3-.8 2-.8 .6.8 2 .8 3-2 4-4.5c1.2-3 .8-6.1-1.2-7.2C15.3 6 13.2 6.6 12 8.5Z" />
      <path d="M12 8.5c.2-1.4 1.1-2.8 2.6-3.3" />
    </svg>
  );
}
function IconPrefs({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 7h9M18 7h1M5 17h1M10 17h9" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </svg>
  );
}
function IconSettings({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M4.6 7.5l1.7 1M17.7 15.5l1.7 1M19.4 7.5l-1.7 1M6.3 15.5l-1.7 1" />
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: (p: IconProps) => React.ReactElement;
};

const NAV: NavItem[] = [
  { href: "/", label: "Semana", icon: IconWeek },
  { href: "/weight", label: "Progresso", icon: IconProgress },
  { href: "/foods", label: "Alimentos", icon: IconFood },
  { href: "/preferences", label: "Preferências", mobileLabel: "Prefs.", icon: IconPrefs },
  { href: "/settings", label: "Configurações", mobileLabel: "Ajustes", icon: IconSettings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

export default function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/"
            aria-label="Início"
            className={`flex shrink-0 items-center gap-1.5 rounded-md ${focusRing}`}
          >
            <span className="size-2 rounded-full bg-carb-low" />
            <span className="size-2 rounded-full bg-carb-medium" />
            <span className="size-2 rounded-full bg-carb-high" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            {NAV.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${focusRing} ${
                    active
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-muted hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0">
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* barra inferior — mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/90 backdrop-blur md:hidden"
        aria-label="Navegação principal"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV.map(({ href, label, mobileLabel, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors ${focusRing} ${
                  active ? "text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-[22px]" />
                <span className="leading-none">{mobileLabel ?? label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
