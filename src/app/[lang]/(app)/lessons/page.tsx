import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentTeacher } from "@/lib/auth";
import { getLessonsBetween, getTeacherTerms, type LessonItem } from "@/lib/data";
import {
  addDays,
  addMonths,
  dayKey,
  formatDayKey,
  formatTime,
  isDayKey,
  startOfDay,
  startOfMonth,
  startOfWeek,
  weekdayNames,
  type DayKey,
} from "@/lib/dates";
import { getI18n } from "@/i18n";
import { localePath, type Locale } from "@/i18n/config";
import { LessonCard } from "@/components/lesson-card";
import { TermSwitcher } from "@/components/term-switcher";
import { Empty } from "@/components/ui";
import { ChevronLeft, ChevronRight } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.lessons };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

export default function LessonsPage({ searchParams }: PageProps<"/[lang]/lessons">) {
  return <Lessons searchParams={searchParams} />;
}

function groupByDay(lessons: LessonItem[], timeZone: string) {
  const map = new Map<DayKey, LessonItem[]>();
  for (const lesson of lessons) {
    const key = dayKey(lesson.startsAt, timeZone);
    map.set(key, [...(map.get(key) ?? []), lesson]);
  }
  return map;
}

async function Lessons({ searchParams }: Pick<PageProps<"/[lang]/lessons">, "searchParams">) {
  const [{ locale, t }, teacher] = await Promise.all([getI18n(), getCurrentTeacher()]);
  const tz = teacher.timezone;
  const href = (v: string, d: string) => localePath(locale, `/lessons?view=${v}&date=${d}`);
  const now = new Date();
  const today = dayKey(now, tz);
  const params = await searchParams;
  const view = params.view === "month" ? "month" : "week";
  const anchor = isDayKey(params.date) ? params.date : today;

  const first = view === "week" ? startOfWeek(anchor) : startOfWeek(startOfMonth(anchor));
  const last = view === "week" ? addDays(first, 7) : addDays(startOfWeek(addMonths(startOfMonth(anchor), 1)), 7);
  const [lessons, terms] = await Promise.all([getLessonsBetween(startOfDay(first, tz), startOfDay(last, tz)), getTeacherTerms()]);
  const byDay = groupByDay(lessons, tz);
  const selectedTerm = terms.find((term) => term.startKey <= anchor && anchor <= term.endKey)?.id ?? null;

  const prev = view === "week" ? addDays(anchor, -7) : addMonths(startOfMonth(anchor), -1);
  const next = view === "week" ? addDays(anchor, 7) : addMonths(startOfMonth(anchor), 1);
  const title =
    view === "week"
      ? `${formatDayKey(first, locale, { weekday: undefined, month: "short" })} – ${formatDayKey(addDays(first, 6), locale, {
          weekday: undefined,
          month: "short",
        })}`
      : formatDayKey(startOfMonth(anchor), locale, { weekday: undefined, day: undefined, year: "numeric" });

  return (
    <>
      <TermSwitcher
        terms={terms}
        selected={selectedTerm}
        hrefFor={(term) => (term.current ? localePath(locale, "/lessons") : href("month", term.startKey))}
        label={t.common.term}
        currentLabel={t.common.current}
      />

      <div className="mb-4 flex rounded-xl border border-line bg-surface p-1 text-sm font-medium md:max-w-xs">
        {(["week", "month"] as const).map((v) => (
          <Link
            key={v}
            href={href(v, anchor)}
            className={`flex-1 rounded-lg py-1.5 text-center ${view === v ? "bg-accent text-accent-ink" : "text-muted"}`}
          >
            {t.lessons[v]}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <Link href={href(view, prev)} className="btn-ghost px-2" aria-label={t.common.previous}>
          <ChevronLeft />
        </Link>
        <h1 className="text-lg font-semibold first-letter:uppercase">{title}</h1>
        <Link href={href(view, next)} className="btn-ghost px-2" aria-label={t.common.next}>
          <ChevronRight />
        </Link>
      </div>

      {view === "week" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 7 }, (_, i) => addDays(first, i)).map((key) => {
            const dayLessons = byDay.get(key) ?? [];
            return (
              <section key={key}>
                <h2 className={`mb-2 text-sm font-semibold first-letter:uppercase ${key === today ? "text-accent" : "text-muted"}`}>
                  {formatDayKey(key, locale, { month: "short" })}
                  {key === today && ` · ${t.lessons.today}`}
                </h2>
                {dayLessons.length === 0 ? (
                  <p className="text-sm text-muted">—</p>
                ) : (
                  <div className="space-y-2">
                    {dayLessons.map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} timeZone={tz} now={now} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <MonthGrid first={first} last={last} month={anchor.slice(0, 7)} today={today} byDay={byDay} tz={tz} locale={locale} />
      )}

      {view === "month" && lessons.length === 0 && <Empty>{t.lessons.noLessonsMonth}</Empty>}
    </>
  );
}

function MonthGrid({
  first,
  last,
  month,
  today,
  byDay,
  tz,
  locale,
}: {
  first: DayKey;
  last: DayKey;
  month: string;
  today: DayKey;
  byDay: Map<DayKey, LessonItem[]>;
  tz: string;
  locale: Locale;
}) {
  const days: DayKey[] = [];
  for (let key = first; key < last; key = addDays(key, 1)) days.push(key);
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line text-center text-[0.6875rem] font-semibold uppercase text-muted">
        {weekdayNames(locale).map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((key) => {
          const dayLessons = byDay.get(key) ?? [];
          const inMonth = key.startsWith(month);
          return (
            <Link
              key={key}
              href={localePath(locale, `/lessons?view=week&date=${key}`)}
              className={`min-h-16 min-w-0 border-b border-r border-line p-1 text-xs ${inMonth ? "" : "bg-surface-2/60 text-muted"}`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                  key === today ? "bg-accent font-bold text-accent-ink" : ""
                }`}
              >
                {Number(key.slice(8))}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayLessons.slice(0, 3).map((lesson) => (
                  <div
                    key={lesson.id}
                    className={`truncate rounded px-0.5 font-mono text-[0.6875rem] leading-4 sm:px-1 sm:font-sans ${
                      lesson.status === "cancelled"
                        ? "bg-bad-soft text-bad line-through"
                        : lesson.status === "moved"
                          ? "bg-warn-soft text-warn"
                          : "bg-accent-soft text-accent"
                    }`}
                    title={`${formatTime(lesson.startsAt, tz)} ${lesson.group.course.title}`}
                  >
                    {formatTime(lesson.startsAt, tz)}
                    <span className="hidden sm:inline"> {lesson.group.name}</span>
                  </div>
                ))}
                {dayLessons.length > 3 && <div className="text-[0.6875rem] text-muted">+{dayLessons.length - 3}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
