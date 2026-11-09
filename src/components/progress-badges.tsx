import type { StudentProgress } from "@/lib/data";
import { formatAverage } from "@/lib/grading";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Locale } from "@/i18n/config";
import { fmt, plural } from "@/i18n/format";
import { Badge } from "./ui";

export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

// Why a student is on the "falling behind" list.
export function ProgressBadges({
  student,
  labels,
  locale,
}: {
  student: StudentProgress;
  labels: Dictionary["groups"]["reasons"];
  locale: Locale;
}) {
  const { attendanceLevel: level, attendanceRate: rate, lowAverage, tooManyMissed, average, missed } = student;
  return (
    <span className="flex flex-wrap gap-1">
      {level !== "ok" && (
        <Badge tone={level === "risk" ? "bad" : "warn"}>{fmt(labels.attendance, { pct: formatRate(rate) })}</Badge>
      )}
      {lowAverage && average !== null && <Badge tone="bad">{fmt(labels.average, { value: formatAverage(average) })}</Badge>}
      {tooManyMissed && <Badge tone="warn">{plural(locale, labels.missed, missed)}</Badge>}
    </span>
  );
}
