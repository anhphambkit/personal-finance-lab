# Production banking architecture proposal

> The current sample implements `Browser -> Nuxt BFF -> standalone Node.js API -> SQLite`. Browser MSW and IndexedDB remain the explicit mock adapter. See [BFF setup](bff.md).

This document proposes production infrastructure beyond the implemented local service. The standalone backend provides fictional password login, opaque tokens, authorization, durable SQLite models and atomic transfers. It does not provide a production identity provider, distributed database, payment rails or operational controls.

## Components and communication

```mermaid
flowchart LR
    Browser[Browser: Vue features and Query cache]
    Nuxt[Nuxt SSR and session boundary]
    Auth[Authentication service: OIDC]
    API[Banking API: authorization and use cases]
    DB[(Transactional relational database)]
    Worker[Payment processing worker]
    Rails[External payment provider]

    Browser -->|HTTPS and session cookie| Nuxt
    Browser -->|Login redirect| Auth
    Auth -->|Authorization code callback| Nuxt
    Nuxt -->|Code exchange and session lifecycle| Auth
    Nuxt -->|Access token and typed requests| API
    API -->|Trusted identity metadata| Auth
    API -->|Atomic writes and scoped reads| DB
    DB -->|Committed outbox jobs| Worker
    Worker -->|Idempotent payment instruction| Rails
    Rails -->|Verified result| Worker
    Worker -->|Settlement updates| DB
```

The browser retains page/form state and an expendable API cache. Nuxt renders request-specific HTML, manages sessions and forwards authorized requests; it is not the source of monetary truth. The Banking API owns account permissions, validation, balances, transfer execution and activity. A relational database enforces durable constraints and transactional writes. External payment processing is a separate asynchronous responsibility.

## Identity and request flow

1. Nuxt initiates an OIDC authorization-code login with an authentication service, validates the response and creates a server-managed session. OIDC supplies authenticated identity on top of OAuth; an ID token is not a substitute for an API access token. Use an established OIDC client with state/nonce validation and provider-supported PKCE. [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).
2. Keep provider tokens server-side and use a Secure, HttpOnly session cookie in the browser. Define expiry, renewal, logout and revocation. The API validates its access-token issuer, audience, signature and expiry, then resolves customer identity from trusted claims rather than a caller-supplied customer ID.
3. Nuxt SSR forwards only the server-held credential for that session. Banking queries check resource ownership before filtering or returning data. Keep responses private/no-store and clear Vue Query on logout or identity change.
4. Apply CSRF protection to cookie-authenticated mutations, including origin checks and a validated token. SameSite cookies are additional protection rather than the entire control. No state changes occur through GET. [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
5. The browser submits a transfer with a stable request key. After server commit, the response contains a receipt and the client invalidates account/activity queries. A timeout remains an unknown result; the client can query durable request status or explicitly repeat the same key.

## Proposed persistence model

| Table                      | Main fields and constraints                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| customers                  | `id` primary key; unique identity-provider issuer/subject pair; display profile.                                                                             |
| accounts                   | `id`, owner FK, type, currency, status; protected account identifier. A balance projection is maintained with ledger postings.                               |
| beneficiaries              | `id`, customer FK, display/bank identity, protected account identifier, optional internal account FK.                                                        |
| transfers                  | `id`, customer/source FKs, destination account or immutable recipient snapshot, amount/currency, reference, lifecycle status and timestamps.                 |
| transfer_requests          | Unique `(customer_id, idempotency_key)`; normalized payload fingerprint, transfer/result reference.                                                          |
| journal_entries / postings | Journal identity plus linked account postings in integer minor units; balanced entries per currency, with explicit clearing accounts for external movements. |
| activity                   | Customer-facing read projection tied to account, transfer and journal references; indexed by account/time and supported search dimensions.                   |
| outbox / audit_events      | Durable payment jobs written with the transfer; append-only operational/audit records with actor, action, request ID and timestamp.                          |

```mermaid
erDiagram
    CUSTOMER ||--o{ ACCOUNT : owns
    CUSTOMER ||--o{ BENEFICIARY : saves
    CUSTOMER ||--o{ TRANSFER_REQUEST : submits
    TRANSFER_REQUEST ||--o| TRANSFER : resolves_to
    ACCOUNT ||--o{ TRANSFER : sends
    TRANSFER ||--o{ JOURNAL_ENTRY : records
    JOURNAL_ENTRY ||--|{ POSTING : contains
    ACCOUNT ||--o{ POSTING : receives
    TRANSFER ||--o{ ACTIVITY : projects
    TRANSFER ||--o{ OUTBOX : schedules
```

This schema adds concepts deliberately absent from the demo. It needs migrations, access controls, encryption/key management, backups and tested recovery. Never place raw tokens or full account identifiers in application logs.

## Transfer transaction and external settlement

For an internal transfer, authorize the source and resolve the destination, enforce the request-key constraint, lock affected account rows in a stable order, recheck status/currency/funds, then write the transfer, journal postings, balance projections, activity and audit record in one database transaction. Prevent negative balances and duplicate application at the database boundary. Return success after commit.

Select an isolation/locking strategy explicitly; a serializable database transaction can still abort and require retry of the entire transaction. Such server retries must preserve the request key and must not repeat external side effects. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

External payments cannot atomically commit a database write and a remote payment-network result. Commit an outbox job with the accepted transfer, process it idempotently, verify provider callbacks and reconcile settlement separately. Define accepted, pending, settled, failed and reversed outcomes with appropriate ledger entries and customer messaging before exposing real funds. The demo's immediate external success is only its mock contract.

## Mapping from this work sample

| Existing boundary                 | Proposed production responsibility                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/features`, `src/contracts`   | Reusable UI/query contracts, with durable pending-request recovery and authenticated session behavior added. |
| `server/api/[...path].ts`         | Extend the forwarding boundary with a complete session lifecycle and CSRF policy.                            |
| MSW handlers                      | Retain for deterministic browser tests; real mode uses the standalone Banking API through the Nuxt BFF.      |
| Pure domain and transfer use case | Reuse rules where appropriate; move authoritative checks and money changes to the backend.                   |
| IndexedDB snapshot                | Replace with transactional relational storage, ledger projections and server-side idempotency.               |
| Fictional current customer        | Replace with authenticated identity and resource-level authorization.                                        |

Backend integration requires contract tests plus isolated authenticated end-to-end scenarios. MSW and test-only BFF doubles do not prove compliance with a deployed bank API. See [backend handoff](nuxt-migration.md), [testing boundaries](testing.md) and the [architecture decisions](adr/001-feature-oriented-vue-architecture.md).
