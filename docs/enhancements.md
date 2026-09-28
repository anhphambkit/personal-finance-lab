# Banking demo enhancements

> Browser MSW mode keeps recovery in browser storage. Authenticated BFF mode mirrors recovery from the standalone service. See [current authentication behavior](authentication.md).

This enhancement adds recipients, transfer recovery, same-browser tab synchronization, dark mode, Storybook and visual regression. Cross-device synchronization requires a shared backend and is outside the demo scope.

## Add a recipient

In Transfer, choose **Someone else**. **Saved recipient** is a searchable select for names, banks and last four account digits. Selecting a contact uses its saved identity without re-entering bank details. Otherwise enter a name, bank and an 8–20 digit account number. **Save recipient for next time** is unchecked by default for new recipients. Review performs no API mutation. The immutable `NEW_BENEFICIARY` request includes the save choice; Confirm saves a contact only when selected, atomically with the transfer. A one-time transfer keeps an immutable recipient snapshot without adding a saved contact. A failed validation or aborted write leaves both transfers and beneficiaries unchanged.

The shared beneficiary operation normalizes whitespace, bounds names, rejects invalid account formats and deduplicates the same bank/account atomically, including concurrent saves and transfer confirmation. Same-bank Check account uses the separate `/api/recipient-accounts/:accountNumber` lookup. The default Jordan Lee (`200000008319`) is an active bank account without a saved contact; successful lookup does not save it. A known Demo Bank account resolves to a hidden internal destination; own or frozen accounts and unknown Demo Bank numbers are rejected. A number at a different bank is never resolved to a Demo Bank account, even if its digits match. Other bank accounts are simulated external destinations: the number's format is validated, but external account existence/name is not verified. The standalone `POST /api/beneficiaries` contract remains available for an explicit future recipient-directory UI. No recipient edit/delete directory was added. Reset restores the original saved recipients.

## Restore an interrupted transfer

A recovery record is scoped by mode and session customer ID. MSW mode stores it in browser storage; BFF mode uses an in-memory mirror with ordered writes to the standalone service. Details autosave after 300 ms of inactivity and flush on normal navigation/page unload; pending saves are canceled before Review, reset or identity changes. Review saves the immutable request, recipient/source snapshot and idempotency key. Confirmation must persist `submitted: true` before sending the HTTP request. Storage failure blocks a new confirmation with an error instead of silently losing the retry context.

Opening Transfer restores the last saved details or review after reload/closing the tab. An interrupted confirmation restores **Retry same transfer** and disables Back. It never submits automatically. Explicit retry uses the original key/payload, so a committed request returns its existing receipt without another debit. The balance shown in review is labeled as the balance at review; execution validates current funds. Success clears the matching recovery record, while a definite rejection allows editing. An idempotency conflict replaces Confirm/Retry with a link to transaction activity and allows navigation. Its terminal status survives reload, without changing the saved request key or sending a replacement payment automatically. A different draft cannot replace a saved unresolved request. Web Locks serialize confirmations across tabs where supported, in addition to repository idempotency and atomic balances.

There is one recovery record per customer/mode, not a draft history. Concurrent unsubmitted edits use the last saved draft. Browser storage in MSW mode is unencrypted and user-editable and may be cleared or evicted. Corrupt or inaccessible recovery storage surfaces an error. BFF mode relies on backend idempotency and standalone recovery persistence; the frontend mirror is not authoritative.

## Same-browser synchronization

After an IndexedDB update/reset commits, the adapter publishes a random change token through the browser `storage` event. Tokens contain no account/recipient data. Other demo tabs cancel in-flight banking queries and invalidate/refetch their accounts, activity and beneficiaries. Reads do not publish, avoiding loops. Listener cleanup runs on application unmount. Browser event delivery may be delayed for suspended tabs; normal query refetch remains available.

Reset removes demo recovery records and signals mounted transfer screens to clear their draft/receipt. A reset-generation check blocks a stale page from resubmitting an old request before its reset event is handled. Notifications are best effort; notification failure does not change a successfully committed transfer into a failed payment. The IndexedDB transaction remains the consistency boundary.

This does not synchronize different browser profiles, origins, browsers or physical devices. Cross-device support requires a shared backend.

## Theme and component catalog

The header theme button switches light/dark mode with a persisted Nuxt color-mode preference. Light is the initial default. The toggle renders after hydration; a fixed-size fallback reserves its space. Semantic surface/text tokens and dedicated dark variants cover tables, forms, navigation, balance summary, skeletons and indicators. Account-card contrast remains explicit.

Storybook uses Vue/Vite and the same Nuxt UI plugin, colors and CSS as the app. Its theme toolbar changes the canvas between light and dark. Seven component groups declare their actual component, typed args and explicit Controls. Eleven stories cover MoneyDisplay, valid/invalid MoneyInput, active/frozen AccountCard, TransactionTable, TransferDetailsForm, TransferReview (normal/pending/uncertain) and TransferReceipt. It is development tooling, not part of the Nitro deployment.

Storybook is included as a local component catalog and visual QA tool. Publishing a hosted catalog is intentionally outside this repository's scope.

```sh
npm run storybook
npm run build-storybook
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:storybook
```

The five browser checks open all eleven stories in both themes, reject browser exceptions, verify seven indexed component groups, require Controls for every story, preserve legacy combined-catalog bookmarks and change live Controls to assert the rendered state updates. Storybook configuration follows the [official Vue/Vite framework guide](https://storybook.js.org/docs/get-started/frameworks/vue3-vite).

## Visual regression

```sh
npm run build
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:visual
# Only after reviewing an intentional UI change:
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:visual:update
```

The separate visual suite compares Accounts, Transactions and Transfer at 1440px and 390px in both themes: 12 images across four tests. Seed data, locale, timezone, reduced motion and screenshot animation handling are deterministic. The baseline allows at most 0.1% changed pixels. Functional E2E assertions remain separate from screenshots.

Baselines live in `scripts/visual/baselines/<platform>/`. The checked-in images target macOS Chromium. Browser version/OS/fonts affect rasterization; use the pinned Playwright browser on the same platform, or deliberately generate and review a separate platform baseline. Never blindly accept updates to make a failing visual test pass. Storybook must be rebuilt before its smoke suite, and the app must be rebuilt before E2E/visual suites.

## Recovery retention and explicit transfer states

Recovery records use a version-2 timestamped envelope. Details and unsubmitted reviews expire after 24 hours and are removed on identity cleanup. Legacy records migrate once with a new bounded retention window because their original age is unknown. Corrupt records or unsupported versions block replacement rather than silently losing a potentially submitted request.

Submitted/uncertain and terminal-conflict records retain their exact request/key beyond that window and across identity cleanup. This is an explicit remaining privacy limitation: their review snapshots still contain financial data in browser storage. A production backend needs durable status/reconciliation before these records can safely be removed; expiring them blindly can allow a duplicate payment. They restore only in their owner/mode scope, never submit automatically, and success clears the matching record.

The transfer composable models details, review, lock wait, submitting, uncertain, conflict and complete as an explicit state union. Session changes reset local form/receipt state synchronously and reject queued confirmations or late completions. Review/pre-submit persistence remains synchronous and must succeed before a new request is sent.
