import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getHomeworkToCheck } from "@/lib/data";
import { getI18n } from "@/i18n";
import { HomeworkToCheck } from "@/components/homework-to-check";
import { PageTitle } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.homework };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function HomeworkQueuePage() {
  return <Queue />;
}

async function Queue() {
  const [{ locale, t }, teacher] = await Promise.all([getI18n(), getCurrentTeacher()]);
  const items = await getHomeworkToCheck();
  return (
    <>
      <PageTitle title={t.dashboard.toCheck} />
      <div className="max-w-3xl">
        <HomeworkToCheck items={items} timeZone={teacher.timezone} locale={locale} t={t} />
      </div>
    </>
  );
}
