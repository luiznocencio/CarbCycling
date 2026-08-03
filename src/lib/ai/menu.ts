import { openaiClient } from "@/lib/ai/openai";
import { classifyFood, coherenceGuidance, coherenceRulesGeneral, type MealType } from "@/lib/nutrition/coherence";

export type RawItem = { food_id: string; quantity: number; unit: "g" | "unit" };
export type RawMenu = {
  slots: { name: string; options: { items: RawItem[] }[] }[];
};

export type PoolFood = {
  id: string;
  name: string;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  unit_name: string | null;
  unit_grams: number | null;
};

export function validateMenu(raw: RawMenu, poolIds: Set<string>): RawMenu {
  const slots = raw.slots.map((slot) => {
    const options = slot.options
      .map((opt) => ({
        items: opt.items.filter(
          (it) => poolIds.has(it.food_id) && (it.unit === "g" || it.unit === "unit") && it.quantity > 0,
        ),
      }))
      .filter((opt) => opt.items.length > 0);
    if (options.length === 0) throw new Error(`Refeição "${slot.name}" sem opções válidas`);
    return { name: slot.name, options };
  });
  return { slots };
}

export function validateItems(
  rawItems: RawItem[],
  pool: PoolFood[],
  include: string[],
  exclude: string[],
): RawItem[] {
  const byId = new Map(pool.map((f) => [f.id, f]));
  const excludeSet = new Set(exclude);
  const items = rawItems.filter(
    (it) =>
      byId.has(it.food_id) &&
      !excludeSet.has(it.food_id) &&
      (it.unit === "g" || it.unit === "unit") &&
      it.quantity > 0,
  );
  const present = new Set(items.map((i) => i.food_id));
  for (const id of include) {
    const f = byId.get(id);
    if (f && !present.has(id) && !excludeSet.has(id)) {
      items.push(
        f.unit_grams
          ? { food_id: id, quantity: 1, unit: "unit" }
          : { food_id: id, quantity: 50, unit: "g" },
      );
    }
  }
  return items;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["slots"],
  properties: {
    slots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "options"],
        properties: {
          name: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["items"],
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["food_id", "quantity", "unit"],
                    properties: {
                      food_id: { type: "string" },
                      quantity: { type: "number" },
                      unit: { type: "string", enum: ["g", "unit"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const OPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["food_id", "quantity", "unit"],
        properties: {
          food_id: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", enum: ["g", "unit"] },
        },
      },
    },
  },
} as const;

export async function suggestMealOption(input: {
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  pool: PoolFood[];
  include: string[];
  exclude: string[];
  guidance?: string;
  mealType?: MealType;
}): Promise<RawItem[]> {
  const client = openaiClient();
  const excludeSet = new Set(input.exclude);
  const usablePool = input.pool.filter((f) => !excludeSet.has(f.id));
  const BASE =
    "Você é nutricionista. Monte UMA opção de refeição brasileira que APROXIME a meta de macros " +
    "(priorize bater a proteína). Use SOMENTE food_id do pool. Inclua OBRIGATORIAMENTE os food_id de 'incluir'. " +
    "quantity é em gramas (unit='g') ou nº de unidades (unit='unit', só se o alimento tiver unit_grams). " +
    coherenceRulesGeneral() +
    (input.mealType ? " " + coherenceGuidance(input.mealType) : "") +
    " Cada alimento traz 'categoria' — use para montar um prato coerente.";
  const system = BASE + (input.guidance ? " " + input.guidance : "");
  const poolWithCat = usablePool.map((f) => ({ ...f, categoria: classifyFood(f) }));
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({ meta: input.target, incluir: input.include, pool: poolWithCat }),
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "meal_option", strict: true, schema: OPTION_SCHEMA } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  const raw = JSON.parse(content) as { items: RawItem[] };
  const items = validateItems(raw.items ?? [], input.pool, input.include, input.exclude);
  if (items.length === 0) throw new Error("A IA não retornou itens válidos");
  return items;
}

export async function generateMenu(input: {
  subTargets: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; mealType?: MealType }[];
  options: number;
  pool: { id: string; name: string; kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number; unit_name: string | null; unit_grams: number | null }[];
  guidance?: string;
}): Promise<RawMenu> {
  const client = openaiClient();
  const BASE =
    "Você é nutricionista. Monte um cardápio brasileiro. Para CADA refeição, gere exatamente " +
    `${input.options} opções DISTINTAS. Cada opção é uma lista de itens que APROXIMA a meta de macros ` +
    "daquela refeição (priorize bater a PROTEÍNA). Use SOMENTE alimentos do pool, referenciando food_id. " +
    "quantity é em gramas quando unit='g', ou número de unidades quando unit='unit' (só use unit='unit' " +
    "se o alimento tiver unit_grams). Varie os alimentos entre as opções. " +
    coherenceRulesGeneral() +
    " Cada refeição tem 'tipo' e 'molde'; siga o molde do tipo. Cada alimento traz 'categoria' — use para montar pratos coerentes.";
  const system = BASE + (input.guidance ? " " + input.guidance : "");
  const refeicoes = input.subTargets.map((s) => ({
    name: s.name, kcal: s.kcal, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g,
    tipo: s.mealType ?? null,
    molde: s.mealType ? coherenceGuidance(s.mealType) : null,
  }));
  const pool = input.pool.map((f) => ({ ...f, categoria: classifyFood(f) }));
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ refeicoes, pool }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "menu", strict: true, schema: SCHEMA } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  const raw = JSON.parse(content) as RawMenu;
  return validateMenu(raw, new Set(input.pool.map((f) => f.id)));
}
