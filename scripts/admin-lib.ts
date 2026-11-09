// Shared setup for the account scripts. These stand in for the Admin Panel.
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
export const APP_URL = (process.env.APP_URL ?? "http://localhost:3001").replace(/\/$/, "");

export async function findTeacher(email: string | undefined) {
  if (!email) throw new Error("Pass the teacher's email, e.g. npm run auth:reset-link -- teacher@example.com");
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) throw new Error(`No user with email ${email}`);
  if (user.role !== "teacher") throw new Error(`${email} is a ${user.role}, not a teacher`);
  return user;
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export const hash = (password: string) => bcrypt.hash(password, 10);

const WORDS = ["kite", "moss", "lamp", "reef", "fern", "dune", "mint", "opal", "pine", "wave", "jade", "bolt"];

export function tempPassword() {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${digits}-${pick()}`;
}

export function run(main: () => Promise<void>) {
  main()
    .catch((e: Error) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
