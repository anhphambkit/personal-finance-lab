# Testing the banking application

> Browser MSW and IndexedDB remain the local test adapter. Real-service mode uses the authenticated Nuxt BFF described in [authentication](authentication.md).

The suites exercise different boundaries. Keep the existing Vitest/MSW Node tests; browser coverage supplements them instead of replacing them. No production banking backend is needed to run these suites.

## Commands

Use Node 24 and npm 11. Install dependencies and Chromium once:

```sh
npm ci
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npx playwright install chromium --no-shell
```

Run the full suite:

```sh
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:all
```

Individual commands:

| Command                                                             | Coverage                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm run test -- --run`                                             | Existing Vitest domain, repository, HTTP client and component tests |
| `npm run test:bff`                                                  | BFF session, HTTP adapter and recovery boundary tests               |
| `npm run test:bff:service`                                          | Built Nuxt → sibling Node service → temporary SQLite smoke          |
| `PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:e2e`       | Build, then Chromium tests in browser MSW mode                      |
| `PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:e2e:built` | Chromium tests against the existing build                           |

If Chromium is installed at Playwright's default location instead, omit `PLAYWRIGHT_BROWSERS_PATH` consistently for both install and test. Linux CI may need `playwright install --with-deps chromium --no-shell` to install system dependencies.

`test:bff:service` requires a current `npm run build` and the sibling `../personal-finance-api` checkout. Set `PERSONAL_FINANCE_API_DIR` when it lives elsewhere. The script starts both services on disposable loopback ports, uses a temporary SQLite database, verifies auth/SSR/transfer replay/recovery/restart persistence, then removes its processes and data.

Playwright starts a production Nuxt process on a dynamically allocated localhost port, then closes it during teardown. Each test gets a new browser context, isolating cookies, Service Workers and IndexedDB. The suite uses Chromium with desktop, 768px tablet and 390px mobile viewports, one worker and no automatic retries. Failure screenshots, traces and the HTML report are ignored by Git in `test-results/` and `playwright-report/`.

## Test boundaries

| Suite                | Request path                                                      | Purpose                                                         |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Vitest unit          | Pure function calls                                               | Money, validation and business rules                            |
| Vitest API/component | Node fetch → MSW `setupServer()` → handlers                       | Controlled HTTP and component behavior; existing tests retained |
| Demo browser         | Browser fetch → MSW `setupWorker()` → handlers → native IndexedDB | Real browser startup, interactions and persistence              |
| BFF adapter tests    | Nitro handler → test-only backend port or stubbed upstream fetch  | Sessions, auth forwarding, runtime validation and failure paths |

`scripts/testing/environment.mjs` contains only the Nuxt lifecycle helper used by Playwright. Test-only BFF doubles live under `src/tests/fixtures/` and are never imported by runtime code.

## Browser scenarios

`scripts/e2e/demo.spec.mjs` checks:

1. Initial demo HTML contains loading state, then MSW starts and accounts render without hydration mismatch; navigation and title work.
2. Transaction filtering updates results and URL, survives reload, and restores on Back/Forward.
3. Review does not submit; confirmation submits once, debits/credits exact cents, and creates two activity entries. Balances persist after reload. Confirmed reset restores the original accounts and survives another reload.

`scripts/e2e/core-qa.spec.mjs` checks the four pages at 1440/768/390px: keyboard navigation and focus, horizontal overflow, visible account-number masking, frozen source exclusion, filtered-empty recovery, and readable transfer review. Invalid submission must focus the enabled Amount input and associate the error message. Review alone must not change balances. These success paths also reject console errors; screenshots are saved for layout inspection.

All browser tests fail on uncaught page errors or logged hydration mismatches. Demo tests use the application's Service Worker, with no Playwright route mocks.

`scripts/e2e/transaction-detail.spec.mjs` checks the transaction drawer in both Transactions and Recent activity at 1440/768/390px. It verifies linked transfer identity, masked accounts, keyboard opening, focus containment, Escape/Close and return focus, width containment, preserved URL and no additional banking requests when opening details.

## When the real backend is ready

Run the standalone service separately and configure `NUXT_PUBLIC_ENABLE_MOCKS=false`, `NUXT_PUBLIC_ENABLE_BFF=true`, and server-only `NUXT_BFF_API_BASE_URL`. Supply test authentication and isolated, resettable data. Cover a small set of critical flows end to end and keep deterministic MSW/unit tests for failure cases. Do not run the demo reset endpoint against a real backend.

## Optional enhancement suites

`src/tests/data/createBeneficiary.test.ts` covers atomic recipient deduplication, internal resolution and invalid requests. `executeTransfer.test.ts` verifies that a new recipient and transfer commit together and both roll back on transfer validation failure. `transferDetails.test.ts` verifies that Review only prepares a `NEW_BENEFICIARY` request. `src/tests/ui/transferRecovery.test.ts` covers exact request/key retention, unresolved-record protection and corrupt/unavailable storage.

`scripts/e2e/enhancements.spec.mjs` covers theme persistence/keyboard toggle, adding and selecting a new recipient through the UI, draft restoration and same-key replay after a simulated committed response loss/page close, plus automatic balance refresh/reset in a second tab.

Build the app before `npm run test:visual` and build Storybook before `npm run test:storybook`. Both use Chromium; see [enhancement commands and baseline rules](enhancements.md). Cross-device synchronization is deferred and is not claimed by any test.

Storybook stories use eight component-specific CSF files and typed args. The third Storybook browser test verifies the component index and edits amountMinor via the manager Controls panel, asserting the new money value in the preview iframe.

## Spending insights coverage

Domain and loader suites verify exact totals, six-month UTC windows, exclusions, pagination completeness/limits, account scope and abort handling. UI tests cover component customization, comparisons, URL state, unchanged-URL reset and error recovery. The Spending Insights browser suite exercises responsive filters, reload/Back and invalid-link recovery with browser MSW. Visual tests include the new page in both themes.

## Feedback round 2 regression coverage

- API response tests validate required fields, money, dates, pagination, invalid JSON and unexpected no-content responses. Invalid transfer success payloads remain uncertain.
- Session UI tests cover customer A/B with shared account IDs, late A responses, late mutation results, failed identity resolution, overlapping credential writes and logout despite corrupt recovery storage.
- Recovery tests cover 24-hour draft expiry, legacy migration, retained uncertain/conflict keys, owner cleanup and debounced save cancellation/flush.
- Transfer state tests cover session changes during queued confirmation and in-flight submission, plus explicit same-key recovery. Existing transfer flow tests preserve exact debit and replay assertions.

These tests exercise frontend lifecycle behavior; they do not implement or certify production authentication.
