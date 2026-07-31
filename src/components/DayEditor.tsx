"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { DayType, Food, Meal, MealItem } from "@/lib/types";
import {
  itemGrams,
  itemMacros,
  mealMacros,
  sumMacros,
  compareToTarget,
} from "@/lib/nutrition/macros";

type MealItemWithFood = MealItem & { food: Food };
type MealWithItems = Meal & { meal_items: MealItemWithFood[] };

// folga em torno da meta para considerar "dentro" (verde) vs "fora" (vermelho)
const MACRO_TOLERANCE = 0.1;

function isOnTarget(diff: number, target: number) {
  if (target > 0) return Math.abs(diff) <= target * MACRO_TOLERANCE;
  return diff === 0;
}

function barPercent(planned: number, target: number) {
  if (target > 0) return Math.min(100, Math.max(0, (planned / target) * 100));
  return planned > 0 ? 100 : 0;
}

function MacroBar({
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
          <span
            data-testid={testId}
            className="font-semibold text-foreground"
          >
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

function AddItemForm({
  onAdd,
}: {
  onAdd: (food: Food, quantity: number, unit: "g" | "unit") => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [qty, setQty] = useState("100");
  const [unit, setUnit] = useState<"g" | "unit">("g");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasUnitOption = Boolean(selected?.unit_grams);

  useEffect(() => {
    if (selected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/foods?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Falha ao buscar alimentos");
          setResults((body as Food[]).slice(0, 8));
        })
        .catch((err) => {
          if (err.name !== "AbortError") setResults([]);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  function pick(food: Food) {
    setSelected(food);
    setQuery(food.name);
    setResults([]);
    const defaultUnit: "g" | "unit" = food.unit_grams ? "unit" : "g";
    setUnit(defaultUnit);
    setQty(defaultUnit === "unit" ? "1" : "100");
  }

  function changeUnit(next: "g" | "unit") {
    setUnit(next);
    setQty(next === "unit" ? "1" : "100");
  }

  function reset() {
    setSelected(null);
    setQuery("");
    setQty("100");
    setUnit("g");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Escolha um alimento na busca.");
      return;
    }
    const quantity = Number(qty);
    if (Number.isNaN(quantity) || quantity <= 0) {
      setError(
        unit === "unit"
          ? "Informe uma quantidade válida."
          : "Informe uma quantidade em gramas válida.",
      );
      return;
    }
    const finalUnit: "g" | "unit" = selected.unit_grams ? unit : "g";
    setAdding(true);
    try {
      await onAdd(selected, quantity, finalUnit);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar item");
    } finally {
      setAdding(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2.5"
    >
      <div className="relative">
        <input
          type="search"
          inputMode="search"
          placeholder="Buscar alimento (ex.: arroz, frango...)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          data-testid="item-food-search"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {!selected && query.trim() && (
          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-sm">
            {searching && (
              <p className="px-3 py-2 text-xs text-muted">Buscando...</p>
            )}
            {!searching && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted">
                Nenhum alimento encontrado.
              </p>
            )}
            {results.map((food) => (
              <button
                type="button"
                key={food.id}
                onClick={() => pick(food)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-background"
              >
                <span className="truncate">{food.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {food.kcal_per_100g} kcal/100g
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {hasUnitOption && (
        <div
          data-testid="item-unit-toggle"
          role="group"
          aria-label="Unidade de medida"
          className="flex rounded-lg border border-border bg-background p-0.5 text-xs font-medium"
        >
          <button
            type="button"
            onClick={() => changeUnit("unit")}
            aria-pressed={unit === "unit"}
            className={`flex-1 rounded-md px-2 py-1.5 transition-colors ${
              unit === "unit"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {selected?.unit_name ?? "unidade"}
          </button>
          <button
            type="button"
            onClick={() => changeUnit("g")}
            aria-pressed={unit === "g"}
            className={`flex-1 rounded-md px-2 py-1.5 transition-colors ${
              unit === "g"
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            gramas
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          data-testid="item-qty-input"
          placeholder={unit === "unit" ? "qtd" : "g"}
          className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {!hasUnitOption && <span className="text-xs text-muted">gramas</span>}
        <button
          type="submit"
          disabled={adding || !selected}
          data-testid="item-add"
          className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
        >
          {adding ? "Adicionando..." : "Adicionar"}
        </button>
      </div>
      {error && <p className="text-xs text-off-target">{error}</p>}
    </form>
  );
}

function ItemRow({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: MealItemWithFood;
  onUpdateQty: (item: MealItemWithFood, quantity: number) => Promise<void>;
  onRemove: (item: MealItemWithFood) => void;
}) {
  const [qty, setQty] = useState(String(item.quantity));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const n = Number(qty);
    if (Number.isNaN(n) || n <= 0 || n === item.quantity) {
      setQty(String(item.quantity));
      return;
    }
    setSaving(true);
    try {
      await onUpdateQty(item, n);
    } finally {
      setSaving(false);
    }
  }

  const m = itemMacros(item, item.food);
  const unitLabel = item.unit === "unit" ? item.food.unit_name ?? "unidade" : "g";
  const displayText =
    item.unit === "unit"
      ? `${item.quantity} ${item.food.unit_name ?? "unidade"} (${itemGrams(item, item.food)}g)`
      : `${item.quantity} g`;

  return (
    <div
      data-testid="meal-item-row"
      className="flex items-center gap-2 rounded-lg bg-background px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{item.food.name}</p>
        <p className="text-xs text-muted">
          <span data-testid="item-display">{displayText}</span>
          {" · "}
          {m.kcal} kcal · P {m.protein_g}g · C {m.carbs_g}g · G {m.fat_g}g
        </p>
      </div>
      <input
        type="number"
        inputMode="decimal"
        min={1}
        step="any"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={saving}
        data-testid="item-qty-edit"
        className="w-16 shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <span className="shrink-0 text-xs text-muted">{unitLabel}</span>
      <button
        type="button"
        onClick={() => onRemove(item)}
        aria-label={`Remover ${item.food.name}`}
        className="shrink-0 text-lg leading-none text-off-target hover:opacity-70"
      >
        ×
      </button>
    </div>
  );
}

function OptionTabs({
  options,
  onSelect,
}: {
  options: MealWithItems[];
  onSelect: (meal: MealWithItems) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Opções da refeição"
      className="flex gap-1.5 overflow-x-auto pb-0.5"
    >
      {options.map((option) => {
        const active = option.selected;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            data-testid="option-tab"
            aria-pressed={active}
            aria-selected={active}
            onClick={() => onSelect(option)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
              active
                ? "bg-accent text-white"
                : "bg-background text-muted hover:text-foreground"
            }`}
          >
            {active && <span aria-hidden="true">✓ </span>}
            {option.option_label}
          </button>
        );
      })}
    </div>
  );
}

export default function DayEditor({ dayType }: { dayType: DayType }) {
  const [meals, setMeals] = useState<MealWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newMealName, setNewMealName] = useState("");
  const [addingMeal, setAddingMeal] = useState(false);
  const [mealError, setMealError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/meals?dayTypeId=${dayType.id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao carregar refeições");
        if (!cancelled) {
          setMeals(body as MealWithItems[]);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dayType.id]);

  const nextSlot = meals.length
    ? Math.max(...meals.map((m) => m.slot)) + 1
    : 0;

  async function handleAddMeal(e: FormEvent) {
    e.preventDefault();
    setMealError(null);
    const name = newMealName.trim();
    if (!name) {
      setMealError("Informe o nome da refeição.");
      return;
    }
    setAddingMeal(true);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day_type_id: dayType.id,
          name,
          order: nextSlot,
          slot: nextSlot,
          option_label: "Opção 1",
          selected: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao criar refeição");
      setMeals((prev) => [...prev, { ...(body as Meal), meal_items: [] }]);
      setNewMealName("");
    } catch (err) {
      setMealError(err instanceof Error ? err.message : "Falha ao criar refeição");
    } finally {
      setAddingMeal(false);
    }
  }

  async function handleRemoveMeal(meal: MealWithItems) {
    if (!window.confirm(`Excluir a refeição "${meal.name}" e todos os itens dela?`))
      return;
    const res = await fetch(`/api/meals/${meal.id}`, { method: "DELETE" });
    if (res.ok) {
      setMeals((prev) => prev.filter((m) => m.id !== meal.id));
    }
  }

  async function handleSelectOption(meal: MealWithItems) {
    if (meal.selected) return;
    const snapshot = meals;
    setMeals((prev) =>
      prev.map((m) =>
        m.day_type_id === meal.day_type_id && m.slot === meal.slot
          ? { ...m, selected: m.id === meal.id }
          : m,
      ),
    );
    try {
      const res = await fetch(`/api/meals/${meal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: true }),
      });
      if (!res.ok) throw new Error("Falha ao selecionar opção");
    } catch (err) {
      setMeals(snapshot);
      setError(err instanceof Error ? err.message : "Falha ao selecionar opção");
    }
  }

  async function handleAddItem(
    meal: MealWithItems,
    food: Food,
    quantity: number,
    unit: "g" | "unit",
  ) {
    const res = await fetch("/api/meal-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_id: meal.id,
        food_id: food.id,
        quantity,
        unit,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Falha ao adicionar item");
    const item = body as MealItemWithFood;
    setMeals((prev) =>
      prev.map((m) =>
        m.id === meal.id ? { ...m, meal_items: [...m.meal_items, item] } : m,
      ),
    );
  }

  async function handleUpdateItemQty(item: MealItemWithFood, quantity: number) {
    const res = await fetch("/api/meal-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, quantity }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Falha ao atualizar item");
    const updated = body as MealItemWithFood;
    setMeals((prev) =>
      prev.map((m) => ({
        ...m,
        meal_items: m.meal_items.map((it) =>
          it.id === updated.id ? updated : it,
        ),
      })),
    );
  }

  async function handleRemoveItem(item: MealItemWithFood) {
    const res = await fetch(`/api/meal-items?id=${item.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setMeals((prev) =>
        prev.map((m) => ({
          ...m,
          meal_items: m.meal_items.filter((it) => it.id !== item.id),
        })),
      );
    }
  }

  const dayTotal = sumMacros(
    meals.filter((m) => m.selected).map((m) => mealMacros(m.meal_items)),
  );
  const diffs = compareToTarget(dayTotal, dayType);

  const groups = useMemo(() => {
    const map = new Map<number, MealWithItems[]>();
    for (const m of meals) {
      const arr = map.get(m.slot) ?? [];
      arr.push(m);
      map.set(m.slot, arr);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slot, options]) => {
        const sorted = [...options].sort((a, b) =>
          a.option_label.localeCompare(b.option_label),
        );
        const active = sorted.find((o) => o.selected) ?? sorted[0];
        return { slot, options: sorted, active };
      });
  }, [meals]);

  return (
    <div className="flex flex-col gap-5">
      {/* Total do dia vs meta — foco visual da tela */}
      <section
        data-testid="day-total-card"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Total do dia vs meta
          </h2>
          <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {dayType.name}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MacroBar
            label="Calorias"
            unit=" kcal"
            planned={dayTotal.kcal}
            target={dayType.target_kcal}
            diff={diffs.kcal}
            testId="day-total-kcal"
          />
          <MacroBar
            label="Proteína"
            unit="g"
            planned={dayTotal.protein_g}
            target={dayType.target_protein_g}
            diff={diffs.protein_g}
            testId="day-total-protein"
          />
          <MacroBar
            label="Carboidrato"
            unit="g"
            planned={dayTotal.carbs_g}
            target={dayType.target_carbs_g}
            diff={diffs.carbs_g}
            testId="day-total-carbs"
          />
          <MacroBar
            label="Gordura"
            unit="g"
            planned={dayTotal.fat_g}
            target={dayType.target_fat_g}
            diff={diffs.fat_g}
            testId="day-total-fat"
          />
        </div>
      </section>

      {/* Nova refeição */}
      <form onSubmit={handleAddMeal} className="flex items-center gap-2">
        <input
          type="text"
          value={newMealName}
          onChange={(e) => setNewMealName(e.target.value)}
          placeholder="Nome da refeição (ex.: Almoço)"
          data-testid="meal-name-input"
          className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={addingMeal}
          data-testid="add-meal"
          className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
        >
          {addingMeal ? "..." : "+ Refeição"}
        </button>
      </form>
      {mealError && <p className="text-xs text-off-target">{mealError}</p>}

      {loading && <p className="text-sm text-muted">Carregando refeições...</p>}
      {error && <p className="text-sm text-off-target">{error}</p>}
      {!loading && !error && meals.length === 0 && (
        <p className="text-sm text-muted">
          Nenhuma refeição ainda. Adicione a primeira acima.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const meal = group.active;
          const subtotal = mealMacros(meal.meal_items);
          const hasOptions = group.options.length > 1;
          return (
            <div
              key={group.slot}
              data-testid="meal-card"
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {meal.name}
                  </h3>
                  <p className="text-xs text-muted">
                    {subtotal.kcal} kcal · P {subtotal.protein_g}g · C{" "}
                    {subtotal.carbs_g}g · G {subtotal.fat_g}g
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMeal(meal)}
                  className="shrink-0 text-xs text-off-target hover:underline"
                >
                  {hasOptions ? "Excluir opção" : "Excluir refeição"}
                </button>
              </div>

              {hasOptions && (
                <OptionTabs options={group.options} onSelect={handleSelectOption} />
              )}

              <div className="flex flex-col gap-1.5">
                {meal.meal_items.length === 0 && (
                  <p className="text-xs text-muted">Nenhum alimento ainda.</p>
                )}
                {meal.meal_items.map((item) => (
                  <ItemRow
                    key={`${item.id}:${item.quantity}:${item.unit}`}
                    item={item}
                    onUpdateQty={handleUpdateItemQty}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </div>

              <AddItemForm
                onAdd={(food, quantity, unit) =>
                  handleAddItem(meal, food, quantity, unit)
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
