"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ActivityLevel, CarbLevel, DayType, Goal, Profile } from "@/lib/types";
import { suggestTargets } from "@/lib/nutrition/targets";

const GOAL_LABELS: Record<Goal, string> = {
  fat_loss: "Perda de gordura",
  maintenance: "Manutenção",
  muscle_gain: "Ganho de massa",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentário",
  light: "Leve",
  moderate: "Moderado",
  active: "Ativo",
};

const CARB_LABELS: Record<CarbLevel, string> = {
  low: "Baixo carbo",
  medium: "Médio carbo",
  high: "Alto carbo",
};

const CARB_DOT: Record<CarbLevel, string> = {
  low: "bg-carb-low",
  medium: "bg-carb-medium",
  high: "bg-carb-high",
};

const defaultProfile: Profile = {
  user_id: "",
  weight_kg: 70,
  goal: "maintenance",
  activity_level: "moderate",
};

type DayTypeForm = {
  name: string;
  carb_level: CarbLevel;
  target_kcal: string;
  target_protein_g: string;
  target_carbs_g: string;
  target_fat_g: string;
  autoSuggest: boolean;
};

const emptyDayTypeForm: DayTypeForm = {
  name: "",
  carb_level: "medium",
  target_kcal: "",
  target_protein_g: "",
  target_carbs_g: "",
  target_fat_g: "",
  autoSuggest: false,
};

function toDayTypeForm(dt: DayType): DayTypeForm {
  return {
    name: dt.name,
    carb_level: dt.carb_level,
    target_kcal: String(dt.target_kcal),
    target_protein_g: String(dt.target_protein_g),
    target_carbs_g: String(dt.target_carbs_g),
    target_fat_g: String(dt.target_fat_g),
    autoSuggest: dt.auto_suggested,
  };
}

export default function DayTypesSettings() {
  // ---- perfil ----
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [profileForm, setProfileForm] = useState({
    weight_kg: String(defaultProfile.weight_kg),
    goal: defaultProfile.goal,
    activity_level: defaultProfile.activity_level,
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  // ---- tipos de dia ----
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DayTypeForm>(emptyDayTypeForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao carregar perfil");
        const p = body as Profile;
        setProfile(p);
        setProfileForm({
          weight_kg: String(p.weight_kg),
          goal: p.goal,
          activity_level: p.activity_level,
        });
      })
      .catch((err) => setProfileError(err instanceof Error ? err.message : String(err)))
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/day-types")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao carregar tipos de dia");
        setDayTypes(body as DayType[]);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : String(err)))
      .finally(() => setListLoading(false));
  }, []);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    const weight_kg = Number(profileForm.weight_kg);
    if (Number.isNaN(weight_kg) || weight_kg <= 0) {
      setProfileError("Informe um peso válido em kg.");
      return;
    }
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight_kg,
          goal: profileForm.goal,
          activity_level: profileForm.activity_level,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar perfil");
      setProfile(body as Profile);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Falha ao salvar perfil");
    } finally {
      setProfileSaving(false);
    }
  }

  function openNewForm() {
    setEditingId(null);
    setForm(emptyDayTypeForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(dt: DayType) {
    setEditingId(dt.id);
    setForm(toDayTypeForm(dt));
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyDayTypeForm);
    setFormError(null);
  }

  function handleSuggest() {
    const targets = suggestTargets({
      weightKg: profile.weight_kg,
      goal: profile.goal,
      activityLevel: profile.activity_level,
      carbLevel: form.carb_level,
    });
    setForm((f) => ({
      ...f,
      target_kcal: String(targets.target_kcal),
      target_protein_g: String(targets.target_protein_g),
      target_carbs_g: String(targets.target_carbs_g),
      target_fat_g: String(targets.target_fat_g),
      autoSuggest: true,
    }));
  }

  function updateMacro(field: "target_kcal" | "target_protein_g" | "target_carbs_g" | "target_fat_g", value: string) {
    setForm((f) => ({ ...f, [field]: value, autoSuggest: false }));
  }

  async function handleDayTypeSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const name = form.name.trim();
    if (!name) {
      setFormError("Informe o nome do tipo de dia.");
      return;
    }

    const payload = {
      name,
      carb_level: form.carb_level,
      autoSuggest: form.autoSuggest,
      target_kcal: Number(form.target_kcal) || 0,
      target_protein_g: Number(form.target_protein_g) || 0,
      target_carbs_g: Number(form.target_carbs_g) || 0,
      target_fat_g: Number(form.target_fat_g) || 0,
    };

    setSaving(true);
    try {
      const url = editingId ? `/api/day-types/${editingId}` : "/api/day-types";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar tipo de dia");

      setDayTypes((prev) => {
        if (editingId) {
          return prev.map((dt) => (dt.id === editingId ? (body as DayType) : dt));
        }
        return [...prev, body as DayType].sort((a, b) => a.name.localeCompare(b.name));
      });
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Falha ao salvar tipo de dia");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dt: DayType) {
    if (!window.confirm(`Excluir o tipo de dia "${dt.name}"?`)) return;
    const res = await fetch(`/api/day-types/${dt.id}`, { method: "DELETE" });
    if (res.ok) {
      setDayTypes((prev) => prev.filter((d) => d.id !== dt.id));
      if (editingId === dt.id) closeForm();
    }
  }

  const formTitle = useMemo(
    () => (editingId ? "Editar tipo de dia" : "Novo tipo de dia"),
    [editingId],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Perfil */}
      <form
        onSubmit={handleProfileSubmit}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <h2 className="text-sm font-semibold text-foreground">Seu perfil</h2>
        {profileLoading ? (
          <p className="text-sm text-muted">Carregando perfil...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Peso (kg)
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  value={profileForm.weight_kg}
                  onChange={(e) =>
                    setProfileForm((f) => ({ ...f, weight_kg: e.target.value }))
                  }
                  data-testid="profile-weight"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Objetivo
                <select
                  value={profileForm.goal}
                  onChange={(e) =>
                    setProfileForm((f) => ({ ...f, goal: e.target.value as Goal }))
                  }
                  data-testid="profile-goal"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                    <option key={g} value={g}>
                      {GOAL_LABELS[g]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Nível de atividade
                <select
                  value={profileForm.activity_level}
                  onChange={(e) =>
                    setProfileForm((f) => ({
                      ...f,
                      activity_level: e.target.value as ActivityLevel,
                    }))
                  }
                  data-testid="profile-activity"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                    <option key={a} value={a}>
                      {ACTIVITY_LABELS[a]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {profileError && <p className="text-xs text-off-target">{profileError}</p>}
            {profileSaved && !profileError && (
              <p className="text-xs text-on-target">Perfil salvo.</p>
            )}

            <button
              type="submit"
              disabled={profileSaving}
              data-testid="profile-save"
              className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
            >
              {profileSaving ? "Salvando..." : "Salvar perfil"}
            </button>
          </>
        )}
      </form>

      {/* Tipos de dia */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Tipos de dia</h2>
          <button
            type="button"
            onClick={formOpen && !editingId ? closeForm : openNewForm}
            className="text-xs font-medium text-accent hover:underline"
          >
            {formOpen && !editingId ? "Fechar" : "+ Novo tipo de dia"}
          </button>
        </div>

        {formOpen && (
          <form
            onSubmit={handleDayTypeSubmit}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{formTitle}</h3>
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Nome
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  data-testid="daytype-name"
                  placeholder="Ex.: Dia de treino pesado"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Nível de carbo
                <select
                  value={form.carb_level}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, carb_level: e.target.value as CarbLevel }))
                  }
                  data-testid="daytype-carblevel"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {(Object.keys(CARB_LABELS) as CarbLevel[]).map((c) => (
                    <option key={c} value={c}>
                      {CARB_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={handleSuggest}
              data-testid="daytype-suggest"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              Sugerir metas
            </button>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Kcal
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={form.target_kcal}
                  onChange={(e) => updateMacro("target_kcal", e.target.value)}
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
                  value={form.target_protein_g}
                  onChange={(e) => updateMacro("target_protein_g", e.target.value)}
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
                  value={form.target_carbs_g}
                  onChange={(e) => updateMacro("target_carbs_g", e.target.value)}
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
                  value={form.target_fat_g}
                  onChange={(e) => updateMacro("target_fat_g", e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            </div>

            {form.autoSuggest && (
              <p className="text-xs text-muted">
                Metas calculadas a partir do seu perfil. Editar qualquer valor marca a meta como manual.
              </p>
            )}

            {formError && <p className="text-xs text-off-target">{formError}</p>}

            <button
              type="submit"
              disabled={saving}
              data-testid="daytype-save"
              className="mt-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar tipo de dia"}
            </button>
          </form>
        )}

        <div className="flex flex-col gap-2">
          {listLoading && <p className="text-sm text-muted">Carregando tipos de dia...</p>}
          {listError && <p className="text-sm text-off-target">{listError}</p>}
          {!listLoading && !listError && dayTypes.length === 0 && (
            <p className="text-sm text-muted">Nenhum tipo de dia cadastrado ainda.</p>
          )}

          {dayTypes.map((dt) => (
            <div
              key={dt.id}
              data-testid="daytype-row"
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`size-2.5 shrink-0 rounded-full ${CARB_DOT[dt.carb_level]}`}
                  />
                  <span className="text-sm font-medium text-foreground">{dt.name}</span>
                  <span className="shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {CARB_LABELS[dt.carb_level]}
                  </span>
                  {dt.auto_suggested && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Auto
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => openEditForm(dt)}
                    className="text-accent hover:underline"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(dt)}
                    className="text-off-target hover:underline"
                  >
                    Excluir
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs text-muted">
                <div>
                  <div className="font-semibold text-foreground">{dt.target_kcal}</div>
                  kcal
                </div>
                <div>
                  <div className="font-semibold text-foreground">{dt.target_protein_g}g</div>
                  prot
                </div>
                <div>
                  <div className="font-semibold text-foreground">{dt.target_carbs_g}g</div>
                  carbo
                </div>
                <div>
                  <div className="font-semibold text-foreground">{dt.target_fat_g}g</div>
                  gord
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
