# 001 — Feature-oriented Vue architecture and state management

- **Status:** Accepted
- **Last clarified:** 2026-09-08
- **Scope:** Frontend structure and state ownership in demo and backend modes

## Context

Accounts, transaction search and transfers share banking rules, but each feature has its own interactions. Related UI code should be easy to find, and business rules should be testable without rendering Vue components.

The Nuxt 4 application supports two data modes. In demo mode, banking data lives in the browser, so the server renders a loading shell. In backend mode, the server can fetch customer data and render it into the page. Both modes use the same feature components and API contracts.

## Decision drivers

- Keep banking rules independent of Vue and browser storage.
- Keep related UI code together without duplicating shared business rules.
- Give each kind of state one clear owner.
- Isolate customer data between server-rendered requests.
- Keep abstractions appropriate for a work sample.

## Alternatives

| Option                                                               | Benefit                                   | Reason not selected                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Technical folders only, such as `components`, `services` and `utils` | Simple initial structure                  | A feature change becomes scattered across broad folders.                                         |
| Put everything inside feature folders                                | Related UI code stays together            | Shared banking rules can be duplicated, and pages can become coupled to persistence.             |
| Full Clean Architecture with a service/interface for every operation | Makes implementation replacement explicit | Adds indirection without a second production adapter to justify it.                              |
| Store API data in Pinia alongside Vue Query                          | Makes data available globally             | Duplicates ownership and requires coordinating loading, caching, invalidation and SSR hydration. |

## Decision

### 1. Organize UI by feature and share the business boundaries

| Boundary                        | Responsibility                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `features`                      | Components and composables for accounts, transactions and transfers              |
| `domain`                        | Framework-independent entities, money arithmetic and transfer validation         |
| `use-cases`                     | Banking operations and queries, accessing persistence through a repository port  |
| `data`                          | HTTP client, MSW handlers, seed data and the IndexedDB repository implementation |
| `contracts`                     | Public API types, importing only domain and contract types                       |
| `shared`                        | Reusable presentation components and utilities                                   |
| Nuxt pages, layouts and plugins | Compose features and configure the application                                   |
| Nitro server routes             | Forward backend-mode requests to the configured upstream                         |

UI code calls the API boundary. It does not import use cases, repositories or seed data directly. Domain code does not depend on outer layers, and use cases do not depend on Vue or concrete data adapters. ESLint enforces these dependency rules.

### 2. Assign each kind of state a clear owner

| State                                                    | Owner                           | Reason                                                                |
| -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Accounts, activity and beneficiaries returned by the API | TanStack Vue Query              | Fetching, cache reuse, loading/error states and invalidation          |
| Applied transaction filters and pagination               | Vue Router query parameters     | Restore searches through reloads, links and Back/Forward navigation   |
| Unapplied form edits, drawers, menus and transfer drafts | Local Vue refs/reactive objects | Keep interaction state close to its component or page                 |
| Transfer draft and retry context across reloads          | Mode-specific recovery adapter  | IndexedDB mode uses browser storage; BFF mode mirrors server recovery |

No current global UI requirement needs Pinia. UForm and Zod validate forms; Nuxt UI and Tailwind provide presentation primitives.

### 3. Create API context and query cache per Nuxt application/request

In backend mode, queries are prefetched during server-side rendering (SSR). Results are serialized into the Nuxt payload and restored into the browser cache during hydration. A payload codec preserves structured `ApiError` values.

In demo mode, queries wait until hydration and MSW startup complete. The server cannot read browser-local banking data, so it renders the same loading shell that the client initially displays. Worker startup failure exposes an explicit API error rather than leaving queries waiting indefinitely.

### 4. Refresh cached banking data after mutations

Successful transfers and demo resets invalidate related banking queries. Transfer success also cancels stale requests before invalidation. Changes committed in another demo tab trigger cache refresh through the notification mechanism in ADR 002.

## Why

This structure keeps a feature's UI easy to find while giving shared banking rules a single home. The repository port lets transfer execution be tested independently of Vue. The HTTP contract lets demo and backend modes share feature UI, and explicit state ownership avoids maintaining competing copies of API data.

## Consequences

### Benefits

- Business rules and use cases can be tested without mounting components.
- Both data modes share typed contracts and feature components.
- Request-local query clients isolate SSR caches between customers.
- Dependency violations are checked automatically by lint.

### Trade-offs and limits

- Developers must understand several boundaries and use explicit imports between them.
- SSR needs query readiness checks, cache hydration and error serialization.
- Demo banking data is available only after browser services start.
- BFF mode uses server sessions and standalone per-user persistence/recovery; see [authentication](../authentication.md). MSW/IndexedDB remain explicit mock adapters.

## Implementation and verification

- [Dependency rules](../../eslint.config.js) enforce layer boundaries.
- [Banking plugin](../../src/plugins/01.banking.ts), [Vue Query plugin](../../src/plugins/02.vue-query.ts) and [error codec](../../src/plugins/api-errors.ts) implement request setup and hydration.
- [Transaction route composable](../../src/features/transactions/composables/useTransactionRoute.ts) owns applied URL state.
- [Transfer mutation](../../src/features/transfers/composables/useTransfer.ts) refreshes cached banking data.
- [BFF tests](../../src/tests/data/bffAuth.test.ts) cover session isolation and authenticated request handling; [verification notes](../verification.md) record broader checks.

Related decisions: [HTTP and demo persistence](002-mock-http-boundary-and-demo-persistence.md), [money and transfer consistency](003-money-and-transfer-consistency.md).
