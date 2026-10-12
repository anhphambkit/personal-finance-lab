# Banking demo enhancements

This enhancement adds recipients, transfer recovery, same-browser tab synchronization, dark mode, Storybook and visual regression. Cross-device synchronization requires a shared backend and is outside the demo scope.

## Add a recipient

In Transfer, choose **Someone else**. **Saved recipient** is a searchable select for names, banks and last four account digits. Selecting a contact uses its saved identity without re-entering bank details. Otherwise enter a name, bank and an 8–20 digit account number. **Save recipient for next time** is unchecked by default for new recipients. Review performs no API mutation. The immutable `NEW_BENEFICIARY` request includes the save choice; Confirm saves a contact only when selected, atomically with the transfer. A one-time transfer keeps an immutable recipient snapshot without adding a saved contact. A failed validation or aborted write leaves both transfers and beneficiaries unchanged.

The shared beneficiary operation normalizes whitespace, bounds names, rejects invalid account formats and deduplicates the same bank/account atomically, including concurrent saves and transfer confirmation. Same-bank Check account uses the separate `/api/recipient-accounts/:accountNumber` lookup. The default Jordan Lee (`200000008319`) is an active bank account without a saved contact; successful lookup does not save it. A known Personal-bank account resolves to a hidden internal destination; own or frozen accounts and unknown Personal-bank numbers are rejected. A number at a different bank is never resolved to a Personal-bank account, even if its digits match. Other bank accounts are simulated external destinations: the number's format is validated, but external account existence/name is not verified. The standalone `POST /api/beneficiaries` contract remains available for an explicit future recipient-directory UI. No recipient edit/delete directory was added. Reset restores the original saved recipients.

## Restore an interrupted transfer

A browser-local recovery record is scoped by fictional customer ID. Details are saved on change; Review saves the immutable request, recipient/source snapshot and idempotency key. Confirmation must persist `submitted: true` before sending the HTTP request. Storage failure blocks a new confirmation with an error instead of silently losing the retry context.

Opening Transfer restores the last saved details or review after reload/closing the tab. An interrupted confirmation restores **Retry same transfer** and disables Back. It never submits automatically. Explicit retry uses the original key/payload, so a committed request returns its existing receipt without another debit. The balance shown in review is labeled as the balance at review; execution validates current funds. Success clears the matching recovery record, while a definite rejection allows editing. An idempotency conflict replaces Confirm/Retry with a link to transaction activity and allows navigation. Its terminal status survives reload, without changing the saved request key or sending a replacement payment automatically. A different draft cannot replace a saved unresolved request. Web Locks serialize confirmations across tabs where supported, in addition to repository idempotency and atomic balances.

There is one recovery record per fictional customer on this origin, not a draft history. Concurrent unsubmitted edits use the last saved draft. Browser storage is unencrypted and user-editable, may be cleared/evicted, and is unsuitable for storing real banking data without a production privacy/session design. Corrupt or inaccessible recovery storage surfaces an error. A future backend would still require server-side idempotency; this browser record is not a server guarantee or cross-device recovery mechanism.

## Same-browser synchronization

After an IndexedDB update/reset commits, the adapter publishes a random change token through the browser `storage` event. Tokens contain no account/recipient data. Other demo tabs cancel in-flight banking queries and invalidate/refetch their accounts, activity and beneficiaries. Reads do not publish, avoiding loops. Listener cleanup runs on application unmount. Browser event delivery may be delayed for suspended tabs; normal query refetch remains available.

Reset removes demo recovery records and signals mounted transfer screens to clear their draft/receipt. A reset-generation check blocks a stale page from resubmitting an old request before its reset event is handled. Notifications are best effort; notification failure does not change a successfully committed transfer into a failed payment. The IndexedDB transaction remains the consistency boundary.

This does not synchronize different browser profiles, origins, browsers or physical devices. Cross-device support requires a shared backend.

## Theme and component catalog

The header theme button switches light/dark mode with a persisted Nuxt color-mode preference. Light is the initial default. The toggle renders after hydration; a fixed-size fallback reserves its space. Semantic surface/text tokens and dedicated dark variants cover tables, forms, navigation, balance summary, skeletons and indicators. Account-card contrast remains explicit.

Storybook uses Vue/Vite and the same Nuxt UI plugin, colors and CSS as the app. Its theme toolbar changes the canvas between light and dark. Eight component groups declare their actual component, typed args and explicit Controls. Nineteen stories cover MoneyDisplay, MoneyInput, AccountCard, TransactionTable, TransferDetailsForm, TransferReview, TransferReceipt and SpendingDashboard states. It is development tooling, not part of the Nitro deployment.

Storybook is included as a local component catalog and visual QA tool. Publishing a hosted catalog is intentionally outside this repository's scope.

```sh
npm run storybook
npm run build-storybook
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:storybook
```

The six browser checks open all nineteen stories in both themes, reject browser exceptions, verify eight indexed component groups, require Controls for every story, preserve legacy combined-catalog bookmarks and change live Controls to assert the rendered state updates. Storybook configuration follows the [official Vue/Vite framework guide](https://storybook.js.org/docs/get-started/frameworks/vue3-vite).

## Visual regression

```sh
npm run build
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:visual
# Only after reviewing an intentional UI change:
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:visual:update
```

The separate visual suite compares Accounts, Transactions, Transfer and Spending Insights across desktop/tablet/mobile viewports in both themes: 24 images across 10 tests. Seed data, locale, timezone, reduced motion and screenshot animation handling are deterministic. The baseline allows at most 0.1% changed pixels. Functional E2E assertions remain separate from screenshots.

Baselines live in `scripts/visual/baselines/<platform>/`. The checked-in images target macOS Chromium. Browser version/OS/fonts affect rasterization; use the pinned Playwright browser on the same platform, or deliberately generate and review a separate platform baseline. Never blindly accept updates to make a failing visual test pass. Storybook must be rebuilt before its smoke suite, and the app must be rebuilt before E2E/visual suites.
