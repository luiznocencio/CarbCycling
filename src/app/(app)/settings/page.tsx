import DayTypesSettings from "@/components/DayTypesSettings";
import WeeklyPatternSettings from "@/components/WeeklyPatternSettings";

export default function SettingsPage() {
  return (
    <main className="space-y-8">
      <section>
        <h1 className="mb-3 text-lg font-semibold text-foreground">
          Perfil e metas por tipo de dia
        </h1>
        <DayTypesSettings />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Padrão semanal
        </h2>
        <WeeklyPatternSettings />
      </section>
    </main>
  );
}
