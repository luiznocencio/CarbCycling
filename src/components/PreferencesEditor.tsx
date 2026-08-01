"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EMPTY_PREFS, type Preferences } from "@/lib/ai/preferences";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChipField = "likes" | "dislikes" | "avoid" | "always_include";

const CHIP_FIELDS: { key: ChipField; label: string; placeholder: string }[] = [
  { key: "likes", label: "Gosto", placeholder: "Ex.: ovo, frango, arroz..." },
  { key: "dislikes", label: "Não curto", placeholder: "Ex.: jiló, fígado..." },
  {
    key: "avoid",
    label: "Evitar / não posso",
    placeholder: "Ex.: leite, amendoim...",
  },
  {
    key: "always_include",
    label: "Sempre incluir",
    placeholder: "Ex.: café, azeite...",
  },
];

function ChipEditor({
  label,
  placeholder,
  values,
  onAdd,
  onRemove,
  testId,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  testId: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <span className="text-xs text-muted">{label}</span>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="flex max-w-full items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
            >
              <span className="truncate">{value}</span>
              <button
                type="button"
                onClick={() => onRemove(value)}
                aria-label={`Remover ${value} de ${label}`}
                data-testid={`${testId}-remove`}
                className="shrink-0 leading-none hover:opacity-70"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={placeholder}
        data-testid={`${testId}-input`}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}

export default function PreferencesEditor() {
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok)
          throw new Error(body.error ?? "Falha ao carregar preferências");
        if (!cancelled) setPrefs(body as Preferences);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  function addChip(field: ChipField, value: string) {
    setSaved(false);
    setPrefs((p) => {
      const exists = p[field].some(
        (v) => v.toLowerCase() === value.toLowerCase(),
      );
      if (exists) return p;
      return { ...p, [field]: [...p[field], value] };
    });
  }

  function removeChip(field: ChipField, value: string) {
    setSaved(false);
    setPrefs((p) => ({ ...p, [field]: p[field].filter((v) => v !== value) }));
  }

  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar preferências");
      setPrefs({
        likes: body.likes ?? [],
        dislikes: body.dislikes ?? [],
        avoid: body.avoid ?? [],
        always_include: body.always_include ?? [],
        notes: body.notes ?? "",
      });
      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Falha ao salvar preferências",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    const text = chatInput.trim();
    if (!text || thinking) return;
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setChatInput("");
    setThinking(true);
    try {
      const res = await fetch("/api/preferences/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, current: prefs }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha no chat");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: String(body.reply ?? "") },
      ]);
      if (body.preferences) {
        setSaved(false);
        setPrefs({
          likes: body.preferences.likes ?? [],
          dislikes: body.preferences.dislikes ?? [],
          avoid: body.preferences.avoid ?? [],
          always_include: body.preferences.always_include ?? [],
          notes: body.preferences.notes ?? "",
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Não consegui responder agora, tente de novo.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  function handleChatKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  if (loadError) {
    return <p className="text-sm text-off-target">{loadError}</p>;
  }

  if (loading) {
    return <p className="text-sm text-muted">Carregando preferências…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Formulário — fonte da verdade */}
      <div
        data-testid="prefs-form"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Suas preferências
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CHIP_FIELDS.map((field) => (
            <ChipEditor
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              values={prefs[field.key]}
              onAdd={(v) => addChip(field.key, v)}
              onRemove={(v) => removeChip(field.key, v)}
              testId={`prefs-${field.key}`}
            />
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Observações
          <textarea
            value={prefs.notes}
            onChange={(e) => {
              setSaved(false);
              setPrefs((p) => ({ ...p, notes: e.target.value }));
            }}
            rows={3}
            placeholder="Ex.: prefiro refeições rápidas, evito frituras à noite..."
            data-testid="prefs-notes"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        {saveError && <p className="text-xs text-off-target">{saveError}</p>}
        {saved && !saveError && (
          <p className="text-xs text-on-target">Preferências salvas.</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          data-testid="prefs-save"
          className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
        >
          {saving ? "Salvando..." : "Salvar preferências"}
        </button>
      </div>

      {/* Chat — ajuda opcional */}
      <div
        data-testid="prefs-chat"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Ajuda da IA
          </h2>
          <p className="text-xs text-muted">
            Converse para preencher o formulário acima. Nada é salvo pelo chat —
            revise e clique em salvar.
          </p>
        </div>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && !thinking && (
            <p className="text-xs text-muted">
              Comece dizendo do que você gosta, o que evita ou não pode comer.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <span
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-accent text-white"
                    : "bg-background text-foreground"
                }`}
              >
                {m.content}
              </span>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <span className="rounded-2xl bg-background px-3 py-2 text-sm text-muted">
                Pensando...
              </span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleChatKeyDown}
            disabled={thinking}
            placeholder="Escreva uma mensagem..."
            data-testid="prefs-chat-input"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={thinking || !chatInput.trim()}
            data-testid="prefs-chat-send"
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
