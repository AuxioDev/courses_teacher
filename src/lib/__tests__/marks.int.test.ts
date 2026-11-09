import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { createWorld, resetDatabase } from "../../../test/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

// The migration 20261109120000_mark_unique_homework is what the Teacher app's grading relies on.
describe("Mark uniqueness (migration mark_unique_homework)", () => {
  it("allows one mark per student per homework and rejects a second", async () => {
    const w = await createWorld();
    const base = { studentId: w.student.id, groupId: w.group.id, homeworkId: w.homework.id, type: "homework" as const, createdBy: w.teacher.id };
    await db.mark.create({ data: { ...base, value: 90 } });
    await expect(db.mark.create({ data: { ...base, value: 50 } })).rejects.toMatchObject({ code: "P2002" });
    expect(await db.mark.count()).toBe(1);
  });

  it("lets a re-grade update the same mark through the compound key (what upsert relies on)", async () => {
    const w = await createWorld();
    const base = { studentId: w.student.id, groupId: w.group.id, homeworkId: w.homework.id, type: "homework" as const, createdBy: w.teacher.id };
    const where = { studentId_homeworkId: { studentId: w.student.id, homeworkId: w.homework.id } };
    await db.mark.upsert({ where, create: { ...base, value: 70 }, update: { value: 70 } });
    await db.mark.upsert({ where, create: { ...base, value: 95 }, update: { value: 95 } });
    const marks = await db.mark.findMany();
    expect(marks).toHaveLength(1);
    expect(marks[0].value).toBe(95);
  });

  it("does not restrict lesson marks, which have no homework", async () => {
    const w = await createWorld();
    const base = { studentId: w.student.id, groupId: w.group.id, homeworkId: null, type: "quiz" as const, createdBy: w.teacher.id };
    await db.mark.createMany({ data: [{ ...base, value: 80 }, { ...base, value: 85 }, { ...base, value: 90 }] });
    expect(await db.mark.count()).toBe(3);
  });

  it("allows the same homework to be graded for different students", async () => {
    const w = await createWorld();
    const other = await db.user.create({ data: { name: "S2", email: "s2@test.local", passwordHash: "x", role: "student" } });
    const common = { groupId: w.group.id, homeworkId: w.homework.id, type: "homework" as const, createdBy: w.teacher.id, value: 60 };
    await db.mark.create({ data: { ...common, studentId: w.student.id } });
    await db.mark.create({ data: { ...common, studentId: other.id } });
    expect(await db.mark.count()).toBe(2);
  });

  it("keeps the audit trail when a mark changes", async () => {
    const w = await createWorld();
    const mark = await db.mark.create({
      data: { studentId: w.student.id, groupId: w.group.id, homeworkId: w.homework.id, type: "homework", createdBy: w.teacher.id, value: 60 },
    });
    await db.$transaction([
      db.markHistory.create({ data: { markId: mark.id, oldValue: 60, newValue: 75, changedBy: w.teacher.id } }),
      db.mark.update({ where: { id: mark.id }, data: { value: 75 } }),
    ]);
    const history = await db.markHistory.findMany({ where: { markId: mark.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ oldValue: 60, newValue: 75 });
  });
});

describe("Submission and enrollment uniqueness", () => {
  it("allows one submission per student per homework", async () => {
    const w = await createWorld();
    const data = { homeworkId: w.homework.id, studentId: w.student.id, content: "done" };
    await db.submission.create({ data });
    await expect(db.submission.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });

  it("does not enroll the same student twice in a group", async () => {
    const w = await createWorld();
    await expect(db.enrollment.create({ data: { groupId: w.group.id, studentId: w.student.id } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects duplicate emails", async () => {
    const w = await createWorld();
    await expect(db.user.create({ data: { name: "Dup", email: w.student.email, passwordHash: "x", role: "student" } })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("pre-flight for the unique-mark migration", () => {
  // Run this query on the real database BEFORE deploying: the migration fails if any row comes back.
  const duplicates = () => db.$queryRaw<{ student_id: string; homework_id: string; n: bigint }[]>`
    SELECT student_id, homework_id, COUNT(*) AS n FROM marks
    WHERE homework_id IS NOT NULL GROUP BY student_id, homework_id HAVING COUNT(*) > 1`;

  it("finds nothing on clean data", async () => {
    await createWorld();
    expect(await duplicates()).toEqual([]);
  });
});
