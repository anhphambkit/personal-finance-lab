# Nuxt migration and future backend handoff

Revision: 2026-10-07.

## Current mock-only runtime

The application runs Nuxt 4 with SSR enabled, but all fictional banking data is browser-local. There is one supported runtime path:

```text
Nuxt page/component
  → injected BankingApi
  → browser fetch to /api/*
  → MSW Service Worker
  → use case
  → IndexedDB repository
```

Nuxt renders navigation, headings and loading states on the server. The banking plugin registers the API context for each Nuxt application, then starts MSW after `app:mounted`. Its `ready` ref becomes true only after startup settles, enabling Vue Query composables. The server never reads IndexedDB and never runs a Node mock server.

The catch-all Nitro `/api/*` route is deliberately not a backend bridge. A request reaching it returns `503 DEMO_BROWSER_ONLY` with `private, no-store`; it never accepts or forwards an upstream URL, cookie or authorization header. No runtime environment variables are needed.

The IndexedDB database and recovery keys use the `raksul-bank` namespace. Returning to this namespace intentionally creates a fresh fictional demo for browsers that used the later `personal-finance-lab` or `personal-banking-lab` names. Older demo state is not migrated because it is disposable and may contain an unresolved fictional transfer request; users can clear those old site-data entries manually.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run test:e2e:built
npm run preview
```

Node.js and npm versions are pinned by `.nvmrc` and `package.json`. Deploying `.output/` currently deploys only the fictional browser demo, not a banking backend.

## Requirements before adding a backend

A real backend is not enabled by toggling an environment variable. Treat it as a new security and architecture change. At minimum:

- define and runtime-validate every request and response contract;
- implement server-side authentication, authorization and account ownership checks;
- bind query caches and recovery records to authenticated identity changes;
- protect cookie-authenticated mutations against CSRF;
- enforce transactional money changes and idempotency on the server;
- keep private upstream URLs, credentials and tokens out of public config and SSR payloads;
- replace browser recovery with an authenticated server-backed status/recovery mechanism;
- add isolated backend contract, session, SSR and end-to-end suites.

The domain and use-case layers can inform a future implementation, but the IndexedDB repository and MSW ownership projection are not production security boundaries.

## Shared contracts

`src/contracts/` is the type boundary consumed by features and the HTTP client. Contract files use type-only imports and do not depend on data/UI implementations. Domain entities remain in `src/domain/`; repository state and privileged operations remain in `src/use-cases/` and `src/data/`. ESLint enforces these directions.

References: [Nuxt plugins](https://nuxt.com/docs/4.x/directory-structure/app/plugins), [Nuxt server directory](https://nuxt.com/docs/4.x/directory-structure/server), [TanStack Query SSR](https://tanstack.com/query/latest/docs/framework/vue/guides/ssr).
