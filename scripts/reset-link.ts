// Prints a one-time password reset link (valid 1 hour) to send to a teacher.
// Usage: npm run auth:reset-link -- teacher@example.com
import { APP_URL, db, findTeacher, randomToken, run, sha256 } from "./admin-lib";

const TTL_MS = 60 * 60 * 1000;

run(async () => {
  const user = await findTeacher(process.argv[2]);
  const token = randomToken();
  await db.authToken.create({
    data: { userId: user.id, type: "reset", tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS) },
  });
  const lang = user.locale ?? "az";
  console.log(`Reset link for ${user.name} (valid 1 hour, works once):`);
  console.log(`${APP_URL}/${lang}/reset-password?token=${token}`);
});
