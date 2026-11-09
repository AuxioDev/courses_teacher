import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getHomeworkChecking, type CheckingState } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { formatScore } from "@/lib/format-score";
import { Badge, Card, Section, type Tone } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.homework };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

const tone: Record<CheckingState, Tone> = {
  toCheck: "accent",
  late: "warn",
  returned: "warn",
  graded: "good",
  givenZero: "bad",
  missing: "bad",
  notYet: "neutral",
};

export default function HomeworkCheckingPage({ params }: PageProps<"/[lang]/homework/[id]">) {
  return <Checking params={params} />;
}

async function Checking({ params }: Pick<PageProps<"/[lang]/homework/[id]">, "params">) {
  const [{ locale, t }, teacher, { id }] = await Promise.all([getI18n(), getCurrentTeacher(), params]);
  const homework = await getHomeworkChecking(id);
  if (!homework) notFound();

  const list = (rows: typeof homework.students) => (
    <Card className="divide-y divide-line p-0">
      {rows.map((row) => (
        <Link
          key={row.id}
          href={localePath(locale, `/homework/${homework.id}/students/${row.id}`)}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{row.name}</span>
            {row.submittedAt && (
              <span className="block text-xs text-muted">{formatDateTime(row.submittedAt, teacher.timezone, locale)}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {row.score !== null && (
              <span className="font-mono text-sm font-semibold">
                {formatScore(row.score)}/{homework.maxScore}
              </span>
            )}
            <Badge tone={tone[row.state]}>{t.checking.state[row.state]}</Badge>
            <ChevronRight width={16} height={16} className="text-muted" />
          </span>
        </Link>
      ))}
    </Card>
  );

  return (
    <div className="max-w-3xl">
      <Link href={localePath(locale, "/homework")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.homework}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{homework.title}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {homework.group.course.title} · {homework.group.name} ·{" "}
            {fmt(t.dashboard.due, { date: formatDateTime(homework.dueAt, teacher.timezone, locale) })} ·{" "}
            {fmt(t.checking.maxPoints, { n: homework.maxScore })}
          </p>
        </div>
        <Link href={localePath(locale, `/homework/${homework.id}/edit`)} className="btn-ghost">
          {t.homeworkPage.editTitle}
        </Link>
      </div>
      {homework.group.term.locked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.homeworkPage.termLocked}</p>}
      <Section title={t.groups.studentsTitle}>{list(homework.students)}</Section>
      {homework.left.length > 0 && <Section title={t.groups.left}>{list(homework.left)}</Section>}
    </div>
  );
}
