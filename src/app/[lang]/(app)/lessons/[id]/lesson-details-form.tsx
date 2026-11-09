"use client";

import { useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { saveLessonDetails } from "@/app/actions";

export function LessonDetailsForm({
  lessonId,
  topic,
  materials,
  canEdit,
  labels,
  errors,
  ok,
}: {
  lessonId: string;
  topic: string;
  materials: string;
  canEdit: boolean;
  labels: Dictionary["lessonPage"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
}) {
  const [state, action, pending] = useActionState(saveLessonDetails, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lessonId" value={lessonId} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.topic}</span>
        <input name="topic" defaultValue={topic} maxLength={200} disabled={!canEdit} className="field disabled:opacity-60" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.materials}</span>
        <textarea name="materials" defaultValue={materials} maxLength={5000} rows={5} disabled={!canEdit} className="field disabled:opacity-60" />
        <span className="mt-1 block text-xs text-muted">{labels.materialsHint}</span>
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-good">
          {ok[state.ok]}
        </p>
      )}
      {canEdit && (
        <button type="submit" disabled={pending} className="btn">
          {pending ? labels.saving : labels.saveDetails}
        </button>
      )}
    </form>
  );
}
