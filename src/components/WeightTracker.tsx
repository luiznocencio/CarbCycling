"use client";

import { useEffect, useMemo, useState } from "react";
import type { WeightLog } from "@/lib/types";

type Analysis = {
  avgDailyTarget: number;
  expectedKgPerWeek: number;
  actualKgPerWeek: number | null;
  enoughData: boolean;
  deltaKcalPerDay: number;
  suggestedDelta: number;
  status: "on_track" | "eat_less" | "eat_more" | "insufficient_data";
};

const fieldLabel = "flex flex-col gap-1 text-xs text-muted";
const fieldInput =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "2026-07-15" → "15/07" (sem depender de timezone) */
function formatDateBr(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Ritmo em kg/sem, 1 casa, sinal claro (negativo = perdendo) */
function formatRate(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const abs = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `+${abs}`;
  if (rounded < 0) return `-${abs}`;
  return "0.0";
}

/** Inteiro com sinal explícito */
function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Δ de peso vs registro anterior, 1 casa, com sinal */
function formatDelta(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const abs = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `+${abs}`;
  if (rounded < 0) return `-${abs}`;
  return "0.0";
}

function WeightChart({ logs }: { logs: WeightLog[] }) {
  // Ordena por data ascendente
  const points = useMemo(() => {
    return [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  }, [logs]);

  if (points.length < 2) {
    return (
      <p className="text-sm text-muted">
        Registre mais pesos para ver o gráfico.
      </p>
    );
  }

  const W = 320;
  const H = 140;
  const padX = 8;
  const padY = 14;

  const weights = points.map((p) => p.weight_kg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;

  const n = points.length;
  const coords = points.map((p, i) => {
    const x = padX + (i / (n - 1)) * (W - padX * 2);
    const y = padY + (1 - (p.weight_kg - minW) / range) * (H - padY * 2);
    return { x, y };
  });

  const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-40 w-full text-accent"
      preserveAspectRatio="none"
      role="img"
      aria-label="Gráfico de evolução do peso"
    >
      {/* eixos discretos */}
      <line
        x1={padX}
        y1={H - padY}
        x2={W - padX}
        y2={H - padY}
        className="stroke-border"
        strokeWidth={1}
      />
      <line
        x1={padX}
        y1={padY}
        x2={padX}
        y2={H - padY}
        className="stroke-border"
        strokeWidth={1}
      />
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2.5} fill="currentColor" />
      ))}
    </svg>
  );
}

export default function WeightTracker() {
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [weight, setWeight] = useState("");
  const [loggedOn, setLoggedOn] = useState(todayIso());
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  async function loadLogs() {
    try {
      const res = await fetch("/api/weight");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao carregar pesos");
      setLogs(body as WeightLog[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    setApplyMessage(null);
    setApplyError(null);

    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) {
      setSaveError("Informe um peso válido (maior que zero).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight_kg: w,
          logged_on: loggedOn || todayIso(),
          note: note.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao registrar peso");
      setAnalysis((body.analysis as Analysis | null) ?? null);
      setSaved(true);
      setNote("");
      await loadLogs();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Falha ao registrar peso");
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyAdjustment() {
    if (!analysis) return;
    setApplyError(null);
    setApplyMessage(null);
    setApplying(true);
    try {
      const res = await fetch("/api/weight/apply-adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: analysis.suggestedDelta }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao aplicar ajuste");
      setApplyMessage(
        `Metas atualizadas (ajuste total: ${formatSigned(body.kcal_adjustment)} kcal/dia).`,
      );
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Falha ao aplicar ajuste");
    } finally {
      setApplying(false);
    }
  }

  // Histórico ordenado por data desc, com Δ vs registro anterior (mais antigo)
  const history = useMemo(() => {
    const asc = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
    const desc = [...asc].reverse();
    return desc.map((log) => {
      const idxAsc = asc.findIndex((l) => l.id === log.id);
      const prev = idxAsc > 0 ? asc[idxAsc - 1] : null;
      const delta = prev ? log.weight_kg - prev.weight_kg : null;
      return { log, delta };
    });
  }, [logs]);

  if (loadError) {
    return <p className="text-sm text-off-target">{loadError}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Registrar peso — ação primária */}
      <div
        data-testid="weight-form"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold text-foreground">Registrar peso</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={fieldLabel}>
            Peso (kg)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={weight}
              onChange={(e) => {
                setSaved(false);
                setWeight(e.target.value);
              }}
              placeholder="Ex.: 79.5"
              data-testid="weight-input"
              className={fieldInput}
            />
          </label>
          <label className={fieldLabel}>
            Data
            <input
              type="date"
              value={loggedOn}
              onChange={(e) => {
                setSaved(false);
                setLoggedOn(e.target.value);
              }}
              data-testid="weight-date"
              className={fieldInput}
            />
          </label>
        </div>
        <label className={fieldLabel}>
          Nota (opcional)
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: pós-treino, em jejum..."
            data-testid="weight-note"
            className={fieldInput}
          />
        </label>

        {saveError && <p className="text-xs text-off-target">{saveError}</p>}
        {saved && !saveError && (
          <p className="text-xs text-on-target">Peso registrado.</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          data-testid="weight-save"
          className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
        >
          {saving ? "Salvando..." : "Registrar peso"}
        </button>
      </div>

      {/* Card de tendência — aparece após um registro com análise */}
      {analysis && (
        <div
          data-testid="weight-trend"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <h2 className="text-sm font-semibold text-foreground">Tendência</h2>

          {analysis.actualKgPerWeek != null && (
            <p className="text-sm text-foreground">
              Ritmo atual:{" "}
              <span className="font-semibold">
                {formatRate(analysis.actualKgPerWeek)} kg/sem
              </span>{" "}
              <span className="text-muted">
                · previsto: {formatRate(analysis.expectedKgPerWeek)} kg/sem
              </span>
            </p>
          )}

          {analysis.status === "insufficient_data" && (
            <p className="text-sm text-muted">
              Registre por ~2 semanas para uma sugestão confiável.
            </p>
          )}

          {analysis.status === "on_track" && (
            <p className="text-sm text-on-target">No rumo certo — siga assim.</p>
          )}

          {(analysis.status === "eat_less" || analysis.status === "eat_more") && (
            <div className="flex flex-col gap-3 rounded-lg bg-accent/10 p-3">
              <p className="text-sm text-foreground">
                Sugestão:{" "}
                <span className="font-semibold text-accent">
                  {formatSigned(analysis.suggestedDelta)} kcal/dia
                </span>
              </p>
              {applyError && (
                <p className="text-xs text-off-target">{applyError}</p>
              )}
              {applyMessage && (
                <p className="text-xs text-on-target">{applyMessage}</p>
              )}
              <button
                type="button"
                onClick={handleApplyAdjustment}
                disabled={applying}
                data-testid="weight-apply-adjustment"
                className="rounded-lg bg-accent py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
              >
                {applying ? "Aplicando..." : "Aplicar ajuste às metas"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Gráfico */}
      <div
        data-testid="weight-chart"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold text-foreground">Evolução</h2>
        <WeightChart logs={logs} />
      </div>

      {/* Histórico */}
      <div
        data-testid="weight-history"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold text-foreground">Histórico</h2>
        {loading ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted">Nenhum peso registrado ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {history.map(({ log, delta }) => (
              <li
                key={log.id}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="w-12 shrink-0 tabular-nums text-muted">
                  {formatDateBr(log.logged_on)}
                </span>
                <span className="w-16 shrink-0 font-medium tabular-nums text-foreground">
                  {log.weight_kg} kg
                </span>
                <span
                  className={
                    "w-14 shrink-0 tabular-nums " +
                    (delta == null
                      ? "text-muted"
                      : delta < 0
                        ? "text-on-target"
                        : delta > 0
                          ? "text-off-target"
                          : "text-muted")
                  }
                >
                  {delta == null ? "—" : `${formatDelta(delta)} kg`}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {log.note}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/weight/${log.id}`, { method: "DELETE" });
                    await loadLogs();
                  }}
                  aria-label={`Excluir registro de ${formatDateBr(log.logged_on)}`}
                  data-testid="weight-delete"
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-off-target"
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
