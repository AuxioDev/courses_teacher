"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { MarkType } from "@/generated/prisma/enums";
import type { GradebookCell, GradebookColumn, GradebookRow } from "@/lib/data";
import { averageBand, formatAverage } from "@/lib/grading";
import { formatScore } from "@/lib/format-score";
import { fmt } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { updateMark, type FormState } from "@/app/actions";

const bandText = { good: "text-good", warn: "text-warn", bad: "text-bad" } as const;

// A lesson mark that can be corrected in place. Enter or leaving the field saves, Escape cancels.
function EditableCell({
  cell,
  label,
  onResult,
}: {
  cell: GradebookCell;
  label: string;
  onResult: (state: FormState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = (raw: string) => {
    setEditing(false);
    if (Number(raw) === cell.value && raw.trim() !== "") return;
    const data = new FormData();
    data.set("markId", cell.markId);
    data.set("value", raw);
    data.set("comment", cell.comment ?? ""); // a grid correction leaves the comment alone
    startTransition(async () => onResult(await updateMark(undefined, data)));
  };

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        autoFocus
        defaultValue={cell.value}
        aria-label={label}
        onFocus={(event) => event.target.select()}
        onBlur={(event) => save(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setEditing(false);
        }}
        className="w-16 rounded-md border border-accent bg-bg px-1 py-1 text-center font-mono text-sm outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      aria-label={label}
      title={cell.comment ?? undefined}
      className="min-h-11 w-full rounded-md sm:min-h-9 px-2 font-mono text-sm hover:bg-surface-2 disabled:opacity-50"
    >
      {formatScore(cell.value)}
    </button>
  );
}

export function GradebookGrid({
  groupId,
  columns,
  rows,
  showFinal,
  canEdit,
  locale,
  t,
  typeLabels,
  errors,
  ok,
}: {
  groupId: string;
  columns: GradebookColumn[];
  rows: GradebookRow[];
  showFinal: boolean;
  canEdit: boolean;
  locale: Locale;
  t: Dictionary["gradebook"];
  typeLabels: Record<MarkType, string>;
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, setState] = useState<FormState>(undefined);
  // The student and average columns stay in view while the marks scroll sideways, and the header row stays in view
  // while the students scroll up and down. On a phone they are narrow (176px of 360) so several lessons fit.
  const nameWidth = "w-28 min-w-28 max-w-28 sm:w-44 sm:min-w-44 sm:max-w-44";
  const averageWidth = "w-16 min-w-16 sm:w-20 sm:min-w-20 border-r border-line";
  const averageLeft = "left-28 sm:left-44";
  const stickyName = `sticky left-0 z-10 bg-surface ${nameWidth}`;
  const stickyAverage = `sticky ${averageLeft} z-10 bg-surface ${averageWidth}`;
  const headName = `sticky left-0 top-0 z-30 bg-surface ${nameWidth}`;
  const headAverage = `sticky ${averageLeft} top-0 z-30 bg-surface ${averageWidth}`;
  const headCell = "sticky top-0 z-20 bg-surface";

  return (
    <>
      <p aria-live="polite" className="mb-2 min-h-5 text-sm">
        {state?.error && <span className="font-medium text-bad">{errors[state.error]}</span>}
        {state?.ok && <span className="font-medium text-good">{ok[state.ok]}</span>}
      </p>
      <div className="scroll-hint max-h-[75dvh] overflow-auto rounded-2xl border border-line bg-surface">
        <table className="border-separate border-spacing-0 text-sm" data-group={groupId}>
          <thead>
            <tr className="align-bottom text-xs text-muted">
              <th scope="col" className={`${headName} border-b border-line px-3 py-2 text-left font-semibold`}>
                {t.student}
              </th>
              <th scope="col" className={`${headAverage} border-b border-line px-1 py-2 text-center font-semibold sm:px-2`}>
                {t.average}
              </th>
              {showFinal && (
                <th scope="col" className={`${headCell} border-b border-r border-line px-2 py-2 text-center font-semibold`}>
                  {t.final}
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  title={column.title ?? undefined}
                  className={`${headCell} min-w-[4.75rem] border-b border-line px-1 py-2 text-center font-medium`}
                >
                  {column.href ? (
                    <Link href={localePath(locale, column.href)} className="block py-1.5 text-accent">
                      {column.date}
                    </Link>
                  ) : (
                    <span className="block">{column.date}</span>
                  )}
                  <span className="block font-normal">
                    {typeLabels[column.type]}
                    {column.weight !== 1 && ` ×${column.weight}`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.enrolled ? "" : "text-muted"}>
                <th scope="row" className={`${stickyName} border-b border-line px-3 py-1.5 text-left font-medium`}>
                  <span className="block break-words leading-tight sm:truncate" title={row.name}>
                    {row.name}
                  </span>
                  {!row.enrolled && <span className="block text-[0.6875rem] font-normal">{t.left}</span>}
                </th>
                <td
                  className={`${stickyAverage} border-b px-1 py-1.5 text-center font-mono font-semibold sm:px-2 ${
                    row.average === null ? "text-muted" : bandText[averageBand(row.average)]
                  }`}
                >
                  {row.average === null ? "—" : formatAverage(row.average)}
                </td>
                {showFinal && (
                  <td className="border-b border-r border-line px-2 py-1.5 text-center font-mono">
                    {row.finalGrade === null ? "—" : formatScore(row.finalGrade)}
                  </td>
                )}
                {columns.map((column) => {
                  const cell = row.cells[column.key];
                  // The visible score is part of the name, so "click 90" works for voice control.
                  const label = cell
                    ? fmt(t.cellLabel, { name: row.name, date: column.date, type: typeLabels[column.type], value: formatScore(cell.value) })
                    : "";
                  return (
                    <td key={column.key} className="border-b border-line px-0.5 py-1 text-center">
                      {!cell ? (
                        <span className="text-muted">·</span>
                      ) : column.homeworkId ? (
                        <Link
                          href={localePath(locale, `/homework/${column.homeworkId}/students/${row.id}`)}
                          aria-label={label}
                          className="block rounded-md px-2 py-1.5 font-mono text-sm text-accent hover:bg-surface-2"
                        >
                          {formatScore(cell.value)}
                        </Link>
                      ) : canEdit && row.enrolled ? (
                        <EditableCell cell={cell} label={label} onResult={setState} />
                      ) : (
                        <span className="font-mono" title={cell.comment ?? undefined}>
                          {formatScore(cell.value)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
