# courses_teacher — Teacher App

The teacher's side of the Online Courses System. It shares one database and one file
store with the Student Diary (`courses_student`).

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Prisma 7 +
PostgreSQL. Built for desktop and tablet, and usable on a phone.

## Setup

The Diary must be set up first, because it owns the database.

```bash
npm install
cp .env.example .env        # same DATABASE_URL and SESSION_SECRET as the Diary
npm run dev                 # http://localhost:3001
```

Demo login after seeding the Diary's database: `leyla@example.com` / `password123`.
Students and admins are refused here.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3001 |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run sync:check` | Fails if a file shared with the Diary has drifted |
| `npm run teacher:create -- "Name" email` | New teacher with a temporary password |
| `npm run auth:temp-password -- email` | Give a teacher a temporary password |
| `npm run auth:reset-link -- email` | Print a one-time reset link |

## Deploying and testing

Follow [docs/deploy-guide.md](docs/deploy-guide.md). The Diary must be deployed first,
because it owns the database. Before each release, go through
[docs/manual-test-checklist.md](docs/manual-test-checklist.md).

## Rules for this repo

- **No migrations here.** The Diary is the only migration owner. A schema change lands and
  deploys in `courses_student` first, then `prisma/schema.prisma` is copied here unchanged.
  Never run `prisma migrate` or the Diary's seed against a database with real data.
- **Shared files** are listed in `scripts/sync-check.mjs` and must stay identical to the
  Diary's. Change them there first, then copy them here.
- **Grading rules** come only from `src/lib/grading.ts`, so everyone sees the same numbers.
- **Teachers never see** students' notes and to-dos, or files not yet handed in.
- **Next.js 16 differs from older versions.** Read `node_modules/next/dist/docs/` before
  using an API you are unsure about.

## Sign-in

Same mechanism as the Diary: a signed cookie that lasts 30 days from last use and carries
`User.sessionVersion`. `getCurrentTeacher()` in `src/lib/auth.ts` checks the role, active
status and session version on every request. The cookie is named `ct_session`, because
cookies aren't separated by port and a shared name would make the apps sign each other out
on localhost.

UI text is in `src/i18n/dictionaries/` (`en.ts` is the source). The Azerbaijani and
Russian translations still need a check by a native speaker.
