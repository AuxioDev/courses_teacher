import type { LessonStatus } from "@/generated/prisma/enums";

// The same 15 minutes as the Diary's Join button.
export const ATTENDANCE_OPENS_BEFORE_MS = 15 * 60 * 1000;

export type AttendanceAvailability = "open" | "termLocked" | "cancelled" | "tooEarly";

// One rule for both the page and the server action.
export function attendanceAvailability(
  lesson: { status: LessonStatus; startsAt: Date; termLocked: boolean },
  now: Date,
): AttendanceAvailability {
  if (lesson.termLocked) return "termLocked";
  if (lesson.status === "cancelled") return "cancelled";
  if (now.getTime() < lesson.startsAt.getTime() - ATTENDANCE_OPENS_BEFORE_MS) return "tooEarly";
  return "open";
}
