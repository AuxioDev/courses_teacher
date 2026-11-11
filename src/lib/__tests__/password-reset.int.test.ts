import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; html: string; text: string }[] }));
vi.mock("../email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../email")>()),
  sendEmail: vi.fn(async (m: { to: string; subject: string; html: string; text: string }) => {
    sent.emails.push(m);
    return true;
  }),
}));
vi.mock("@/i18n", async () => {
  const { az } = await import("@/i18n/dictionaries/az");
  const { en } = await import("@/i18n/dictionaries/en");
  const { ru } = await import("@/i18n/dictionaries/ru");
  const { fmt } = await import("@/i18n/format");
  return { getDictionary: (l: "az" | "en" | "ru") => ({ az, en, ru })[l], fmt };
});

import { db } from "../db";
import { APP_URL } from "../email";
import { hashToken } from "../passwords";
import { sendResetLink } from "../password-reset";
import { resetDatabase } from "../../../test/db";

let n = 0;
const person = (extra: Record<string, unknown> = {}) =>
  db.user.create({ data: { name: "Aysel Mammadova", email: `p${++n}@t.local`, passwordHash: "x", role: "teacher", ...extra } });
const tokenOf = (mail: { text: string }) => /token=([\w-]+)/.exec(mail.text)![1];

beforeEach(async () => {
  await resetDatabase();
  sent.emails.length = 0;
});
afterAll(() => db.$disconnect());

describe("sendResetLink (real database)", () => {
  it("emails a one-time link in the teacher's language, valid for an hour", async () => {
    const u = await person({ locale: "ru" });
    const before = Date.now();
    await sendResetLink(u.email);

    expect(sent.emails).toHaveLength(1);
    const [mail] = sent.emails;
    expect(mail.to).toBe(u.email);
    expect(mail.subject).toMatch(/[А-Яа-я]/);
    expect(mail.text).toContain(`${APP_URL}/ru/reset-password?token=`);
    expect(mail.html + mail.text).toContain("Aysel"); // first name
    expect(mail.html + mail.text).not.toContain("Mammadova");

    const row = await db.authToken.findFirstOrThrow();
    expect(row).toMatchObject({ userId: u.id, type: "reset", usedAt: null });
    const minutes = (row.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(59);
    expect(minutes).toBeLessThan(61);
  });

  it("stores only a hash of the token, so a copy of the database cannot be used to reset anyone's password", async () => {
    const u = await person();
    await sendResetLink(u.email);
    const token = tokenOf(sent.emails[0]);
    const row = await db.authToken.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 random bytes
  });

  it("makes every link different", async () => {
    const u = await person();
    await sendResetLink(u.email);
    await sendResetLink(u.email);
    expect(new Set(sent.emails.map(tokenOf)).size).toBe(2);
  });

  it("does nothing for an unknown address, a deactivated account, or a student or admin", async () => {
    await sendResetLink("nobody@t.local");
    const gone = await person({ active: false });
    const student = await person({ role: "student" });
    const admin = await person({ role: "admin" });
    for (const u of [gone, student, admin]) await sendResetLink(u.email);
    expect(sent.emails).toEqual([]);
    expect(await db.authToken.count()).toBe(0);
  });

  it("stops after three links in an hour, and allows another once the hour has passed", async () => {
    const u = await person();
    for (let i = 0; i < 5; i++) await sendResetLink(u.email);
    expect(sent.emails).toHaveLength(3);
    expect(await db.authToken.count()).toBe(3);

    await db.authToken.updateMany({ data: { createdAt: new Date(Date.now() - 2 * 3_600_000) } });
    await sendResetLink(u.email);
    expect(sent.emails).toHaveLength(4);
  });

  it("counts links per teacher, not across teachers", async () => {
    const a = await person();
    const b = await person();
    for (let i = 0; i < 3; i++) await sendResetLink(a.email);
    await sendResetLink(b.email);
    expect(sent.emails.map((m) => m.to)).toEqual([a.email, a.email, a.email, b.email]);
  });
});
