import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import { fmt, plural } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { Card, Empty } from "./ui";

type Item = { id: string; title: string; dueAt: Date; handedIn: number };

export function HomeworkList({
  items,
  timeZone,
  locale,
  t,
}: {
  items: Item[];
  timeZone: string;
  locale: Locale;
  t: Dictionary;
}) {
  if (items.length === 0) return <Empty>{t.homeworkPage.none}</Empty>;
  return (
    <Card className="divide-y divide-line p-0">
      {items.map((hw) => (
        <Link key={hw.id} href={localePath(locale, `/homework/${hw.id}`)} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span className="block truncate font-medium">{hw.title}</span>
            <span className="block text-xs text-muted">{fmt(t.dashboard.due, { date: formatDateTime(hw.dueAt, timeZone, locale) })}</span>
          </span>
          <span className="shrink-0 text-xs text-muted">{plural(locale, t.homeworkPage.handedIn, hw.handedIn)}</span>
        </Link>
      ))}
    </Card>
  );
}
