import Link from "next/link";
import type { CarbLevel, DayType, Macros } from "@/lib/types";

export interface DayCard {
  weekday: number;
  label: string;
  dayType: DayType | null;
  planned: Macros;
  diff: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
}

// folgas de tolerância antes de sinalizar "fora da meta"
const KCAL_TOLERANCE = 100;
const MACRO_TOLERANCE_G = 15;

const CARB_LEVEL_STYLES: Record<
  CarbLevel,
  { dot: string; chipBg: string; chipText: string }
> = {
  low: {
    dot: "bg-carb-low",
    chipBg: "bg-carb-low/15",
    chipText: "text-carb-low",
  },
  medium: {
    dot: "bg-carb-medium",
    chipBg: "bg-carb-medium/15",
    chipText: "text-carb-medium",
  },
  high: {
    dot: "bg-carb-high",
    chipBg: "bg-carb-high/15",
    chipText: "text-carb-high",
  },
};

function isOffTarget(diff: DayCard["diff"]) {
  if (!diff) return false;
  return (
    Math.abs(diff.kcal) > KCAL_TOLERANCE ||
    Math.abs(diff.protein_g) > MACRO_TOLERANCE_G ||
    Math.abs(diff.carbs_g) > MACRO_TOLERANCE_G ||
    Math.abs(diff.fat_g) > MACRO_TOLERANCE_G
  );
}

function CardBody({ card }: { card: DayCard }) {
  const { dayType, planned, diff } = card;

  if (!dayType) {
    return (
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">
            {card.label}
          </span>
        </div>
        <p className="text-xs text-muted">
          Sem tipo definido para este dia. Configure o padrão semanal.
        </p>
      </div>
    );
  }

  const offTarget = isOffTarget(diff);
  const levelStyle = CARB_LEVEL_STYLES[dayType.carb_level];
  const kcal = Math.round(planned.kcal);
  const percent = dayType.target_kcal > 0
    ? Math.min(100, Math.max(0, (planned.kcal / dayType.target_kcal) * 100))
    : planned.kcal > 0
      ? 100
      : 0;

  return (
    <div className="flex h-full flex-col gap-2.5">
      <span className="text-sm font-semibold text-foreground">
        {card.label}
      </span>

      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${levelStyle.chipBg} ${levelStyle.chipText}`}
      >
        <span className={`size-1.5 rounded-full ${levelStyle.dot}`} />
        {dayType.name}
      </span>

      <div className="mt-0.5 flex flex-col gap-1.5">
        <p className="flex items-baseline gap-1">
          <span className="text-base font-semibold tabular-nums text-foreground">
            {kcal}
          </span>
          <span className="text-xs text-muted">
            / {dayType.target_kcal} kcal
          </span>
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full ${
              offTarget ? "bg-off-target" : "bg-on-target"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <p className="text-xs tabular-nums text-muted">
        P {Math.round(planned.protein_g)} · C {Math.round(planned.carbs_g)} · G{" "}
        {Math.round(planned.fat_g)} <span className="opacity-70">g</span>
      </p>

      {offTarget && (
        <span
          data-testid="off-target"
          className="mt-auto text-[11px] font-medium text-off-target"
        >
          Fora da meta
        </span>
      )}
    </div>
  );
}

export default function WeekGrid({ cards }: { cards: DayCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((card) => {
        const className =
          "flex flex-col rounded-xl border border-border bg-card p-4 transition-colors" +
          (card.dayType ? " hover:border-accent" : " border-dashed");

        if (!card.dayType) {
          return (
            <div
              key={card.weekday}
              data-testid={`day-card-${card.weekday}`}
              className={className}
            >
              <CardBody card={card} />
            </div>
          );
        }

        return (
          <Link
            key={card.weekday}
            href={`/day/${card.dayType.id}`}
            data-testid={`day-card-${card.weekday}`}
            className={className}
          >
            <CardBody card={card} />
          </Link>
        );
      })}
    </div>
  );
}
