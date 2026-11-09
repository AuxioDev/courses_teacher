import Link from "next/link";
import { getCurrentTeacher } from "@/lib/auth";
import { getHomeworkToCheck, getLessonsBetween, getMyGroups, resolveTerm } from "@/lib/data";
import { dayKey, dayRange, formatDayKey } from "@/lib/dates";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { HomeworkToCheck } from "@/components/homework-to-check";
import { LessonCard } from "@/components/lesson-card";
import { ProgressBadges } from "@/components/progress-badges";
import { Card, Empty, PageTitle, Section } from "@/components/ui";

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function DashboardPage() {
  return <Dashboard />;
}

async function Dashboard() {
  const [{ locale, t }, teacher] = await Promise.all([getI18n(), getCurrentTeacher()]);
  const now = new Date();
  const today = dayKey(now, teacher.timezone);
  const { start, end } = dayRange(today, teacher.timezone);
  const { term } = await resolveTerm(null);
  const [lessons, toCheck, groups] = await Promise.all([
    getLessonsBetween(start, end),
    getHomeworkToCheck(),
    term ? getMyGroups(term.id) : [],
  ]);
  const behind = groups.flatMap((group) =>
    group.students.filter((s) => s.fallingBehind).map((student) => ({ student, group })),
  );

  return (
    <>
      <PageTitle
        title={fmt(t.dashboard.greeting, { name: teacher.name.split(" ")[0] })}
        subtitle={formatDayKey(today, locale)}
      />
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
        <Section title={t.dashboard.todayLessons}>
          {lessons.length === 0 ? (
            <Empty>{t.dashboard.noLessons}</Empty>
          ) : (
            <div className="space-y-2">
              {lessons.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} timeZone={teacher.timezone} now={now} />
              ))}
            </div>
          )}
        </Section>
        <div>
          <Section title={t.dashboard.toCheck}>
            <HomeworkToCheck items={toCheck} timeZone={teacher.timezone} locale={locale} t={t} />
          </Section>
          <Section title={t.dashboard.fallingBehind}>
            {behind.length === 0 ? (
              <Empty>{t.dashboard.nobodyBehind}</Empty>
            ) : (
              <Card className="divide-y divide-line p-0">
                {behind.map(({ student, group }) => (
                  <Link
                    key={`${group.id}:${student.id}`}
                    href={localePath(locale, `/groups/${group.id}`)}
                    className="block px-4 py-3"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{student.name}</span>
                      <span className="text-xs text-muted">
                        {group.course} · {group.name}
                      </span>
                    </span>
                    <span className="mt-1 block">
                      <ProgressBadges student={student} labels={t.groups.reasons} locale={locale} />
                    </span>
                  </Link>
                ))}
              </Card>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
