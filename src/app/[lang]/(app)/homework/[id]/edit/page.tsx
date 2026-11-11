import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getHomeworkForEdit } from "@/lib/data";
import { dateToLocalInput } from "@/lib/homework-rules";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { DeleteHomeworkButton, HomeworkForm } from "@/components/homework-form";
import { Card } from "@/components/ui";
import { ChevronLeft } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.homeworkPage.editTitle };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function EditHomeworkPage({ params }: PageProps<"/[lang]/homework/[id]/edit">) {
  return <EditHomework params={params} />;
}

async function EditHomework({ params }: Pick<PageProps<"/[lang]/homework/[id]/edit">, "params">) {
  const [{ locale, t }, teacher, { id }] = await Promise.all([getI18n(), getCurrentTeacher(), params]);
  const homework = await getHomeworkForEdit(id);
  if (!homework) notFound();
  const canEdit = !homework.group.term.locked;

  return (
    <div className="max-w-2xl">
      <Link href={localePath(locale, `/homework/${homework.id}`)} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {homework.title}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t.homeworkPage.editTitle}</h1>
      <p className="mb-5 mt-0.5 text-sm text-muted">
        {homework.group.course.title} · {homework.group.name}
      </p>
      {!canEdit && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.homeworkPage.termLocked}</p>}
      <Card>
        <HomeworkForm
          target={{ homeworkId: homework.id }}
          values={{
            title: homework.title,
            description: homework.description ?? "",
            attachments: homework.attachments.join("\n"),
            dueAt: dateToLocalInput(homework.dueAt, teacher.timezone),
            maxScore: homework.maxScore,
          }}
          canEdit={canEdit}
          maxScoreLocked={homework.graded}
          labels={t.homeworkPage}
          errors={t.errors}
        />
      </Card>
      {canEdit && homework.deletable && (
        <div className="mt-4">
          <DeleteHomeworkButton homeworkId={homework.id} labels={t.homeworkPage} errors={t.errors} />
        </div>
      )}
    </div>
  );
}
