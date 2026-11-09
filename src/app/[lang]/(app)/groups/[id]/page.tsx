import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getGroup, type StudentProgress } from "@/lib/data";
import { averageBand, formatAverage } from "@/lib/grading";
import { fmt, getI18n, plural } from "@/i18n";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatRate, ProgressBadges } from "@/components/progress-badges";
import { HomeworkList } from "@/components/homework-list";
import { Badge, Empty, Section } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.groups };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function GroupPage({ params }: PageProps<"/[lang]/groups/[id]">) {
  return <Group params={params} />;
}

const bandText = { good: "text-good", warn: "text-warn", bad: "text-bad" } as const;

async function Group({ params }: Pick<PageProps<"/[lang]/groups/[id]">, "params">) {
  const [{ locale, t }, teacher, { id }] = await Promise.all([getI18n(), getCurrentTeacher(), params]);
  const group = await getGroup(id);
  if (!group) notFound();

  return (
    <>
      <Link href={localePath(locale, "/groups")} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {t.nav.groups}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">{group.course.title}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          {group.name} · {group.term.name} · {plural(locale, t.groups.students, group.students.length)}
          {group.term.locked && <Badge>{t.groups.locked}</Badge>}
        </p>
        </div>
        <Link href={localePath(locale, `/groups/${group.id}/gradebook`)} className="btn-ghost">
          {t.gradebook.title}
        </Link>
      </div>

      <Section title={t.groups.studentsTitle}>
        {group.students.length === 0 ? (
          <Empty>{t.groups.noStudents}</Empty>
        ) : (
          <StudentTable students={group.students} t={t} locale={locale} />
        )}
      </Section>

      <Section
        title={t.homeworkPage.title}
        action={
          !group.term.locked && (
            <Link href={localePath(locale, `/groups/${group.id}/homework/new`)} className="text-sm font-medium text-accent">
              {t.homeworkPage.give}
            </Link>
          )
        }
      >
        <HomeworkList items={group.homework} timeZone={teacher.timezone} locale={locale} t={t} />
      </Section>

      {group.left.length > 0 && (
        <Section title={t.groups.left}>
          <StudentTable students={group.left} t={t} locale={locale} />
        </Section>
      )}
    </>
  );
}

function StudentTable({ students, t, locale }: { students: StudentProgress[]; t: Dictionary; locale: Locale }) {
  const header = "px-4 py-2 text-left text-xs font-semibold text-muted";
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={header}>{t.groups.student}</th>
            <th scope="col" className={header}>{t.groups.attendance}</th>
            <th scope="col" className={header}>{t.groups.average}</th>
            <th scope="col" className={header}>{t.groups.homework}</th>
            <th scope="col" className={header}>{t.groups.attention}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {students.map((student) => (
            <tr key={student.id}>
              <th scope="row" className="px-4 py-3 text-left font-medium">{student.name}</th>
              <td className="px-4 py-3 font-mono">{formatRate(student.attendanceRate)}</td>
              <td className={`px-4 py-3 font-mono font-semibold ${student.average === null ? "text-muted" : bandText[averageBand(student.average)]}`}>
                {student.average === null ? "—" : formatAverage(student.average)}
              </td>
              <td className="px-4 py-3 font-mono">
                {student.assigned === 0 ? "—" : fmt(t.groups.handedIn, { done: student.handedIn, total: student.assigned })}
              </td>
              <td className="px-4 py-3">
                {student.fallingBehind && <ProgressBadges student={student} labels={t.groups.reasons} locale={locale} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
