"use client";

import { startTransition, useActionState } from "react";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { giveZero, reviewSubmission } from "@/app/actions";

export function ReviewForm({
  attemptId,
  maxScore,
  score,
  feedback,
  regrade,
  labels,
  errors,
}: {
  attemptId: string;
  maxScore: number;
  score: number | null;
  feedback: string;
  regrade: boolean;
  labels: Dictionary["checking"];
  errors: Dictionary["errors"];
}) {
  const [state, action, pending] = useActionState(reviewSubmission, undefined);
  return (
    // Not <form action>: React resets the form after an action, which would wipe the feedback
    // whenever it is refused. The clicked button says whether this is a grade or a return.
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="attemptId" value={attemptId} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.score}</span>
        <span className="flex items-center gap-2">
          <input
            name="score"
            type="number"
            min={0}
            max={maxScore}
            step={1}
            inputMode="numeric"
            defaultValue={score ?? ""}
            className="field w-28 font-mono"
          />
          <span className="font-mono text-muted">/{maxScore}</span>
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{labels.feedback}</span>
        <textarea name="feedback" defaultValue={feedback} rows={6} maxLength={5000} className="field" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="grade" disabled={pending} className="btn">
          {pending ? labels.saving : regrade ? labels.changeGrade : labels.grade}
        </button>
        {!regrade && (
          <button type="submit" name="decision" value="return" disabled={pending} className="btn-ghost">
            {labels.returnForRevision}
          </button>
        )}
      </div>
    </form>
  );
}

export function GiveZeroForm({
  homeworkId,
  studentId,
  labels,
  errors,
}: {
  homeworkId: string;
  studentId: string;
  labels: Dictionary["checking"];
  errors: Dictionary["errors"];
}) {
  const [state, action, pending] = useActionState(giveZero, undefined);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(labels.giveZeroConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="homeworkId" value={homeworkId} />
      <input type="hidden" name="studentId" value={studentId} />
      <button type="submit" disabled={pending} className="btn-ghost text-bad">
        {labels.giveZero}
      </button>
      <p className="mt-2 text-xs text-muted">{labels.giveZeroHint}</p>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {errors[state.error]}
        </p>
      )}
    </form>
  );
}
