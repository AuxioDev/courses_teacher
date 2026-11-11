import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getLesson } from "@/lib/data";
import { dayKey, formatDayKey, formatTime } from "@/lib/dates";
import { ATTENDANCE_OPENS_BEFORE_MS } from "@/lib/lesson-rules";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { HomeworkList } from "@/components/homework-list";
import { Badge, Card, Empty, Section, type Tone } from "@/components/ui";
import { ChevronLeft, VideoIcon } from "@/components/icons";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { AttendanceRoster } from "./attendance-roster";
import { LessonDetailsForm } from "./lesson-details-form";
import { MarkRow, NewMarksForm } from "./marks-section";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.lessons };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

const tone: Record<AttendanceStatus, Tone> = { present: "good", late: "warn", absent: "bad", excused: "neutral" };

export default function LessonPage({ params }: PageProps<"/[lang]/lessons/[id]">) {
  return <Lesson params={params} />;
}

async function Lesson({ params }: Pick<PageProps<"/[lang]/lessons/[id]">, "params">) {
  const [{ locale, t }, teacher, { id }] = await Promise.all([getI18n(), getCurrentTeacher(), params]);
  const lesson = await getLesson(id);
  if (!lesson) notFound();

  const tz = teacher.timezone;
  const day = dayKey(lesson.startsAt, tz);
  const now = new Date();
  const canEditDetails = !lesson.group.term.locked && lesson.status !== "cancelled";
  const canTakeAttendance = lesson.availability === "open";
  const live =
    lesson.status !== "cancelled" &&
    lesson.meetingUrl &&
    now.getTime() >= lesson.startsAt.getTime() - ATTENDANCE_OPENS_BEFORE_MS &&
    now < lesson.endsAt;
  const notice =
    lesson.availability === "termLocked"
      ? t.lessonPage.termLocked
      : lesson.availability === "cancelled"
        ? t.lessonPage.cancelled
        : lesson.availability === "tooEarly"
          ? fmt(t.lessonPage.tooEarly, {
              time: formatTime(new Date(lesson.startsAt.getTime() - ATTENDANCE_OPENS_BEFORE_MS), tz),
            })
          : null;

  return (
    <>
      <Link href={localePath(locale, `/lessons?view=week&date=${day}`)} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {t.nav.lessons}
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{lesson.group.course.title}</h1>
            {lesson.status === "moved" && <Badge tone="warn">{t.lesson.status.moved}</Badge>}
            {lesson.status === "cancelled" && <Badge tone="bad">{t.lesson.status.cancelled}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted first-letter:uppercase">
            {formatDayKey(day, locale)} · {formatTime(lesson.startsAt, tz)}–{formatTime(lesson.endsAt, tz)}
          </p>
          <p className="text-sm text-muted">
            {lesson.isGroupTeacher ? (
              <Link href={localePath(locale, `/groups/${lesson.group.id}`)} className="text-accent underline underline-offset-2">
                {lesson.group.name}
              </Link>
            ) : (
              lesson.group.name
            )}{" "}
            · {lesson.group.term.name}
          </p>
        </div>
        {live && (
          <a href={lesson.meetingUrl!} target="_blank" rel="noreferrer" className="btn">
            <VideoIcon width={18} height={18} /> {t.lesson.join}
          </a>
        )}
      </div>

      {notice && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{notice}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div>
          <Section title={t.lessonPage.attendance}>
            {lesson.roster.length === 0 ? (
              <Empty>{t.groups.noStudents}</Empty>
            ) : (
              <AttendanceRoster
                lessonId={lesson.id}
                students={lesson.roster}
                canEdit={canTakeAttendance}
                labels={t.lessonPage}
                statusLabels={t.attendance.status}
                errors={t.errors}
                ok={t.ok}
                notMarkedForms={t.lessonPage.notMarked}
                locale={locale}
              />
            )}
          </Section>

          {lesson.isGroupTeacher && (canTakeAttendance || lesson.marks.length > 0) && (
            <Section title={t.marksPage.title}>
              <div className="space-y-3">
                {lesson.marks.length > 0 && (
                  <Card className="divide-y divide-line p-0">
                    {lesson.marks.map((mark) => (
                      <MarkRow
                        key={mark.id}
                        mark={mark}
                        canEdit={!lesson.group.term.locked}
                        labels={t.marksPage}
                        typeLabels={t.marks.type}
                        errors={t.errors}
                        ok={t.ok}
                      />
                    ))}
                  </Card>
                )}
                {canTakeAttendance && lesson.roster.length > 0 && (
                  <NewMarksForm
                    lessonId={lesson.id}
                    students={lesson.roster}
                    weights={lesson.markWeights}
                    labels={t.marksPage}
                    typeLabels={t.marks.type}
                    errors={t.errors}
                    ok={t.ok}
                  />
                )}
              </div>
            </Section>
          )}

          {lesson.left.length > 0 && (
            <Section title={t.groups.left}>
              <Card className="divide-y divide-line p-0">
                {lesson.left.map((student) => (
                  <div key={student.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="font-medium">{student.name}</span>
                    <Badge tone={tone[student.status]}>{t.attendance.status[student.status]}</Badge>
                  </div>
                ))}
              </Card>
            </Section>
          )}
        </div>

        <div>
          <Section title={t.lessonPage.details}>
            <Card>
              <LessonDetailsForm
                lessonId={lesson.id}
                topic={lesson.topic ?? ""}
                materials={lesson.materials ?? ""}
                canEdit={canEditDetails}
                labels={t.lessonPage}
                errors={t.errors}
                ok={t.ok}
              />
            </Card>
          </Section>
          {lesson.isGroupTeacher && (
            <Section
              title={t.homeworkPage.title}
              action={
                canEditDetails && (
                  <Link
                    href={localePath(locale, `/groups/${lesson.group.id}/homework/new?lesson=${lesson.id}`)}
                    className="text-sm font-medium text-accent"
                  >
                    {t.homeworkPage.give}
                  </Link>
                )
              }
            >
              <HomeworkList items={lesson.homework} timeZone={tz} locale={locale} t={t} />
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
