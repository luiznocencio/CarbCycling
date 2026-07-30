"use client";

import { useEffect, useMemo, useState } from "react";
import {
  bmr,
  bmrMifflin,
  bmrHarris,
  bmrKatch,
  tdee,
  isProfileComplete,
} from "@/lib/nutrition/bmr";
import type {
  ActivityLevel,
  BmrFormula,
  Goal,
  Intensity,
  Profile,
  Sex,
} from "@/lib/types";

const SEX_LABELS: Record<Sex, string> = {
  male: "Masculino",
  female: "Feminino",
};

const GOAL_LABELS: Record<Goal, string> = {
  fat_loss: "Perda de gordura",
  maintenance: "Manutenção",
  muscle_gain: "Ganho de massa",
};

const INTENSITY_LABELS: Record<Intensity, string> = {
  light: "Leve",
  moderate: "Moderado",
  aggressive: "Agressivo",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentário",
  light: "Leve",
  moderate: "Moderado",
  active: "Ativo",
};

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

const FORMULA_LABELS: Record<BmrFormula, string> = {
  auto: "Automático",
  mifflin: "Mifflin-St Jeor",
  harris: "Harris-Benedict",
  katch: "Katch-McArdle",
};

type FormState = {
  weight_kg: string;
  sex: Sex | "";
  age: string;
  height_cm: string;
  body_fat_pct: string;
  goal: Goal;
  intensity: Intensity;
  activity_level: ActivityLevel;
  bmr_formula: BmrFormula;
  safety_guardrails: boolean;
};

function toFormState(p: Profile): FormState {
  return {
    weight_kg: String(p.weight_kg),
    sex: p.sex ?? "",
    age: p.age != null ? String(p.age) : "",
    height_cm: p.height_cm != null ? String(p.height_cm) : "",
    body_fat_pct: p.body_fat_pct != null ? String(p.body_fat_pct) : "",
    goal: p.goal,
    intensity: p.intensity,
    activity_level: p.activity_level,
    bmr_formula: p.bmr_formula,
    safety_guardrails: p.safety_guardrails,
  };
}

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

const fieldLabel = "flex flex-col gap-1 text-xs text-muted";
const fieldInput =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent";

export default function ProfileForm() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Falha ao carregar perfil");
        const p = body as Profile;
        setProfile(p);
        setForm(toFormState(p));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaved(false);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  const preview = useMemo(() => {
    if (!form) return null;

    const weightNum = toNumber(form.weight_kg);
    const ageNum = toNumber(form.age);
    const heightNum = toNumber(form.height_cm);
    const bodyFatNum = toNumber(form.body_fat_pct);
    const sexVal: Sex | null = form.sex === "" ? null : form.sex;

    const complete =
      weightNum != null &&
      isProfileComplete({
        sex: sexVal,
        age: ageNum,
        height_cm: heightNum,
        weight_kg: weightNum,
      });

    if (!complete) return { complete: false as const };

    const bmrInputs = {
      sex: sexVal as Sex,
      weight_kg: weightNum as number,
      height_cm: heightNum as number,
      age: ageNum as number,
      body_fat_pct: bodyFatNum,
    };

    const mifflinValue = bmrMifflin(
      bmrInputs.sex,
      bmrInputs.weight_kg,
      bmrInputs.height_cm,
      bmrInputs.age,
    );
    const harrisValue = bmrHarris(
      bmrInputs.sex,
      bmrInputs.weight_kg,
      bmrInputs.height_cm,
      bmrInputs.age,
    );
    const katchValue = bodyFatNum != null ? bmrKatch(bmrInputs.weight_kg, bodyFatNum) : null;

    const usesKatch =
      (form.bmr_formula === "katch" || form.bmr_formula === "auto") && bodyFatNum != null;
    const activeFormula: "mifflin" | "harris" | "katch" = usesKatch
      ? "katch"
      : form.bmr_formula === "harris"
        ? "harris"
        : "mifflin";

    const selectedBmr = bmr(bmrInputs, form.bmr_formula);
    const selectedTdee = tdee(selectedBmr, form.activity_level);

    return {
      complete: true as const,
      mifflinValue,
      harrisValue,
      katchValue,
      activeFormula,
      selectedTdee,
    };
  }, [form]);

  async function handleSave() {
    if (!form || !profile) return;
    setSaveError(null);
    setSaved(false);

    const weightNum = toNumber(form.weight_kg);
    if (weightNum == null || weightNum <= 0) {
      setSaveError("Informe um peso válido (maior que zero).");
      return;
    }

    const payload: Profile = {
      user_id: profile.user_id,
      weight_kg: weightNum,
      goal: form.goal,
      activity_level: form.activity_level,
      sex: form.sex === "" ? null : form.sex,
      age: toNumber(form.age),
      height_cm: toNumber(form.height_cm),
      body_fat_pct: toNumber(form.body_fat_pct),
      bmr_formula: form.bmr_formula,
      intensity: form.intensity,
      safety_guardrails: form.safety_guardrails,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Falha ao salvar perfil");
      const saved = body as Profile;
      setProfile(saved);
      setForm(toFormState(saved));
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Falha ao salvar perfil");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-off-target">{loadError}</p>;
  }

  if (!form) {
    return <p className="text-sm text-muted">Carregando perfil…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Dados corporais */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Dados corporais</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={fieldLabel}>
            Peso (kg)
            <input
              type="number"
              inputMode="decimal"
              min={1}
              step="any"
              value={form.weight_kg}
              onChange={(e) => update("weight_kg", e.target.value)}
              data-testid="profile-weight"
              className={fieldInput}
            />
          </label>
          <label className={fieldLabel}>
            Sexo
            <select
              value={form.sex}
              onChange={(e) => update("sex", e.target.value as Sex | "")}
              data-testid="profile-sex"
              className={fieldInput}
            >
              <option value="">Selecione</option>
              {(Object.keys(SEX_LABELS) as Sex[]).map((s) => (
                <option key={s} value={s}>
                  {SEX_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            Idade
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={form.age}
              onChange={(e) => update("age", e.target.value)}
              data-testid="profile-age"
              className={fieldInput}
            />
          </label>
          <label className={fieldLabel}>
            Altura (cm)
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={form.height_cm}
              onChange={(e) => update("height_cm", e.target.value)}
              data-testid="profile-height"
              className={fieldInput}
            />
          </label>
        </div>
        <label className={fieldLabel + " sm:w-1/2"}>
          % de gordura corporal (opcional)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={80}
            step="any"
            placeholder="Ex.: 18"
            value={form.body_fat_pct}
            onChange={(e) => update("body_fat_pct", e.target.value)}
            data-testid="profile-bodyfat"
            className={fieldInput}
          />
        </label>
      </div>

      {/* Objetivo e rotina */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Objetivo e rotina</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={fieldLabel}>
            Objetivo
            <select
              value={form.goal}
              onChange={(e) => update("goal", e.target.value as Goal)}
              data-testid="profile-goal"
              className={fieldInput}
            >
              {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            Intensidade
            <select
              value={form.intensity}
              onChange={(e) => update("intensity", e.target.value as Intensity)}
              data-testid="profile-intensity"
              className={fieldInput}
            >
              {(Object.keys(INTENSITY_LABELS) as Intensity[]).map((i) => (
                <option key={i} value={i}>
                  {INTENSITY_LABELS[i]}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            Nível de atividade
            <select
              value={form.activity_level}
              onChange={(e) => update("activity_level", e.target.value as ActivityLevel)}
              data-testid="profile-activity"
              className={fieldInput}
            >
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Cálculo do basal */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Cálculo do basal</h3>
        <label className={fieldLabel + " sm:w-1/2"}>
          Fórmula
          <select
            value={form.bmr_formula}
            onChange={(e) => update("bmr_formula", e.target.value as BmrFormula)}
            data-testid="profile-formula"
            className={fieldInput}
          >
            {(Object.keys(FORMULA_LABELS) as BmrFormula[]).map((f) => (
              <option key={f} value={f}>
                {FORMULA_LABELS[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
          <span className="text-sm text-foreground">
            Respeitar travas de segurança
            <span className="mt-0.5 block text-xs text-muted">
              Impede metas abaixo do basal e limites agressivos demais.
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              role="switch"
              checked={form.safety_guardrails}
              onChange={(e) => update("safety_guardrails", e.target.checked)}
              data-testid="profile-guardrails"
              className="peer sr-only"
            />
            <span className="h-6 w-10 rounded-full bg-border transition-colors peer-checked:bg-accent" />
            <span className="absolute left-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform peer-checked:translate-x-4" />
          </span>
        </label>
      </div>

      {/* Preview ao vivo */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Gasto calórico estimado</h3>

        {!preview || !preview.complete ? (
          <p className="text-sm text-muted">
            Complete peso, sexo, idade e altura para ver o basal.
          </p>
        ) : (
          <>
            <div data-testid="bmr-preview" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <BmrChip
                label="Mifflin-St Jeor"
                value={preview.mifflinValue}
                active={preview.activeFormula === "mifflin"}
              />
              <BmrChip
                label="Harris-Benedict"
                value={preview.harrisValue}
                active={preview.activeFormula === "harris"}
              />
              <BmrChip
                label="Katch-McArdle"
                value={preview.katchValue}
                active={preview.activeFormula === "katch"}
                disabled={preview.katchValue == null}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/10 px-3 py-3">
              <div>
                <p className="text-xs text-muted">
                  TDEE · atividade {ACTIVITY_LABELS[form.activity_level]} (×
                  {ACTIVITY_FACTOR[form.activity_level]})
                </p>
                <p className="text-xs text-muted">
                  Fórmula usada: {FORMULA_LABELS[preview.activeFormula === "katch" ? "katch" : preview.activeFormula]}
                </p>
              </div>
              <p className="text-2xl font-bold text-accent">
                <span data-testid="tdee-preview">{preview.selectedTdee}</span>{" "}
                <span className="text-sm font-medium text-muted">kcal/dia</span>
              </p>
            </div>
          </>
        )}
      </div>

      {saveError && <p className="text-xs text-off-target">{saveError}</p>}
      {saved && !saveError && <p className="text-xs text-on-target">Perfil salvo.</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        data-testid="profile-save"
        className="rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60 sm:w-fit sm:px-6"
      >
        {saving ? "Salvando..." : "Salvar perfil"}
      </button>
    </div>
  );
}

function BmrChip({
  label,
  value,
  active,
  disabled,
}: {
  label: string;
  value: number | null;
  active: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col gap-0.5 rounded-lg border px-3 py-2 " +
        (active
          ? "border-accent bg-accent/10"
          : "border-border bg-background") +
        (disabled ? " opacity-50" : "")
      }
    >
      <span className="text-xs text-muted">
        {label}
        {active && <span className="ml-1 text-accent">· selecionada</span>}
      </span>
      <span className="text-base font-semibold text-foreground">
        {value != null ? `${value} kcal` : "—"}
      </span>
    </div>
  );
}
