"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Food, Macros } from "@/lib/types";
import { itemGrams, sumMacros } from "@/lib/nutrition/macros";

type ProposalItem = {
  food_id: string;
  quantity: number;
  unit: "g" | "unit";
  food: Food;
};

type ProposalOption = {
  label: string;
  items: ProposalItem[];
  macros: Macros;
};

type ProposalSlot = {
  name: string;
  slot: number;
  options: ProposalOption[];
};

type Proposal = { slots: ProposalSlot[] };

type WeekEntry = {
  day_type_id: string;
  name: string;
  proposal?: Proposal;
  error?: string;
};

type ApplyFeedback = {
  applied: number;
  failed: { day_type_id: string; error: string }[];
};

function itemDisplay(item: ProposalItem) {
  if (item.unit === "unit") {
    const grams = itemGrams(item, item.food);
    return `${item.quantity} ${item.food.unit_name ?? "unidade"} (${grams}g)`;
  }
  return `${item.quantity} g`;
}

function SlotCard({
  slot,
  activeIndex,
  onSelectOption,
}: {
  slot: ProposalSlot;
  activeIndex: number;
  onSelectOption: (slot: number, optionIndex: number) => void;
}) {
  const option = slot.options[activeIndex] ?? slot.options[0];
  const hasOptions = slot.options.length > 1;

  return (
    <div
      data-testid="week-slot"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h5 className="truncate text-sm font-semibold text-foreground">
          {slot.name}
        </h5>
        <span className="shrink-0 text-xs text-muted">
          {option?.macros.kcal ?? 0} kcal · P {option?.macros.protein_g ?? 0}g
        </span>
      </div>

      {hasOptions && (
        <div
          role="tablist"
          aria-label={`Opções de ${slot.name}`}
          className="flex gap-1.5 overflow-x-auto pb-0.5"
        >
          {slot.options.map((opt, oi) => {
            const active = oi === activeIndex;
            return (
              <button
                key={opt.label}
                type="button"
                role="tab"
                data-testid="week-option-tab"
                aria-pressed={active}
                aria-selected={active}
                onClick={() => onSelectOption(slot.slot, oi)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "bg-background text-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {(option?.items.length ?? 0) === 0 && (
          <p className="text-xs text-muted">Nenhum alimento sugerido.</p>
        )}
        {option?.items.map((item, ii) => (
          <div
            key={`${item.food_id}:${ii}`}
            data-testid="week-item"
            className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate text-foreground">
              {item.food.name}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {itemDisplay(item)}
            </span>
          </div>
        ))}
      </div>

      {option && (
        <p className="text-xs text-muted">
          {option.macros.kcal} kcal · P {option.macros.protein_g}g · C{" "}
          {option.macros.carbs_g}g · G {option.macros.fat_g}g
        </p>
      )}
    </div>
  );
}

function DayTypeSection({
  entry,
  entryKey,
  activeOptions,
  onSelectOption,
}: {
  entry: WeekEntry;
  entryKey: string;
  activeOptions: Record<string, number>;
  onSelectOption: (entryKey: string, slot: number, optionIndex: number) => void;
}) {
  const dayTotal = useMemo(() => {
    if (!entry.proposal) return null;
    return sumMacros(
      entry.proposal.slots.map((s) => {
        const idx = activeOptions[`${entryKey}:${s.slot}`] ?? 0;
        return (
          s.options[idx]?.macros ??
          s.options[0]?.macros ?? {
            kcal: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
          }
        );
      }),
    );
  }, [entry.proposal, activeOptions, entryKey]);

  return (
    <section
      data-testid="week-day-type"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-foreground">{entry.name}</h4>
        {entry.proposal && dayTotal && (
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
            {dayTotal.kcal} kcal · P {dayTotal.protein_g}g
          </span>
        )}
        {entry.error && (
          <span className="rounded-full bg-off-target/15 px-2.5 py-1 text-xs font-semibold text-off-target">
            não será aplicada
          </span>
        )}
      </div>

      {entry.error && (
        <p className="text-xs text-off-target">{entry.error}</p>
      )}

      {entry.proposal && (
        <div className="flex flex-col gap-3">
          {entry.proposal.slots.map((slot) => (
            <SlotCard
              key={slot.slot}
              slot={slot}
              activeIndex={activeOptions[`${entryKey}:${slot.slot}`] ?? 0}
              onSelectOption={(s, oi) => onSelectOption(entryKey, s, oi)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function WeekMenuGenerator() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<WeekEntry[] | null>(null);
  const [activeOptions, setActiveOptions] = useState<Record<string, number>>({});

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyFeedback | null>(null);

  const applicable = useMemo(
    () => (week ?? []).filter((e) => !!e.proposal),
    [week],
  );

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setApplyError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/week/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals: 5, options: 2 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao gerar a semana");
      setWeek((body.week ?? []) as WeekEntry[]);
      setActiveOptions({});
    } catch (err) {
      setWeek(null);
      setError(err instanceof Error ? err.message : "Falha ao gerar a semana");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (applicable.length === 0) return;
    if (!window.confirm("Isso substitui o cardápio de cada tipo de dia. Continuar?"))
      return;
    setApplying(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const res = await fetch("/api/week/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: applicable.map((e) => ({
            day_type_id: e.day_type_id,
            proposal: e.proposal,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao aplicar a semana");
      setApplyResult({
        applied: Number(body.applied ?? 0),
        failed: (body.failed ?? []) as ApplyFeedback["failed"],
      });
      router.refresh();
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : "Falha ao aplicar a semana",
      );
    } finally {
      setApplying(false);
    }
  }

  function handleSelectOption(entryKey: string, slot: number, optionIndex: number) {
    setActiveOptions((prev) => ({ ...prev, [`${entryKey}:${slot}`]: optionIndex }));
  }

  const failedName = (id: string) =>
    week?.find((e) => e.day_type_id === id)?.name ?? id;

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-dashed border-accent/40 bg-accent/5 p-4">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm text-accent"
        >
          ✨
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Cardápio da semana
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            A IA monta um cardápio para cada tipo de dia do seu padrão semanal.
            Revise e aplique de uma vez.
          </p>
        </div>
      </div>

      {!week && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          data-testid="week-generate"
          className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
        >
          {loading ? "Gerando a semana…" : "Gerar semana com IA"}
        </button>
      )}

      {error && <p className="text-xs text-off-target">{error}</p>}

      {week && (
        <div data-testid="week-review" className="flex flex-col gap-4 pt-1">
          {week.length === 0 && (
            <p className="text-sm text-muted">
              Nenhum tipo de dia no padrão semanal.
            </p>
          )}

          {week.map((entry, i) => (
            <DayTypeSection
              key={`${entry.day_type_id}:${i}`}
              entry={entry}
              entryKey={`${entry.day_type_id}:${i}`}
              activeOptions={activeOptions}
              onSelectOption={handleSelectOption}
            />
          ))}

          {applyError && <p className="text-xs text-off-target">{applyError}</p>}

          {applyResult && (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium text-on-target">
                Semana aplicada.{" "}
                <span className="text-muted">
                  {applyResult.applied} tipo(s) de dia atualizado(s).
                </span>
              </p>
              {applyResult.failed.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-off-target">
                  {applyResult.failed.map((f) => (
                    <li key={f.day_type_id}>
                      {failedName(f.day_type_id)}: {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || applicable.length === 0}
              data-testid="week-apply"
              className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:flex-1"
            >
              {applying
                ? "Aplicando…"
                : `Aplicar semana${
                    applicable.length ? ` (${applicable.length})` : ""
                  }`}
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || applying}
              data-testid="week-regenerate"
              className="rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground transition-opacity disabled:opacity-60 sm:flex-1"
            >
              {loading ? "Gerando a semana…" : "Gerar novamente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
