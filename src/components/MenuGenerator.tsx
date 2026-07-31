"use client";

import { useMemo, useState } from "react";
import type { DayType, Food, Macros } from "@/lib/types";
import { compareToTarget, itemGrams, sumMacros } from "@/lib/nutrition/macros";

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

// mesma folga usada no editor de dia para marcar dentro/fora da meta
const MACRO_TOLERANCE = 0.1;

function isOnTarget(diff: number, target: number) {
  if (target > 0) return Math.abs(diff) <= target * MACRO_TOLERANCE;
  return diff === 0;
}

function barPercent(planned: number, target: number) {
  if (target > 0) return Math.min(100, Math.max(0, (planned / target) * 100));
  return planned > 0 ? 100 : 0;
}

function TotalBar({
  label,
  unit,
  planned,
  target,
  diff,
  testId,
}: {
  label: string;
  unit: string;
  planned: number;
  target: number;
  diff: number;
  testId: string;
}) {
  const onTarget = isOnTarget(diff, target);
  const percent = barPercent(planned, target);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs text-muted">
        <span>{label}</span>
        <span>
          <span data-testid={testId} className="font-semibold text-foreground">
            {planned}
          </span>
          {unit} <span className="text-muted">/ {target}{unit} meta</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            onTarget ? "bg-on-target" : "bg-off-target"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={`text-[11px] font-medium ${
          onTarget ? "text-on-target" : "text-off-target"
        }`}
      >
        {diff > 0 ? `+${diff}` : diff}
        {unit} · {onTarget ? "dentro da meta" : "fora da meta"}
      </span>
    </div>
  );
}

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
  onSelectOption: (slotIndex: number, optionIndex: number) => void;
}) {
  const option = slot.options[activeIndex] ?? slot.options[0];
  const hasOptions = slot.options.length > 1;

  return (
    <div
      data-testid="proposal-slot"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="truncate text-sm font-semibold text-foreground">
          {slot.name}
        </h4>
        <span className="shrink-0 text-xs text-muted">
          {option.macros.kcal} kcal
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
                data-testid="proposal-option-tab"
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
        {option.items.length === 0 && (
          <p className="text-xs text-muted">Nenhum alimento sugerido.</p>
        )}
        {option.items.map((item, ii) => (
          <div
            key={`${item.food_id}:${ii}`}
            data-testid="proposal-item"
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

      <p className="text-xs text-muted">
        {option.macros.kcal} kcal · P {option.macros.protein_g}g · C{" "}
        {option.macros.carbs_g}g · G {option.macros.fat_g}g
      </p>
    </div>
  );
}

export default function MenuGenerator({ dayType }: { dayType: DayType }) {
  const [open, setOpen] = useState(false);
  const [mealsValue, setMealsValue] = useState("5");
  const [optionsValue, setOptionsValue] = useState("3");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [activeOptions, setActiveOptions] = useState<Record<number, number>>({});

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setApplyError(null);
    const mealsNum = Number(mealsValue);
    const optionsNum = Number(optionsValue);
    if (!Number.isFinite(mealsNum) || mealsNum < 1) {
      setError("Informe um número de refeições válido.");
      return;
    }
    if (!Number.isFinite(optionsNum) || optionsNum < 1) {
      setError("Informe um número de opções válido.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/day-types/${dayType.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals: mealsNum, options: optionsNum }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao gerar cardápio");
      setProposal(body.proposal as Proposal);
      setActiveOptions({});
    } catch (err) {
      setProposal(null);
      setError(err instanceof Error ? err.message : "Falha ao gerar cardápio");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposal) return;
    if (!window.confirm("Isso substitui o cardápio atual. Continuar?")) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`/api/day-types/${dayType.id}/apply-menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao aplicar cardápio");
      window.location.reload();
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : "Falha ao aplicar cardápio",
      );
      setApplying(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    setError(null);
    setApplyError(null);
  }

  function handleClose() {
    setOpen(false);
    setProposal(null);
    setError(null);
    setApplyError(null);
  }

  const dayTotal = useMemo(() => {
    if (!proposal) return null;
    return sumMacros(
      proposal.slots.map(
        (s) =>
          s.options[0]?.macros ?? {
            kcal: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
          },
      ),
    );
  }, [proposal]);
  const diffs = dayTotal ? compareToTarget(dayTotal, dayType) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm text-accent"
          >
            ✨
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Gerador de cardápio
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              A IA monta um cardápio a partir do seu pool de alimentos favoritos.
            </p>
          </div>
        </div>
        {open && (
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 text-xs font-medium text-muted hover:text-foreground"
          >
            Fechar
          </button>
        )}
      </div>

      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          data-testid="generate-open"
          className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
        >
          Gerar cardápio
        </button>
      )}

      {open && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Refeições
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={mealsValue}
                onChange={(e) => setMealsValue(e.target.value)}
                data-testid="generate-meals"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Opções por refeição
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={optionsValue}
                onChange={(e) => setOptionsValue(e.target.value)}
                data-testid="generate-options"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            data-testid="generate-run"
            className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
          >
            {loading ? "Gerando..." : "Gerar"}
          </button>

          {error && <p className="text-xs text-off-target">{error}</p>}

          {proposal && dayTotal && diffs && (
            <div data-testid="proposal" className="flex flex-col gap-4 pt-1">
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">
                    Proposta vs meta
                  </h4>
                  <span className="text-[11px] text-muted">
                    opção 1 de cada refeição
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TotalBar
                    label="Calorias"
                    unit=" kcal"
                    planned={dayTotal.kcal}
                    target={dayType.target_kcal}
                    diff={diffs.kcal}
                    testId="proposal-total-kcal"
                  />
                  <TotalBar
                    label="Proteína"
                    unit="g"
                    planned={dayTotal.protein_g}
                    target={dayType.target_protein_g}
                    diff={diffs.protein_g}
                    testId="proposal-total-protein"
                  />
                  <TotalBar
                    label="Carboidrato"
                    unit="g"
                    planned={dayTotal.carbs_g}
                    target={dayType.target_carbs_g}
                    diff={diffs.carbs_g}
                    testId="proposal-total-carbs"
                  />
                  <TotalBar
                    label="Gordura"
                    unit="g"
                    planned={dayTotal.fat_g}
                    target={dayType.target_fat_g}
                    diff={diffs.fat_g}
                    testId="proposal-total-fat"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {proposal.slots.map((slot) => (
                  <SlotCard
                    key={slot.slot}
                    slot={slot}
                    activeIndex={activeOptions[slot.slot] ?? 0}
                    onSelectOption={(slotIndex, optionIndex) =>
                      setActiveOptions((prev) => ({
                        ...prev,
                        [slotIndex]: optionIndex,
                      }))
                    }
                  />
                ))}
              </div>

              {applyError && (
                <p className="text-xs text-off-target">{applyError}</p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  data-testid="proposal-apply"
                  className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:flex-1"
                >
                  {applying ? "Aplicando..." : "Aplicar"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || applying}
                  data-testid="proposal-regenerate"
                  className="rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground transition-opacity disabled:opacity-60 sm:flex-1"
                >
                  {loading ? "Gerando..." : "Gerar de novo"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
