export type FoodCategory =
  | "proteina_animal" | "ovo" | "leguminosa" | "laticinio"
  | "carbo" | "pao" | "vegetal" | "fruta" | "gordura" | "oleaginosa" | "outro";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ordem = prioridade. Cada regra: se algum termo aparece no nome normalizado.
const KEYWORDS: [FoodCategory, string[]][] = [
  ["ovo", ["ovo", "ovos", "clara", "gema"]],
  ["leguminosa", ["feijao", "lentilha", "grao-de-bico", "grao de bico", "ervilha", "soja", "edamame", "tremoco", "vagem"]],
  ["oleaginosa", ["castanha", "amendoim", "noz", "nozes", "amendoa", "pistache", "macadamia", "avela"]],
  ["laticinio", ["leite", "iogurte", "queijo", "requeijao", "coalhada", "ricota", "whey"]],
  ["proteina_animal", [
    "frango", "peito", "carne", "bovina", "patinho", "boi", "acem", "musculo",
    "peixe", "tilapia", "salmao", "atum", "sardinha", "merluza", "pescada",
    "porco", "suina", "lombo", "pernil", "peru", "file", "filé", "coxa", "sobrecoxa", "camarao",
  ]],
  ["gordura", ["azeite", "oleo", "manteiga", "margarina", "banha"]],
  ["pao", ["pao", "torrada", "biscoito", "bolacha"]],
  ["carbo", [
    "arroz", "batata", "mandioca", "aipim", "macaxeira", "inhame", "cara",
    "macarrao", "massa", "cuscuz", "aveia", "tapioca", "polenta", "fuba",
    "quinoa", "milho", "pure",
  ]],
  ["fruta", ["banana", "maca", "mamao", "laranja", "morango", "abacaxi", "uva", "manga", "melancia", "pera", "kiwi", "melao", "goiaba", "ameixa", "abacate"]],
  ["vegetal", [
    "brocolis", "tomate", "alface", "couve", "cenoura", "abobrinha", "espinafre",
    "pepino", "pimentao", "cebola", "alho", "chuchu", "beterraba", "repolho",
    "rucula", "acelga", "abobora", "quiabo", "berinjela", "aspargo",
  ]],
];

export function classifyFood(food: {
  name: string; protein_per_100g: number; carbs_per_100g: number; fat_per_100g: number;
}): FoodCategory {
  const n = norm(food.name);
  for (const [cat, terms] of KEYWORDS) {
    if (terms.some((t) => n.includes(t))) return cat;
  }
  // fallback por macro
  const { protein_per_100g: p, carbs_per_100g: c, fat_per_100g: g } = food;
  if (p >= 15 && c < 15) return "proteina_animal";
  if (c >= 40) return "carbo";
  if (g >= 50) return "gordura";
  return "outro";
}

export type MealType = "cafe" | "lanche" | "principal";

export function mealTypeFromName(name: string, index: number, _total: number): MealType {
  const n = norm(name);
  if (n.includes("cafe") || n.includes("manha")) return "cafe";
  if (n.includes("lanche") || n.includes("pre-treino") || n.includes("pos-treino") || n.includes("ceia"))
    return "lanche";
  if (n.includes("almoco") || n.includes("jantar")) return "principal";
  // fallback por posição: primeira = café; demais = principal
  return index === 0 ? "cafe" : "principal";
}

export function coherenceRulesGeneral(): string {
  return (
    "Monte pratos que fazem sentido juntos e são palatáveis. No máximo UMA proteína animal " +
    "principal por refeição (carne OU frango OU peixe) — ovo, feijão e laticínios são complementos " +
    "e podem acompanhar. Não empilhe carboidratos base (escolha arroz OU macarrão OU batata; " +
    "arroz + feijão é permitido). Escolha alimentos adequados ao horário da refeição."
  );
}

export function coherenceGuidance(mealType: MealType): string {
  switch (mealType) {
    case "cafe":
      return "Café da manhã: base de carboidrato (pão/aveia/tapioca) + proteína leve (ovo/iogurte/leite/queijo) + fruta opcional. Nada de arroz+feijão+bife no café.";
    case "lanche":
      return "Lanche: algo leve — fruta + proteína (iogurte/whey/leite) ou oleaginosas.";
    case "principal":
      return "Almoço/Jantar: 1 proteína animal + 1 carboidrato + feijão opcional + um vegetal/salada + gordura boa opcional (azeite).";
  }
}
