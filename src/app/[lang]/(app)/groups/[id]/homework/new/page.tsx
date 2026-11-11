import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getGroupForNewHomework } from "@/lib/data";
import { defaultDueInput } from "@/lib/homework-rules";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { HomeworkForm } from "@/components/homework-form";
import { Card } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.homeworkPage.give };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function NewHomeworkPage(props: PageProps<"/[lang]/groups/[id]/homework/new">) {
  return <NewHomework {...props} />;
}

async function NewHomework({ params, searchParams }: PageProps<"/[lang]/groups/[id]/homework/new">) {
  const [{ locale, t }, teacher, { id }, query] = await Promise.all([getI18n(), getCurrentTeacher(), params, searchParams]);
  const group = await getGroupForNewHomework(id, query.lesson);
  if (!group) notFound();
  const back = group.lesson?.ownLesson ? `/lessons/${group.lesson.id}` : `/groups/${group.id}`;
  const canEdit = !group.term.locked && group.lesson?.status !== "cancelled";

  return (
    <div className="max-w-2xl">
      <Link href={localePath(locale, back)} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {group.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t.homeworkPage.give}</h1>
      <p className="mb-5 mt-0.5 text-sm text-muted">
        {group.course.title} · {group.name}
        {group.lesson?.topic && ` · ${group.lesson.topic}`}
      </p>
      {group.term.locked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.homeworkPage.termLocked}</p>}
      <Card>
        <HomeworkForm
          target={{ groupId: group.id, lessonId: group.lesson?.id ?? null }}
          values={{ title: "", description: "", attachments: "", dueAt: defaultDueInput(new Date(), teacher.timezone), maxScore: 100 }}
          canEdit={canEdit}
          maxScoreLocked={false}
          labels={t.homeworkPage}
          errors={t.errors}
        />
      </Card>
    </div>
  );
}
