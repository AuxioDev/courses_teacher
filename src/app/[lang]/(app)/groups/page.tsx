import Link from "next/link";
import type { Metadata } from "next";
import { getMyGroups, resolveTerm } from "@/lib/data";
import { getI18n, plural } from "@/i18n";
import { localePath } from "@/i18n/config";
import { TermSwitcher } from "@/components/term-switcher";
import { Badge, Card, Empty, PageTitle } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.groups };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function GroupsPage({ searchParams }: PageProps<"/[lang]/groups">) {
  return <Groups searchParams={searchParams} />;
}

async function Groups({ searchParams }: Pick<PageProps<"/[lang]/groups">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams]);
  const { terms, term } = await resolveTerm(params.term);
  const groups = term ? await getMyGroups(term.id) : [];

  return (
    <>
      <PageTitle title={t.nav.groups} />
      {term && (
        <TermSwitcher
          terms={terms}
          selected={term.id}
          hrefFor={(item) => localePath(locale, item.current ? "/groups" : `/groups?term=${item.id}`)}
          label={t.common.term}
          currentLabel={t.common.current}
        />
      )}
      {groups.length === 0 ? (
        <Empty>{t.groups.none}</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {groups.map((group) => {
            const behind = group.students.filter((s) => s.fallingBehind).length;
            return (
              <li key={group.id}>
                <Link href={localePath(locale, `/groups/${group.id}`)} className="block">
                  <Card>
                    <p className="font-semibold">{group.course}</p>
                    <p className="text-sm text-muted">{group.name}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      {plural(locale, t.groups.students, group.students.length)}
                      {behind > 0 && <Badge tone="warn">{plural(locale, t.groups.needAttention, behind)}</Badge>}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
