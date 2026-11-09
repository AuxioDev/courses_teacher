"use client";

import { startTransition, useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { deleteHomework, saveHomework } from "@/app/actions";

type Values = { title: string; description: string; attachments: string; dueAt: string; maxScore: number };

export function HomeworkForm({
  target,
  values,
  canEdit,
  maxScoreLocked,
  labels,
  errors,
}: {
  target: { homeworkId: string } | { groupId: string; lessonId: string | null };
  values: Values;
  canEdit: boolean;
  maxScoreLocked: boolean;
  labels: Dictionary["homeworkPage"];
  errors: Dictionary["errors"];
}) {
  const [state, action, pending] = useActionState(saveHomework, undefined);
  const editing = "homeworkId" in target;
  return (
    // Not <form action>: React resets the form after an action, which would wipe what
    // the teacher typed whenever a field is rejected.
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {"homeworkId" in target ? (
        <input type="hidden" name="homeworkId" value={target.homeworkId} />
      ) : (
        <>
          <input type="hidden" name="groupId" value={target.groupId} />
          {target.lessonId && <input type="hidden" name="lessonId" value={target.lessonId} />}
        </>
      )}
      <fieldset disabled={!canEdit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.titleField}</span>
          <input name="title" defaultValue={values.title} required maxLength={200} className="field disabled:opacity-60" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.description}</span>
          <textarea name="description" defaultValue={values.description} rows={6} maxLength={20000} className="field disabled:opacity-60" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{labels.attachments}</span>
          <textarea
            name="attachments"
            defaultValue={values.attachments}
            rows={3}
            placeholder="https://…"
            className="field font-mono text-sm disabled:opacity-60"
          />
          <span className="mt-1 block text-xs text-muted">{labels.attachmentsHint}</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.due}</span>
            <input name="dueAt" type="datetime-local" defaultValue={values.dueAt} required className="field disabled:opacity-60" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{labels.maxScore}</span>
            <input
              name="maxScore"
              type="number"
              min={1}
              max={1000}
              step={1}
              defaultValue={values.maxScore}
              required
              readOnly={maxScoreLocked}
              className="field read-only:opacity-60 disabled:opacity-60"
            />
            {maxScoreLocked && <span className="mt-1 block text-xs text-muted">{labels.maxScoreLocked}</span>}
          </label>
        </div>
      </fieldset>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn">
            {pending ? labels.saving : editing ? labels.save : labels.create}
          </button>
          {!editing && <span className="text-xs text-muted">{labels.notifyHint}</span>}
        </div>
      )}
    </form>
  );
}

export function DeleteHomeworkButton({
  homeworkId,
  labels,
  errors,
}: {
  homeworkId: string;
  labels: Dictionary["homeworkPage"];
  errors: Dictionary["errors"];
}) {
  const [state, action, pending] = useActionState(deleteHomework, undefined);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(labels.deleteConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="homeworkId" value={homeworkId} />
      <button type="submit" disabled={pending} className="btn-ghost text-bad">
        {labels.delete}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
    </form>
  );
}
