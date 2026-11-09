# Teacher App: manual test checklist

Run this before each release, on Chrome and on a tablet. Run it with the Student Diary open
beside it, because most of what teachers do is only finished when a student can see it.

Seed the Diary's **local** database first, from `courses_student`:

```bash
npm run db:seed
```

This wipes that database. Never run it against one with real data.

| Account (password `password123`) | Use |
| --- | --- |
| `leyla@example.com` | Teacher of ENG-B2-1 and of the locked term's ENG-A2-3 |
| `tural@example.com` | Teacher of PY-1, to test that teachers can't see each other's work |
| `student@example.com`, `murad@example.com`, `nigar@example.com` | Students. Must be refused here |
| `admin@example.com` | Must be refused here |

If pages look out of date on `localhost:3001`, unregister any service worker left there by
a production build of the Diary (DevTools → Application → Service Workers).

## 1. Signing in

- [ ] A student and an admin are refused with the "this app is for teachers" message
- [ ] A wrong password shows an error, and 5 wrong tries block login for 15 minutes
- [ ] A new teacher (`npm run teacher:create`) must choose a password, then accept the privacy notice
- [ ] Forgot password sends a link that works once and opens this app
- [ ] Log out on all devices signs out other browsers
- [ ] Logging in to the Diary in the same browser doesn't sign the teacher out
- [ ] The language chosen in the top-right menu is kept at the next login

## 2. Dashboard, lessons, groups

- [ ] The Dashboard shows today's lessons, homework to check and students falling behind
- [ ] My lessons shows week and month views, and the term switcher reaches the past term
- [ ] Join appears from 15 minutes before a lesson until it ends
- [ ] The group page's attendance % and average match the Diary for the same student

## 3. Lesson page

- [ ] Before 15 minutes ahead of the start, attendance is read-only with a message
- [ ] Save stays off until every student is marked, and "Mark all present" marks everyone
- [ ] After saving, the Diary shows the badge on the lesson and a changed percentage
- [ ] Attendance can be corrected later
- [ ] Topic and materials appear in the Diary, with line breaks and clickable links
- [ ] A cancelled lesson can't be changed

## 4. Homework

- [ ] Homework given from a lesson and from a group appears in the Diary
- [ ] Every active student gets a notification that opens the homework in the Diary
- [ ] A `javascript:` link, a past due date and a maximum of 0 are refused, keeping what was typed
- [ ] The maximum score can't change once something is graded
- [ ] Delete is only offered when nobody has handed in, and removes its notifications

## 5. Marks

- [ ] Choosing a type fills in its weight from school settings
- [ ] Students left empty get no mark, and the Diary's average matches a hand calculation
- [ ] A correction shows in the Diary and is recorded in `mark_history`
- [ ] A substitute teacher sees attendance and topic only

## 6. Checking homework

- [ ] To check lists homework with work waiting, and only for this teacher
- [ ] The review page shows the answer, files, links and earlier attempts
- [ ] A file opens in a new tab. Files a student hasn't handed in yet can't be opened
- [ ] Return needs feedback, and the Diary shows it and lets the student hand in again
- [ ] A revised hand-in shows "After revision", not late
- [ ] If the student hands in again while the page is open, grading is refused
- [ ] A grade creates one mark on the 0–100 scale (18/20 becomes 90) and notifies the student
- [ ] Changing a grade updates the mark and records the change
- [ ] After the deadline, "Give 0" works, and a later hand-in can replace it
- [ ] A student looking at an old page can't hand in over work that was just graded

## 7. Gradebook

- [ ] Columns are in date order, and averages use the Diary's colour bands
- [ ] Clicking a lesson mark edits it: Enter saves, Escape cancels, 150 is refused
- [ ] A homework mark opens that student's review page
- [ ] Only published final grades appear

## 8. Locked terms and other teachers

- [ ] In a locked term (ENG-A2-3) everything is read-only
- [ ] Signed in as Leyla, Tural's group, lesson, homework, review, gradebook and files all give 404
- [ ] Students who have left stay visible, labelled, and can't be graded

## 9. Each page, at phone, tablet and desktop width

- [ ] Nothing overflows the page sideways, and dark mode is readable
- [ ] Azerbaijani, Russian and English all show text, with no `{placeholders}`
