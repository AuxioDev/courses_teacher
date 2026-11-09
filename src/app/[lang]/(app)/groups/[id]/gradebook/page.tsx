import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGradebook } from "@/lib/data";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Empty } from "@/components/ui";
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
      <Link href={localePath(locale, `/groups/${gradebook.id}`)} className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <ChevronLeft width={18} height={18} /> {gradebook.name}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t.gradebook.title}</h1>
      <p className="mb-4 mt-0.5 text-sm text-muted">
        {gradebook.course} · {gradebook.name} · {gradebook.termName}
      </p>
      {gradebook.termLocked && <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm">{t.gradebook.termLocked}</p>}
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
