"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { saveLessonDetails, type FormState } from "@/app/actions";
import { CharCounter, FormMessage } from "@/components/form-kit";
import { SubmitButton } from "@/components/submit-button";

const TOPIC_MAX = 200;
const MATERIALS_MAX = 5000;

// The boxes are kept in the page, so what was typed is still there if saving fails.
export function LessonDetailsForm({
  lessonId,
  topic,
  materials,
  canEdit,
  labels,
  errors,
  ok,
  counter,
}: {
  lessonId: string;
  topic: string;
  materials: string;
  canEdit: boolean;
  labels: Dictionary["lessonPage"];
  errors: Dictionary["errors"];
  ok: Dictionary["ok"];
  counter: Dictionary["form"];
}) {
  const [values, setValues] = useState({ topic, materials });
  const [edited, setEdited] = useState(false);
  const [state, action] = useActionState(async (previous: FormState, formData: FormData) => {
    const result = await saveLessonDetails(previous, formData);
    setEdited(false);
    return result;
  }, undefined);
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setEdited(true);
  };
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lessonId" value={lessonId} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.topic}</span>
        <input
          name="topic"
          value={values.topic}
          onChange={set("topic")}
          maxLength={TOPIC_MAX + 50}
          disabled={!canEdit}
          className="field disabled:opacity-60"
        />
        {canEdit && <CharCounter length={values.topic.length} max={TOPIC_MAX} labels={counter} />}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.materials}</span>
        <textarea
          name="materials"
          value={values.materials}
          onChange={set("materials")}
          maxLength={MATERIALS_MAX + 500}
          rows={5}
          disabled={!canEdit}
          className="field disabled:opacity-60"
        />
        {canEdit && <CharCounter length={values.materials.length} max={MATERIALS_MAX} labels={counter} />}
        <span className="block text-xs text-muted">{labels.materialsHint}</span>
      </label>
      {state?.error && <FormMessage kind="error">{errors[state.error]}</FormMessage>}
      {state?.ok && !edited && <FormMessage kind="success">{ok[state.ok]}</FormMessage>}
      {canEdit && (
        <SubmitButton className="btn" pendingLabel={labels.saving}>
          {labels.saveDetails}
        </SubmitButton>
      )}
    </form>
  );
}
