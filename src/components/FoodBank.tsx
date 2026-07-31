"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Food } from "@/lib/types";

type FormState = {
  name: string;
  kcal_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fat_per_100g: string;
  unit_name: string;
  unit_grams: string;
};

const emptyForm: FormState = {
  name: "",
  kcal_per_100g: "",
  protein_per_100g: "",
  carbs_per_100g: "",
  fat_per_100g: "",
  unit_name: "",
  unit_grams: "",
};

function toFormState(food: Food): FormState {
  return {
    name: food.name,
    kcal_per_100g: String(food.kcal_per_100g),
    protein_per_100g: String(food.protein_per_100g),
    carbs_per_100g: String(food.carbs_per_100g),
    fat_per_100g: String(food.fat_per_100g),
    unit_name: food.unit_name ?? "",
    unit_grams: food.unit_grams != null ? String(food.unit_grams) : "",
  };
}

type UnitFormState = { name: string; grams: string };

const emptyUnitForm: UnitFormState = { name: "", grams: "" };

function formatUnit(food: Food): string {
  if (food.unit_name && food.unit_grams != null) {
    return `1 ${food.unit_name} = ${food.unit_grams} g`;
  }
  return "sem unidade";
}

export default function FoodBank() {
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [unitEditingId, setUnitEditingId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<UnitFormState>(emptyUnitForm);
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  // Contador de mutações locais (criar/editar/excluir). Uma resposta de busca
  // que ficou obsoleta por uma mutação ocorrida durante o fetch é descartada,
  // para não sobrescrever a lista otimista (ex.: alimento recém-criado).
  const mutationRef = useRef(0);

  // busca com debounce
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const startedAt = mutationRef.current;
      setLoading(true);
      setListError(null);
      fetch(`/api/foods?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Falha ao buscar alimentos");
          if (mutationRef.current !== startedAt) return; // resposta obsoleta
          setFoods(body as Food[]);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setListError(err.message);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const title = useMemo(
    () => (editingId ? "Editar alimento" : "Novo alimento"),
    [editingId],
  );

  function openNewForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(food: Food) {
    setEditingId(food.id);
    setForm(toFormState(food));
    setFormError(null);
    setFormOpen(true);
    closeUnitEdit();
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function openUnitEdit(food: Food) {
    setUnitEditingId(food.id);
    setUnitForm({
      name: food.unit_name ?? "",
      grams: food.unit_grams != null ? String(food.unit_grams) : "",
    });
    setUnitError(null);
  }

  function closeUnitEdit() {
    setUnitEditingId(null);
    setUnitForm(emptyUnitForm);
    setUnitError(null);
  }

  async function handleUnitSave(foodId: string) {
    setUnitError(null);

    const trimmedName = unitForm.name.trim();
    const trimmedGrams = unitForm.grams.trim();
    const unitName = trimmedName === "" ? null : trimmedName;
    const unitGrams = trimmedGrams === "" ? null : Number(trimmedGrams);

    if ((unitName === null) !== (unitGrams === null)) {
      setUnitError("Informe nome e peso da unidade, ou deixe os dois em branco.");
      return;
    }
    if (unitGrams !== null && !(unitGrams > 0)) {
      setUnitError("Peso da unidade deve ser maior que zero.");
      return;
    }

    setUnitSaving(true);
    try {
      const res = await fetch(`/api/foods/${foodId}/unit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_name: unitName, unit_grams: unitGrams }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar unidade");

      mutationRef.current += 1;
      setFoods((prev) =>
        prev.map((f) =>
          f.id === foodId ? { ...f, unit_name: unitName, unit_grams: unitGrams } : f,
        ),
      );
      closeUnitEdit();
    } catch (err) {
      setUnitError(err instanceof Error ? err.message : "Falha ao salvar unidade");
    } finally {
      setUnitSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const name = form.name.trim();
    const kcal = Number(form.kcal_per_100g);
    const protein = Number(form.protein_per_100g);
    const carbs = Number(form.carbs_per_100g);
    const fat = Number(form.fat_per_100g);
    const trimmedUnitName = form.unit_name.trim();
    const trimmedUnitGrams = form.unit_grams.trim();
    const unitName = trimmedUnitName === "" ? null : trimmedUnitName;
    const unitGrams = trimmedUnitGrams === "" ? null : Number(trimmedUnitGrams);

    if (!name) {
      setFormError("Informe o nome do alimento.");
      return;
    }
    if ([kcal, protein, carbs, fat].some((n) => Number.isNaN(n) || n < 0)) {
      setFormError("Macros devem ser números válidos (0 ou mais).");
      return;
    }
    if ((unitName === null) !== (unitGrams === null)) {
      setFormError("Informe nome e peso da unidade, ou deixe os dois em branco.");
      return;
    }
    if (unitGrams !== null && !(unitGrams > 0)) {
      setFormError("Peso da unidade deve ser maior que zero.");
      return;
    }

    const payload = {
      name,
      kcal_per_100g: kcal,
      protein_per_100g: protein,
      carbs_per_100g: carbs,
      fat_per_100g: fat,
      unit_name: unitName,
      unit_grams: unitGrams,
    };

    setSaving(true);
    try {
      const url = editingId ? `/api/foods/${editingId}` : "/api/foods";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar alimento");

      mutationRef.current += 1;
      setFoods((prev) => {
        if (editingId) {
          return prev.map((f) => (f.id === editingId ? (body as Food) : f));
        }
        return [body as Food, ...prev];
      });
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao salvar alimento");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(food: Food) {
    if (!window.confirm(`Excluir "${food.name}"?`)) return;
    const res = await fetch(`/api/foods/${food.id}`, { method: "DELETE" });
    if (res.ok) {
      mutationRef.current += 1;
      setFoods((prev) => prev.filter((f) => f.id !== food.id));
      if (editingId === food.id) closeForm();
      if (unitEditingId === food.id) closeUnitEdit();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          fill="none"
        >
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M14 14L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          inputMode="search"
          placeholder="Buscar alimento (ex.: arroz, frango, aveia...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="food-search"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <button
        type="button"
        onClick={formOpen && !editingId ? closeForm : openNewForm}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-accent transition-colors hover:bg-card"
      >
        <span aria-hidden="true">{formOpen ? "×" : "+"}</span>
        {formOpen && !editingId ? "Fechar formulário" : "Cadastrar alimento próprio"}
      </button>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {editingId && (
              <button
                type="button"
                onClick={closeForm}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancelar
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs text-muted">
            Nome
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              data-testid="food-name-input"
              placeholder="Ex.: Panqueca de aveia"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Kcal /100g
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.kcal_per_100g}
                onChange={(e) =>
                  setForm((f) => ({ ...f, kcal_per_100g: e.target.value }))
                }
                data-testid="food-kcal-input"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Proteína (g)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.protein_per_100g}
                onChange={(e) =>
                  setForm((f) => ({ ...f, protein_per_100g: e.target.value }))
                }
                data-testid="food-protein-input"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Carbo (g)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.carbs_per_100g}
                onChange={(e) =>
                  setForm((f) => ({ ...f, carbs_per_100g: e.target.value }))
                }
                data-testid="food-carbs-input"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Gordura (g)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.fat_per_100g}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fat_per_100g: e.target.value }))
                }
                data-testid="food-fat-input"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border p-2.5">
            <span className="text-xs text-muted">Unidade prática (opcional)</span>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
                Nome
                <input
                  type="text"
                  placeholder="Ex.: ovo, fatia, unidade"
                  value={form.unit_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unit_name: e.target.value }))
                  }
                  data-testid="food-form-unit-name-input"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <label className="flex w-24 flex-col gap-1 text-xs text-muted">
                Peso (g)
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="50"
                  value={form.unit_grams}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, unit_grams: e.target.value }))
                  }
                  data-testid="food-form-unit-grams-input"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            </div>
          </div>

          {formError && <p className="text-xs text-off-target">{formError}</p>}

          <button
            type="submit"
            disabled={saving}
            data-testid="food-save"
            className="mt-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alimento"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {loading && <p className="text-sm text-muted">Buscando...</p>}
        {listError && <p className="text-sm text-off-target">{listError}</p>}
        {!loading && !listError && foods.length === 0 && (
          <p className="text-sm text-muted">Nenhum alimento encontrado.</p>
        )}

        {foods.map((food) => (
          <div
            key={food.id}
            data-testid="food-row"
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {food.name}
                </span>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                    (food.is_custom
                      ? "bg-accent/15 text-accent"
                      : "bg-muted/15 text-muted")
                  }
                >
                  {food.is_custom ? "Meu" : "TACO"}
                </span>
              </div>
              {food.is_custom && (
                <div className="flex shrink-0 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => openEditForm(food)}
                    className="text-accent hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(food)}
                    className="text-off-target hover:underline"
                  >
                    Excluir
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted">
              <div>
                <div className="font-semibold text-foreground">
                  {food.kcal_per_100g}
                </div>
                kcal
              </div>
              <div>
                <div className="font-semibold text-foreground">
                  {food.protein_per_100g}g
                </div>
                prot
              </div>
              <div>
                <div className="font-semibold text-foreground">
                  {food.carbs_per_100g}g
                </div>
                carbo
              </div>
              <div>
                <div className="font-semibold text-foreground">
                  {food.fat_per_100g}g
                </div>
                gord
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
              <span data-testid="food-unit-display" className="text-xs text-muted">
                {formatUnit(food)}
              </span>
              <button
                type="button"
                onClick={() =>
                  unitEditingId === food.id ? closeUnitEdit() : openUnitEdit(food)
                }
                className="shrink-0 text-xs text-accent hover:underline"
              >
                {unitEditingId === food.id ? "Cancelar" : "Editar unidade"}
              </button>
            </div>

            {unitEditingId === food.id && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2.5">
                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-[11px] text-muted">
                    Unidade
                    <input
                      type="text"
                      placeholder="Ex.: ovo, fatia, unidade"
                      value={unitForm.name}
                      onChange={(e) =>
                        setUnitForm((f) => ({ ...f, name: e.target.value }))
                      }
                      data-testid="food-unit-name-input"
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                  <label className="flex w-20 flex-col gap-1 text-[11px] text-muted">
                    Peso (g)
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      placeholder="50"
                      value={unitForm.grams}
                      onChange={(e) =>
                        setUnitForm((f) => ({ ...f, grams: e.target.value }))
                      }
                      data-testid="food-unit-grams-input"
                      className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                </div>
                {unitError && (
                  <p className="text-[11px] text-off-target">{unitError}</p>
                )}
                <button
                  type="button"
                  onClick={() => handleUnitSave(food.id)}
                  disabled={unitSaving}
                  data-testid="food-unit-save"
                  className="self-end rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-60"
                >
                  {unitSaving ? "Salvando..." : "Salvar unidade"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
