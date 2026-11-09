import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ teacher: null as null | { id: string; timezone: string } }));

vi.mock("@/lib/auth", () => ({
  getTeacherOrNull: async () => state.teacher,
  getCurrentTeacher: async () => {
    throw new Error("page auth must not be used by the API route");
  },
}));
// next/root-params only exists inside Next's compiler, so @/i18n is replaced by the real dictionaries.
vi.mock("@/i18n", async () => {
  const [{ az }, { en }, { ru }] = await Promise.all([
    import("@/i18n/dictionaries/az"),
    import("@/i18n/dictionaries/en"),
    import("@/i18n/dictionaries/ru"),
  ]);
  const all = { az, en, ru } as const;
  return { getDictionary: (locale: keyof typeof all) => all[locale], getRequestLocale: async () => "en" as const };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

import { db } from "@/lib/db";
import { createWorld, resetDatabase } from "../../../test/db";
import { GET } from "../api/groups/[id]/gradebook/route";

const call = (groupId: string, query = "") =>
  GET(new Request(`http://localhost/api/groups/${groupId}/gradebook${query}`), { params: Promise.resolve({ id: groupId }) } as never);

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function withMarks() {
  const w = await createWorld();
  await db.user.update({ where: { id: w.student.id }, data: { name: "=HYPERLINK(\"http://evil\")" } });
  await db.mark.create({ data: { studentId: w.student.id, groupId: w.group.id, homeworkId: w.homework.id, type: "homework", value: 90, createdBy: w.teacher.id } });
  state.teacher = { id: w.teacher.id, timezone: "Asia/Baku" };
  return w;
}

describe("GET /api/groups/[id]/gradebook", () => {
  it("answers 401 to anyone who is not a signed-in teacher", async () => {
    const w = await withMarks();
    state.teacher = null;
    expect((await call(w.group.id)).status).toBe(401);
  });

  it("answers 404 for another teacher's group (no existence leak)", async () => {
    const w = await withMarks();
    const other = await db.user.create({ data: { name: "O", email: "o@t.local", passwordHash: "x", role: "teacher" } });
    state.teacher = { id: other.id, timezone: "Asia/Baku" };
    expect((await call(w.group.id)).status).toBe(404);
    expect((await call("does-not-exist")).status).toBe(404);
  });

  it("returns a CSV attachment with the marks, in the requested language", async () => {
    const w = await withMarks();
    const res = await call(w.group.id, "?lang=ru");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename\*=UTF-8''gradebook-A1\.csv$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // text() would strip the BOM, so check the bytes Excel receives.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    const [header, student] = body.slice(1).trimEnd().split("\r\n");
    expect(header.startsWith("Ученик,")).toBe(true);
    expect(student).toContain(",90,");
    // A formula in a student's name must not run in Excel: it is prefixed with ' (and quoted, as it holds quotes).
    expect(student).toMatch(/^"'=HYPERLINK/);
    expect(student).not.toMatch(/^"?=/);
  });

  it("falls back to the default language for an unknown ?lang", async () => {
    const w = await withMarks();
    const body = await (await call(w.group.id, "?lang=xx")).text();
    expect(body.length).toBeGreaterThan(10);
  });
});
