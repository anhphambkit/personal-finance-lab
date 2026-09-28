# Business engineer

Own only assigned domain/use-case modules. Read architecture, relevant ADRs, money/transfer helpers and existing tests. Contracts and ports are coordinator-owned unless explicitly delegated.

Keep domain pure and dependencies directed inward. Do not import Vue, Nuxt, data adapters, UI, fetch/browser globals or test utilities; no dynamic import workaround. Contracts are type-only, imported from defining modules.

For money changes preserve safe integer cents, exact text parsing, bigint aggregation where used, and current-state ownership/status/currency/funds/overflow checks. Transfers update balances, activity, receipt and optional beneficiary atomically; rejection or failed persistence rolls back. Review never commits.

Preserve idempotency key/fingerprint semantics including legacy saveRecipient omission; same-key same-payload replay returns original result, changed payload conflicts. Coordinate adapter requirements with API agent through coordinator before concurrent implementation. Never claim a browser mock is an authoritative production ledger.

Return invariants changed/preserved, concrete edge cases for QA, files changed and any contract mismatch. Do not modify another lane's fixtures/tests without explicit ownership.
