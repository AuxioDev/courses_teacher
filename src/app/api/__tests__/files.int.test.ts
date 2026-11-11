// A teacher may open a file a student handed in for one of the teacher's own groups, and nothing else.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ teacherId: null as string | null, objects: new Map<string, string>() }));

vi.mock("@/lib/auth", () => ({
  getTeacherOrNull: async () => (state.teacherId ? { id: state.teacherId, name: "T", email: "t@x", timezone: "Asia/Baku", locale: "en" } : null),
}));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  readObject: vi.fn(async (key: string) => {
    const text = state.objects.get(key);
    return text === undefined ? null : new Blob([text]).stream();
  }),
}));

import { db } from "@/lib/db";
import { createWorld, resetDatabase } from "../../../../test/db";
import { GET as downloadFile } from "../files/[id]/route";

async function setup() {
  const w = await createWorld();
  state.teacherId = w.teacher.id;
  const otherTeacher = await db.user.create({ data: { name: "Other", email: "other@t.local", passwordHash: "x", role: "teacher" } });
  const otherGroup = await db.group.create({ data: { name: "B1", courseId: w.course.id, teacherId: otherTeacher.id, termId: w.term.id } });
  const otherHomework = await db.homework.create({ data: { groupId: otherGroup.id, title: "Theirs", dueAt: new Date(Date.now() + 86_400_000), maxScore: 10 } });
  const attempt = async (homeworkId: string) => {
    const submission = await db.submission.create({ data: { homeworkId, studentId: w.student.id, status: "submitted" } });
    return db.submissionAttempt.create({ data: { submissionId: submission.id, number: 1 } });
  };
  const file = (homeworkId: string, attemptId: string | null, extra: Record<string, unknown> = {}) =>
    db.submissionFile.create({
      data: { homeworkId, studentId: w.student.id, attemptId, name: "essay.pdf", size: 5, contentType: "application/pdf", storageKey: `submissions/${homeworkId}/${w.student.id}/${attemptId ?? "pending"}.pdf`, ...extra },
    });
  return { ...w, otherTeacher, otherHomework, attempt, file };
}
const get = (id: string, query = "") => downloadFile(new Request(`http://localhost/api/files/${id}${query}`), { params: Promise.resolve({ id }) } as never);

beforeEach(async () => {
  await resetDatabase();
  state.teacherId = null;
  state.objects.clear();
});
afterAll(() => db.$disconnect());

describe("GET /api/files/[id] (teacher)", () => {
  it("is refused without a signed-in teacher", async () => {
    const w = await setup();
    const f = await w.file(w.homework.id, (await w.attempt(w.homework.id)).id);
    state.teacherId = null;
    expect((await get(f.id)).status).toBe(401);
  });

  it("hands a teacher a file that was handed in for their own group, shown or downloaded as appropriate", async () => {
    const w = await setup();
    const f = await w.file(w.homework.id, (await w.attempt(w.homework.id)).id);
    state.objects.set(f.storageKey, "hello");
    const res = await get(f.id);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''essay.pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect((await get(f.id, "?download")).headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("downloads rather than shows a type a browser could run", async () => {
    const w = await setup();
    const f = await w.file(w.homework.id, (await w.attempt(w.homework.id)).id, { name: "page.html", contentType: "text/html", storageKey: `submissions/${w.homework.id}/s/p.html` });
    state.objects.set(f.storageKey, "<script>alert(1)</script>");
    expect((await get(f.id)).headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("never serves a file a student uploaded but has not handed in", async () => {
    const w = await setup();
    const pending = await w.file(w.homework.id, null);
    state.objects.set(pending.storageKey, "draft");
    expect((await get(pending.id)).status).toBe(404);
  });

  it("never serves a file from another teacher's group, and does not even read it", async () => {
    const w = await setup();
    const theirs = await w.file(w.otherHomework.id, (await w.attempt(w.otherHomework.id)).id);
    state.objects.set(theirs.storageKey, "their student's work");
    const res = await get(theirs.id);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect((await get("no-such-file")).status).toBe(404);
    // The other teacher can open it.
    state.teacherId = w.otherTeacher.id;
    expect((await get(theirs.id)).status).toBe(200);
  });

  it("answers 404 when the stored copy is missing", async () => {
    const w = await setup();
    const f = await w.file(w.homework.id, (await w.attempt(w.homework.id)).id);
    expect((await get(f.id)).status).toBe(404);
  });
});
