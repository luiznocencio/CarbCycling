"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CarbLevel, DayType } from "@/lib/types";

type Summary = {
  avgDailyTarget: number;
  actualWeeklyAvg: number;
  adjustmentPct: number;
  warnings: string[];
};

const CARB_LABELS: Record<CarbLevel, string> = {
  low: "Baixo carbo",
  medium: "Médio carbo",
  high: "Alto carbo",
};

const CARB_DOT: Record<CarbLevel, string> = {
  low: "bg-carb-low",
  medium: "bg-carb-medium",
  high: "bg-carb-high",
};

const fieldLabel = "flex flex-col gap-1 text-xs text-muted";
const fieldInput =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";

type RowForm = {
  name: string;
  carb_level: CarbLevel;
  target_kcal: string;
  target_protein_g: string;
  target_carbs_g: string;
  target_fat_g: string;
};

function toRowForm(dt: DayType): RowForm {
  return {
    name: dt.name,
    carb_level: dt.carb_level,
    target_kcal: String(dt.target_kcal),
    target_protein_g: String(dt.target_protein_g),
    target_carbs_g: String(dt.target_carbs_g),
    target_fat_g: String(dt.target_fat_g),
  };
}

const emptyNewForm: RowForm = {
  name: "",
  carb_level: "medium",
  target_kcal: "0",
  target_protein_g: "0",
  target_carbs_g: "0",
  target_fat_g: "0",
};

function adjustmentTone(pct: number): "low" | "high" | "neutral" {
  if (pct > 0.01) return "high";
  if (pct < -0.01) return "low";
  return "neutral";
}

const ADJUSTMENT_TONE_CLASSES: Record<"low" | "high" | "neutral", string> = {
  low: "bg-carb-low/15 text-carb-low",
  high: "bg-carb-high/15 text-carb-high",
  neutral: "bg-muted/15 text-muted",
};

export default function WeeklyTargetsPanel() {
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState<RowForm>(emptyNewForm);
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/day-types");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao carregar tipos de dia");
      setDayTypes(body as DayType[]);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function recalc() {
    setError(null);
    setRecalculating(true);
    try {
      const res = await fetch("/api/targets/recalculate", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Falha ao recalcular metas.");
        setSummary(null);
        return;
      }
      setSummary(body.summary as Summary);
      await load();
    } finally {
      setRecalculating(false);
    }
  }

  function openNewForm() {
    setNewForm(emptyNewForm);
    setNewError(null);
    setCreating(true);
  }

  function closeNewForm() {
    setCreating(false);
    setNewForm(emptyNewForm);
    setNewError(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setNewError(null);
    const name = newForm.name.trim();
    if (!name) {
      setNewError("Informe o nome do tipo de dia.");
      return;
    }
    setNewSaving(true);
    try {
      const res = await fetch("/api/day-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          carb_level: newForm.carb_level,
          target_kcal: 0,
          target_protein_g: 0,
          target_carbs_g: 0,
          target_fat_g: 0,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao criar tipo de dia");
      setDayTypes((prev) => [...prev, body as DayType].sort((a, b) => a.name.localeCompare(b.name)));
      closeNewForm();
    } catch (err) {
      setNewError(err instanceof Error ? err.message : "Falha ao criar tipo de dia");
    } finally {
      setNewSaving(false);
    }
  }

  function handleRowSaved(updated: DayType) {
    setDayTypes((prev) => prev.map((dt) => (dt.id === updated.id ? updated : dt)));
  }

  function handleRowDeleted(id: string) {
    setDayTypes((prev) => prev.filter((dt) => dt.id !== id));
  }

  const adjustmentPct = summary ? Math.round(summary.adjustmentPct * 1000) / 10 : 0;
  const tone = summary ? adjustmentTone(summary.adjustmentPct) : "neutral";

  return (
    <div className="flex flex-col gap-4">
      {/* Recalcular + resumo */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recalcular metas</h3>
          <p className="mt-0.5 text-xs text-muted">
            Redistribui kcal e macros entre os tipos de dia a partir do seu perfil e do padrão semanal.
          </p>
        </div>

        <button
          type="button"
          onClick={recalc}
          disabled={recalculating}
          data-testid="recalc-targets"
          className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
        >
          {recalculating ? "Recalculando..." : "Recalcular metas da semana"}
        </button>

        {error && <p className="text-xs text-off-target">{error}</p>}

        {summary && (
          <div
            data-testid="weekly-summary"
            className="flex flex-col gap-3 rounded-lg bg-accent/10 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Média diária alvo</p>
                <p className="text-2xl font-bold text-accent">
                  <span data-testid="weekly-avg">{summary.avgDailyTarget}</span>{" "}
                  <span className="text-sm font-medium text-muted">kcal/dia</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Ajuste vs. gasto</p>
                <p
                  data-testid="weekly-adjustment"
                  className={`inline-block rounded-full px-2.5 py-1 text-sm font-semibold ${ADJUSTMENT_TONE_CLASSES[tone]}`}
                >
                  {adjustmentPct > 0 ? "+" : ""}
                  {adjustmentPct}%
                </p>
              </div>
            </div>

            <p className="text-xs text-muted">
              Média semanal real:{" "}
              <span className="font-medium text-foreground">{summary.actualWeeklyAvg} kcal/dia</span>
            </p>

            {summary.warnings.length > 0 && (
              <ul className="flex flex-col gap-1">
                {summary.warnings.map((w, i) => (
                  <li
                    key={i}
                    data-testid="weekly-warning"
                    className="rounded-lg bg-off-target/10 px-2.5 py-1.5 text-xs text-off-target"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Tipos de dia */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Tipos de dia</h3>
          <button
            type="button"
            onClick={creating ? closeNewForm : openNewForm}
            className="text-xs font-medium text-accent hover:underline"
          >
            {creating ? "Fechar" : "+ Novo tipo de dia"}
          </button>
        </div>

        {creating && (
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={fieldLabel}>
                Nome
                <input
                  type="text"
                  value={newForm.name}
                  onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="daytype-name"
                  placeholder="Ex.: Dia de treino pesado"
                  className={fieldInput}
                />
              </label>
              <label className={fieldLabel}>
                Nível de carbo
                <select
                  value={newForm.carb_level}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, carb_level: e.target.value as CarbLevel }))
                  }
                  data-testid="daytype-carblevel"
                  className={fieldInput}
                >
                  {(Object.keys(CARB_LABELS) as CarbLevel[]).map((c) => (
                    <option key={c} value={c}>
                      {CARB_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-xs text-muted">
              As metas começam zeradas — edite os valores na lista ou use &ldquo;Recalcular metas da
              semana&rdquo;.
            </p>

            {newError && <p className="text-xs text-off-target">{newError}</p>}

            <button
              type="submit"
              disabled={newSaving}
              data-testid="daytype-save"
              className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
            >
              {newSaving ? "Salvando..." : "Criar tipo de dia"}
            </button>
          </form>
        )}

        <div className="flex flex-col gap-2">
          {listLoading && <p className="text-sm text-muted">Carregando tipos de dia...</p>}
          {listError && <p className="text-sm text-off-target">{listError}</p>}
          {!listLoading && !listError && dayTypes.length === 0 && (
            <p className="text-sm text-muted">Nenhum tipo de dia cadastrado ainda.</p>
          )}

          {dayTypes.map((dt) => (
            <DayTypeRow key={dt.id} dayType={dt} onSaved={handleRowSaved} onDeleted={handleRowDeleted} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayTypeRow({
  dayType,
  onSaved,
  onDeleted,
}: {
  dayType: DayType;
  onSaved: (updated: DayType) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState<RowForm>(toRowForm(dayType));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof RowForm>(key: K, value: RowForm[K]) {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = form.name.trim();
    if (!name) {
      setError("Informe o nome do tipo de dia.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/day-types/${dayType.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          carb_level: form.carb_level,
          target_kcal: Number(form.target_kcal) || 0,
          target_protein_g: Number(form.target_protein_g) || 0,
          target_carbs_g: Number(form.target_carbs_g) || 0,
          target_fat_g: Number(form.target_fat_g) || 0,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar tipo de dia");
      onSaved(body as DayType);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar tipo de dia");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Excluir o tipo de dia "${dayType.name}"?`)) return;
    const res = await fetch(`/api/day-types/${dayType.id}`, { method: "DELETE" });
    if (res.ok) onDeleted(dayType.id);
  }

  return (
    <form
      onSubmit={handleSave}
      data-testid="daytype-row"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={fieldLabel}>
            Nome
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              data-testid="daytype-name"
              className={fieldInput}
            />
          </label>
          <label className={fieldLabel}>
            Nível de carbo
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${CARB_DOT[form.carb_level]}`}
              />
              <select
                value={form.carb_level}
                onChange={(e) => update("carb_level", e.target.value as CarbLevel)}
                data-testid="daytype-carblevel"
                className={fieldInput + " flex-1"}
              >
                {(Object.keys(CARB_LABELS) as CarbLevel[]).map((c) => (
                  <option key={c} value={c}>
                    {CARB_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="shrink-0 text-xs text-off-target hover:underline"
        >
          Excluir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={fieldLabel}>
          Kcal
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.target_kcal}
            onChange={(e) => update("target_kcal", e.target.value)}
            className={fieldInput}
          />
        </label>
        <label className={fieldLabel}>
          Proteína (g)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.target_protein_g}
            onChange={(e) => update("target_protein_g", e.target.value)}
            className={fieldInput}
          />
        </label>
        <label className={fieldLabel}>
          Carbo (g)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.target_carbs_g}
            onChange={(e) => update("target_carbs_g", e.target.value)}
            className={fieldInput}
          />
        </label>
        <label className={fieldLabel}>
          Gordura (g)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.target_fat_g}
            onChange={(e) => update("target_fat_g", e.target.value)}
            className={fieldInput}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {dayType.auto_suggested && (
            <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Auto
            </span>
          )}
          {error && <p className="text-xs text-off-target">{error}</p>}
          {saved && !error && <p className="text-xs text-on-target">Salvo.</p>}
        </div>
        <button
          type="submit"
          disabled={saving}
          data-testid="daytype-save"
          className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-opacity disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
