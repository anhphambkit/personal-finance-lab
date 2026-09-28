# 003 — Money representation and transfer consistency

- **Status:** Accepted
- **Last clarified:** 2026-09-08
- **Scope:** USD demo transfers to owned accounts and saved or newly entered recipients

## Context

A transfer affects balances, activity and a receipt. It may also save a new recipient. Rounding errors, checks against an old balance or duplicate requests must not leave these records inconsistent.

The demo completes transfers within one request. An internal recipient has an account in the local dataset; an external recipient has no balance managed by this application. A completed demo transfer means the local operation committed, not that funds settled through payment rails.

## Decision drivers

- Represent supported USD amounts exactly.
- Validate funds against the current state when applying a transfer.
- Commit related records together or leave the previous state intact.
- Prevent repeated requests from applying the same transfer twice.
- Preserve an explicit recovery path when confirmation has an uncertain outcome.

## Alternatives

| Option                                          | Benefit                                        | Reason not selected                                                               |
| ----------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Floating-point dollar amounts                   | Convenient for input and display               | Arithmetic can introduce binary rounding errors.                                  |
| Decimal strings everywhere or a decimal library | Supports exact decimal arithmetic              | Adds conversion or library complexity for fixed two-decimal USD amounts.          |
| BigInt in every API money field                 | Supports integers beyond the safe Number range | Requires a custom JSON representation; safe integer cents cover the demo's range. |
| Load, validate and save in separate operations  | Simple sequential code                         | Competing transfers can validate against the same old balance.                    |
| Disable Confirm as the only duplicate guard     | Prevents some repeated clicks                  | Does not handle repeated HTTP requests or a lost response after commit.           |
| Full ledger and distributed settlement workflow | Models real payment processing more closely    | Exceeds the synchronous mock scope.                                               |

## Decision

### 1. Store money as safe integer cents

The API and persisted state use integer minor units. For USD, `$10.50` is stored as `1050` cents.

- Transfer amounts must be positive safe integers in cents.
- Balances must be non-negative safe integers in cents.
- Fractional cents, zero/negative transfer amounts and values above `Number.MAX_SAFE_INTEGER` are rejected.
- User input may contain up to two decimal places. `MoneyInput` uses exact decimal-text parsing rather than multiplying a floating-point dollar value by 100.
- BigInt is used during exact parsing and when summing balances for display. API fields remain JSON-compatible numbers.
- Display formatting is separate from arithmetic.

### 2. Validate and apply the transfer inside the repository update

`executeTransfer` resolves the recipient and validates the operation against the current snapshot inside a synchronous repository callback. Checks include ownership, active account status, matching currency, sufficient funds, a different source/destination and destination balance overflow.

The same IndexedDB transaction debits the source, credits a local destination when applicable, creates linked activity and stores the completed transfer. A new recipient is saved in that transaction when requested.

| Destination                       | Source balance | Destination balance                   | Linked activity          |
| --------------------------------- | -------------- | ------------------------------------- | ------------------------ |
| Another owned account             | Debit          | Credit                                | One debit and one credit |
| Another person's internal account | Debit          | Credit to the local recipient account | One debit and one credit |
| External recipient                | Debit          | Outside the demo                      | One debit                |

Internal and external recipients have an identity snapshot stored with the transfer, so the receipt does not depend on a saved contact remaining unchanged. Recipient resolution uses the bank and account number: an external number matching a local account does not credit that local account.

Review does not change banking state. It validates the draft and persists local recovery information. Transfer success is returned only after commit. Rejection or transaction abort leaves the previous committed balances, activity, transfers and beneficiaries intact.

### 3. Make saving a new recipient an explicit choice

The current form sends an explicit `saveRecipient` boolean for a new recipient. `true` allows the contact to be saved with a successful transfer; `false` keeps it as a one-time transfer with a receipt snapshot. Review does not save a contact.

For compatibility, older requests that omit the flag retain their original save-by-default behavior. Their existing fingerprints remain replayable.

### 4. Persist a key and fingerprint to prevent duplicate execution

Before entering the synchronous transaction callback, copy the caller's request, normalize its relevant fields and compute a SHA-256 fingerprint. Copying first prevents the caller from changing the input while hashing is in progress.

Store the idempotency key and fingerprint with the completed transfer. The fingerprint includes the source, destination, amount, currency, normalized reference and effective save-recipient choice.

| Incoming request                       | Result                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| New key and valid request              | Apply the transfer once and store its receipt                                         |
| Existing key and matching fingerprint  | Return the original receipt without adding a debit, credit, contact or activity entry |
| Existing key and different fingerprint | Return an idempotency conflict without changing banking state                         |

The duplicate check runs inside the same transaction as the transfer. Idempotency prevents repeated execution of one request; transaction serialization separately prevents competing requests from spending the same funds.

### 5. Require explicit retries when the outcome is uncertain

Do not automatically retry transfer mutations. Before sending confirmation, persist the exact draft, request and key in browser recovery storage. If this persistence fails, block confirmation.

After a lost response or forced close, opening Transfer restores the submitted request for an explicit same-key retry. Restoring the page never sends a payment automatically. If the earlier request committed, retry returns its existing receipt.

An idempotency conflict is terminal for that request. The UI preserves conflict status across reloads, refreshes banking queries and offers a link to transaction activity. It does not automatically retry or replace the key.

Successful transfers cancel stale banking queries and invalidate cached accounts, activity and beneficiaries.

### 6. Coordinate browser recovery and demo reset

Web Locks serialize confirmations across tabs where available. Recovery writes check for an existing submitted request before replacing a draft. Without Web Locks, the localStorage read/write guard is not an atomic cross-tab lock; IndexedDB transactions and idempotency checks remain the banking-state safeguards.

Reset restores seed banking state, removing user-created transfers and their idempotency records. After commit, it attempts to clear demo recovery records and update a generation marker. Confirmation checks that marker to reject drafts from before a detected reset. As described in ADR 002, localStorage cleanup and notification are best-effort and are not part of the IndexedDB transaction.

## Why

Integer cents make supported arithmetic exact. Checking and applying a transfer inside one transaction prevents partial updates and stale competing spends. Persisted idempotency records address the separate case where a request commits but the client loses the response. Saving the exact request before submission lets the user retrieve that result through a same-key retry.

## Consequences

### Benefits

- Balances, activity, transfer records and opted-in recipient creation commit together.
- Duplicate replay returns the original result without double-debiting.
- Competing transfers validate against the latest available committed balance.
- Users can explicitly recover an uncertain confirmation after reload while browser storage remains available.

### Trade-offs and limits

- Only USD with two decimal places is supported; fees, FX and other currency minor units are outside scope.
- The safe integer range is an explicit limit on amounts and balances.
- Browser storage can be edited, cleared or evicted. Recovery and cross-tab coordination do not provide production durability.
- `COMPLETED` means committed in this demo. External settlement is not simulated.
- Production needs authenticated key scoping, durable recovery, a transactional database and reconciliation for uncertain or asynchronous payment outcomes.

## Implementation and verification

- [Money arithmetic](../../src/domain/money/money.ts) and [money tests](../../src/tests/domain/money.test.ts) cover exact parsing and safe integer limits.
- [Transfer validation](../../src/domain/transfers/validateTransfer.ts) and [execution](../../src/use-cases/transfers/executeTransfer.ts) enforce current-state checks, atomic changes and idempotency.
- [Transfer tests](../../src/tests/data/executeTransfer.test.ts) cover destinations, recipient save choices, duplicate/conflicting requests, competing spends and rollback. [Recipient lookup tests](../../src/tests/data/lookupRecipient.test.ts) cover bank-scoped resolution.
- [Recovery storage](../../src/features/transfers/transferRecovery.ts) and [Transfer page](../../src/pages/transfer.vue) implement persistence and explicit confirmation/retry behavior.
- [Recovery tests](../../src/tests/ui/transferRecovery.test.ts) and [transfer flow tests](../../src/tests/ui/transferFlow.test.ts) cover recovery guards and user-visible outcomes.

Related decisions: [frontend architecture](001-feature-oriented-vue-architecture.md), [HTTP and demo persistence](002-mock-http-boundary-and-demo-persistence.md).
