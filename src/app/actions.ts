"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { getCurrentTeacher, getTeacherForConsent, getTeacherForPasswordChange } from "@/lib/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { hashPassword, hashToken, newPasswordSchema, verifyPassword } from "@/lib/passwords";
import { clientIp, isLoginBlocked, recordLoginAttempt } from "@/lib/rate-limit";
import { sendResetLink } from "@/lib/password-reset";
import { attendanceAvailability } from "@/lib/lesson-rules";
import { dateToLocalInput, localInputToDate } from "@/lib/homework-rules";
import { notify } from "@/lib/notifications/notify";
import { toHundredScale } from "@/lib/grading";
import { getMarkWeights } from "@/lib/settings";
import { getRequestLocale } from "@/i18n";
import { hasLocale, isInternalPath, LOCALE_COOKIE, localePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import type { MarkType } from "@/generated/prisma/enums";

// Messages are keys into the dictionary so the client can show them in the current language.
export type FormState = { error?: keyof Dictionary["errors"]; ok?: keyof Dictionary["ok"]; email?: string } | undefined;

// ---------- Auth ----------

const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: "missingCredentials", email };

  const ip = await clientIp();
  if (await isLoginBlocked(parsed.data.email, ip)) return { error: "tooManyAttempts", email };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Always run bcrypt so a missing email takes as long as a wrong password.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash);
  if (!user || !valid || !user.active) {
    await recordLoginAttempt(parsed.data.email, ip, false);
    return { error: "wrongCredentials", email };
  }
  await recordLoginAttempt(parsed.data.email, ip, true);
  if (user.role !== "teacher") return { error: "notTeacher", email };

  await createSession({ userId: user.id, role: user.role, v: user.sessionVersion });
  // The saved language follows the teacher across devices; the first login saves
  // whatever language they are using now.
  const current = await getRequestLocale();
  const locale = hasLocale(user.locale) ? user.locale : current;
  if (!user.locale) await db.user.update({ where: { id: user.id }, data: { locale } });
  const next = formData.get("next");
  redirect(localePath(locale, user.mustChangePassword ? "/change-password" : isInternalPath(next) ? next : "/"));
}

export async function logout() {
  await deleteSession();
  redirect(localePath(await getRequestLocale(), "/login"));
}

// Bumping sessionVersion invalidates every cookie issued before now.
export async function logoutEverywhere() {
  const teacher = await getCurrentTeacher();
  await db.user.update({ where: { id: teacher.id }, data: { sessionVersion: { increment: 1 } } });
  await deleteSession();
  redirect(localePath(await getRequestLocale(), "/login"));
}

function readNewPassword(
  formData: FormData,
): { password: string } | { error: "passwordTooShort" | "passwordMismatch" } {
  const password = String(formData.get("newPassword") ?? "");
  if (!newPasswordSchema.safeParse(password).success) return { error: "passwordTooShort" };
  if (password !== formData.get("confirmPassword")) return { error: "passwordMismatch" };
  return { password };
}

// Sets a new password, signs out every other device and keeps this one signed in.
async function setPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  const [user] = await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    }),
    // Any other reset link still in someone's inbox stops working.
    db.authToken.deleteMany({ where: { userId, type: "reset" } }),
  ]);
  await createSession({ userId: user.id, role: user.role, v: user.sessionVersion });
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getTeacherForPasswordChange();
  const user = await db.user.findUniqueOrThrow({ where: { id: teacher.id }, select: { passwordHash: true } });
  const current = String(formData.get("currentPassword") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "wrongCurrentPassword" };

  const next = readNewPassword(formData);
  if ("error" in next) return { error: next.error };
  if (next.password === current) return { error: "samePassword" };

  await setPassword(teacher.id, next.password);
  if (teacher.mustChangePassword) redirect(localePath(await getRequestLocale(), "/"));
  refresh();
  return { ok: "passwordChanged" };
}

const forgotSchema = z.object({ email: z.email().transform((e) => e.toLowerCase().trim()) });

// Always gives the same answer, whether or not the email is registered.
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "missingCredentials" };

  // Counted with the login attempts, so one IP can't send endless reset emails.
  const ip = await clientIp();
  const key = `reset:${parsed.data.email}`;
  if (await isLoginBlocked(key, ip)) return { error: "tooManyAttempts" };
  await recordLoginAttempt(key, ip, false);

  await sendResetLink(parsed.data.email);
  return { ok: "resetSent" };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const tokenHash = hashToken(String(formData.get("token") ?? ""));
  const record = await db.authToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record || record.type !== "reset" || record.usedAt || record.expiresAt < new Date() || !record.user.active) {
    return { error: "resetLinkInvalid" };
  }
  if (record.user.role !== "teacher") return { error: "notTeacher" };

  const next = readNewPassword(formData);
  if ("error" in next) return { error: next.error };

  // Claim the token first so the same link can't be used twice at once.
  const claimed = await db.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { error: "resetLinkInvalid" };

  await setPassword(record.userId, next.password);
  const locale = hasLocale(record.user.locale) ? record.user.locale : await getRequestLocale();
  redirect(localePath(locale, "/"));
}

// ---------- Lessons ----------

// Every lesson write starts here: the lesson is this teacher's and its term is open.
async function findWritableLesson(lessonId: string, teacherId: string) {
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, teacherId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      group: {
        select: {
          id: true,
          teacherId: true,
          course: { select: { title: true } },
          term: { select: { locked: true } },
          enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
        },
      },
    },
  });
  if (!lesson) return { error: "lessonNotFound" as const };
  if (lesson.group.term.locked) return { error: "termLocked" as const };
  return { lesson };
}

const attendanceStatus = z.enum(["present", "late", "absent", "excused"]);

export async function saveAttendance(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const found = await findWritableLesson(String(formData.get("lessonId") ?? ""), teacher.id);
  if ("error" in found) return { error: found.error };
  const { lesson } = found;

  const availability = attendanceAvailability({ ...lesson, termLocked: false }, new Date());
  if (availability === "cancelled") return { error: "lessonCancelled" };
  if (availability === "tooEarly") return { error: "attendanceNotOpen" };

  // The Diary's percentage only counts rows that exist, so a partial roster would
  // quietly change it. Only students enrolled now are read from the form.
  const records = [];
  for (const { studentId } of lesson.group.enrollments) {
    const status = attendanceStatus.safeParse(formData.get(`status:${studentId}`));
    if (!status.success) return { error: "attendanceIncomplete" };
    records.push({ studentId, status: status.data });
  }

  await db.$transaction([
    ...records.map(({ studentId, status }) =>
      db.attendance.upsert({
        where: { lessonId_studentId: { lessonId: lesson.id, studentId } },
        create: { lessonId: lesson.id, studentId, status },
        update: { status },
      }),
    ),
    db.lesson.updateMany({ where: { id: lesson.id, status: { in: ["scheduled", "moved"] } }, data: { status: "done" } }),
  ]);
  refresh();
  return { ok: "attendanceSaved" };
}

const lessonDetailsSchema = z.object({
  topic: z.string().trim().max(200),
  materials: z.string().trim().max(5_000),
});

export async function saveLessonDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const found = await findWritableLesson(String(formData.get("lessonId") ?? ""), teacher.id);
  if ("error" in found) return { error: found.error };
  if (found.lesson.status === "cancelled") return { error: "lessonCancelled" };

  const parsed = lessonDetailsSchema.safeParse({
    topic: formData.get("topic") ?? "",
    materials: formData.get("materials") ?? "",
  });
  if (!parsed.success) return { error: "lessonDetailsTooLong" };

  await db.lesson.update({
    where: { id: found.lesson.id },
    data: { topic: parsed.data.topic || null, materials: parsed.data.materials || null },
  });
  refresh();
  return { ok: "lessonSaved" };
}

// ---------- Marks ----------

const MARK_TYPE = z.enum(["classwork", "quiz", "exam"]);
const MARK_COMMENT = z.string().trim().max(500);

// Marks are on the 0–100 scale, kept to one decimal.
function readMarkValue(raw: string): number | null {
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 10) / 10;
}

// After the response, for the same reason as homework notifications.
function notifyMarks(
  marks: { id: string; studentId: string; type: MarkType; value: number }[],
  course: string,
  key: (mark: { id: string; value: number }) => string,
) {
  after(async () => {
    for (const mark of marks) {
      try {
        await notify(mark.studentId, "new_mark", { course, markType: mark.type, value: mark.value }, { dedupeKey: key(mark) });
      } catch (e) {
        console.error(`[notify] new_mark failed: ${e instanceof Error ? e.name : "unknown"}`);
      }
    }
  });
}

export async function addMarks(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const found = await findWritableLesson(String(formData.get("lessonId") ?? ""), teacher.id);
  if ("error" in found) return { error: found.error };
  const { lesson } = found;
  // Marks belong to the group's own teacher; a substitute only takes attendance.
  if (lesson.group.teacherId !== teacher.id) return { error: "lessonNotFound" };

  const availability = attendanceAvailability({ ...lesson, termLocked: false }, new Date());
  if (availability === "cancelled") return { error: "lessonCancelled" };
  if (availability === "tooEarly") return { error: "attendanceNotOpen" };

  const type = MARK_TYPE.safeParse(formData.get("type"));
  if (!type.success) return { error: "markValue" };
  const weight = Number(formData.get("weight"));
  if (!Number.isFinite(weight) || weight < 0.1 || weight > 10) return { error: "markWeight" };

  const entries = [];
  for (const { studentId } of lesson.group.enrollments) {
    const raw = String(formData.get(`value:${studentId}`) ?? "").trim();
    if (raw === "") continue;
    const value = readMarkValue(raw);
    if (value === null) return { error: "markValue" };
    const comment = MARK_COMMENT.safeParse(formData.get(`comment:${studentId}`) ?? "");
    if (!comment.success) return { error: "markComment" };
    entries.push({ studentId, value, comment: comment.data || null });
  }
  if (entries.length === 0) return { error: "marksEmpty" };

  const created = await db.$transaction(
    entries.map((entry) =>
      db.mark.create({
        data: {
          ...entry,
          type: type.data,
          weight,
          groupId: lesson.group.id,
          lessonId: lesson.id,
          createdBy: teacher.id,
        },
      }),
    ),
  );
  notifyMarks(created, lesson.group.course.title, (mark) => `mark:${mark.id}`);
  refresh();
  return { ok: "marksSaved" };
}

export async function updateMark(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const mark = await db.mark.findFirst({
    where: { id: String(formData.get("markId") ?? ""), group: { teacherId: teacher.id } },
    select: {
      id: true,
      studentId: true,
      type: true,
      value: true,
      homeworkId: true,
      group: { select: { course: { select: { title: true } }, term: { select: { locked: true } } } },
    },
  });
  if (!mark) return { error: "markNotFound" };
  if (mark.group.term.locked) return { error: "termLocked" };
  // Changing one here would leave the homework's grade showing a different score.
  if (mark.homeworkId) return { error: "markFromHomework" };

  const value = readMarkValue(String(formData.get("value") ?? "").trim());
  if (value === null) return { error: "markValue" };
  const comment = MARK_COMMENT.safeParse(formData.get("comment") ?? "");
  if (!comment.success) return { error: "markComment" };

  const changed = value !== mark.value;
  await db.$transaction([
    db.mark.update({ where: { id: mark.id }, data: { value, comment: comment.data || null } }),
    ...(changed
      ? [db.markHistory.create({ data: { markId: mark.id, oldValue: mark.value, newValue: value, changedBy: teacher.id } })]
      : []),
  ]);
  if (changed) {
    notifyMarks([{ ...mark, value }], mark.group.course.title, (m) => `mark:${m.id}:${m.value}`);
  }
  refresh();
  return { ok: "markSaved" };
}

// ---------- Checking homework ----------

const FEEDBACK = z.string().trim().max(5_000);

class ReviewRefused extends Error {
  constructor(readonly code: "attemptOutdated") {
    super(code);
  }
}

// Creates the student's mark for a homework, or moves it with a history entry.
async function saveHomeworkMark(
  tx: Prisma.TransactionClient,
  input: { studentId: string; homeworkId: string; groupId: string; value: number; teacherId: string },
) {
  const key = { studentId_homeworkId: { studentId: input.studentId, homeworkId: input.homeworkId } };
  const existing = await tx.mark.findUnique({ where: key, select: { id: true, value: true } });
  if (existing) {
    if (existing.value === input.value) return { id: existing.id, changed: false };
    await tx.mark.update({ where: { id: existing.id }, data: { value: input.value } });
    await tx.markHistory.create({
      data: { markId: existing.id, oldValue: existing.value, newValue: input.value, changedBy: input.teacherId },
    });
    return { id: existing.id, changed: true };
  }
  const weights = await getMarkWeights();
  const created = await tx.mark.create({
    data: {
      studentId: input.studentId,
      homeworkId: input.homeworkId,
      groupId: input.groupId,
      type: "homework",
      value: input.value,
      weight: weights.homework,
      createdBy: input.teacherId,
    },
  });
  return { id: created.id, changed: true };
}

export async function reviewSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const attemptId = String(formData.get("attemptId") ?? "");
  const decision = formData.get("decision");
  if (decision !== "grade" && decision !== "return") return { error: "submissionNotFound" };

  const attempt = await db.submissionAttempt.findFirst({
    where: { id: attemptId, submission: { homework: { group: { teacherId: teacher.id } } } },
    select: {
      submission: {
        select: {
          id: true,
          status: true,
          studentId: true,
          homework: {
            select: {
              id: true,
              title: true,
              maxScore: true,
              groupId: true,
              group: { select: { course: { select: { title: true } }, term: { select: { locked: true } } } },
            },
          },
        },
      },
    },
  });
  if (!attempt) return { error: "submissionNotFound" };
  const { submission } = attempt;
  const { homework } = submission;
  if (homework.group.term.locked) return { error: "termLocked" };
  const enrolled = await db.enrollment.count({
    where: { groupId: homework.groupId, studentId: submission.studentId, status: "active", student: { active: true } },
  });
  if (enrolled === 0) return { error: "studentLeft" };

  const feedbackInput = FEEDBACK.safeParse(formData.get("feedback") ?? "");
  if (!feedbackInput.success) return { error: "feedbackTooLong" };
  const feedback = feedbackInput.data || null;
  const course = homework.group.course.title;
  const backPath = `/homework/${homework.id}`;
  const reviewedAt = new Date();

  // Work is only judged while the page still shows the student's latest hand-in.
  const assertLatest = async (tx: Prisma.TransactionClient) => {
    const latest = await tx.submissionAttempt.findFirst({
      where: { submissionId: submission.id },
      orderBy: { number: "desc" },
      select: { id: true },
    });
    if (latest?.id !== attemptId) throw new ReviewRefused("attemptOutdated");
  };

  if (decision === "return") {
    if (!feedback) return { error: "feedbackRequired" };
    try {
      await db.$transaction(async (tx) => {
        await assertLatest(tx);
        const claimed = await tx.submission.updateMany({
          where: { id: submission.id, status: { in: ["submitted", "late"] } },
          data: { status: "returned", score: null, feedback },
        });
        if (claimed.count === 0) throw new ReviewRefused("attemptOutdated");
        await tx.submissionAttempt.update({
          where: { id: attemptId },
          data: { outcome: "returned", score: null, feedback, reviewedAt },
        });
      });
    } catch (e) {
      if (e instanceof ReviewRefused) return { error: e.code };
      throw e;
    }
    after(async () => {
      try {
        await notify(
          submission.studentId,
          "homework_returned",
          { homeworkId: homework.id, homeworkTitle: homework.title, course },
          { dedupeKey: `returned:${attemptId}` },
        );
      } catch (e) {
        console.error(`[notify] homework_returned failed: ${e instanceof Error ? e.name : "unknown"}`);
      }
    });
    redirect(localePath(await getRequestLocale(), backPath));
  }

  const raw = String(formData.get("score") ?? "").trim();
  const score = Number(raw);
  if (raw === "" || !Number.isInteger(score) || score < 0 || score > homework.maxScore) return { error: "scoreRange" };
  const value = toHundredScale(score, homework.maxScore);

  let mark: { id: string; changed: boolean };
  try {
    mark = await db.$transaction(async (tx) => {
      await assertLatest(tx);
      // A first grade or a change of grade. Returned work waits for the student.
      const claimed = await tx.submission.updateMany({
        where: { id: submission.id, status: { in: ["submitted", "late", "graded"] } },
        data: { status: "graded", score, feedback },
      });
      if (claimed.count === 0) throw new ReviewRefused("attemptOutdated");
      await tx.submissionAttempt.update({
        where: { id: attemptId },
        data: { outcome: "graded", score, feedback, reviewedAt },
      });
      return saveHomeworkMark(tx, {
        studentId: submission.studentId,
        homeworkId: homework.id,
        groupId: homework.groupId,
        value,
        teacherId: teacher.id,
      });
    });
  } catch (e) {
    if (e instanceof ReviewRefused) return { error: e.code };
    throw e;
  }
  if (mark.changed) {
    notifyMarks(
      [{ id: mark.id, studentId: submission.studentId, type: "homework", value }],
      course,
      (m) => `mark:${m.id}:${m.value}`,
    );
  }
  redirect(localePath(await getRequestLocale(), backPath));
}

// For a student who never handed in. Only creates the mark, so a later hand-in can still
// be graded and will replace it, with the change recorded.
export async function giveZero(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const studentId = String(formData.get("studentId") ?? "");
  const homework = await db.homework.findFirst({
    where: { id: String(formData.get("homeworkId") ?? ""), group: { teacherId: teacher.id } },
    select: {
      id: true,
      dueAt: true,
      groupId: true,
      submissions: { where: { studentId }, select: { id: true } },
      marks: { where: { studentId }, select: { id: true } },
      group: {
        select: {
          course: { select: { title: true } },
          term: { select: { locked: true } },
          enrollments: { where: { studentId, status: "active", student: { active: true } }, select: { id: true } },
        },
      },
    },
  });
  if (!homework) return { error: "homeworkNotFound" };
  if (homework.group.term.locked) return { error: "termLocked" };
  if (homework.group.enrollments.length === 0) return { error: "studentLeft" };
  if (homework.dueAt >= new Date()) return { error: "zeroBeforeDeadline" };
  if (homework.submissions.length > 0 || homework.marks.length > 0) return { error: "attemptOutdated" };

  const weights = await getMarkWeights();
  let mark;
  try {
    mark = await db.mark.create({
      data: {
        studentId,
        homeworkId: homework.id,
        groupId: homework.groupId,
        type: "homework",
        value: 0,
        weight: weights.homework,
        createdBy: teacher.id,
      },
    });
  } catch (e) {
    // A double tap: the unique rule on (student, homework) stopped the second mark.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "attemptOutdated" };
    throw e;
  }
  notifyMarks([mark], homework.group.course.title, (m) => `mark:${m.id}:${m.value}`);
  redirect(localePath(await getRequestLocale(), `/homework/${homework.id}`));
}

// ---------- Homework ----------

const homeworkSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(20_000),
  // The Diary puts these straight into links, so only http(s) addresses are accepted.
  attachments: z
    .string()
    .trim()
    .transform((s) => s.split(/\s+/).filter(Boolean))
    .pipe(z.array(z.url({ protocol: /^https?$/ }).max(2_000)).max(10)),
  maxScore: z.coerce.number().int().min(1).max(1_000),
});

const HOMEWORK_FIELD_ERRORS = {
  title: "homeworkTitle",
  description: "homeworkTitle",
  attachments: "homeworkLinks",
  maxScore: "homeworkMaxScore",
} as const;

function readHomework(formData: FormData) {
  const parsed = homeworkSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    attachments: formData.get("attachments") ?? "",
    maxScore: formData.get("maxScore"),
  });
  if (parsed.success) return { data: parsed.data };
  const field = parsed.error.issues[0].path[0] as keyof typeof HOMEWORK_FIELD_ERRORS;
  return { error: HOMEWORK_FIELD_ERRORS[field] };
}

// Runs after the response: one notification per student would otherwise keep the teacher
// waiting. One student's failure must not stop the rest.
function notifyNewHomework(
  studentIds: string[],
  homework: { id: string; title: string; dueAt: Date },
  course: string,
) {
  after(async () => {
    for (const studentId of studentIds) {
      try {
        await notify(
          studentId,
          "new_homework",
          { homeworkId: homework.id, homeworkTitle: homework.title, course, dueAt: homework.dueAt.toISOString() },
          { dedupeKey: `new_homework:${homework.id}` },
        );
      } catch (e) {
        console.error(`[notify] new_homework failed: ${e instanceof Error ? e.name : "unknown"}`);
      }
    }
  });
}

export async function saveHomework(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const read = readHomework(formData);
  if ("error" in read) return { error: read.error };
  const { data } = read;
  const dueInput = String(formData.get("dueAt") ?? "");
  const dueAt = localInputToDate(dueInput, teacher.timezone);
  if (!dueAt) return { error: "homeworkDue" };
  const fields = { title: data.title, description: data.description || null, attachments: data.attachments, dueAt };
  const homeworkId = formData.get("homeworkId");
  let backPath: string;

  if (typeof homeworkId === "string") {
    const existing = await db.homework.findFirst({
      where: { id: homeworkId, group: { teacherId: teacher.id } },
      select: {
        dueAt: true,
        maxScore: true,
        lesson: { select: { id: true, teacherId: true } },
        groupId: true,
        group: { select: { term: { select: { locked: true } } } },
        submissions: { where: { status: "graded" }, select: { id: true }, take: 1 },
        _count: { select: { marks: true } },
      },
    });
    if (!existing) return { error: "homeworkNotFound" };
    if (existing.group.term.locked) return { error: "termLocked" };
    // Marks were converted using the old maximum, so it can't change once work is graded.
    const graded = existing._count.marks > 0 || existing.submissions.length > 0;
    if (graded && data.maxScore !== existing.maxScore) return { error: "maxScoreLocked" };
    // A deadline already in the past may stay as it is; a new one must be in the future.
    const dueChanged = dueInput !== dateToLocalInput(existing.dueAt, teacher.timezone);
    if (dueChanged && dueAt <= new Date()) return { error: "homeworkDue" };

    await db.homework.update({
      where: { id: homeworkId },
      data: { ...fields, dueAt: dueChanged ? dueAt : existing.dueAt, maxScore: data.maxScore },
    });
    backPath = existing.lesson?.teacherId === teacher.id ? `/lessons/${existing.lesson.id}` : `/groups/${existing.groupId}`;
  } else {
    const group = await db.group.findFirst({
      where: { id: String(formData.get("groupId") ?? ""), teacherId: teacher.id },
      select: {
        id: true,
        course: { select: { title: true } },
        term: { select: { locked: true } },
        enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
      },
    });
    if (!group) return { error: "groupNotFound" };
    if (group.term.locked) return { error: "termLocked" };
    if (dueAt <= new Date()) return { error: "homeworkDue" };

    const requestedLesson = formData.get("lessonId");
    const lesson =
      typeof requestedLesson === "string"
        ? await db.lesson.findFirst({
            where: { id: requestedLesson, groupId: group.id },
            select: { id: true, status: true, teacherId: true },
          })
        : null;
    if (typeof requestedLesson === "string" && !lesson) return { error: "lessonNotFound" };
    if (lesson?.status === "cancelled") return { error: "lessonCancelled" };

    const homework = await db.homework.create({
      data: { ...fields, maxScore: data.maxScore, groupId: group.id, lessonId: lesson?.id ?? null },
    });
    notifyNewHomework(group.enrollments.map((e) => e.studentId), homework, group.course.title);
    backPath = lesson?.teacherId === teacher.id ? `/lessons/${lesson.id}` : `/groups/${group.id}`;
  }

  redirect(localePath(await getRequestLocale(), backPath));
}

// Only homework nobody has started. Anything handed in, uploaded or marked is a school record.
export async function deleteHomework(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const id = String(formData.get("homeworkId") ?? "");
  const homework = await db.homework.findFirst({
    where: { id, group: { teacherId: teacher.id } },
    select: {
      groupId: true,
      lesson: { select: { id: true, teacherId: true } },
      group: { select: { term: { select: { locked: true } } } },
      _count: { select: { submissions: true, uploads: true, marks: true } },
    },
  });
  if (!homework) return { error: "homeworkNotFound" };
  if (homework.group.term.locked) return { error: "termLocked" };
  const { submissions, uploads, marks } = homework._count;
  if (submissions + uploads + marks > 0) return { error: "homeworkHasWork" };

  await db.$transaction([
    // Otherwise students keep notifications that link to a page that no longer exists.
    db.notification.deleteMany({
      where: { type: { in: ["new_homework", "deadline"] }, payload: { path: ["homeworkId"], equals: id } },
    }),
    db.homework.delete({ where: { id } }),
  ]);
  const backPath =
    homework.lesson?.teacherId === teacher.id ? `/lessons/${homework.lesson.id}` : `/groups/${homework.groupId}`;
  redirect(localePath(await getRequestLocale(), backPath));
}

// ---------- Profile ----------

export async function updateTimezone(_prev: FormState, formData: FormData): Promise<FormState> {
  const teacher = await getCurrentTeacher();
  const timezone = String(formData.get("timezone") ?? "");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC") {
    return { error: "badTimezone" };
  }
  await db.user.update({ where: { id: teacher.id }, data: { timezone } });
  refresh();
  return { ok: "timezoneSaved" };
}

export async function updateLocale(formData: FormData) {
  const teacher = await getCurrentTeacher();
  const locale = formData.get("locale");
  if (!hasLocale(locale)) return;
  await db.user.update({ where: { id: teacher.id }, data: { locale } });
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Stay on the same page. Only paths inside this site are accepted.
  const path = formData.get("path");
  redirect(localePath(locale, isInternalPath(path) ? path : "/"));
}

// ---------- Privacy ----------

export async function acceptPrivacy(formData: FormData) {
  const teacher = await getTeacherForConsent();
  if (formData.get("confirmResponsible") !== "on") return;
  await db.user.update({
    where: { id: teacher.id },
    data: { privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: new Date() },
  });
  redirect(localePath(await getRequestLocale(), "/"));
}
