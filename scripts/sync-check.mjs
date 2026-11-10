// Fails when a file shared with the Student Diary has drifted from the Diary's copy.
// Run from this repo: npm run sync:check
// The Diary is expected next to this repo; set STUDENT_REPO to look elsewhere.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const studentRepo = path.resolve(process.env.STUDENT_REPO ?? "../courses_student");

// Must stay byte-for-byte identical. Add a file here when it is copied in a later step.
const SHARED = [
  "prisma/schema.prisma",
  "src/app/globals.css",
  "src/app/motion.css",
  "src/components/language-menu.tsx",
  "src/components/link-pending.tsx",
  "src/components/password-form.tsx",
  "src/components/ui.tsx",
  "src/i18n/config.ts",
  "src/i18n/format.ts",
  "src/lib/dates.ts",
  "src/lib/db.ts",
  "src/lib/email.ts",
  "src/lib/grading.ts",
  "src/lib/notifications/types.ts",
  "src/lib/passwords.ts",
  "src/lib/push.ts",
  "src/lib/rate-limit.ts",
  "src/lib/session-token.ts",
  "src/lib/session.ts",
  "src/lib/upload-policy.ts",
  "test/db.ts",
  "test/server-only.ts",
  "vitest.config.ts",
  "vitest.integration.config.ts",
];

if (!existsSync(path.join(studentRepo, "prisma/schema.prisma"))) {
  console.error(`Student Diary not found at ${studentRepo}. Set STUDENT_REPO to its folder.`);
  process.exit(1);
}

const different = SHARED.filter((file) => {
  const ours = path.resolve(file);
  const theirs = path.join(studentRepo, file);
  return !existsSync(ours) || !existsSync(theirs) || !readFileSync(ours).equals(readFileSync(theirs));
});

if (different.length > 0) {
  console.error(`Out of sync with ${studentRepo}:\n${different.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${SHARED.length} shared files match the Student Diary.`);
