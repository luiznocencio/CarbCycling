import WeightTracker from "@/components/WeightTracker";

export default function WeightPage() {
  return (
    <main className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Progresso</h1>
        <p className="text-sm text-muted">
          Registre seu peso ao longo do tempo. O sistema compara seu ritmo real
          com o previsto pelo plano e sugere ajustes de calorias.
        </p>
      </div>
      <WeightTracker />
    </main>
  );
}
