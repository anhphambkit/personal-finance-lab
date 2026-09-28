# Nuxt migration and backend handoff

For the standalone service integration and browser MSW mode, see [BFF setup](bff.md).

> The application has two modes: browser MSW with IndexedDB, or authenticated Nitro BFF access to the standalone Node.js service. See [current authentication behavior](authentication.md).

Revision: 2026-09-06. This document supersedes the previous standalone Vue/Vite setup.

## Current architecture

The application runs Nuxt 4 with `ssr: true`, Vue 3, Vue Router 5, Nitro, Nuxt UI 4, Tailwind 4 and TanStack Vue Query. The default development path connects its BFF to the separate `personal-finance-api` Node.js/SQLite service. Browser MSW and IndexedDB remain isolated demo/test adapters.

| Before                                          | Current                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/main.ts`, `index.html`, manual `createApp` | `src/app.vue`, Nuxt application startup                                                    |
| `src/app/router/index.ts`                       | `src/pages/index.vue`, `accounts.vue`, `transactions.vue`, `transfer.vue`, `[...slug].vue` |
| `src/app/layouts/BankingLayout.vue`             | `src/layouts/default.vue` with a slot                                                      |
| Router `afterEach` writes `document.title`      | Reactive `useHead` in `src/app.vue`; page metadata also renders on the server              |
| Module-global QueryClient                       | QueryClient created for each Nuxt application/SSR request                                  |
| Module-global HTTP client                       | Banking context injected per application/request                                           |
| Nuxt UI Vite/Vue application plugins            | `@nuxt/ui` Nuxt module and `src/app.config.ts`                                             |
| `VITE_ENABLE_MOCKS`, `.env.local`               | `NUXT_PUBLIC_ENABLE_MOCKS`, `.env` / deployment environment                                |
| Static `dist/`                                  | `.output/server/index.mjs` and `.output/public/`                                           |
| Manual app/node tsconfigs                       | Nuxt-generated app/server/shared/node project references                                   |
| `vite.config.ts` application config             | `nuxt.config.ts`; `vitest.vite.config.ts` only supports isolated tests                     |

`src/` is explicitly configured as Nuxt's `srcDir`. Root `server/` holds Nitro handlers. `@/` still points at `src/`, preserving the feature/domain/use-case/data/shared boundaries. ESLint continues to enforce framework-independent domain/use-case code and forbids repository/seed imports from UI.

## Demo mode

Default: `NUXT_PUBLIC_ENABLE_MOCKS=true`.

1. Nuxt renders navigation, page headings and loading states on the server.
2. The client begins with the same disabled-query state, preserving hydration consistency.
3. After `app:mounted`, the client loads MSW and starts the worker.
4. Queries become enabled only after startup; HTTP requests use the existing MSW/use-case/IndexedDB pipeline.
5. If worker startup fails, requests reach Nitro's explicit 503 demo-unavailable response and existing retry/error UI.

No IndexedDB access or Node MSW interception occurs during SSR. `src/data/mock/server.ts` is only a test helper. The database name, schema and seed remain unchanged, so migration does not delete stored demo data. The reset mutation still waits for committed storage, then invalidates banking queries. Other tabs still need to refetch.

## Standalone BFF mode and SSR

```dotenv
NUXT_PUBLIC_ENABLE_MOCKS=false
NUXT_PUBLIC_ENABLE_BFF=true
NUXT_BFF_API_BASE_URL=http://127.0.0.1:4000/v1
```

The upstream root is private runtime config. The browser always calls same-origin `/api/*`; Nitro validates its HttpOnly session and CSRF token, refreshes backend credentials server-side and maps the suffix/query to the configured root. Browser cookies, CSRF values and caller-supplied authorization are never forwarded to the banking service.

`useAccounts`, `useBeneficiaries`, `useTransactions` and recent activity prefetch with `onServerPrefetch` in backend mode. The query plugin dehydrates completed success/error state into Nuxt's payload and hydrates it before the first client render. `ApiError` has a payload reducer/reviver; network failures normalize to that type. Reads have a 30-second stale time; SSR does not retry, the browser retries reads once, and mutations never auto-retry. Failed initial queries remain available for explicit retry instead of changing hydration output through an immediate mount retry.

The server QueryClient is created inside the plugin, serialized after rendering and cleared. Page/API responses have `Cache-Control: private, no-store`; do not introduce shared response caches for authenticated banking data. The reset UI is hidden and `/api/demo/*` returns 404 in backend mode. Missing backend configuration returns a structured 503. Unknown page routes return actual HTTP 404 responses.

The standalone service matches the domain and pagination contracts used by the UI. Success payloads are decoded by endpoint-specific runtime schemas before entering application state. Invalid JSON, malformed bodies and unexpected no-content responses produce `INVALID_RESPONSE`; an invalid transfer receipt remains an uncertain outcome and retains its original request key. The backend derives identity from its Bearer token and enforces customer ownership, atomic persistence and idempotency. The frontend lifecycle clears state/cache and partitions keys by customer ID and session generation. Transfer POST requests are sent once; explicit recovery reuses the same key.

## Commands and deployment

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run preview
```

Node.js 24.14.0 and npm 11 remain pinned. `npm ci` runs `nuxt prepare`; Nuxt regenerates `.nuxt/` type declarations. Development normally uses port 3000.

Deploy `.output/` to a Node/Nitro-compatible host and run `npm start`, with `NUXT_PUBLIC_ENABLE_MOCKS=false`, `NUXT_PUBLIC_ENABLE_BFF=true` and private `NUXT_BFF_API_BASE_URL` set in the server environment. Deploy the standalone API separately on a private HTTPS connection. The built Nuxt server does not load `.env` automatically.

## Verification

- Clean lockfile install (`npm ci --offline` with the local npm cache), generated Nuxt types, typecheck, lint, formatting, production build and Git whitespace checks passed. Nuxt development startup and its SSR HTML response also passed.

- Unit/component suite: 153 tests passed after migration, including all existing domain, persistence, API and UI scenarios plus updated runtime configuration checks.
- BFF handler/adapter tests: session isolation, server-held token forwarding, ownership-scoped requests, response validation and fail-closed configuration.
- Browser: Accounts populated through native MSW/IndexedDB, route navigation and transaction search worked, reload preserved `query=salary`, and no warning/error logs appeared in the inspected demo pages.
- Isolated UI tests use real Nuxt UI primitives with a small routing/metadata adapter; browser checks cover the actual Nuxt build in MSW mode.

## Shared contracts revision — 2026-09-06

`src/contracts/` is the common type boundary for UI, API adapters and use cases. Import each type from its defining module, without a client/use-case re-export:

- `transactions.ts`: `TransactionQuery` and `PaginatedTransactions`.
- `pagination.ts`: `Pagination`, used directly by the pagination component.
- `banking.ts`: `BankingApi`, implemented by `createBankingApi` and consumed by `BankingContext` without `ReturnType<typeof createBankingApi>`.

Contract files import only domain/contract types. ESLint disallows dependencies on implementation/UI layers, runtime imports and contract re-export barrels. Domain code cannot import contracts. Runtime query validation remains in the HTTP adapter; `ApiError` lives in `src/data/api/apiError.ts` and is shared directly by the client, error UI and Nuxt payload codec.

Domain entities and the privileged repository port/state remain in their owning layers. Do not publish complete persistence snapshots as API contracts. Keep fetch transport configuration with the adapter and feature-only form types inside their feature. This changes type ownership and import paths; HTTP shapes and SSR behavior stay the same.

Verification for the original refactor included typecheck, lint, unit/component tests, production build, formatting and dependency-boundary checks. Current commands and boundaries are recorded in [testing](testing.md).

## Next work

The transfer use case, HTTP endpoints and details/review/receipt UI are complete. Transfer request and receipt types live in `src/contracts/transfers.ts`. BFF tests check authenticated JSON forwarding, session isolation and token handling; transfer tests cover exact cents, rejection status and lack of automatic mutation retries. For new queries, use the injected banking context, honor readiness, add SSR prefetch, and avoid module-scoped user data.

References: [Nuxt plugins](https://nuxt.com/docs/4.x/directory-structure/app/plugins), [Nuxt server directory](https://nuxt.com/docs/4.x/directory-structure/server), [TanStack Query SSR](https://tanstack.com/query/latest/docs/framework/vue/guides/ssr).

## Optional enhancement integration

The frontend keeps Review read-only. New recipient details travel in the immutable transfer request, and Confirm creates the beneficiary atomically with the transfer only when `destination.saveRecipient` is true; false retains only the transfer snapshot. Omitted values preserve legacy save-by-default requests/fingerprints. Backends must support this flag and include its effective choice in idempotency checks. Saved contacts are selectable through a searchable menu. The standalone `POST /api/beneficiaries` contract remains available for a future explicit recipient-directory UI. Transfer drafts/request keys persist in customer/mode-scoped browser storage. A backend adapter must implement the documented recipient contract and idempotent transfers. Storage-event invalidation is enabled only for the IndexedDB demo; it is not backend realtime or cross-device synchronization. Nuxt color-mode provides the persisted light/dark preference. See [enhancement details](enhancements.md).

Same-bank recipient lookup uses `GET /api/recipient-accounts/:accountNumber` and returns `{ displayName, bankName, accountNumber, currency }` without balances or owner IDs. A compatible backend must verify active third-party account identity independently of the saved-contact list. Demo lookup exposes only fictional accounts; Other bank existence verification remains outside this mock.

## Spending insights

`/spending-insights` reuses `GET /api/accounts` and the paginated `GET /api/transactions` contract; no new upstream endpoint is required. The loader requests the six-month UTC range, validates responses and reads every page before exposing totals. It rejects malformed/inconsistent pagination and ranges above 10,000 transactions rather than showing partial spending. Offset pagination cannot guarantee a snapshot during concurrent backend writes; a production aggregate/snapshot endpoint would be preferable for large histories.

The calculation includes completed USD debits of type CARD, CASH and FEE only. All transfers, credits (including refunds), pending and failed transactions are excluded. This is gross recorded spending, not net cash flow, merchant categorization, budget tracking or financial advice. Exact totals use bigint internally and decimal minor-unit strings in the query cache/payload. Ownership is intersected with returned accounts; backend authorization remains authoritative.

The page defaults to the previous calendar month in UTC, serialized with Nuxt state to avoid month-boundary hydration differences. Month/account filters live in the URL. The query key starts with `bank`, so existing transfer/reset/cross-tab invalidation also refreshes insights. The page prefetches in backend mode and retains demo readiness gating.

## Identity and client cache lifecycle

The API `/customer` response supplies the authenticated customer ID used for client cache scope. Query keys start with `['bank', customerId, sessionGeneration]`; account IDs and transaction filters are additional resource dimensions. An account ID alone cannot isolate customers, and client cache scope does not authorize access. The server must derive identity from its session and enforce resource ownership.

`useBankingContext().session.changeIdentity(async () => { /* change credentials */ })` must wrap login/account-switch credential changes. It synchronously disables reads and clears the exposed identity, unmounts sensitive page state, cancels old queries, clears query/mutation caches and hydrated query state, then changes credentials and resolves `/customer`. Credential writes serialize; generation guards reject stale query, mutation and identity responses. `session.logout(async () => { /* invalidate server session */ })` performs cleanup and leaves reads disabled without resolving a new identity. Storage cleanup failures are reported separately and do not prevent credential invalidation. These callbacks are integration points, not implemented authentication endpoints.

SSR keeps request-specific API/QueryClient instances and hydrates the verified identity/cache scope without a duplicate identity request. Identity lookup failures render retryable session errors. Demo startup resolves its fictional customer only after MSW is ready. Real-service identity comes from the standalone API's `/customer` endpoint.

The host authentication integration must invoke the lifecycle before changing credentials and relay logout/identity changes from other tabs. Arbitrary cookie changes outside that lifecycle are not automatically detected. Do not derive identity from the first account, since a customer may have zero accounts.
