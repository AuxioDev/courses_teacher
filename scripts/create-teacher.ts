// Creates a teacher account with a temporary password, until the Admin Panel exists.
// Usage: npm run teacher:create -- "Leyla Mammadova" leyla@school.az
import { db, hash, run, tempPassword } from "./admin-lib";

run(async () => {
  const [name, rawEmail] = process.argv.slice(2).map((s) => s.trim());
  const email = rawEmail?.toLowerCase();
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run teacher:create -- "Full Name" teacher@school.az');
  }
  if (await db.user.findUnique({ where: { email } })) throw new Error(`${email} already has an account`);

  const password = tempPassword();
  await db.user.create({
    data: { name, email, role: "teacher", passwordHash: await hash(password), mustChangePassword: true },
  });
  console.log(`Created ${name} <${email}>. Temporary password: ${password}`);
  console.log("They will be asked to choose their own password when they log in.");
});
