import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGradebook } from "@/lib/data";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Empty } from "@/components/ui";
import { Notice } from "@/components/notice";
import { ChevronLeft } from "@/components/icons";
import { GradebookGrid } from "./gradebook-grid";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.gradebook.title };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function GradebookPage({ params }: PageProps<"/[lang]/groups/[id]/gradebook">) {
  return <Gradebook params={params} />;
}

async function Gradebook({ params }: Pick<PageProps<"/[lang]/groups/[id]/gradebook">, "params">) {
  const [{ locale, t }, { id }] = await Promise.all([getI18n(), params]);
  const gradebook = await getGradebook(id);
  if (!gradebook) notFound();

  return (
    <>
      <Link href={localePath(locale, `/groups/${gradebook.id}`)} className="mb-0 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink sm:mb-3 sm:min-h-6">
        <ChevronLeft width={18} height={18} /> {gradebook.name}
      </Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t.gradebook.title}</h1>
        {gradebook.columns.length > 0 && (
          <a href={`/api/groups/${gradebook.id}/gradebook?lang=${locale}`} download className="btn-ghost shrink-0">
            {t.gradebook.export}
          </a>
        )}
      </div>
      <p className="mb-5 mt-0.5 text-sm text-muted">
        {gradebook.course} · {gradebook.name} · {gradebook.termName}
      </p>
      {gradebook.termLocked && <Notice>{t.gradebook.termLocked}</Notice>}
      {gradebook.columns.length === 0 ? (
        <Empty>{t.gradebook.none}</Empty>
      ) : (
        <>
          <GradebookGrid
            groupId={gradebook.id}
            columns={gradebook.columns}
            rows={gradebook.rows}
            showFinal={gradebook.showFinal}
            canEdit={!gradebook.termLocked}
            locale={locale}
            t={t.gradebook}
            typeLabels={t.marks.type}
            errors={t.errors}
            ok={t.ok}
          />
          {!gradebook.termLocked && <p className="mt-2 text-xs text-muted">{t.gradebook.hint}</p>}
        </>
      )}
    </>
  );
}
