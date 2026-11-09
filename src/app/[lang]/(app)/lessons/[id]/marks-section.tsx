"use client";

import { useState, useTransition } from "react";
import type { MarkType } from "@/generated/prisma/enums";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { addMarks, updateMark, type FormState } from "@/app/actions";

const GIVEN_TYPES = ["classwork", "quiz", "exam"] as const;
type GivenType = (typeof GIVEN_TYPES)[number];

type Labels = Dictionary["marksPage"];

function Message({ state, errors, ok }: { state: FormState; errors: Dictionary["errors"]; ok: Dictionary["ok"] }) {
  if (state?.error) {
    return (
      <span role="alert" className="text-sm font-medium text-bad">
        {errors[state.error]}
      </span>
    );
  }
  if (state?.ok) {
    return (
      <span role="status" className="text-sm font-medium text-good">
        {ok[state.ok]}
      </span>
    );
  }
  return null;
}

export function NewMarksForm({
  lessonId,
  students,
  weights,
  labels,
  typeLabels,
  errors,
  ok,
}: {
  lessonId: string;
  students: { id: string; name: string }[];
  weights: Record<MarkType, number>;
  labels: Labels;
  typeLabels: Dictionary["marks"]["type"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [type, setType] = useState<GivenType>("classwork");
  const [weight, setWeight] = useState(String(weights.classwork));
  const [values, setValues] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [state, setState] = useState<FormState>(undefined);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await addMarks(undefined, data);
          setState(result);
          if (result?.ok) {
            setValues({});
            setComments({});
          }
        });
      }}
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <input type="hidden" name="lessonId" value={lessonId} />
      <h3 className="mb-3 text-sm font-semibold">{labels.add}</h3>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:max-w-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{labels.type}</span>
          <select
            name="type"
            value={type}
            onChange={(event) => {
              const next = event.target.value as GivenType;
              setType(next);
              setWeight(String(weights[next]));
            }}
            className="field"
          >
            {GIVEN_TYPES.map((item) => (
              <option key={item} value={item}>
                {typeLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">{labels.weight}</span>
          <input
            name="weight"
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            required
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            className="field"
          />
        </label>
      </div>

      <ul className="space-y-2">
        {students.map((student) => (
          <li key={student.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)]">
            <span className="text-sm font-medium">{student.name}</span>
            <input
              name={`value:${student.id}`}
              type="number"
              min={0}
              max={100}
              step={0.1}
              inputMode="decimal"
              aria-label={`${labels.value}: ${student.name}`}
              placeholder="0–100"
              value={values[student.id] ?? ""}
              onChange={(event) => setValues((v) => ({ ...v, [student.id]: event.target.value }))}
              className="field font-mono"
            />
            <input
              name={`comment:${student.id}`}
              maxLength={500}
              aria-label={`${labels.comment}: ${student.name}`}
              placeholder={labels.comment}
              value={comments[student.id] ?? ""}
              onChange={(event) => setComments((c) => ({ ...c, [student.id]: event.target.value }))}
              className="field col-span-2 sm:col-span-1"
            />
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted">{labels.hint}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn">
          {pending ? labels.saving : labels.save}
        </button>
        <Message state={state} errors={errors} ok={ok} />
      </div>
    </form>
  );
}

// One mark already given. Only the value and comment can be corrected, and each change
// to the value is recorded in the mark's history.
export function MarkRow({
  mark,
  canEdit,
  labels,
  typeLabels,
  errors,
  ok,
}: {
  mark: { id: string; studentName: string; type: MarkType; value: number; weight: number; comment: string | null };
  canEdit: boolean;
  labels: Labels;
  typeLabels: Dictionary["marks"]["type"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [value, setValue] = useState(String(mark.value));
  const [comment, setComment] = useState(mark.comment ?? "");
  const [state, setState] = useState<FormState>(undefined);
  const [pending, startTransition] = useTransition();
  const dirty = Number(value) !== mark.value || comment !== (mark.comment ?? "");
  const heading = (
    <span className="min-w-0 text-sm">
      <span className="block truncate font-medium">{mark.studentName}</span>
      <span className="block text-xs text-muted">
        {typeLabels[mark.type]}
        {mark.weight !== 1 && ` ×${mark.weight}`}
      </span>
    </span>
  );

  if (!canEdit) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          {heading}
          {mark.comment && <span className="mt-0.5 block text-xs text-muted">{mark.comment}</span>}
        </span>
        <span className="font-mono text-lg font-semibold">{mark.value}</span>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => setState(await updateMark(undefined, data)));
      }}
      className="px-4 py-3"
    >
      <input type="hidden" name="markId" value={mark.id} />
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)]">
        {heading}
        <input
          name="value"
          type="number"
          min={0}
          max={100}
          step={0.1}
          required
          aria-label={`${labels.value}: ${mark.studentName}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="field font-mono"
        />
        <input
          name="comment"
          maxLength={500}
          aria-label={`${labels.comment}: ${mark.studentName}`}
          placeholder={labels.comment}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          className="field col-span-2 sm:col-span-1"
        />
      </div>
      {(dirty || state) && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {dirty && (
            <button type="submit" disabled={pending} className="btn-ghost">
              {pending ? labels.saving : labels.correct}
            </button>
          )}
          {!dirty && <Message state={state} errors={errors} ok={ok} />}
          {dirty && state?.error && <Message state={state} errors={errors} ok={ok} />}
        </div>
      )}
    </form>
  );
}
