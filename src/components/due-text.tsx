import { formatDateTime } from "@/lib/dates";
import { fmt } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";

const DAY_MS = 24 * 60 * 60 * 1000;

// "Due Fri 14:00". It turns amber when the deadline is still ahead and less than a day away, so what is about to close
// stands out. A deadline that has passed stays plain: for a teacher it only means the work is closed to students, not
// that anything is wrong. Only the style depends on the time; the text and the date format are the app's own.
export function DueText({
  dueAt,
  now,
  timeZone,
  locale,
  t,
}: {
  dueAt: Date;
  now: Date;
  timeZone: string;
  locale: Locale;
  t: Dictionary;
}) {
  const left = dueAt.getTime() - now.getTime();
  const soon = left > 0 && left <= DAY_MS;
  return (
    <span className={soon ? "font-medium text-warn" : undefined}>
      {fmt(t.dashboard.due, { date: formatDateTime(dueAt, timeZone, locale) })}
    </span>
  );
}
