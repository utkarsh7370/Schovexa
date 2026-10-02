# Schovexa — School Management

What a school can set up, where, who may change it, and — more important —
**which rules the rest of the app actually follows because of it**. A setting
that nothing reads is not a feature; every row below names what reads it.

Tests: `apps/api/test/school-config.e2e-spec.ts` (HTTP-level, incl. cross-school
and permission cases) plus the existing module specs.

## Where things live

| Setting | Screen | API | Who changes it |
|---|---|---|---|
| Profile, contact, address, regional, logo | Settings → Profile | `PATCH /schools/me`, `POST/DELETE/GET /schools/me/logo` | `school.update` (Director) |
| Timings, working days, off-Saturdays | Settings → Timings & days | `PATCH /school-settings` | `school.update` |
| Staff punch-in/out hours | Settings → Timings & days | `PATCH /schools/me` | `school.update` |
| Attendance rules | Settings → Attendance | `PATCH /school-settings` | `school.update` |
| Fee rules | Settings → Fees | `PATCH /school-settings` | `school.update` |
| Notification rules | Settings → Notifications | `PATCH /schools/me`, `PATCH /school-settings` | `school.update` |
| Document rules | Settings → Documents | `PATCH /school-settings` | `school.update` |
| Grading scale + pass mark | Settings → Grading | `GET/PUT /grading`, `GET /grading/preview` | `school.update` (read: `school.view`) |
| Academic years | Academic Years | `/academic-years…` | Principal proposes, Director approves |
| Terms | Academic Years → Terms | `/academic-years/:id/terms` | `academicYear.update` |
| Holidays | Holidays | `/holidays` | `holiday.create/update/delete` |
| School calendar | School Calendar | `GET /calendar?from&to` | everyone with `holiday.view` (read-only) |
| Classes, sections, subjects | Classes, Subjects | existing | existing |
| Departments | Departments | `/departments` | `department.create/update` (view: `department.view`) |
| Houses & groups | Houses & Groups | `/groups` | `group.create/update` (view: `group.view`) |

Settings are one row per school (`SchoolSettings`), created on first save.
Until then the defaults apply, and **reading never writes**. Defaults live in
`school-settings.service.ts` and mirror the column defaults in `schema.prisma`.

## Rules that are enforced (not just stored)

1. **Working days.** The week is Monday–Saturday by default; `offSaturdays`
   (e.g. 2nd and 4th) and holidays are layered on top. `classifyDay()` in
   `common/school-calendar.util.ts` is the single definition, used by both the
   calendar and attendance.
2. **No attendance on a day off.** Marking or correcting attendance on a weekly
   off, an off-Saturday or a holiday is refused (`NOT_A_SCHOOL_DAY`, naming the
   holiday) unless the school ticks *Allow attendance on days the school is
   closed* (make-up Saturday, special event).
3. **Correction window.** `attendanceEditWindowDays` (0–30, default 0) is how far
   back attendance can still be changed. 0 keeps the original same-day rule.
   Never in advance. `GET /attendance/today` reports `editableFrom`, so the UI
   doesn't guess.
4. **Parent alerts for an earlier day** say which day ("…marked absent on
   Thursday 1 October") instead of "today".
5. **Low attendance.** Attendance reports flag students below
   `attendanceMinPercent` (`lowAttendance`).
6. **Receipts** are numbered with `receiptPrefix` (`SPS/000123`).
7. **Part payments.** With `allowPartialPayments` off, a payment must equal the
   whole outstanding balance (`PARTIAL_PAYMENT_NOT_ALLOWED`).
8. **Late fee.** After `lateFeeGraceDays`, an overdue balance accrues
   `lateFeePerDayMinor` per day. It is *shown* (`daysLate`, `lateFeeMinor`) on
   the student's fees and the outstanding report; it never changes the amount
   billed or the payment history.
9. **Notifications.** `notifyParentsOnAbsence` (in-app alerts to parents),
   `notifyAbsenceEmail`, `notifyYearApprovalEmail` (the in-app notice always
   goes out) and `notifyStaffAttendanceDecisions` each gate exactly the message
   they name.
10. **Documents.** `documentMaxSizeMb` (1–25), `allowedDocumentTypes` (subset of
    PDF/JPEG/PNG — the file's *content* is still checked), `documentCategories`.
    An upload may carry a `category`, which must be one of the school's.
    `requiredStudentDocuments` (must be a subset of the categories) drives the
    "required documents — missing" checklist on a student's profile. Applies to
    student, staff and "my profile" uploads alike. `GET /documents/config` tells
    the UI what to offer.
11. **Departments.** Names are unique per school (any letter case). Deleting one
    never deletes subjects or teachers — they become unassigned. Head and members
    must belong to the same school.
12. **Houses & groups.** A student is in **at most one house**; clubs, sports
    teams and other groups have no limit. A group's students must belong to the
    same school. A student's groups are visible exactly where the student record is.
13. **Grading.** A scale needs at least two grades, one starting at 0% (so every
    mark earns a grade), no two with the same start or label. Saving replaces the
    whole scale atomically; a school with none gets the standard A+–F scale
    without anything being written. The pass mark lives with it.
14. **Terms** sit inside their academic year, don't overlap, and have unique
    names within the year.
15. **Logo** is a PNG/JPEG (checked by content, ≤1 MB), kept in object storage,
    served only to members of the same school, and the storage key never appears
    in an API response.

## Not built yet (and why)

* A report-card / marks module — the grading scale and pass mark are ready
  (`gradeForPercent()` in `packages/validation`, `/grading/preview`), but there
  is no exam or marks table to apply them to.
* Automatic fee-due reminders and SMS/WhatsApp — there is no scheduler or
  gateway yet; the notification switches only cover messages that exist today.
* Periods / timetable — school timings are the day's start, end and break; a
  per-period timetable is a separate module.

## Adding a setting

1. Column on `SchoolSettings` (with a default) + the same default in `DEFAULT_SETTINGS`.
2. Zod rule in `updateSchoolSettingsSchema` (and any cross-field check in
   `SchoolSettingsService.update`).
3. **Read it where it matters.** If nothing reads it, don't ship it.
4. A control on the right Settings tab, and a test that the rule is followed.
