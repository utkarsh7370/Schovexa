# Teacher — teaching workspace

One principle: **a teacher gets everything needed to manage their own classes, subjects and students — and nothing school-wide, administrative or financial.**

Everything below is enforced by the API (permission + teaching scope). Hiding a button is never the control.

## Scope

Permissions carry a *scope*. For teaching, three matter:

| Scope | Meaning |
|---|---|
| `OWN_CLASS` | Sections the person teaches in, or is class teacher of |
| `OWN_SUBJECT` | The exact (section, subject) pairs they are assigned — Maths in 6A is not English in 6A, nor Maths in 8A |
| `OWN_STUDENTS` | Students in those sections |

`TeachingScopeService` (`apps/api/src/teaching/`) resolves a request's scope once; every module asks it instead of re-implementing checks. Anything out of scope answers **404**, so a teacher cannot even learn that it exists. `ALL_SCHOOL` holders (Principal, Director, Academic Coordinator for their areas) see everything.

## What a teacher can do

| Area | Screen | Notes |
|---|---|---|
| Dashboard | `/dashboard` | Today's lessons and next lesson, attendance / homework / marks / assignments pending, upcoming exams, events, notices, leave balance, quick actions |
| Students | `/dashboard/students` | Own classes only: photo, admission and roll no., class, parents' names. Parent phone/email only if the school allows it. Remarks, results, attendance. No fees, no edits to class, admission no. or parents |
| Attendance | `/dashboard/attendance` | Present / absent / late / half day / excused with remarks; editable inside the school's correction window, then locked. **Corrections** tab: request → coordinator/principal approves → parents told |
| Timetable | `/dashboard/timetable` | Own week, today, class timetable, cover. Read-only for teachers |
| Homework, assignments | `/dashboard/homework`, `/dashboard/assignments` | One or many sections, or chosen students; due date, priority, files; hand-in tracking, review, marks (assignments), feedback, redo; parents notified |
| Marks & exams | `/dashboard/marks` | Own papers only. Enter → submit → review → approve → publish. Locked after submit; changes via a correction request, every change audited |
| Study material | `/dashboard/content` | Notes, PDFs, videos, links, worksheets, practice; draft / publish / archive; own material only |
| Remarks | student → Remarks | Strengths, weak areas, behaviour, participation, recommendations; private unless shared |
| Messages | `/dashboard/messages` | To parents of own class or student; reply to questions. No fee talk, no other classes |
| Notices | `/dashboard/notices` | Own sections/classes only; can be scheduled |
| Leave | `/dashboard/leave` | Apply, balance, history, cancel pending, supporting file; decided by Principal/Director, never by yourself |
| Calendar | `/dashboard/calendar` | Holidays, events, PTMs, my exams, work due, my leave |
| Reports | `/dashboard/teaching-reports` | 8 reports for own classes; CSV / Excel / PDF exports (audited) |
| Profile | `/dashboard/profile` | Contact details, photo, password, notification preferences |

## What a teacher cannot do

Fees, payments, refunds, discounts, finance reports · school settings, subscription, roles and permissions, creating or deleting users · admissions, deleting or transferring students, changing admission number, class or section, parent accounts · salary, payroll, HR records · system, security, backups, platform administration. These routes return 403 and are absent from the menu.

## School policy (Settings → Teaching)

| Setting | Default | Effect |
|---|---|---|
| `teachersSeeParentContact` | off | Parents' phone and email shown to teachers |
| `shareRemarksWithParents` | off | Default visibility of a new remark |
| `teacherDocumentCategories` | none | Student document categories a teacher may open |
| `leaveAllowances` | 12 / 10 / 15 | Casual / sick / earned days per year |

## Marks workflow

```
Teacher enters → submits → Coordinator reviews → Principal approves → Principal publishes
```

A Principal or Director holding both permissions may approve straight from "submitted". Nobody reviews or approves marks they submitted. After submission nothing changes silently: a **correction request** is approved by someone else, the paper reopens (results hidden from parents while open), and each change is logged as `marks.changed` with before and after.

## Academic Coordinator

New schools get an *Academic Coordinator* role: builds the timetable and cover, creates exams and papers, reviews submitted marks, approves attendance corrections, manages events. No finance, no final marks approval. Existing schools can create the same role from the Roles page.

## Not built yet

- Subject-wise (period) attendance: attendance is daily per section.
- Pushed reminders for homework or marks deadlines: they are shown on the dashboard and agenda instead (no SMS / WhatsApp yet).

## Demo data

`DEMO_SUFFIX=x node apps/api/scripts/seed-demo-school.js` seeds a school with a timetable and cover, homework and assignments, study material, an exam with papers at three stages of the marks workflow, remarks, messages, announcements (one scheduled), events and leave. Teacher `teacher1<suffix>@demo.school`, coordinator `coordinator<suffix>@demo.school`.
