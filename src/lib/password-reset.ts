import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { APP_URL, emailLayout, sendEmail } from "./email";
import { hashToken } from "./passwords";
import { getDictionary } from "@/i18n";
import { defaultLocale, hasLocale, localePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";

const TTL_MS = 60 * 60 * 1000;
const MAX_LINKS_PER_HOUR = 3;

// Emails a one-time reset link (valid 1 hour). Silently does nothing for unknown,
// inactive or non-teacher accounts, or after 3 links in an hour, so the response
// never reveals whether an email is registered.
export async function sendResetLink(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || user.role !== "teacher") return;

  const recent = await db.authToken.count({
    where: { userId: user.id, type: "reset", createdAt: { gte: new Date(Date.now() - TTL_MS) } },
  });
  if (recent >= MAX_LINKS_PER_HOUR) return;

  const token = randomBytes(32).toString("base64url");
  await db.authToken.create({
    data: { userId: user.id, type: "reset", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS) },
  });

  const locale = hasLocale(user.locale) ? user.locale : defaultLocale;
  const t = getDictionary(locale);
  const { html, text } = emailLayout({
    lang: locale,
    greeting: fmt(t.email.greeting, { name: user.name.split(" ")[0] }),
    title: t.email.resetSubject,
    body: t.email.resetBody,
    buttonLabel: t.email.resetButton,
    buttonUrl: `${APP_URL}${localePath(locale, "/reset-password")}?token=${token}`,
    footer: t.email.footer,
  });
  await sendEmail({ to: user.email, subject: t.email.resetSubject, html, text });
}
