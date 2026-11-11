// The Teacher's data layer against a real database. A teacher sees their own groups, lessons and homework, and a request
// for anyone else's looks exactly like a request for something that does not exist.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ teacherId: "" }));
vi.mock("../auth", () => ({
  getCurrentTeacher: async () => ({ id: state.teacherId, name: "T", email: "t@x", timezone: "Asia/Baku", locale: "en", mustChangePassword: false }),
}));

// @/i18n needs Next's request context (root params), which only exists inside a build: serve the real dictionaries.
vi.mock("@/i18n", async () => {
  const { en } = await import("@/i18n/dictionaries/en");
  const { fmt } = await import("@/i18n/format");
  return { getDictionary: () => en, getI18n: async () => ({ locale: "en", t: en }), getRequestLocale: async () => "en", fmt };
});

import { db } from "../db";
import {
  getGroup,
  getHomeworkChecking,
  getHomeworkForEdit,
  getHomeworkToCheck,
  getLesson,
  getLessonsBetween,
  getMyGroups,
  getSubmissionReview,
  getTeacherTerms,
  resolveTerm,
} from "../data";
import { createWorld, daysFromNow, resetDatabase } from "../../../test/db";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let n = 0;
const student = (name: string) => db.user.create({ data: { name, email: `${name.toLowerCase()}${++n}@t.local`, passwordHash: "x", role: "student" } });

// T is the signed-in teacher. Their group has Anna and Boris (enrolled) and Lena (left). Another teacher, O, has a
// group with Anna in it too.
async function setup() {
  const w = await createWorld(); // teacher T, student "Student", course, term, group A1 (T), homework HW 1
  const anna = w.student;
  await db.user.update({ where: { id: anna.id }, data: { name: "Anna" } });
  const boris = await student("Boris");
  const lena = await student("Lena");
  await db.enrollment.create({ data: { groupId: w.group.id, studentId: boris.id } });
  await db.enrollment.create({ data: { groupId: w.group.id, studentId: lena.id, status: "dropped" } });
  const other = await db.user.create({ data: { name: "Other", email: "other@t.local", passwordHash: "x", role: "teacher" } });
  const otherGroup = await db.group.create({ data: { name: "B1", courseId: w.course.id, teacherId: other.id, termId: w.term.id } });
  await db.enrollment.create({ data: { groupId: otherGroup.id, studentId: anna.id } });
  const otherHomework = await db.homework.create({ data: { groupId: otherGroup.id, title: "Theirs", dueAt: daysFromNow(5), maxScore: 10 } });
  state.teacherId = w.teacher.id;
  return { ...w, anna, boris, lena, other, otherGroup, otherHomework };
}
type World = Awaited<ReturnType<typeof setup>>;
const lesson = (w: World, groupId: string, teacherId: string, hours: number, extra: Record<string, unknown> = {}) =>
  db.lesson.create({ data: { groupId, teacherId, startsAt: new Date(Date.now() + hours * HOUR), endsAt: new Date(Date.now() + (hours + 1) * HOUR), ...extra } });

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("terms", () => {
  it("lists the terms a teacher teaches in or has covered a lesson in, newest first, and marks the current one", async () => {
    const w = await setup();
    const old = await db.term.create({ data: { name: "Spring", startDate: daysFromNow(-400), endDate: daysFromNow(-300), locked: true } });
    const oldGroup = await db.group.create({ data: { name: "S1", courseId: w.course.id, teacherId: w.teacher.id, termId: old.id } });
    // A term where they only covered one lesson for another teacher.
    const cover = await db.term.create({ data: { name: "Cover", startDate: daysFromNow(-200), endDate: daysFromNow(-150) } });
    const coverGroup = await db.group.create({ data: { name: "C1", courseId: w.course.id, teacherId: w.other.id, termId: cover.id } });
    await lesson(w, coverGroup.id, w.teacher.id, -24 * 160);
    // A term they have nothing to do with.
    await db.term.create({ data: { name: "Unrelated", startDate: daysFromNow(-5), endDate: daysFromNow(5) } });
    void oldGroup;

    expect((await getTeacherTerms()).map((t) => [t.name, t.current, t.locked])).toEqual([
      ["Fall", true, false],
      ["Cover", false, false],
      ["Spring", false, true],
    ]);
  });

  it("gives the requested term if it is the teacher's own, otherwise the current one", async () => {
    const w = await setup();
    const strangers = await db.term.create({ data: { name: "Hidden", startDate: daysFromNow(-5), endDate: daysFromNow(5) } });
    expect((await resolveTerm(w.term.id)).term?.name).toBe("Fall");
    expect((await resolveTerm(strangers.id)).term?.name).toBe("Fall");
    expect((await resolveTerm("nonsense")).term?.name).toBe("Fall");
  });
});

describe("lessons", () => {
  it("follows Lesson.teacherId: a substitute's lesson is theirs, and the group teacher's lesson given away is not", async () => {
    const w = await setup();
    const mine = await lesson(w, w.group.id, w.teacher.id, 2);
    await lesson(w, w.group.id, w.other.id, 3); // in my group, covered by someone else
    const covering = await lesson(w, w.otherGroup.id, w.teacher.id, 4); // someone else's group, covered by me
    await lesson(w, w.otherGroup.id, w.other.id, 5);
    await lesson(w, w.group.id, w.teacher.id, 30); // outside the window
    const found = await getLessonsBetween(new Date(), new Date(Date.now() + 10 * HOUR));
    expect(found.map((l) => l.id)).toEqual([mine.id, covering.id]);
  });

  it("opens a lesson of their own, with the roster and who is marked, and the group teacher's homework and marks", async () => {
    const w = await setup();
    const l = await lesson(w, w.group.id, w.teacher.id, 2, { topic: "Fractions" });
    await db.homework.update({ where: { id: w.homework.id }, data: { lessonId: l.id } }); // given in this lesson
    await db.attendance.create({ data: { lessonId: l.id, studentId: w.anna.id, status: "late" } });
    await db.attendance.create({ data: { lessonId: l.id, studentId: w.lena.id, status: "present" } }); // has since left
    await db.mark.create({ data: { studentId: w.anna.id, groupId: w.group.id, lessonId: l.id, type: "quiz", value: 70, createdBy: w.teacher.id } });
    const data = (await getLesson(l.id))!;
    expect(data).toMatchObject({ id: l.id, topic: "Fractions", isGroupTeacher: true });
    expect(data.roster.map((r) => [r.name, r.status])).toEqual([["Anna", "late"], ["Boris", null]]);
    expect(data.left.map((r) => [r.name, r.status])).toEqual([["Lena", "present"]]);
    expect(data.homework.map((h) => h.title)).toEqual(["HW 1"]);
    expect(data.marks.map((m) => [m.studentName, m.value])).toEqual([["Anna", 70]]);
  });

  it("shows a substitute the lesson and the roster, but not the group's homework or marks", async () => {
    const w = await setup();
    const l = await lesson(w, w.otherGroup.id, w.teacher.id, 2);
    await db.mark.create({ data: { studentId: w.anna.id, groupId: w.otherGroup.id, lessonId: l.id, type: "quiz", value: 55, createdBy: w.other.id } });
    const data = (await getLesson(l.id))!;
    expect(data.isGroupTeacher).toBe(false);
    expect(data.homework).toEqual([]);
    expect(data.marks).toEqual([]);
    expect(data.roster.map((r) => r.name)).toEqual(["Anna"]);
  });

  it("does not open another teacher's lesson, or one that does not exist", async () => {
    const w = await setup();
    const theirs = await lesson(w, w.otherGroup.id, w.other.id, 2);
    const mineButGivenAway = await lesson(w, w.group.id, w.other.id, 3);
    expect(await getLesson(theirs.id)).toBeNull();
    expect(await getLesson(mineButGivenAway.id)).toBeNull();
    expect(await getLesson("nonsense")).toBeNull();
  });
});

describe("groups and how each student is doing", () => {
  async function lessonsFor(w: World, studentId: string, statuses: ("present" | "late" | "absent" | "excused")[]) {
    for (const [i, status] of statuses.entries()) {
      const l = await lesson(w, w.group.id, w.teacher.id, -(i + 1) * 24);
      await db.attendance.create({ data: { lessonId: l.id, studentId, status } });
    }
  }

  it("lists only the teacher's own groups in a term, with the enrolled students", async () => {
    const w = await setup();
    const groups = await getMyGroups(w.term.id);
    expect(groups.map((g) => [g.name, g.course, g.students.map((s) => s.name)])).toEqual([["A1", "Math", ["Anna", "Boris"]]]);
    const other = await db.term.create({ data: { name: "Empty", startDate: daysFromNow(-5), endDate: daysFromNow(5) } });
    expect(await getMyGroups(other.id)).toEqual([]);
  });

  it("works out each student's attendance, average and homework the way the school does", async () => {
    const w = await setup();
    await lessonsFor(w, w.anna.id, ["present", "late", "absent", "excused"]); // 2 of 3 counted
    await db.mark.create({ data: { studentId: w.anna.id, groupId: w.group.id, type: "quiz", value: 80, weight: 1, createdBy: w.teacher.id } });
    await db.mark.create({ data: { studentId: w.anna.id, groupId: w.group.id, type: "exam", value: 60, weight: 3, createdBy: w.teacher.id } }); // (80+180)/4
    await db.mark.create({ data: { studentId: w.boris.id, groupId: w.otherGroup.id, type: "quiz", value: 5, createdBy: w.other.id } }); // another group's
    // Two homeworks past due: Anna handed one in.
    await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - 2 * DAY) } });
    const hw2 = await db.homework.create({ data: { groupId: w.group.id, title: "HW 2", dueAt: new Date(Date.now() - DAY), maxScore: 10 } });
    await db.submission.create({ data: { homeworkId: hw2.id, studentId: w.anna.id, status: "submitted" } });

    const [group] = await getMyGroups(w.term.id);
    const anna = group.students.find((s) => s.name === "Anna")!;
    const boris = group.students.find((s) => s.name === "Boris")!;
    expect(anna).toMatchObject({ average: 65, handedIn: 1, missed: 1, assigned: 2, enrolled: true, tooManyMissed: false });
    expect(anna.attendanceRate).toBeCloseTo(2 / 3, 5);
    expect(anna.attendanceLevel).toBe("risk");
    expect(anna.lowAverage).toBe(false); // 65 is amber, not red
    expect(anna.fallingBehind).toBe(true); // because of attendance
    expect(boris).toMatchObject({ average: null, attendanceRate: null, handedIn: 0, missed: 2, tooManyMissed: true, fallingBehind: true });
  });

  it("does not call a student who is fine 'falling behind'", async () => {
    const w = await setup();
    await lessonsFor(w, w.anna.id, ["present", "present", "present"]);
    await db.mark.create({ data: { studentId: w.anna.id, groupId: w.group.id, type: "quiz", value: 90, createdBy: w.teacher.id } });
    const [group] = await getMyGroups(w.term.id);
    expect(group.students.find((s) => s.name === "Anna")).toMatchObject({ fallingBehind: false, lowAverage: false, attendanceLevel: "ok" });
  });

  it("opens a group of their own with its homework, and separates the students who have left", async () => {
    const w = await setup();
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.anna.id, status: "submitted" } });
    const group = (await getGroup(w.group.id))!;
    expect(group).toMatchObject({ name: "A1", course: { title: "Math" }, term: { locked: false } });
    expect(group.students.map((s) => s.name)).toEqual(["Anna", "Boris"]);
    expect(group.left.map((s) => s.name)).toEqual(["Lena"]);
    expect(group.homework).toMatchObject([{ title: "HW 1" }]);
  });

  it("does not open another teacher's group, and cannot tell it apart from one that does not exist", async () => {
    const w = await setup();
    expect(await getGroup(w.otherGroup.id)).toBeNull();
    expect(await getGroup("nonsense")).toBeNull();
  });
});

describe("homework", () => {
  it("opens a teacher's own homework for editing, checking and review, and nobody else's", async () => {
    const w = await setup();
    expect(await getHomeworkForEdit(w.homework.id)).toMatchObject({ id: w.homework.id, title: "HW 1", maxScore: 20 });
    expect(await getHomeworkChecking(w.homework.id)).toMatchObject({ id: w.homework.id, title: "HW 1" });
    expect(await getSubmissionReview(w.homework.id, w.anna.id)).toMatchObject({ homeworkId: w.homework.id, studentName: "Anna", enrolled: true, submissionStatus: null, mark: null });
    // A student who has left is still reviewable, as no longer enrolled; one who was never in the group is not.
    expect(await getSubmissionReview(w.homework.id, w.lena.id)).toMatchObject({ studentName: "Lena", enrolled: false });
    expect(await getSubmissionReview(w.homework.id, (await student("Stranger")).id)).toBeNull();

    expect(await getHomeworkForEdit(w.otherHomework.id)).toBeNull();
    expect(await getHomeworkChecking(w.otherHomework.id)).toBeNull();
    expect(await getSubmissionReview(w.otherHomework.id, w.anna.id)).toBeNull();
    expect(await getHomeworkForEdit("nonsense")).toBeNull();
  });

  it("lists what is waiting to be checked: handed in, from students still in the group, in an open term", async () => {
    const w = await setup();
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.anna.id, status: "submitted" } });
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.boris.id, status: "late" } });
    await db.submission.create({ data: { homeworkId: w.homework.id, studentId: w.lena.id, status: "submitted" } }); // has left
    await db.submission.create({ data: { homeworkId: w.otherHomework.id, studentId: w.anna.id, status: "submitted" } }); // not mine
    expect(await getHomeworkToCheck()).toMatchObject([{ id: w.homework.id, title: "HW 1", course: "Math", groupName: "A1", waiting: 2 }]);

    await db.submission.updateMany({ where: { homeworkId: w.homework.id }, data: { status: "graded", score: 10 } });
    expect(await getHomeworkToCheck()).toEqual([]);

    await db.submission.updateMany({ where: { homeworkId: w.homework.id }, data: { status: "submitted", score: null } });
    await db.term.update({ where: { id: w.term.id }, data: { locked: true } });
    expect(await getHomeworkToCheck()).toEqual([]);
  });
});
