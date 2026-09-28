# Authentication and data modes

## Standalone API mode

Run `personal-finance-api`, then start this repository with `npm run dev`. Nuxt acts as the browser-facing BFF described in [BFF setup](bff.md).

Login, refresh and logout go through same-origin `/api/auth/*` endpoints. Nuxt stores backend access/refresh tokens only in its process-local session and gives the browser an opaque HttpOnly, SameSite=Lax cookie. The browser receives the authenticated customer and a CSRF token, never a backend Bearer token.

Protected pages redirect anonymous requests to `/login`. Login rotates the BFF session and CSRF token. Logout blocks banking immediately, revokes the backend grant and retains private retry state if revocation temporarily fails. Session changes clear customer-scoped Vue Query state and transfer form state.

Mutations require an exact Origin, CSRF token and expected customer header. The customer header detects a stale tab; authorization comes from the BFF session and backend token. The standalone service derives customer ownership from that token and enforces it for accounts, recipients, transactions, transfers and recovery.

Relevant frontend boundaries:

| Concern                                            | Owner                                       |
| -------------------------------------------------- | ------------------------------------------- |
| BFF session, CSRF, expiry and token refresh        | `server/utils/bffHandler.ts`                |
| Standalone service adapter                         | `server/utils/bffHttpBackend.ts`            |
| Auth response validation                           | `src/data/api/authApi.ts`                   |
| Login/logout and browser revalidation              | `src/features/auth/authController.ts`       |
| Identity changes and cache generation              | `src/data/api/bankingSession.ts`            |
| Recovery mirror and ordered persistence            | `src/features/transfers/sessionRecovery.ts` |
| Durable credentials, authorization and persistence | sibling `personal-finance-api` repository   |

For direct localhost development, leave `NUXT_AUTH_ORIGIN` empty. Behind TLS termination, set its exact public HTTPS origin without a path or query. BFF sessions are process-local, so multi-instance deployment requires a shared protected session store.

## MSW mock mode

Run `npm run dev:mock`. The browser starts the existing MSW worker after hydration and serves the deterministic Taylor fixture through the same `/api/*` client contract. MSW uses IndexedDB for atomic mock transfers and persistence across reloads. Transfer recovery uses browser storage.

Mock mode has no fake auth or banking server inside Nitro. `/login` redirects to the application, the Sign out control is hidden, and SSR renders loading state until the browser worker resolves the fictional customer. If an API request reaches Nitro before MSW is ready, it fails closed with `DEMO_BROWSER_ONLY`.

MSW and IndexedDB remain test/demo adapters. They do not provide server authorization, confidential storage or real payment processing.
