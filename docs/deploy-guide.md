# Deploying the Teacher App

The Teacher App is a separate Vercel project that uses the **same** Neon database and
**same** Blob store as the Student Diary. It has no database migrations and no cron jobs.

Do these in order. The Diary goes first, because it owns the database.

## 1. Deploy the Diary's changes first

In `courses_student`, commit and push the waiting changes, including
`prisma/migrations/20261109120000_mark_unique_homework/`. Check that CI passes, and that
the production deployment finishes. Its build applies the migration.

The Teacher App's grading needs this migration, so don't deploy it before this step.

## 2. Push the code

Commit and push `courses_teacher`.

Before pushing, with both repos side by side, confirm the shared files match:

```bash
npm run sync:check
```

## 3. Create the Vercel project

1. **Add New → Project**, and import `AuxioDev/courses_teacher`.
2. Keep the defaults, but **don't deploy yet** if Vercel lets you skip it. If it deploys
   anyway, that first build may fail, which is harmless.

## 4. Connect the existing stores

In the project's **Storage** tab, connect the **existing** stores. Don't create new ones.

1. The Neon database the Diary uses. Check that `DATABASE_URL` appears in **Settings →
   Environment Variables**.
2. The private Blob store the Diary uses. This adds `BLOB_READ_WRITE_TOKEN`.

## 5. Add the environment variables

Mark the secrets as **Sensitive**. Copy the shared values from the Diary project.

| Name | Value | Sensitive |
| --- | --- | --- |
| `SESSION_SECRET` | Same as the Diary | Yes |
| `APP_URL` | This app's address, e.g. `https://courses-teacher.vercel.app` | No |
| `STUDENT_APP_URL` | The Diary's address, e.g. `https://courses-student.vercel.app` | No |
| `RESEND_API_KEY` | Same as the Diary | Yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same as the Diary | No |
| `VAPID_PRIVATE_KEY` | Same as the Diary | Yes |
| `VAPID_SUBJECT` | Same as the Diary | No |
| `PRIVACY_CONTACT_EMAIL` | Who to contact about data | No |

`STUDENT_APP_URL` matters: without it, the notifications students get can't be delivered
by email or push. Students receive mail from this app too, so if you set `EMAIL_FROM`,
use a name that suits both apps.

Don't set `UPLOADS_DIR`. It's only for local development.

## 6. Deploy

Under **Deployments**, redeploy the latest one. Check that `APP_URL` matches the address
you got. If it doesn't, fix it and redeploy.

## 7. Create the teachers

The account scripts run on your computer against the production database. Use the direct
connection string:

```bash
DATABASE_URL="direct-url" npm run teacher:create -- "Full Name" teacher@school.az
```

The temporary password is printed once. Never run the Diary's `db:seed` here: it wipes
the shared database.

## 8. Test it

Go through [the checklist](manual-test-checklist.md), paying particular attention to the
parts that can only be checked on a real address:

- Opening a real uploaded homework file as the teacher
- A notification email reaching a real inbox with a link that opens the **Diary**
- A push notification reaching a student's phone
- "Forgot password" reaching your inbox, with a link that opens the **Teacher App**

## Before a real pilot

- [ ] Groups, terms and lessons exist. Only the Admin Panel or a setup script can create them
- [ ] A new, empty database with no demo accounts
- [ ] A verified sending domain in Resend, and `EMAIL_FROM` set in both projects
- [ ] The teacher privacy notice reviewed
- [ ] Azerbaijani and Russian text checked by a native speaker
- [ ] A decision on the Vercel plan: Hobby is for non-commercial use only
