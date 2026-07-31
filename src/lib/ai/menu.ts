import { openaiClient } from "@/lib/ai/openai";

export type RawItem = { food_id: string; quantity: number; unit: "g" | "unit" };
export type RawMenu = {
  slots: { name: string; options: { items: RawItem[] }[] }[];
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

export async function generateMenu(input: {
  subTargets: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }[];
  options: number;
  pool: { id: string; name: string; kcal_per_100g: number; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number; unit_name: string | null; unit_grams: number | null }[];
}): Promise<RawMenu> {
  const client = openaiClient();
  const system =
    "Você é nutricionista. Monte um cardápio brasileiro. Para CADA refeição, gere exatamente " +
    `${input.options} opções DISTINTAS. Cada opção é uma lista de itens que APROXIMA a meta de macros ` +
    "daquela refeição (priorize bater a PROTEÍNA). Use SOMENTE alimentos do pool, referenciando food_id. " +
    "quantity é em gramas quando unit='g', ou número de unidades quando unit='unit' (só use unit='unit' " +
    "se o alimento tiver unit_grams). Varie os alimentos entre as opções.";
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ refeicoes: input.subTargets, pool: input.pool }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "menu", strict: true, schema: SCHEMA } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  const raw = JSON.parse(content) as RawMenu;
  return validateMenu(raw, new Set(input.pool.map((f) => f.id)));
}
