"use client";

import { useEffect, useState } from "react";
import type { CarbLevel, DayType, WeeklyPatternEntry } from "@/lib/types";

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

// Padrão inicial: Dom-Ter = baixo carbo, Qua-Qui = médio carbo, Sex-Sáb = alto carbo.
const DEFAULT_CARB_LEVEL_BY_WEEKDAY: CarbLevel[] = [
  "low",
  "low",
  "low",
  "medium",
  "medium",
  "high",
  "high",
];

export default function WeeklyPatternSettings() {
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [pattern, setPattern] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/day-types").then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao carregar tipos de dia");
        return body as DayType[];
      }),
      fetch("/api/weekly-pattern").then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao carregar padrão semanal");
        return body as WeeklyPatternEntry[];
      }),
    ])
      .then(([types, entries]) => {
        setDayTypes(types);
        if (entries.length > 0) {
          const map: Record<number, string> = {};
          for (const entry of entries) map[entry.weekday] = entry.day_type_id;
          setPattern(map);
        } else if (types.length > 0) {
          // padrão vazio: pré-preenche casando pelo carb_level dos tipos existentes
          const map: Record<number, string> = {};
          for (let weekday = 0; weekday < 7; weekday++) {
            const level = DEFAULT_CARB_LEVEL_BY_WEEKDAY[weekday];
            const match = types.find((t) => t.carb_level === level);
            if (match) map[weekday] = match.id;
          }
          setPattern(map);
        }
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  function updateWeekday(weekday: number, dayTypeId: string) {
    setSaved(false);
    setPattern((prev) => ({ ...prev, [weekday]: dayTypeId }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const entries = Object.entries(pattern)
        .filter(([, dayTypeId]) => !!dayTypeId)
        .map(([weekday, dayTypeId]) => ({
          weekday: Number(weekday),
          day_type_id: dayTypeId,
        }));
      const res = await fetch("/api/weekly-pattern", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar padrão semanal");
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Falha ao salvar padrão semanal");
    } finally {
      setSaving(false);
    }
  }

  const hasDayTypes = dayTypes.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      {loading && <p className="text-sm text-muted">Carregando padrão semanal...</p>}
      {loadError && <p className="text-sm text-off-target">{loadError}</p>}

      {!loading && !loadError && !hasDayTypes && (
        <p className="text-sm text-muted">
          Cadastre ao menos um tipo de dia acima para montar o padrão semanal.
        </p>
      )}

      {!loading && !loadError && hasDayTypes && (
        <>
          <div className="flex flex-col gap-2">
            {WEEKDAY_LABELS.map((label, weekday) => (
              <label
                key={weekday}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <span>{label}</span>
                <select
                  value={pattern[weekday] ?? ""}
                  onChange={(e) => updateWeekday(weekday, e.target.value)}
                  data-testid={`weekday-select-${weekday}`}
                  className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Selecione um tipo</option>
                  {dayTypes.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {saveError && <p className="text-xs text-off-target">{saveError}</p>}
          {saved && !saveError && <p className="text-xs text-on-target">Padrão salvo.</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            data-testid="weekly-save"
            className="mt-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
          >
            {saving ? "Salvando..." : "Salvar padrão"}
          </button>
        </>
      )}
    </div>
  );
}
