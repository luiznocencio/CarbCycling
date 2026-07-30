"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { DayType, Food, Meal, MealItem } from "@/lib/types";
import {
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
  onAdd: (food: Food, quantityG: number) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [qty, setQty] = useState("100");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }

  function reset() {
    setSelected(null);
    setQuery("");
    setQty("100");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Escolha um alimento na busca.");
      return;
    }
    const quantityG = Number(qty);
    if (Number.isNaN(quantityG) || quantityG <= 0) {
      setError("Informe uma quantidade em gramas válida.");
      return;
    }
    setAdding(true);
    try {
      await onAdd(selected, quantityG);
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

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step="any"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          data-testid="item-qty-input"
          placeholder="g"
          className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <span className="text-xs text-muted">gramas</span>
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
  onUpdateQty: (item: MealItemWithFood, quantityG: number) => Promise<void>;
  onRemove: (item: MealItemWithFood) => void;
}) {
  const [qty, setQty] = useState(String(item.quantity_g));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const n = Number(qty);
    if (Number.isNaN(n) || n <= 0 || n === item.quantity_g) {
      setQty(String(item.quantity_g));
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

  return (
    <div
      data-testid="meal-item-row"
      className="flex items-center gap-2 rounded-lg bg-background px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{item.food.name}</p>
        <p className="text-xs text-muted">
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
      <span className="shrink-0 text-xs text-muted">g</span>
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
          order: meals.length,
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

  async function handleAddItem(
    meal: MealWithItems,
    food: Food,
    quantityG: number,
  ) {
    const res = await fetch("/api/meal-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meal_id: meal.id,
        food_id: food.id,
        quantity_g: quantityG,
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

  async function handleUpdateItemQty(
    item: MealItemWithFood,
    quantityG: number,
  ) {
    const res = await fetch("/api/meal-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, quantity_g: quantityG }),
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

  const dayTotal = sumMacros(meals.map((m) => mealMacros(m.meal_items)));
  const diffs = compareToTarget(dayTotal, dayType);

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
        {meals.map((meal) => {
          const subtotal = mealMacros(meal.meal_items);
          return (
            <div
              key={meal.id}
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
                  Excluir refeição
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                {meal.meal_items.length === 0 && (
                  <p className="text-xs text-muted">Nenhum alimento ainda.</p>
                )}
                {meal.meal_items.map((item) => (
                  <ItemRow
                    key={`${item.id}:${item.quantity_g}`}
                    item={item}
                    onUpdateQty={handleUpdateItemQty}
                    onRemove={handleRemoveItem}
                  />
                ))}
              </div>

              <AddItemForm onAdd={(food, qty) => handleAddItem(meal, food, qty)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
