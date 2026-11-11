import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getSubmissionReview, type ReviewAttempt } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { formatScore } from "@/lib/format-score";
import { formatBytes } from "@/lib/upload-policy";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { Badge, Card, Empty, Section, type Tone } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";
import { GiveZeroForm, ReviewForm } from "./review-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.homework };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

type Route = "/[lang]/homework/[id]/students/[studentId]";

export default function ReviewPage({ params }: PageProps<Route>) {
  return <Review params={params} />;
}

function timing(attempt: ReviewAttempt, previous: ReviewAttempt | undefined, t: Dictionary["checking"]): { label: string; tone: Tone } {
  if (attempt.late) return { label: t.timing.late, tone: "bad" };
  if (previous?.outcome === "returned") return { label: t.timing.afterRevision, tone: "neutral" };
  return { label: t.timing.onTime, tone: "good" };
}

function Attempt({ attempt, t }: { attempt: ReviewAttempt; t: Dictionary["checking"] }) {
  return (
    <div className="space-y-3 text-sm">
      {attempt.content && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted">{t.answer}</p>
          <p className="whitespace-pre-wrap break-words">{attempt.content}</p>
        </div>
      )}
      {attempt.files.length > 0 && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted">{t.files}</p>
          <ul className="space-y-1">
            {attempt.files.map((file) => (
              <li key={file.id} className="flex items-baseline gap-2">
                <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="truncate text-accent">
                  {file.name}
                </a>
                <span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {attempt.links.length > 0 && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted">{t.links}</p>
          <ul className="space-y-1">
            {attempt.links.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer" className="break-all text-accent">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

async function Review({ params }: Pick<PageProps<Route>, "params">) {
  const [{ locale, t }, teacher, { id, studentId }] = await Promise.all([getI18n(), getCurrentTeacher(), params]);
  const review = await getSubmissionReview(id, studentId);
  if (!review) notFound();

  const tz = teacher.timezone;
  const [latest, ...earlier] = review.attempts;
  const canReview = !review.termLocked && review.enrolled && latest !== undefined;
  const status = review.submissionStatus;
  const waiting = status === "submitted" || status === "late";
  const canGiveZero = !review.termLocked && review.enrolled && !latest && review.mark === null && review.dueAt < new Date();

  return (
    <>
      <Link href={localePath(locale, `/homework/${review.homeworkId}`)} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {review.title}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{review.studentName}</h1>
      <p className="mb-5 mt-0.5 text-sm text-muted">
        {review.course} · {review.groupName} · {fmt(t.dashboard.due, { date: formatDateTime(review.dueAt, tz, locale) })}
      </p>
      {review.termLocked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.homeworkPage.termLocked}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-8">
        <div>
          <Section title={t.checking.submission}>
            {latest ? (
              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {fmt(t.checking.attempt, { n: latest.number })} · {formatDateTime(latest.submittedAt, tz, locale)}
                  </p>
                  <Badge tone={timing(latest, earlier[0], t.checking).tone}>{timing(latest, earlier[0], t.checking).label}</Badge>
                </div>
                <Attempt attempt={latest} t={t.checking} />
              </Card>
            ) : (
              <Empty>
                {review.mark !== null ? t.checking.state.givenZero : review.dueAt < new Date() ? t.checking.state.missing : t.checking.state.notYet}
              </Empty>
            )}
          </Section>

          {earlier.length > 0 && (
            <Section title={t.checking.earlier}>
              <div className="space-y-2">
                {earlier.map((attempt, index) => (
                  <details key={attempt.id} className="rounded-2xl border border-line bg-surface">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                      <span className="min-w-0">
                        <span className="block font-medium">{fmt(t.checking.attempt, { n: attempt.number })}</span>
                        <span className="block text-xs text-muted">
                          {formatDateTime(attempt.submittedAt, tz, locale)} · {timing(attempt, earlier[index + 1], t.checking).label}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {attempt.outcome === "returned"
                          ? t.checking.state.returned
                          : attempt.outcome === "graded"
                            ? t.checking.state.graded
                            : t.checking.replaced}
                      </span>
                    </summary>
                    <div className="space-y-3 border-t border-line p-4">
                      {attempt.feedback && (
                        <div className="rounded-xl bg-warn-soft/50 p-3 text-sm">
                          <p className="mb-1 text-xs font-semibold text-muted">{t.checking.feedback}</p>
                          <p className="whitespace-pre-wrap break-words">{attempt.feedback}</p>
                        </div>
                      )}
                      <Attempt attempt={attempt} t={t.checking} />
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div>
          {latest && (
            <Section title={status === "graded" ? t.checking.state.graded : status === "returned" ? t.checking.state.returned : t.checking.decision}>
              <Card>
                {canReview && (waiting || status === "graded") ? (
                  <ReviewForm
                    attemptId={latest.id}
                    maxScore={review.maxScore}
                    score={latest.score}
                    feedback={latest.feedback ?? ""}
                    regrade={status === "graded"}
                    labels={t.checking}
                    errors={t.errors}
                  />
                ) : (
                  <div className="space-y-2 text-sm">
                    {latest.score !== null && (
                      <p className="font-mono text-2xl font-semibold">
                        {formatScore(latest.score)}
                        <span className="text-base text-muted">/{review.maxScore}</span>
                      </p>
                    )}
                    {latest.feedback && <p className="whitespace-pre-wrap break-words">{latest.feedback}</p>}
                    {status === "returned" && <p className="text-muted">{t.checking.waitingForStudent}</p>}
                  </div>
                )}
              </Card>
            </Section>
          )}
          {canGiveZero && (
            <Section title={t.checking.decision}>
              <Card>
                <GiveZeroForm homeworkId={review.homeworkId} studentId={studentId} labels={t.checking} errors={t.errors} />
              </Card>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
