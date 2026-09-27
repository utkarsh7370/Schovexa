# Schovexa — Frontend Architecture

Status: Phase 1 design deliverable (closes the frontend-architecture gap
tracked in `docs/architecture.md` §16). Governs `apps/web`.

## 1. Folder Structure

```
apps/web/src/
├── app/                        Next.js App Router routes
│   ├── (marketing)/            public site — homepage, etc.
│   ├── (auth)/                 login, forgot-password, accept-invite
│   ├── (dashboard)/            authenticated app, one segment per role area
│   │   ├── layout.tsx          shell: nav, active-school context, session check
│   │   ├── students/
│   │   ├── attendance/
│   │   ├── fees/
│   │   └── ...                 one folder per module, mirroring docs/modules.md
│   └── layout.tsx               root layout (fonts, providers)
├── components/                 app-specific composed components (not the design system)
├── lib/
│   ├── api-client.ts            typed fetch wrapper (see §4)
│   ├── auth.ts                  session/user helpers (client-side)
│   └── query-client.ts          TanStack Query client setup
└── hooks/                      shared React hooks

packages/ui/                    the reusable design system (Button, Input,
                                 Table, Modal, ... per docs/architecture.md
                                 brief §33) — imported by apps/web, not
                                 duplicated inside it
```

Route groups (`(marketing)`, `(auth)`, `(dashboard)`) share no layout
chrome — a logged-out marketing visitor never loads the dashboard shell's
JS, and vice versa.

## 2. Server vs. Client Components

Default: **Server Component**. A component becomes a Client Component
(`'use client'`) only when it needs one of:
- Local interactive state (`useState`, form input handling)
- Browser-only APIs (`localStorage`, `window`)
- Event handlers (`onClick`, `onChange`)
- A hook that depends on the above (`useEffect`, TanStack Query hooks,
  React Hook Form)

Concretely:
- Page shells, data-fetching-only views, and static layout render as
  Server Components, fetching data directly (via the API client, §4)
  during the server render — this avoids a client-side loading spinner
  for data that's known at request time.
- Forms (React Hook Form + Zod resolver), interactive tables (sort/filter
  client state), modals/drawers, and anything using TanStack Query for
  client-side caching/mutation are Client Components, kept as small and
  as deep in the tree as possible (a page is not made a Client Component
  just because one button inside it needs interactivity — the button is
  extracted into its own Client Component instead).

This directly implements the "Use Server Components where appropriate...
do not turn the entire application into Client Components" rule from the
brief — enforced by this being the default and interactivity being the
opt-in, not the reverse.

## 3. Data Fetching & Server State

- **Server Components**: fetch directly against the API using the
  session's forwarded cookie (Next.js server-side `fetch` with
  `credentials: 'include'` against the internal API URL).
- **Client Components**: use TanStack Query exclusively for server state
  (lists, detail views that need client-side refetch/invalidation after
  a mutation) — no ad hoc `useEffect` + `useState` data fetching.
- **Mutations**: React Hook Form collects input, validated client-side
  with the *same* Zod schema from `@schovexa/validation` used by the API
  (`docs/architecture.md` frontend stack) — this is convenience
  validation for UX (immediate feedback), never the security boundary;
  the API re-validates independently regardless of what the client sent,
  per `docs/architecture.md` §49 (validate at multiple layers).
- Mutation success invalidates the relevant TanStack Query cache keys
  rather than the page doing a full reload.

## 4. API Client

A single typed wrapper (`lib/api-client.ts`) is the only place that calls
`fetch` against the API:

```ts
async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw await ApiError.fromResponse(res); // parses the error envelope from docs/api.md §3
  return res.json();
}
```

- Never trusts or reads a `schoolId` out of client state to send to the
  API — the API derives tenant context from the session cookie, per
  `docs/multi-tenancy.md` §2; the client never needs to (and must not)
  pass one.
- `ApiError` carries the `code` from the API's error envelope
  (`docs/api.md` §3) so UI can branch on stable codes, never on
  message-string matching.

## 5. Role-Based Navigation & Dashboards

The dashboard shell (`(dashboard)/layout.tsx`) renders navigation and
widgets by asking the API "what can I see" (`GET /api/v1/auth/me`, which
returns the user's memberships) rather than hardcoding a per-role menu
in the frontend. Concretely:
- The frontend does **not** contain a `if (role === 'TEACHER') show X`
  branch — the same anti-pattern the brief forbids server-side
  (`docs/permissions.md` §1) is forbidden here too.
- Navigation items and dashboard widgets declare the permission they
  require (e.g. a "Fees" nav item declares `fee.view`); the shell renders
  only the items the current user's resolved permission set actually
  grants, sourced from the API response, not guessed from role name.
- This is a UX convenience layer only — hiding a nav item is not a
  security control. Every route it links to independently enforces
  authorization server-side (`docs/authorization.md`); a hidden button
  is not a substitute for a 403.

## 6. Design System (`packages/ui`)

Reusable, accessible components per the brief's list (§33): `Button`,
`Input`, `Select`, `DatePicker`, `Modal`, `Drawer`, `Table`, `Pagination`,
`Tabs`, `Dropdown`, `Toast`, `Alert`, `Card`, `Badge`, `Avatar`,
`EmptyState`, `LoadingState`, `ErrorState`, `ConfirmDialog`,
`FileUploader`, `DataTable`, `Form`. Built incrementally — a component is
added to `packages/ui` the first time two different modules need it, not
speculatively ahead of need, to avoid an unused abstraction sitting idle
(per the "no premature abstraction" engineering principle). Styled with
Tailwind using the Schovexa brand tokens already configured in
`apps/web/tailwind.config.ts` (to be lifted into `packages/config`'s
shared Tailwind preset once `packages/ui` exists, so both the app and the
design system share one token source).

## 7. Accessibility & Responsiveness (binding, not aspirational)

- Every interactive design-system component ships with keyboard
  navigation and a visible focus state before it's considered done — not
  as a follow-up pass.
- Forms use semantic labels (`<label htmlFor>`), not placeholder-only
  fields.
- Mobile-first layouts for parent/teacher/student-facing screens
  specifically (per `docs/product-requirements.md` — these personas are
  primarily on phones); admin/accountant-heavy screens (large data
  tables, reports) are designed desktop-first but must remain usable,
  not broken, on tablet width.

## 8. What's Deliberately Not Decided Yet

- Exact TanStack Query cache-key conventions and the RHF form-wrapper
  component's API are decided when the first real form/list is built
  (Students module), not invented in the abstract here.
- `packages/ui`'s first components ship alongside whichever module needs
  them first, per §6 above.
