import "server-only";
import { db } from "./db";
import { getCurrentTeacher } from "./auth";
import { dayKey, formatDayKey } from "./dates";
import { attendanceLevel, attendanceRate, averageBand, weightedAverage, type AttendanceLevel } from "./grading";
import { getMarkWeights, getSchoolSettings } from "./settings";
import { attendanceAvailability } from "./lesson-rules";
import type { AttendanceStatus, MarkType, SubmissionStatus } from "@/generated/prisma/enums";
import { getRequestLocale } from "@/i18n";

// Every query here resolves the teacher itself, so callers can never ask for
// another teacher's data by passing an id.
//
// Never read StudentNote or StudentTodo, files not handed in yet (attemptId = null),
// or unpublished final grades. Students are selected by id and name only.

// ---------- Terms ----------

// The terms the teacher has groups or lessons in, newest first. "current" is the one
// that contains today, or else the latest one that has started.
export async function getTeacherTerms() {
  const teacher = await getCurrentTeacher();
  const terms = await db.term.findMany({
    where: { groups: { some: { OR: [{ teacherId: teacher.id }, { lessons: { some: { teacherId: teacher.id } } }] } } },
    orderBy: { startDate: "desc" },
  });
  const today = dayKey(new Date(), teacher.timezone);
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const current =
    terms.find((t) => key(t.startDate) <= today && today <= key(t.endDate)) ??
    terms.find((t) => key(t.startDate) <= today) ??
    terms[terms.length - 1];
  return terms.map((t) => ({
    id: t.id,
    name: t.name,
    startKey: key(t.startDate),
    endKey: key(t.endDate),
    locked: t.locked,
    current: t.id === current?.id,
  }));
}

export type TeacherTerm = Awaited<ReturnType<typeof getTeacherTerms>>[number];

// The requested term if it's one of the teacher's, otherwise the current one.
export async function resolveTerm(requested: unknown) {
  const terms = await getTeacherTerms();
  const term = terms.find((t) => t.id === requested) ?? terms.find((t) => t.current) ?? null;
  return { terms, term };
}

// ---------- Lessons ----------

// A substitute's lesson belongs to the substitute, so lessons follow Lesson.teacherId.
export async function getLessonsBetween(start: Date, end: Date) {
  const teacher = await getCurrentTeacher();
  return db.lesson.findMany({
    where: { teacherId: teacher.id, startsAt: { gte: start, lt: end } },
    include: { group: { select: { id: true, name: true, course: { select: { title: true } } } } },
    orderBy: { startsAt: "asc" },
  });
}

export type LessonItem = Awaited<ReturnType<typeof getLessonsBetween>>[number];

const homeworkListSelect = {
  select: { id: true, title: true, dueAt: true, _count: { select: { submissions: true } } },
  orderBy: { dueAt: "desc" },
} as const;

function toHomeworkItem(hw: { id: string; title: string; dueAt: Date; _count: { submissions: number } }) {
  return { id: hw.id, title: hw.title, dueAt: hw.dueAt, handedIn: hw._count.submissions };
}

// Null when the lesson doesn't exist or is another teacher's, so both look the same.
export async function getLesson(id: string) {
  const teacher = await getCurrentTeacher();
  const lesson = await db.lesson.findFirst({
    where: { id, teacherId: teacher.id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      topic: true,
      materials: true,
      meetingUrl: true,
      status: true,
      attendance: { select: { status: true, student: { select: { id: true, name: true } } } },
      group: {
        select: {
          id: true,
          name: true,
          teacherId: true,
          course: { select: { title: true } },
          term: { select: { name: true, locked: true } },
          enrollments: {
            where: { status: "active", student: { active: true } },
            select: { student: { select: { id: true, name: true } } },
            orderBy: { student: { name: "asc" } },
          },
        },
      },
      homework: homeworkListSelect,
      // Homework marks follow their grade, so they are changed through checking, not here.
      marks: {
        where: { homeworkId: null },
        select: { id: true, type: true, value: true, weight: true, comment: true, student: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { student: { name: "asc" } }],
      },
    },
  });
  if (!lesson) return null;
  const { attendance, group, homework, marks, ...rest } = lesson;
  const { enrollments, teacherId, ...groupInfo } = group;
  const marked = new Map(attendance.map((a) => [a.student.id, a.status]));
  const enrolled = new Set(enrollments.map((e) => e.student.id));
  return {
    ...rest,
    group: groupInfo,
    isGroupTeacher: teacherId === teacher.id,
    // Homework belongs to the group's teacher, so a substitute doesn't see it here.
    homework: teacherId === teacher.id ? homework.map(toHomeworkItem) : [],
    marks: teacherId === teacher.id ? marks.map(({ student, ...mark }) => ({ ...mark, studentName: student.name })) : [],
    markWeights: await getMarkWeights(),
    availability: attendanceAvailability({ ...rest, termLocked: group.term.locked }, new Date()),
    roster: enrollments.map(({ student }) => ({ ...student, status: marked.get(student.id) ?? null })),
    // Records for students who have since left stay visible but can't be changed here.
    left: attendance
      .filter((a) => !enrolled.has(a.student.id))
      .map((a) => ({ ...a.student, status: a.status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---------- Groups and how each student is doing ----------

// Decision 1 in teacher-app-plan.md. The attendance limits come from SchoolSettings.
const MISSED_HOMEWORK_LIMIT = 2;

export type StudentProgress = {
  id: string;
  name: string;
  enrolled: boolean; // false once they've left the group or their account is deactivated
  attendanceRate: number | null;
  attendanceLevel: AttendanceLevel;
  average: number | null;
  handedIn: number;
  assigned: number; // past the deadline, or already handed in
  missed: number;
  lowAverage: boolean;
  tooManyMissed: boolean;
  fallingBehind: boolean;
};

// Only called with group ids the caller has already scoped to this teacher.
async function progressByGroup(groupIds: string[]) {
  const [enrollments, attendance, marks, homework, settings] = await Promise.all([
    db.enrollment.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, status: true, student: { select: { id: true, name: true, active: true } } },
      orderBy: { student: { name: "asc" } },
    }),
    db.attendance.findMany({
      where: { lesson: { groupId: { in: groupIds } } },
      select: { studentId: true, status: true, lesson: { select: { groupId: true } } },
    }),
    db.mark.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, studentId: true, value: true, weight: true },
    }),
    db.homework.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, dueAt: true, submissions: { select: { studentId: true } } },
    }),
    getSchoolSettings(),
  ]);

  const now = new Date();
  const statuses = new Map<string, AttendanceStatus[]>();
  for (const row of attendance) {
    const key = `${row.lesson.groupId}:${row.studentId}`;
    statuses.set(key, [...(statuses.get(key) ?? []), row.status]);
  }

  const result = new Map<string, StudentProgress[]>(groupIds.map((id) => [id, []]));
  for (const { groupId, status, student } of enrollments) {
    const rate = attendanceRate(statuses.get(`${groupId}:${student.id}`) ?? []);
    const average = weightedAverage(marks.filter((m) => m.groupId === groupId && m.studentId === student.id));
    let handedIn = 0;
    let missed = 0;
    for (const hw of homework) {
      if (hw.groupId !== groupId) continue;
      if (hw.submissions.some((s) => s.studentId === student.id)) handedIn++;
      else if (hw.dueAt < now) missed++;
    }
    const enrolled = status === "active" && student.active;
    const level = attendanceLevel(rate, settings);
    const lowAverage = average !== null && averageBand(average) === "bad";
    const tooManyMissed = missed >= MISSED_HOMEWORK_LIMIT;
    result.get(groupId)!.push({
      id: student.id,
      name: student.name,
      enrolled,
      attendanceRate: rate,
      attendanceLevel: level,
      average,
      handedIn,
      assigned: handedIn + missed,
      missed,
      lowAverage,
      tooManyMissed,
      fallingBehind: enrolled && (level !== "ok" || lowAverage || tooManyMissed),
    });
  }
  return result;
}

export async function getMyGroups(termId: string) {
  const teacher = await getCurrentTeacher();
  const groups = await db.group.findMany({
    where: { teacherId: teacher.id, termId },
    select: { id: true, name: true, course: { select: { title: true } } },
    orderBy: [{ course: { title: "asc" } }, { name: "asc" }],
  });
  const progress = await progressByGroup(groups.map((g) => g.id));
  return groups.map(({ id, name, course }) => {
    const students = progress.get(id)!.filter((s) => s.enrolled);
    return { id, name, course: course.title, students };
  });
}

export type MyGroup = Awaited<ReturnType<typeof getMyGroups>>[number];

// Null when the group doesn't exist or belongs to another teacher, so both look the same.
export async function getGroup(id: string) {
  const teacher = await getCurrentTeacher();
  const group = await db.group.findFirst({
    where: { id, teacherId: teacher.id },
    select: {
      id: true,
      name: true,
      course: { select: { title: true } },
      term: { select: { name: true, locked: true } },
      homework: homeworkListSelect,
    },
  });
  if (!group) return null;
  const progress = await progressByGroup([group.id]);
  const students = progress.get(group.id)!;
  return {
    ...group,
    homework: group.homework.map(toHomeworkItem),
    students: students.filter((s) => s.enrolled),
    left: students.filter((s) => !s.enrolled),
  };
}

// ---------- Giving homework ----------

// The lesson only counts when it belongs to this group; anything else is ignored.
export async function getGroupForNewHomework(groupId: string, lessonId: unknown) {
  const teacher = await getCurrentTeacher();
  const group = await db.group.findFirst({
    where: { id: groupId, teacherId: teacher.id },
    select: {
      id: true,
      name: true,
      course: { select: { title: true } },
      term: { select: { locked: true } },
      lessons: {
        where: { id: typeof lessonId === "string" ? lessonId : "" },
        select: { id: true, topic: true, status: true, teacherId: true },
      },
    },
  });
  if (!group) return null;
  const { lessons, ...rest } = group;
  const lesson = lessons[0];
  return { ...rest, lesson: lesson ? { ...lesson, ownLesson: lesson.teacherId === teacher.id } : null };
}

export async function getHomeworkForEdit(id: string) {
  const teacher = await getCurrentTeacher();
  const homework = await db.homework.findFirst({
    where: { id, group: { teacherId: teacher.id } },
    select: {
      id: true,
      title: true,
      description: true,
      attachments: true,
      dueAt: true,
      maxScore: true,
      lesson: { select: { id: true, teacherId: true } },
      group: { select: { id: true, name: true, course: { select: { title: true } }, term: { select: { locked: true } } } },
      submissions: { select: { status: true } },
      _count: { select: { uploads: true, marks: true } },
    },
  });
  if (!homework) return null;
  const { submissions, _count, lesson, ...rest } = homework;
  return {
    ...rest,
    backPath: lesson?.teacherId === teacher.id ? `/lessons/${lesson.id}` : `/groups/${homework.group.id}`,
    graded: _count.marks > 0 || submissions.some((s) => s.status === "graded"),
    deletable: submissions.length === 0 && _count.uploads === 0 && _count.marks === 0,
  };
}

// ---------- Gradebook ----------

export type GradebookColumn = {
  key: string;
  date: string;
  sortAt: number;
  type: MarkType;
  weight: number;
  title: string | null;
  href: string | null;
  homeworkId: string | null;
};

export type GradebookCell = { markId: string; value: number; comment: string | null };

export type GradebookRow = {
  id: string;
  name: string;
  enrolled: boolean;
  average: number | null;
  finalGrade: number | null;
  cells: Record<string, GradebookCell>;
};

export async function getGradebook(id: string) {
  return loadGradebook(await getCurrentTeacher(), id);
}

// Also used by the CSV download, a Route Handler that answers 401 instead of redirecting.
export async function loadGradebook(teacher: { id: string; timezone: string }, id: string) {
  const group = await db.group.findFirst({
    where: { id, teacherId: teacher.id },
    select: {
      id: true,
      name: true,
      course: { select: { title: true } },
      term: { select: { name: true, locked: true } },
      enrollments: {
        select: { status: true, student: { select: { id: true, name: true, active: true } } },
        orderBy: { student: { name: "asc" } },
      },
      marks: {
        select: {
          id: true,
          studentId: true,
          type: true,
          value: true,
          weight: true,
          comment: true,
          createdAt: true,
          lessonId: true,
          homeworkId: true,
          lesson: { select: { startsAt: true, topic: true, teacherId: true } },
          homework: { select: { title: true, dueAt: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      // Only published final grades ever leave the database here.
      finalGrades: { where: { published: true }, select: { studentId: true, value: true } },
    },
  });
  if (!group) return null;

  const locale = await getRequestLocale();
  const shortDate = (date: Date) =>
    formatDayKey(dayKey(date, teacher.timezone), locale, { weekday: undefined, month: "short" });

  const columns = new Map<string, GradebookColumn>();
  const cells = new Map<string, Record<string, GradebookCell>>();
  // Several marks of one kind in one lesson get a column each, in the order they were given.
  const seen = new Map<string, number>();
  for (const mark of group.marks) {
    let base: string;
    if (mark.homeworkId) {
      base = `homework:${mark.homeworkId}`;
    } else {
      base = `lesson:${mark.lessonId ?? "none"}:${mark.type}:${mark.weight}`;
    }
    const nth = (seen.get(`${mark.studentId}:${base}`) ?? 0) + 1;
    seen.set(`${mark.studentId}:${base}`, nth);
    const key = `${base}:${nth}`;
    if (!columns.has(key)) {
      const at = mark.homework?.dueAt ?? mark.lesson?.startsAt ?? mark.createdAt;
      columns.set(key, {
        key,
        date: shortDate(at),
        sortAt: at.getTime(),
        type: mark.type,
        weight: mark.weight,
        title: mark.homework?.title ?? mark.lesson?.topic ?? null,
        href: mark.homeworkId
          ? `/homework/${mark.homeworkId}`
          : mark.lessonId && mark.lesson?.teacherId === teacher.id
            ? `/lessons/${mark.lessonId}`
            : null,
        homeworkId: mark.homeworkId,
      });
    }
    const row = cells.get(mark.studentId) ?? {};
    row[key] = { markId: mark.id, value: mark.value, comment: mark.comment };
    cells.set(mark.studentId, row);
  }

  const rows: GradebookRow[] = group.enrollments.map(({ status, student }) => {
    const finalGrade = group.finalGrades.find((f) => f.studentId === student.id);
    return {
      id: student.id,
      name: student.name,
      enrolled: status === "active" && student.active,
      average: weightedAverage(group.marks.filter((m) => m.studentId === student.id)),
      finalGrade: finalGrade?.value ?? null,
      cells: cells.get(student.id) ?? {},
    };
  });
  rows.sort((a, b) => Number(b.enrolled) - Number(a.enrolled));

  return {
    id: group.id,
    name: group.name,
    course: group.course.title,
    termName: group.term.name,
    termLocked: group.term.locked,
    columns: [...columns.values()].sort((a, b) => a.sortAt - b.sortAt),
    rows,
    showFinal: group.finalGrades.length > 0,
  };
}

// ---------- Checking one homework ----------

export type CheckingState = "toCheck" | "late" | "returned" | "graded" | "givenZero" | "missing" | "notYet";

// Work that needs the teacher comes first.
const CHECKING_ORDER: CheckingState[] = ["toCheck", "late", "returned", "missing", "notYet", "givenZero", "graded"];

function checkingState(status: SubmissionStatus | undefined, hasMark: boolean, dueAt: Date, now: Date): CheckingState {
  if (status === "submitted") return "toCheck";
  if (status) return status;
  if (hasMark) return "givenZero";
  return dueAt < now ? "missing" : "notYet";
}

export async function getHomeworkChecking(id: string) {
  const teacher = await getCurrentTeacher();
  const homework = await db.homework.findFirst({
    where: { id, group: { teacherId: teacher.id } },
    select: {
      id: true,
      title: true,
      dueAt: true,
      maxScore: true,
      submissions: { select: { studentId: true, status: true, score: true, submittedAt: true } },
      marks: { select: { studentId: true } },
      group: {
        select: {
          name: true,
          course: { select: { title: true } },
          term: { select: { locked: true } },
          enrollments: { select: { status: true, student: { select: { id: true, name: true, active: true } } } },
        },
      },
    },
  });
  if (!homework) return null;
  const now = new Date();
  const { submissions, marks, group, ...rest } = homework;
  const { enrollments, ...groupInfo } = group;
  const rows = enrollments.map(({ status, student }) => {
    const submission = submissions.find((s) => s.studentId === student.id);
    return {
      id: student.id,
      name: student.name,
      enrolled: status === "active" && student.active,
      state: checkingState(submission?.status, marks.some((m) => m.studentId === student.id), homework.dueAt, now),
      score: submission?.score ?? null,
      submittedAt: submission?.submittedAt ?? null,
    };
  });
  rows.sort((a, b) => CHECKING_ORDER.indexOf(a.state) - CHECKING_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
  return {
    ...rest,
    group: groupInfo,
    students: rows.filter((r) => r.enrolled),
    // Someone who left only appears if they handed something in.
    left: rows.filter((r) => !r.enrolled && r.submittedAt !== null),
  };
}

const reviewFileFields = { id: true, name: true, size: true } as const;

// Null unless the homework is this teacher's and the student has been in its group.
export async function getSubmissionReview(homeworkId: string, studentId: string) {
  const teacher = await getCurrentTeacher();
  const homework = await db.homework.findFirst({
    where: { id: homeworkId, group: { teacherId: teacher.id } },
    select: {
      id: true,
      title: true,
      dueAt: true,
      maxScore: true,
      group: {
        select: {
          name: true,
          course: { select: { title: true } },
          term: { select: { locked: true } },
          enrollments: { where: { studentId }, select: { status: true, student: { select: { name: true, active: true } } } },
        },
      },
      submissions: {
        where: { studentId },
        select: {
          status: true,
          attempts: {
            orderBy: { number: "desc" },
            select: {
              id: true,
              number: true,
              content: true,
              links: true,
              submittedAt: true,
              late: true,
              outcome: true,
              score: true,
              feedback: true,
              // Rows linked to an attempt were handed in, so drafts can't appear here.
              files: { select: reviewFileFields, orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
      marks: { where: { studentId }, select: { value: true } },
    },
  });
  const enrollment = homework?.group.enrollments[0];
  if (!homework || !enrollment) return null;
  const submission = homework.submissions[0];
  return {
    homeworkId: homework.id,
    title: homework.title,
    dueAt: homework.dueAt,
    maxScore: homework.maxScore,
    course: homework.group.course.title,
    groupName: homework.group.name,
    termLocked: homework.group.term.locked,
    studentName: enrollment.student.name,
    enrolled: enrollment.status === "active" && enrollment.student.active,
    submissionStatus: submission?.status ?? null,
    attempts: submission?.attempts ?? [],
    mark: homework.marks[0]?.value ?? null,
  };
}

export type ReviewAttempt = NonNullable<Awaited<ReturnType<typeof getSubmissionReview>>>["attempts"][number];

// ---------- Homework to check ----------

// Handed-in work waiting for a decision, per homework. Locked terms can't be graded,
// and students who have left the group don't count.
export async function getHomeworkToCheck() {
  const teacher = await getCurrentTeacher();
  const homework = await db.homework.findMany({
    where: {
      group: { teacherId: teacher.id, term: { locked: false } },
      submissions: { some: { status: { in: ["submitted", "late"] } } },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      submissions: { where: { status: { in: ["submitted", "late"] } }, select: { studentId: true } },
      group: {
        select: {
          name: true,
          course: { select: { title: true } },
          enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
        },
      },
    },
    orderBy: { dueAt: "asc" },
  });
  return homework.flatMap(({ submissions, group, ...hw }) => {
    const enrolled = new Set(group.enrollments.map((e) => e.studentId));
    const waiting = submissions.filter((s) => enrolled.has(s.studentId)).length;
    return waiting > 0 ? [{ ...hw, course: group.course.title, groupName: group.name, waiting }] : [];
  });
}
