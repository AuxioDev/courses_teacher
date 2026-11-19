import Link from "next/link";
import { plural } from "@/i18n/format";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { Badge, Empty } from "./ui";
import { DueText } from "./due-text";

type Item = { id: string; title: string; dueAt: Date; course: string; groupName: string; waiting: number };

export function HomeworkToCheck({
  items,
  now,
  timeZone,
  locale,
  t,
}: {
  items: Item[];
  now: Date;
  timeZone: string;
  locale: Locale;
  t: Dictionary;
}) {
  if (items.length === 0) return <Empty>{t.dashboard.nothingToCheck}</Empty>;
  // One card of rows, not a stack of cards: easier to scan, and the waiting counts line up on the right.
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {items.map((hw) => (
        <li key={hw.id}>
          <Link
            href={localePath(locale, `/homework/${hw.id}`)}
            className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{hw.title}</p>
              <p className="text-xs text-muted">
                {hw.course} · {hw.groupName} ·{" "}
                <DueText dueAt={hw.dueAt} now={now} timeZone={timeZone} locale={locale} t={t} />
              </p>
            </div>
            <Badge tone="accent">{plural(locale, t.dashboard.waiting, hw.waiting)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}
