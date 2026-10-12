# 002 — Mock HTTP boundary and demo persistence

- **Status:** Accepted
- **Last clarified:** 2026-09-08
- **Scope:** Browser-local demo HTTP and persistence

## Context

The work sample needs realistic accounts, filterable activity and balances that survive refresh. Reviewers should be able to run it with Nuxt alone, without installing a banking backend or database.

A transfer changes several related records. Those changes must all commit or all fail, including when two tabs submit transfers at the same time.

## Decision drivers

- Exercise HTTP requests and errors through the client used by the UI.
- Preserve demo data across navigation and reloads.
- Commit related banking changes together and avoid lost updates between tabs.
- Keep storage simple for approximately 100 seed transactions.
- Make the demo's persistence and authorization limits explicit.

## Alternatives

| Option                                       | Benefit                                | Reason not selected                                                                                           |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Component fixtures or an in-memory store     | Minimal setup                          | Bypasses HTTP behavior and loses changes on reload.                                                           |
| JSON Server or a separate backend            | Provides a real server process         | Adds installation and runtime requirements for reviewers.                                                     |
| One JSON snapshot in `localStorage`          | Simple persistence                     | Separate read/modify/write calls can lose concurrent updates; synchronous access also blocks the main thread. |
| Separate IndexedDB entity stores and indexes | More efficient queries at larger scale | Adds migration and consistency work that this small dataset does not need.                                    |

## Decision

### 1. Keep HTTP between the UI and the demo implementation

```text
Vue feature UI
  → BankingApi HTTP client
  → browser MSW handlers
  → use cases
  → BankingRepository port
  → IndexedDB repository
```

MSW intercepts browser HTTP requests. Handlers parse requests and map results or errors to HTTP responses. Use cases own filtering, customer ownership projection and transfer execution. The deterministic seed factory supplies the initial dataset.

### 2. Store one validated, versioned banking snapshot

| Setting                 | Value           |
| ----------------------- | --------------- |
| Database                | `personal-bank` |
| Database version        | `1`             |
| Object store            | `banking-state` |
| Snapshot key            | `current`       |
| Snapshot schema version | `1`             |

The snapshot contains the customer, accounts, transactions, transfers and beneficiaries. A runtime Zod schema checks field values and relationships, including unique IDs, valid references and the linked activity required for each transfer. This detects malformed or inconsistent data; it does not authenticate browser data or prove it has not been edited.

### 3. Read, validate and write within one transaction

`load`, `update` and `reset` use IndexedDB `readwrite` transactions. Even `load` can write when initializing or recovering data, so it must be serialized with updates.

An update follows this sequence:

1. Read the latest snapshot inside the transaction.
2. Run a synchronous callback that applies the banking operation.
3. Validate the resulting snapshot.
4. Queue one snapshot write.
5. Resolve the operation only when the transaction completes.

A callback, validation or storage failure aborts the transaction and preserves the previous committed state. The callback cannot await asynchronous work; transfer fingerprints are prepared before entering it, as described in ADR 003.

IndexedDB serializes competing writes to the same object store across connections. Each transfer checks funds against the state available when its transaction runs.

### 4. Distinguish invalid demo data from storage access failures

| Condition                                                                 | Behavior                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Snapshot is missing or fails the supported schema                         | Recover to deterministic seed data, discarding changes in the invalid snapshot |
| Valid snapshot lacks the added demo directory account                     | Add that account while preserving existing history                             |
| Database open/read fails, or the database version is newer than supported | Surface a storage error without deleting the database                          |
| Resulting snapshot fails validation or its write aborts                   | Reject the operation and keep the previous committed state                     |
| User resets the demo                                                      | Replace banking state with the seed snapshot                                   |

Seed recovery is a convenience for disposable demo data, not a production migration or recovery policy.

### 5. Notify other demo tabs after commit

After an update or reset commits, publish a change token through `localStorage`. Other tabs on the same origin receive a storage event, cancel stale banking queries and refetch. The token contains notification metadata, not banking records. Loads do not publish notifications.

Reset also attempts to clear demo transfer recovery records and update a reset-generation marker. Notifications and recovery cleanup happen after the IndexedDB commit. If `localStorage` fails, the committed banking operation still succeeds; notification and cleanup are best-effort.

### 6. Fail closed outside browser MSW

Demo queries start after browser hydration and MSW startup. Nitro never proxies banking requests: if a request is made during SSR or MSW does not intercept it, the catch-all `/api/*` route returns an explicit `DEMO_BROWSER_ONLY` 503 response with `private, no-store` caching.

## Why

The HTTP boundary exercises request and error handling while keeping setup small. A single IndexedDB snapshot makes it straightforward to commit balances, activity and transfer records together. At this dataset size, that simplicity is more useful than indexed queries over separate stores.

## Consequences

### Benefits

- Reviewers need no server beyond Nuxt.
- Banking changes survive reloads and commit atomically within IndexedDB.
- Competing tabs do not overwrite changes based on independently loaded snapshots.
- HTTP behavior and native persistence can be verified in isolation and in a real browser.

### Trade-offs and limits

- Operations read and validate the whole snapshot; writes persist it as a whole. This is intended for demo-scale data.
- Browser storage is local, user-editable and subject to browser durability, retention and eviction behavior.
- Cross-tab notifications can fail independently of a successful commit.
- Cross-device persistence is explicitly deferred.
- Mock ownership filtering is not server-side authorization. A real integration must supply authentication, authorization, runtime contract validation and transactional persistence.
- The `personal-bank` namespace intentionally starts a fresh fictional demo for browsers that stored data under an earlier demo name. Those older demo namespaces and recovery records are not migrated.

## Implementation and verification

- [HTTP handlers](../../src/data/mock/handlers/banking.ts) and [seed factory](../../src/data/seed/createSeedState.ts) define the demo entry point and initial data.
- [IndexedDB repository](../../src/data/repositories/indexedDbBankingRepository.ts) implements transactions and recovery; [snapshot schema](../../src/data/repositories/bankingStateSchema.ts) checks stored data.
- [Change notifications](../../src/data/sync/bankingChanges.ts) and [Vue Query plugin](../../src/plugins/02.vue-query.ts) refresh other tabs.
- [Nitro API route](../../server/api/[...path].ts) implements the fail-closed server boundary.
- [Repository tests](../../src/tests/data/repository.test.ts) cover validation, recovery, concurrent connections and aborted writes. [Browser tests](../../scripts/e2e/demo.spec.mjs) exercise native persistence.

Related decisions: [frontend architecture](001-feature-oriented-vue-architecture.md), [money and transfer consistency](003-money-and-transfer-consistency.md).
