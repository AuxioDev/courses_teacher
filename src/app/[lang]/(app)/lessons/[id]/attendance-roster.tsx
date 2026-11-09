"use client";

import { startTransition, useActionState, useState } from "react";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { Locale } from "@/i18n/config";
import { plural } from "@/i18n/format";
import { saveAttendance } from "@/app/actions";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

const selected: Record<AttendanceStatus, string> = {
  present: "peer-checked:bg-good peer-checked:text-accent-ink",
  late: "peer-checked:bg-warn peer-checked:text-accent-ink",
  absent: "peer-checked:bg-bad peer-checked:text-accent-ink",
  excused: "peer-checked:bg-muted peer-checked:text-accent-ink",
};

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
          <li key={student.id}>
            <div className="flex flex-col gap-2 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
              <span className="font-medium">{student.name}</span>
              <div role="radiogroup" aria-label={student.name} className="grid grid-cols-4 gap-1 xl:w-96 xl:shrink-0">
                {STATUSES.map((status) => (
                  <label key={status} className="min-w-0">
                    <input
                      type="radio"
                      name={`status:${student.id}`}
                      value={status}
                      checked={current(student) === status}
                      disabled={!canEdit}
                      onChange={() => setChanges((c) => ({ ...c, [student.id]: status }))}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex min-h-11 items-center justify-center rounded-lg bg-surface-2 px-1 text-center text-xs font-semibold text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${selected[status]} ${canEdit ? "cursor-pointer" : ""}`}
                    >
                      {statusLabels[status]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="sticky bottom-20 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 md:bottom-3">
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
