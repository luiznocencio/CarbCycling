import type { SupabaseClient } from "@supabase/supabase-js";
import { openaiClient } from "@/lib/ai/openai";

export type Preferences = {
  likes: string[]; dislikes: string[]; avoid: string[];
  always_include: string[]; notes: string;
};

export const EMPTY_PREFS: Preferences = {
  likes: [], dislikes: [], avoid: [], always_include: [], notes: "",
};

const MAX_ITEMS = 50;
const MAX_LEN = 80;
const MAX_NOTES = 2000;

export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").trim().toLowerCase();
}

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const s = raw.trim().slice(0, MAX_LEN);
    if (!s) continue;
    const key = normalizeName(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function sanitizePrefs(input: unknown): Preferences {
  const o = (input ?? {}) as Record<string, unknown>;
  return {
    likes: cleanList(o.likes),
    dislikes: cleanList(o.dislikes),
    avoid: cleanList(o.avoid),
    always_include: cleanList(o.always_include),
    notes: typeof o.notes === "string" ? o.notes.slice(0, MAX_NOTES) : "",
  };
}

export function applyAvoidToPool<T extends { name: string }>(pool: T[], avoid: string[]): T[] {
  const terms = avoid.map(normalizeName).filter((t) => t.length > 0);
  if (terms.length === 0) return pool;
  return pool.filter((f) => {
    const n = normalizeName(f.name);
    return !terms.some((t) => n.includes(t));
  });
}

export function resolveIncludeIds(pool: { id: string; name: string }[], names: string[]): string[] {
  const terms = names.map(normalizeName).filter((t) => t.length > 0);
  const ids = new Set<string>();
  for (const f of pool) {
    const n = normalizeName(f.name);
    if (terms.some((t) => n.includes(t))) ids.add(f.id);
  }
  return [...ids];
}

export function prefsPromptSnippet(p: Preferences): string {
  const parts: string[] = [];
  if (p.likes.length) parts.push(`gosta de: ${p.likes.join(", ")}`);
  if (p.dislikes.length) parts.push(`não curte: ${p.dislikes.join(", ")}`);
  if (p.avoid.length) parts.push(`evita/não pode: ${p.avoid.join(", ")}`);
  if (p.notes.trim()) parts.push(`observações: ${p.notes.trim()}`);
  if (parts.length === 0) return "";
  return `Preferências do usuário — ${parts.join("; ")}. Priorize o que ele gosta; NÃO use o que ele evita.`;
}

export async function loadPreferences(supabase: SupabaseClient): Promise<Preferences> {
  const { data } = await supabase.from("user_preferences").select("*").maybeSingle();
  if (!data) return EMPTY_PREFS;
  return {
    likes: data.likes ?? [], dislikes: data.dislikes ?? [], avoid: data.avoid ?? [],
    always_include: data.always_include ?? [], notes: data.notes ?? "",
  };
}

const CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "preferences"],
  properties: {
    reply: { type: "string" },
    preferences: {
      type: "object",
      additionalProperties: false,
      required: ["likes", "dislikes", "avoid", "always_include", "notes"],
      properties: {
        likes: { type: "array", items: { type: "string" } },
        dislikes: { type: "array", items: { type: "string" } },
        avoid: { type: "array", items: { type: "string" } },
        always_include: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
    },
  },
} as const;

export async function chatPreferences(input: {
  messages: { role: "user" | "assistant"; content: string }[];
  current: Preferences;
}): Promise<{ reply: string; preferences: Preferences }> {
  const client = openaiClient();
  const system =
    "Você ajuda a levantar as preferências alimentares do usuário, em português do Brasil. " +
    "Faça no máximo 1–2 perguntas curtas por vez. A cada turno devolva 'reply' (sua fala) E " +
    "'preferences' = o registro ATUALIZADO, acumulando o que já existe em 'atual' com o que o " +
    "usuário disse (não zere o que não foi contradito). Não invente: registre só o que foi dito. " +
    "Alergias e restrições ('não posso', 'sem lactose') vão em 'avoid'. Alimentos que ele quer " +
    "sempre presentes vão em 'always_include'.";
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ atual: input.current }) },
      ...input.messages,
    ],
    response_format: { type: "json_schema", json_schema: { name: "prefs_chat", strict: true, schema: CHAT_SCHEMA } },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  const parsed = JSON.parse(content) as { reply: string; preferences: unknown };
  return { reply: parsed.reply, preferences: sanitizePrefs(parsed.preferences) };
}
