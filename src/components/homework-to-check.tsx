import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import { fmt, plural } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { Badge, Card, Empty } from "./ui";

type Item = { id: string; title: string; dueAt: Date; course: string; groupName: string; waiting: number };

export function HomeworkToCheck({
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
  if (items.length === 0) return <Empty>{t.dashboard.nothingToCheck}</Empty>;
  return (
    <ul className="space-y-2">
      {items.map((hw) => (
        <li key={hw.id}>
          <Link href={localePath(locale, `/homework/${hw.id}`)} className="block">
            <Card className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{hw.title}</p>
                <p className="text-xs text-muted">
                  {hw.course} · {hw.groupName} · {fmt(t.dashboard.due, { date: formatDateTime(hw.dueAt, timeZone, locale) })}
                </p>
              </div>
              <Badge tone="accent">{plural(locale, t.dashboard.waiting, hw.waiting)}</Badge>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
