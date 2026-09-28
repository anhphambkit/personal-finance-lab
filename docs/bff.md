# BFF with the standalone Node.js backend

The application has two data modes:

- `npm run dev:mock` starts Nuxt with browser MSW and IndexedDB fixtures.
- `npm run dev` starts Nuxt as a BFF for the sibling `personal-finance-api` service at `http://127.0.0.1:4000/v1`.

## Real API request flow

1. The browser obtains an anonymous session and CSRF token from `/api/auth/session`.
2. Login sends fictional credentials and the CSRF token to Nitro.
3. Nitro calls the standalone service and stores its opaque access/refresh tokens in the server-side BFF session.
4. The browser receives only customer information, a CSRF token and an HttpOnly BFF cookie.
5. Banking requests stay same-origin. Nitro attaches the server-held Bearer token and sends them to `NUXT_BFF_API_BASE_URL`.
6. The standalone service validates the token, customer ownership, recovery and idempotency before reading or writing SQLite.

`csrfToken` is intentionally readable by frontend code so it can submit `X-CSRF-Token`. It is not a backend access token. The expected-customer header detects a stale UI; it cannot select another customer's identity.

## Mock mode

Mock mode does not start a fake backend inside Nitro. After hydration, the browser starts the existing MSW worker. Its handlers use the IndexedDB repository and the original deterministic seed data. Nitro returns `DEMO_BROWSER_ONLY` if a mock request reaches the server before the worker is ready.

Mock recovery remains in browser storage and mock mutations publish cross-tab invalidation events. Real API recovery is stored by `personal-finance-api` and mirrored in memory by the frontend.

## Sessions and limits

The BFF cookie uses HttpOnly, SameSite=Lax and Secure on HTTPS. Mutations require matching Origin and CSRF checks. Backend access/refresh tokens never enter browser responses, storage or SSR payloads.

Nuxt BFF sessions remain process-local in this sample, so restarting Nuxt signs browsers out. Multi-instance deployment needs a shared protected BFF session store. The standalone SQLite data and backend tokens survive service restarts.

Production identity still needs a real provider, enrollment and recovery controls. This sample supports no real credentials, customer data or payments.

## Verification

```sh
npx vitest run src/tests/data/bffAuth.test.ts src/tests/data/bffHttpBackend.test.ts
npm run build
npm run test:bff:service
```

The cross-repository smoke requires the sibling checkout or `PERSONAL_FINANCE_API_DIR`. The standalone repository also runs its own API and persistence suite with `npm test`.
