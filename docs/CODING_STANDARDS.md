# Coding Standards

## General

- TypeScript `strict: true` everywhere. No `any` except at explicit third-party boundaries, and even then prefer `unknown` + narrowing.
- No default exports for anything except React page/route components and Express `Router` instances at a module's public boundary — everything else uses named exports (better refactor-safety, better auto-import).
- Functions do one thing. If a controller function needs a comment to explain a section, that section is a candidate for extraction into the service layer.
- Errors are always thrown as `ApiError` (backend) — never `throw new Error(...)` — so the central error handler can shape a consistent response.
- Async route handlers are always wrapped in `asyncHandler` — never a raw `async (req, res) => {}` passed straight to `router.get`.

## Naming

- Files: `kebab-case` for multi-word files that aren't a module's own convention (`email-account`), but this repo's module files use `<feature>.<layer>.ts` (`auth.controller.ts`) — consistent, greppable, colocated.
- Types/interfaces: `PascalCase`, no `I` prefix (`User`, not `IUser`).
- Mongoose model files: `user.model.ts` exporting `export const User = model<UserDocument>(...)`.
- React components: `PascalCase.tsx`, one component per file, matching filename.
- Hooks: `useX.ts`, always start with `use`.
- Zustand stores: `useXStore.ts`.

## Backend layering (enforced by convention, not a linter rule — see PR review checklist)

`route → validate → authenticate → controller → service → model`

- **Controller**: parses `req`, calls one service method, sends response via `ApiResponse`. No business logic, no direct Mongoose calls.
- **Service**: business logic, orchestration, the only layer that imports models directly.
- **Model**: schema + instance/static methods that are genuinely data-shape concerns (e.g. `comparePassword`), not business rules.

## React / frontend

- Server state (anything from the API) lives in **TanStack Query**, never copied into Zustand. Zustand is reserved for genuine client-only UI/global state (auth session, theme, sidebar open/closed).
- One `useXQuery`/`useXMutation` hook per API operation, colocated under `features/<feature>/hooks/`. Components never call `axios`/`fetch` directly.
- Co-locate: a feature's API client, hooks, components, and types live under `features/<feature>/`, not scattered across generic `hooks/`, `services/` top-level folders (mirrors the backend's feature-based layout intentionally).
- No inline Tailwind class soup beyond ~6-8 classes — extract to a component or use `cva`/`clsx` variant maps once a component grows conditional styling.

## Git / PRs

- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) — the CI pipeline and changelong generation assume this.
- CI must pass (lint, typecheck, test, build) before merge — enforced via required GitHub Actions checks + branch protection (configured in the repo settings, not in code).

## Testing

- Backend: Jest + Supertest for integration tests against services/routes using `mongodb-memory-server` (no real DB in CI). Unit test services independent of Express where logic is non-trivial (e.g. token encryption, quota calculation).
- Frontend: Vitest + React Testing Library. Test behavior (what the user sees/does), not implementation details.
- New business logic ships with tests in the same PR — not a follow-up.
