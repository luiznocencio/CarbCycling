import ProfileForm from "@/components/ProfileForm";
import WeeklyTargetsPanel from "@/components/WeeklyTargetsPanel";
import WeeklyPatternSettings from "@/components/WeeklyPatternSettings";

export default function SettingsPage() {
  return (
    <main className="space-y-8">
      <section>
        <h1 className="mb-3 text-lg font-semibold">Perfil</h1>
        <ProfileForm />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Metas por tipo de dia</h2>
        <WeeklyTargetsPanel />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Padrão semanal</h2>
        <WeeklyPatternSettings />
      </section>
    </main>
  );
}
