"use client";

import { startTransition, useActionState, useState, type ComponentType, type SVGProps } from "react";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/format";
import { saveAttendance } from "@/app/actions";
import { Badge, type Tone } from "@/components/ui";
import { AlertIcon, CheckIcon, CircleIcon, CrossIcon } from "@/components/icons";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

const selected: Record<AttendanceStatus, string> = {
  present: "peer-checked:bg-good peer-checked:text-accent-ink",
  late: "peer-checked:bg-warn peer-checked:text-accent-ink",
  absent: "peer-checked:bg-bad peer-checked:text-accent-ink",
  excused: "peer-checked:bg-muted peer-checked:text-accent-ink",
};

// Each status has its own mark, so a chip reads without its colour: ✓ present, ! late, ✕ absent, ○ excused.
const marks: Record<AttendanceStatus, ComponentType<SVGProps<SVGSVGElement>>> = {
  present: CheckIcon,
  late: AlertIcon,
  absent: CrossIcon,
  excused: CircleIcon,
};
const tones: Record<AttendanceStatus, Tone> = { present: "good", late: "warn", absent: "bad", excused: "neutral" };

type Student = { id: string; name: string; status: AttendanceStatus | null };

export function AttendanceRoster({
  lessonId,
  students,
  canEdit,
  labels,
  statusLabels,
  errors,
  ok,
  notMarkedForms,
  locale,
}: {
  lessonId: string;
  students: Student[];
  canEdit: boolean;
  labels: Dictionary["lessonPage"];
  statusLabels: Dictionary["attendance"]["status"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
  notMarkedForms: Dictionary["lessonPage"]["notMarked"];
  locale: Locale;
}) {
  const [state, action, pending] = useActionState(saveAttendance, undefined);
  const [changes, setChanges] = useState<Record<string, AttendanceStatus>>({});
  const current = (s: Student) => changes[s.id] ?? s.status;
  const notMarked = students.filter((s) => !current(s)).length;
  const dirty = students.some((s) => current(s) !== s.status);

  return (
    // Not <form action>: React resets the form after an action, which blanks controlled radios.
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="lessonId" value={lessonId} />
      {canEdit && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setChanges(Object.fromEntries(students.map((s) => [s.id, "present" as const])))}
          >
            {labels.markAllPresent}
          </button>
          {notMarked > 0 && <span className="text-sm font-medium text-warn">{plural(locale, notMarkedForms, notMarked)}</span>}
        </div>
      )}

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {students.map((student) => (
          <li key={student.id} className={canEdit && !current(student) ? "not-marked-row" : undefined}>
            {/* Side by side from 1024px, where the radios are 20rem wide; below that they sit under the name. */}
            <div className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{student.name}</span>
                {/* Not marked yet: said in words next to the name, and the row is outlined (see .not-marked-row). */}
                {canEdit && !current(student) && <span className="status-not-marked">{labels.notMarkedChip}</span>}
              </span>
              {canEdit ? (
                <div role="radiogroup" aria-label={student.name} className="grid grid-cols-4 gap-1 lg:w-80 lg:shrink-0 xl:w-96">
                  {STATUSES.map((status) => {
                    const Mark = marks[status];
                    return (
                      <label key={status} className="min-w-0">
                        <input
                          type="radio"
                          name={`status:${student.id}`}
                          value={status}
                          checked={current(student) === status}
                          onChange={() => setChanges((c) => ({ ...c, [student.id]: status }))}
                          className="peer sr-only"
                        />
                        <span
                          className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-2 px-1 text-center text-xs font-semibold text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent sm:flex-row sm:gap-1.5 ${selected[status]}`}
                        >
                          <Mark width={14} height={14} strokeWidth={2.4} className="shrink-0" />
                          {statusLabels[status]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : // Closed (term locked, too early, cancelled): nothing can be changed, so the result is shown as a plain
              // chip, not as a row of disabled buttons.
              current(student) ? (
                <Badge tone={tones[current(student)!]}>{statusLabels[current(student)!]}</Badge>
              ) : (
                <span className="status-not-marked">{labels.notMarkedChip}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="save-bar sticky bottom-20 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 md:bottom-3">
          <button type="submit" disabled={pending || notMarked > 0 || !dirty} className="btn">
            {pending ? labels.saving : labels.saveAttendance}
          </button>
          {dirty && !pending && <span className="text-sm font-medium text-warn">{labels.unsaved}</span>}
          {!dirty && !state?.error && state?.ok && (
            <span role="status" className="text-sm font-medium text-good">
              {ok[state.ok]}
            </span>
          )}
          {state?.error && (
            <span role="alert" className="text-sm font-medium text-bad">
              {errors[state.error]}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
