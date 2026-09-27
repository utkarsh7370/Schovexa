# Schovexa — Module & Phase Plan

Status: Phase 0 draft. This defines *what gets built when*. Do not build
Phase 2/3 modules before MVP (Phase 1) is implemented, tested, and
security-reviewed.

## Phase 1 — MVP

**Core Platform**
- Authentication (login/logout, password hashing, verification, reset,
  sessions, rate limiting)
- Multi-tenancy (School, SchoolMembership)
- RBAC + permission system (Role, Permission, RolePermission, scopes)
- School management (create/update, settings, branding, academic year)
- User management (invite, states, membership assignment)
- Audit logs

**Student Management**
- Students, Parents, Student-Parent linking
- Admission records, student documents (object storage from day one),
  student status

**Academic Management**
- Academic years, Classes, Sections, Subjects
- Teacher profiles, teacher-class/subject assignments

**Attendance**
- Daily/class attendance marking, history, basic reports

**Fees**
- Fee categories, fee structures, student fee assignment
- Manually recorded payments, receipts, outstanding balance
- Basic fee reports
- *Online payment gateway integration is Phase 2, not MVP.*

**Communication**
- Notices/announcements, in-app notifications
- *Email/SMS/WhatsApp delivery channels are Phase 2.*

**Reports**
- Role-appropriate dashboards
- Student, attendance, fee reports (paginated, exportable to CSV)

## Phase 2 — Post-MVP Expansion

- Online admissions workflow
- Parent portal / Student portal / Teacher portal polish
- Exams, marks, results, report cards (with approval workflow)
- Homework / assignments
- Leave management
- Online payments (Razorpay/Cashfree adapters, webhook verification)
- Email notification delivery
- SMS integration
- WhatsApp integration
- Data import (CSV/Excel) with validation/preview/error reporting
- Approval workflow engine (generalized, used by results + fee refunds)

## Phase 3 — Scale & Differentiation

- Library management
- Inventory management
- Transport management
- Staff management / payroll architecture (architecture only, not a full
  payroll engine unless separately scoped)
- Advanced analytics
- Generalized workflow engine (beyond Phase 2's minimal version)
- Advanced/custom reporting
- PWA / mobile-optimized experience
- Third-party API integrations
- AI-assisted features (report drafting, notice drafting, insights) —
  always authorization-scoped to what the requesting user can already see
- White-label / custom school domains

## Explicit Non-Goals Until Requested

- Native iOS/Android apps (API-first backend + responsive/PWA web first)
- Full payroll processing engine
- AI as a core dependency (it is an optional layer only)

## Module → Primary Backend Module Mapping

| Product module | Backend module (NestJS) |
|---|---|
| Auth | `auth` |
| Multi-tenancy | `tenants`, `schools`, `memberships` |
| RBAC | `roles`, `permissions` |
| Students | `students` |
| Parents | `parents` |
| Teachers/Staff | `teachers`, `staff` |
| Academics | `academics` (years/classes/sections/subjects) |
| Attendance | `attendance` |
| Timetable | `timetable` |
| Admissions | `admissions` |
| Exams/Results | `exams`, `results` |
| Fees/Payments | `fees`, `payments` |
| Notices/Notifications | `notifications` |
| Documents | `documents` |
| Homework | `homework` |
| Leave | `leave` |
| Library | `library` |
| Inventory | `inventory` |
| Transport | `transport` |
| Events | `events` |
| Reports | `reports` |
| Audit | `audit` |
| Subscriptions/Entitlements | `subscriptions` |
| Platform admin | `platform` |

This mirrors the module list in `docs/architecture.md` §Backend
Architecture and is the basis for the monorepo's `apps/api/src/<module>`
folder layout once implementation begins.
