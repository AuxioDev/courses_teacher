// Gives a teacher a temporary password. They must choose their own at next login,
// and every device they were signed in on is signed out.
// Usage: npm run auth:temp-password -- teacher@example.com
import { db, findTeacher, hash, run, tempPassword } from "./admin-lib";

run(async () => {
  const user = await findTeacher(process.argv[2]);
  const password = tempPassword();
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(password), mustChangePassword: true, sessionVersion: { increment: 1 } },
  });
  console.log(`Temporary password for ${user.name} <${user.email}>: ${password}`);
  console.log("They will be asked to choose their own password when they log in.");
});
