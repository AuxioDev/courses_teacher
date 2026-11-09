import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getSession } from "./session";
import { getRequestLocale } from "@/i18n";
import { hasLocale, localePath, type Locale } from "@/i18n/config";
import { PRIVACY_VERSION } from "./privacy";

export type Teacher = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  locale: Locale | null;
  sessionVersion: number;
  mustChangePassword: boolean;
  privacyAccepted: boolean;
};

async function goTo(path: string): Promise<never> {
  redirect(localePath(await getRequestLocale(), path));
}

// Verifies the session against the database: right role, still active, and not
// signed out everywhere since the cookie was issued.
const loadTeacher = cache(async (): Promise<Teacher | null> => {
  const session = await getSession();
  if (!session || session.role !== "teacher") return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      timezone: true,
      locale: true,
      role: true,
      active: true,
      sessionVersion: true,
      mustChangePassword: true,
      privacyVersion: true,
    },
  });
  if (!user || user.role !== "teacher" || !user.active || user.sessionVersion !== session.v) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    locale: hasLocale(user.locale) ? user.locale : null,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
    privacyAccepted: user.privacyVersion === PRIVACY_VERSION,
  };
});

// Every app page and action. A teacher with a temporary password is sent to set
// their own before they can use anything else.
export async function getCurrentTeacher(): Promise<Teacher> {
  const teacher = await loadTeacher();
  if (!teacher) return goTo("/login?expired=1");
  if (teacher.mustChangePassword) return goTo("/change-password");
  if (!teacher.privacyAccepted) return goTo("/privacy/accept");
  return teacher;
}

// For Route Handlers, which answer 401 instead of redirecting.
export async function getTeacherOrNull(): Promise<Teacher | null> {
  const teacher = await loadTeacher();
  return teacher && !teacher.mustChangePassword && teacher.privacyAccepted ? teacher : null;
}

// Only for the page and action that accept the privacy notice.
export async function getTeacherForConsent(): Promise<Teacher> {
  const teacher = await loadTeacher();
  if (!teacher) return goTo("/login?expired=1");
  if (teacher.mustChangePassword) return goTo("/change-password");
  return teacher;
}

// Only for the change-password page and action.
export async function getTeacherForPasswordChange(): Promise<Teacher> {
  const teacher = await loadTeacher();
  if (!teacher) return goTo("/login?expired=1");
  return teacher;
}
