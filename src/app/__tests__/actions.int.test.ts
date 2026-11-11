// Runs the real server actions against a throwaway database. Only the framework edges are
// faked: who is signed in, redirect(), after(), and the notification sender.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  signedIn: true,
  teacherId: "",
  afterJobs: [] as (() => Promise<void>)[],
  notify: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentTeacher: async () => {
    if (!state.signedIn) throw new Error("SENTINEL_NOT_TEACHER");
    return { id: state.teacherId, name: "T", email: "t@x", timezone: "Asia/Baku", locale: "en" };
  },
  getTeacherForConsent: vi.fn(),
  getTeacherForPasswordChange: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ refresh: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (job: () => Promise<void>) => void state.afterJobs.push(job) }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("@/i18n", () => ({ getRequestLocale: async () => "en" }));
vi.mock("@/lib/notifications/notify", () => ({ notify: state.notify }));

import { db } from "@/lib/db";
import { dateToLocalInput } from "@/lib/homework-rules";
import { createWorld, resetDatabase } from "../../../test/db";
import * as actions from "../actions";
const { addMarks, giveZero, reviewSubmission, saveAttendance, saveHomework, updateMark } = actions;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const redirectsTo = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  return null;
};
const flushAfter = async () => {
  const jobs = state.afterJobs.splice(0);
  for (const job of jobs) await job();
};

const HOUR = 3_600_000;
let n = 0;

async function setup() {
  const w = await createWorld();
  state.teacherId = w.teacher.id;
  const other = await db.user.create({ data: { name: "Other", email: `other${++n}@t.local`, passwordHash: "x", role: "teacher" } });
  const lesson = await db.lesson.create({
    data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR) },
  });
  return { ...w, other, lesson };
}

// A student's first hand-in, waiting to be checked.
async function handIn(w: Awaited<ReturnType<typeof setup>>) {
  const submission = await db.submission.create({
    data: { homeworkId: w.homework.id, studentId: w.student.id, content: "done", status: "submitted" },
  });
  const attempt = await db.submissionAttempt.create({ data: { submissionId: submission.id, number: 1, content: "done" } });
  return { submission, attempt };
}

beforeEach(async () => {
  await resetDatabase();
  state.signedIn = true;
  state.afterJobs.length = 0;
  state.notify.mockClear();
});
afterAll(() => db.$disconnect());

describe("reviewSubmission", () => {
  it("grades: converts to the 0–100 scale, creates one mark, updates submission and attempt", async () => {
    const w = await setup();
    const { submission, attempt } = await handIn(w);
    const to = await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "18", feedback: "Nice" })));
    expect(to).toBe(`/en/homework/${w.homework.id}`);

    const marks = await db.mark.findMany();
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ studentId: w.student.id, homeworkId: w.homework.id, value: 90, type: "homework", createdBy: w.teacher.id });
    expect(await db.submission.findUnique({ where: { id: submission.id } })).toMatchObject({ status: "graded", score: 18, feedback: "Nice" });
    expect(await db.submissionAttempt.findUnique({ where: { id: attempt.id } })).toMatchObject({ outcome: "graded", score: 18 });

    await flushAfter();
    expect(state.notify).toHaveBeenCalledWith(w.student.id, "new_mark", expect.objectContaining({ value: 90 }), { dedupeKey: `mark:${marks[0].id}:90` });
  });

  it("re-grading moves the same mark and records history", async () => {
    const w = await setup();
    const { attempt } = await handIn(w);
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "10" })));
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "20" })));
    const marks = await db.mark.findMany();
    expect(marks).toHaveLength(1);
    expect(marks[0].value).toBe(100);
    expect(await db.markHistory.findMany()).toMatchObject([{ oldValue: 50, newValue: 100, changedBy: w.teacher.id }]);
  });

  it("grading with the same score again changes nothing and does not notify twice", async () => {
    const w = await setup();
    const { attempt } = await handIn(w);
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "15" })));
    await flushAfter();
    state.notify.mockClear();
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "15" })));
    await flushAfter();
    expect(await db.markHistory.count()).toBe(0);
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("rejects scores outside 0..maxScore and non-integers", async () => {
    const w = await setup();
    const { attempt } = await handIn(w);
    for (const score of ["-1", "21", "1.5", "abc", ""]) {
      expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score }))).toEqual({ error: "scoreRange" });
    }
    expect(await db.mark.count()).toBe(0);
  });

  it("returning needs feedback, creates no mark, and notifies the student", async () => {
    const w = await setup();
    const { submission, attempt } = await handIn(w);
    expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "return", feedback: "  " }))).toEqual({ error: "feedbackRequired" });
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "return", feedback: "Redo part 2" })));
    expect(await db.mark.count()).toBe(0);
    expect(await db.submission.findUnique({ where: { id: submission.id } })).toMatchObject({ status: "returned", feedback: "Redo part 2" });
    await flushAfter();
    expect(state.notify).toHaveBeenCalledWith(w.student.id, "homework_returned", expect.anything(), { dedupeKey: `returned:${attempt.id}` });
  });

  it("refuses an outdated attempt once the student has handed in again", async () => {
    const w = await setup();
    const { submission, attempt } = await handIn(w);
    await db.submissionAttempt.create({ data: { submissionId: submission.id, number: 2, content: "v2" } });
    expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "20" }))).toEqual({ error: "attemptOutdated" });
    expect(await db.mark.count()).toBe(0);
  });

  it("refuses work that was returned (waits for the student) and invalid decisions", async () => {
    const w = await setup();
    const { submission, attempt } = await handIn(w);
    await db.submission.update({ where: { id: submission.id }, data: { status: "returned" } });
    expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "20" }))).toEqual({ error: "attemptOutdated" });
    expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "delete" }))).toEqual({ error: "submissionNotFound" });
  });

  it("refuses a student who left the group", async () => {
    const w = await setup();
    const { attempt } = await handIn(w);
    await db.enrollment.updateMany({ where: { studentId: w.student.id }, data: { status: "dropped" } });
    expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "20" }))).toEqual({ error: "studentLeft" });
  });
});

describe("homework maximum and rounding", () => {
  const editForm = (w: Awaited<ReturnType<typeof setup>>, maxScore: number) =>
    form({
      homeworkId: w.homework.id,
      title: "HW 1",
      description: "",
      attachments: "",
      dueAt: dateToLocalInput(w.homework.dueAt, "Asia/Baku"),
      maxScore: String(maxScore),
    });

  it("stores a converted homework mark rounded to one decimal, like every other mark", async () => {
    const w = await setup();
    await db.homework.update({ where: { id: w.homework.id }, data: { maxScore: 3 } });
    const { attempt } = await handIn(w);
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "2" })));
    expect((await db.mark.findFirstOrThrow()).value).toBe(66.7);
  });

  it("lets the maximum change before any work is graded, then locks it", async () => {
    const w = await setup();
    await redirectsTo(saveHomework(undefined, editForm(w, 40)));
    expect((await db.homework.findUniqueOrThrow({ where: { id: w.homework.id } })).maxScore).toBe(40);

    const { attempt } = await handIn(w);
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "30" })));
    expect(await saveHomework(undefined, editForm(w, 20))).toEqual({ error: "maxScoreLocked" });
    expect((await db.homework.findUniqueOrThrow({ where: { id: w.homework.id } })).maxScore).toBe(40);
    // Other fields may still change once work is graded, as long as the maximum stays.
    await redirectsTo(saveHomework(undefined, editForm(w, 40)));
  });

  it("grading and changing the maximum at the same moment never leave a mark on the wrong scale", async () => {
    for (let round = 0; round < 8; round++) {
      await resetDatabase();
      const w = await setup();
      const { attempt } = await handIn(w);
      await Promise.all([
        redirectsTo(saveHomework(undefined, editForm(w, 40))),
        redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "18" }))),
      ]);
      const homework = await db.homework.findUniqueOrThrow({ where: { id: w.homework.id } });
      const mark = await db.mark.findFirst();
      // Whoever won, the mark is the score converted with the maximum the homework ended with.
      if (mark) expect(mark.value).toBe(Math.round((18 / homework.maxScore) * 1000) / 10);
    }
  });
});

describe("giveZero", () => {
  const input = (w: Awaited<ReturnType<typeof setup>>) => form({ homeworkId: w.homework.id, studentId: w.student.id });

  it("refuses before the deadline", async () => {
    const w = await setup();
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() + HOUR) } });
    expect(await giveZero(undefined, input(w))).toEqual({ error: "zeroBeforeDeadline" });
    expect(await db.mark.count()).toBe(0);
  });

  it("gives 0 after the deadline, once; a double tap is stopped by the unique rule", async () => {
    const w = await setup();
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
    await redirectsTo(giveZero(undefined, input(w)));
    expect(await db.mark.findMany()).toMatchObject([{ value: 0, homeworkId: w.homework.id, studentId: w.student.id }]);
    expect(await giveZero(undefined, input(w))).toEqual({ error: "attemptOutdated" });
    expect(await db.mark.count()).toBe(1);
  });

  it("refuses when the student already handed in", async () => {
    const w = await setup();
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
    await handIn(w);
    expect(await giveZero(undefined, input(w))).toEqual({ error: "attemptOutdated" });
  });

  it("a late hand-in can still be graded and replaces the zero, with history", async () => {
    const w = await setup();
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
    await redirectsTo(giveZero(undefined, input(w)));
    const { attempt } = await handIn(w);
    await redirectsTo(reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "16" })));
    expect(await db.mark.findMany()).toMatchObject([{ value: 80 }]);
    expect(await db.markHistory.findMany()).toMatchObject([{ oldValue: 0, newValue: 80 }]);
  });
});

describe("marks on lessons", () => {
  const marksForm = (w: Awaited<ReturnType<typeof setup>>, value: string, extra: Record<string, string> = {}) =>
    form({ lessonId: w.lesson.id, type: "quiz", weight: "2", [`value:${w.student.id}`]: value, ...extra });

  it("adds marks and rejects bad values, types and weights", async () => {
    const w = await setup();
    expect(await addMarks(undefined, marksForm(w, "85.46"))).toEqual({ ok: "marksSaved" });
    expect(await db.mark.findMany()).toMatchObject([{ value: 85.5, weight: 2, type: "quiz", lessonId: w.lesson.id }]);
    for (const bad of ["101", "-1", "abc"]) expect(await addMarks(undefined, marksForm(w, bad))).toEqual({ error: "markValue" });
    expect(await addMarks(undefined, marksForm(w, "", {}))).toEqual({ error: "marksEmpty" });
    expect(await addMarks(undefined, marksForm(w, "80", { weight: "0" }))).toEqual({ error: "markWeight" });
    expect(await addMarks(undefined, marksForm(w, "80", { weight: "11" }))).toEqual({ error: "markWeight" });
    expect(await addMarks(undefined, marksForm(w, "80", { type: "homework" }))).toEqual({ error: "markValue" });
    expect(await db.mark.count()).toBe(1);
  });

  it("updateMark records history only when the value changes", async () => {
    const w = await setup();
    await addMarks(undefined, marksForm(w, "70"));
    const mark = (await db.mark.findFirst())!;
    expect(await updateMark(undefined, form({ markId: mark.id, value: "70" }))).toEqual({ ok: "markSaved" });
    expect(await db.markHistory.count()).toBe(0);
    expect(await updateMark(undefined, form({ markId: mark.id, value: "90" }))).toEqual({ ok: "markSaved" });
    expect(await db.markHistory.findMany()).toMatchObject([{ oldValue: 70, newValue: 90 }]);
  });

  it("will not edit a homework mark from here (the homework page owns it)", async () => {
    const w = await setup();
    const mark = await db.mark.create({
      data: { studentId: w.student.id, groupId: w.group.id, homeworkId: w.homework.id, type: "homework", value: 50, createdBy: w.teacher.id },
    });
    expect(await updateMark(undefined, form({ markId: mark.id, value: "60" }))).toEqual({ error: "markFromHomework" });
  });

  it("takes attendance for the whole roster and marks the lesson done", async () => {
    const w = await setup();
    expect(await saveAttendance(undefined, form({ lessonId: w.lesson.id }))).toEqual({ error: "attendanceIncomplete" });
    expect(await saveAttendance(undefined, form({ lessonId: w.lesson.id, [`status:${w.student.id}`]: "late" }))).toEqual({ ok: "attendanceSaved" });
    expect(await db.attendance.findMany()).toMatchObject([{ status: "late" }]);
    expect((await db.lesson.findUnique({ where: { id: w.lesson.id } }))!.status).toBe("done");
    // Saving again updates rather than duplicating.
    await saveAttendance(undefined, form({ lessonId: w.lesson.id, [`status:${w.student.id}`]: "absent" }));
    expect(await db.attendance.findMany()).toMatchObject([{ status: "absent" }]);
  });

  it("opens attendance only 15 minutes before the lesson and never for cancelled lessons", async () => {
    const w = await setup();
    const roster = { [`status:${w.student.id}`]: "present" };
    await db.lesson.update({ where: { id: w.lesson.id }, data: { startsAt: new Date(Date.now() + 2 * HOUR) } });
    expect(await saveAttendance(undefined, form({ lessonId: w.lesson.id, ...roster }))).toEqual({ error: "attendanceNotOpen" });
    await db.lesson.update({ where: { id: w.lesson.id }, data: { startsAt: new Date(Date.now() - HOUR), status: "cancelled" } });
    expect(await saveAttendance(undefined, form({ lessonId: w.lesson.id, ...roster }))).toEqual({ error: "lessonCancelled" });
  });
});

describe("authorization: a teacher cannot touch another teacher's group", () => {
  it("blocks every write", async () => {
    const w = await setup();
    const { attempt } = await handIn(w);
    const mark = await db.mark.create({
      data: { studentId: w.student.id, groupId: w.group.id, lessonId: w.lesson.id, type: "quiz", value: 55, createdBy: w.teacher.id },
    });
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
    state.teacherId = w.other.id; // sign in as the other teacher

    expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "20" }))).toEqual({ error: "submissionNotFound" });
    expect(await giveZero(undefined, form({ homeworkId: w.homework.id, studentId: w.student.id }))).toEqual({ error: "homeworkNotFound" });
    expect(await updateMark(undefined, form({ markId: mark.id, value: "100" }))).toEqual({ error: "markNotFound" });
    expect(await saveAttendance(undefined, form({ lessonId: w.lesson.id, [`status:${w.student.id}`]: "present" }))).toEqual({ error: "lessonNotFound" });
    expect(await addMarks(undefined, form({ lessonId: w.lesson.id, type: "quiz", weight: "1", [`value:${w.student.id}`]: "99" }))).toEqual({ error: "lessonNotFound" });

    expect(await db.mark.findMany()).toMatchObject([{ id: mark.id, value: 55 }]);
    expect(await db.attendance.count()).toBe(0);
    expect(await db.markHistory.count()).toBe(0);
  });

  it("a substitute teacher may take attendance but not give marks", async () => {
    const w = await setup();
    await db.lesson.update({ where: { id: w.lesson.id }, data: { teacherId: w.other.id } });
    state.teacherId = w.other.id;
    expect(await saveAttendance(undefined, form({ lessonId: w.lesson.id, [`status:${w.student.id}`]: "present" }))).toEqual({ ok: "attendanceSaved" });
    expect(await addMarks(undefined, form({ lessonId: w.lesson.id, type: "quiz", weight: "1", [`value:${w.student.id}`]: "70" }))).toEqual({ error: "lessonNotFound" });
  });
});

describe("locked term", () => {
  it("rejects every write", async () => {
    const w = await setup();
    const { attempt } = await handIn(w);
    const mark = await db.mark.create({
      data: { studentId: w.student.id, groupId: w.group.id, lessonId: w.lesson.id, type: "quiz", value: 55, createdBy: w.teacher.id },
    });
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
    await db.term.update({ where: { id: w.term.id }, data: { locked: true } });

    expect(await reviewSubmission(undefined, form({ attemptId: attempt.id, decision: "grade", score: "20" }))).toEqual({ error: "termLocked" });
    expect(await giveZero(undefined, form({ homeworkId: w.homework.id, studentId: w.student.id }))).toEqual({ error: "termLocked" });
    expect(await updateMark(undefined, form({ markId: mark.id, value: "100" }))).toEqual({ error: "termLocked" });
    expect(await saveAttendance(undefined, form({ lessonId: w.lesson.id, [`status:${w.student.id}`]: "present" }))).toEqual({ error: "termLocked" });
    expect(await addMarks(undefined, form({ lessonId: w.lesson.id, type: "quiz", weight: "1", [`value:${w.student.id}`]: "99" }))).toEqual({ error: "termLocked" });
    expect(await db.mark.findMany()).toMatchObject([{ value: 55 }]);
  });
});

// Actions that run before sign-in, or use the consent / password-change guards.
const NOT_TEACHER_GUARDED = new Set(["login", "logout", "requestPasswordReset", "resetPassword", "changePassword", "acceptPrivacy", "updateLocale"]);

describe("authorization matrix", () => {
  it("every other action refuses a request that is not a signed-in teacher, and writes nothing", async () => {
    await setup();
    state.signedIn = false;
    const count = () => Promise.all([db.mark.count(), db.attendance.count(), db.homework.count(), db.submission.count(), db.lesson.count(), db.user.count()]);
    const before = await count();

    const guarded = Object.entries(actions).filter(([name, fn]) => typeof fn === "function" && !NOT_TEACHER_GUARDED.has(name));
    const source = readFileSync(fileURLToPath(new URL("../actions.ts", import.meta.url)), "utf8");
    const declared = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(guarded.map(([name]) => name).sort()).toEqual(declared.filter((name) => !NOT_TEACHER_GUARDED.has(name)).sort());

    const unguarded: string[] = [];
    for (const [name, fn] of guarded) {
      try {
        await (fn as (a: unknown, b: unknown) => Promise<unknown>)(form({}), form({}));
        unguarded.push(name);
      } catch (e) {
        if ((e as Error).message !== "SENTINEL_NOT_TEACHER") unguarded.push(`${name} (${(e as Error).message})`);
      }
    }
    expect(unguarded).toEqual([]);
    expect(await count()).toEqual(before);
  });
});
