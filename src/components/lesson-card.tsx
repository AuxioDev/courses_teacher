import Link from "next/link";
import type { LessonItem } from "@/lib/data";
import { formatTime } from "@/lib/dates";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Badge } from "./ui";
import { VideoIcon } from "./icons";

const JOIN_WINDOW_MS = 15 * 60 * 1000;

export async function LessonCard({ lesson, timeZone, now }: { lesson: LessonItem; timeZone: string; now: Date }) {
  const { locale, t } = await getI18n();
  const cancelled = lesson.status === "cancelled";
  const live =
    !cancelled &&
    lesson.meetingUrl &&
    now.getTime() >= lesson.startsAt.getTime() - JOIN_WINDOW_MS &&
    now < lesson.endsAt;

  return (
    <div className={`relative flex gap-3 rounded-2xl border border-line bg-surface p-4 ${cancelled ? "opacity-60" : ""}`}>
      <div className="w-12 shrink-0 text-right font-mono text-sm leading-tight">
        <div className={cancelled ? "line-through" : "font-semibold"}>{formatTime(lesson.startsAt, timeZone)}</div>
        <div className="text-muted">{formatTime(lesson.endsAt, timeZone)}</div>
      </div>
      <div className={`min-w-0 flex-1 border-l-2 pl-3 ${cancelled ? "border-line" : "border-accent"}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* The link stretches over the whole card; the Join button sits above it. */}
          <Link href={localePath(locale, `/lessons/${lesson.id}`)} className="font-semibold after:absolute after:inset-0 after:rounded-2xl">
            {lesson.group.course.title}
          </Link>
          {lesson.status === "moved" && <Badge tone="warn">{t.lesson.status.moved}</Badge>}
          {cancelled && <Badge tone="bad">{t.lesson.status.cancelled}</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted">{lesson.group.name}</p>
        {lesson.topic && <p className="mt-0.5 text-sm">{lesson.topic}</p>}
        {live && (
          <a href={lesson.meetingUrl!} target="_blank" rel="noreferrer" className="btn relative z-10 mt-3">
            <VideoIcon width={18} height={18} /> {t.lesson.join}
          </a>
        )}
      </div>
    </div>
  );
}
