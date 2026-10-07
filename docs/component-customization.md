# Customizing banking components

The banking components expose typed props and scoped slots. Existing callers keep the same default UI; override only the region you need.

## DataState

Import from `src/shared/components/DataState.vue`.

The existing `loading`, `refreshing`, `error`, `empty`, `label`, `emptyMessage`, `skeleton` props and `retry` event remain supported. `skeleton` defaults to `generic`. State priority remains **loading → error → empty → content**. Refreshing decorates the content branch without replacing its children.

| Slot         | Scope                     | Default                                   |
| ------------ | ------------------------- | ----------------------------------------- |
| `loading`    | `{ label, skeleton }`     | BankingSkeleton with the selected variant |
| `error`      | `{ error, label, retry }` | Error message and retry button            |
| `empty`      | `{ label, message }`      | Empty heading and `emptyMessage`          |
| `refreshing` | `{ label }`               | Spinner and updating message              |
| `default`    | `{ refreshing }`          | Page content                              |

Calling the scoped `retry()` emits the existing `retry` event. Slots replace the contents of their region; DataState retains the loading/error/live-status wrappers and `aria-busy` attributes. Custom status content should still include meaningful text.

Use the page's query state and callbacks, for example:

```vue
<DataState
  :loading="isPending"
  :refreshing="isFetching && !isPending"
  :error="isError ? error : null"
  :empty="!accounts?.length"
  label="accounts"
  empty-message="No accounts to display."
  skeleton="accounts"
  :ui="{ error: 'p-4', empty: 'py-8' }"
  @retry="refetch()"
>
  <template #loading="{ label }">
    <p class="text-sm text-muted">Preparing your {{ label }}…</p>
  </template>
  <template #error="{ retry }">
    <p>Accounts could not be loaded.</p>
    <UButton class="mt-3" @click="retry">Load again</UButton>
  </template>
  <template #empty="{ message }">
    <p>{{ message }}</p>
    <UButton to="/" class="mt-3">Back to overview</UButton>
  </template>
  <template #default="{ refreshing }">
    <p v-if="refreshing" class="sr-only">Balances are being updated.</p>
    <AccountCard v-for="account in accounts" :key="account.id" :account="account" />
  </template>
</DataState>
```

`ui` accepts utility class strings for `root`, `loading`, `error`, `empty`, `content`, and `refreshing`. `root` is applied to whichever state is active; the state-specific classes are merged afterward. For example, `ui.error: 'p-4'` replaces the default `p-6` instead of leaving conflicting padding classes.

## AccountCard

Import from `src/features/accounts/components/AccountCard.vue`.

| Prop         | Type                              | Default               |
| ------------ | --------------------------------- | --------------------- |
| `account`    | `Account`                         | Required              |
| `appearance` | `auto \| navy \| indigo \| slate` | `auto`                |
| `brand`      | `string`                          | Empty string (hidden) |
| `transferTo` | Vue Router `RouteLocationRaw`     | `/transfer`           |
| `ui`         | Partial class map                 | Default region styles |

The default card omits the repeated bank name and places account type beside its status. Pass `brand` explicitly only when needed.

`auto` uses navy for checking, indigo for savings, and slate for frozen accounts. Choosing a different appearance changes only the visual treatment. The default status badge, availability message, and disabled transfer behavior still reflect `account.status`.

All four slots receive `{ account, canTransfer }`, updated reactively:

| Slot      | Replaces                                                          |
| --------- | ----------------------------------------------------------------- |
| `header`  | Account type and status badge (or optional brand and badge)       |
| `default` | Account details, balance, and masked number below the header      |
| `actions` | Transfer button, keeping the default availability message         |
| `footer`  | Entire footer content, including availability message and actions |

Overriding `footer` takes precedence over `actions`. If you provide custom transfer controls, bind their availability to `canTransfer`. Custom details should keep account numbers masked, using the existing `MaskedAccountNumber` component when needed.

For simple customization, no slot is necessary:

```vue
<AccountCard
  :account="account"
  brand="Business banking"
  appearance="navy"
  :transfer-to="{ path: '/transfer', query: { from: account.id } }"
  :ui="{ body: 'p-4 sm:p-5', footer: 'px-4 sm:px-5' }"
/>
```

`transferTo` controls the link destination only; handling its query parameters belongs to the destination page.

For custom actions, keep the default account details and availability message:

```vue
<AccountCard :account="account">
  <template #actions="{ account: currentAccount, canTransfer }">
    <div class="flex flex-wrap gap-2">
      <UButton :disabled="!canTransfer" @click="openTransfer(currentAccount)">
        Move money
      </UButton>
      <UButton color="neutral" @click="openDetails(currentAccount)">
        Details
      </UButton>
    </div>
  </template>
</AccountCard>
```

`openTransfer` and `openDetails` are handlers supplied by the consuming page. A custom action does not automatically navigate to `transferTo`; that prop configures the default button.

`ui` supports `root`, `body`, `header`, `footer`, and `actions`. Utility classes are merged using the existing Nuxt UI class-merging utility, including responsive variants. To change the card's built-in gradient, use `appearance`. Both components also forward ordinary root attributes such as `id`, `class`, and `data-*`.

## Other component slots

Every slot below has a fallback. Existing pages can keep their current component calls. Slot content is supplied by the consuming page; wrapper layout, default behavior, and domain calculations stay in the component unless explicitly replaced.

| Component                                      | Slots                                                                                                       | Scope / additional props                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccountSummary`                               | `total`, `active`, `frozen`                                                                                 | All receive `{ accounts, total, active, frozen }`; balances are `bigint` minor units.                                                        |
| `AccountStatusBadge`, `TransactionStatusBadge` | `default`, `leading`                                                                                        | Default receives `{ status, label }`; leading receives `{ status, icon }`. Props: `size`, `showIcon`. Semantic colors remain tied to status. |
| `MoneyDisplay`                                 | `default`                                                                                                   | `{ formatted, amountMinor, direction }`; formatting remains centralized.                                                                     |
| `MaskedAccountNumber`                          | `default`                                                                                                   | `{ masked }`, without the full account number in slot scope.                                                                                 |
| `BankingSkeleton`                              | `summary`, `account`, `transaction`, `block`                                                                | Repeated item slots receive `{ index }`, starting at zero. Props: `variant`, `count`, `showSummary`.                                         |
| `PagePlaceholder`                              | `title`, `description`, `actions`, `header`, `default`, `footer`                                            | Title/description/header receive their matching text prop; default receives `{ icon, message }`. Heading wrappers retain accessible IDs.     |
| `TransactionTable`                             | `description`, `date`, `account`, `type`, `status`, `amount`, `mobile-item`                                 | Field slots receive `{ transaction, account, layout }`; see below.                                                                           |
| `TransactionFilters`                           | `search`, `account`, `direction`, `type`, `status`, `dates`, `extra-fields`, `actions`, `error`             | Field slots receive `{ draft, update, busy }`; select slots also receive `items`.                                                            |
| `TransactionPagination`                        | `page-size`, `summary`, `controls`                                                                          | Scoped callbacks change the page or size; see below.                                                                                         |
| `RecentTransactions`                           | `header`, `actions`, `default`, `loading`, `error`, `empty`, `refreshing`, plus all transaction field slots | Props: `title`, `limit`, `viewAllTo`; renders `TransactionTable` in `recent` mode.                                                           |
| `ResetDemoButton`                              | `trigger`, `body`, `actions`, `success`                                                                     | Scoped callbacks open the confirmation dialog, confirm, or cancel.                                                                           |

### TransactionTable and RecentTransactions

Transaction field slots use the same API on desktop and mobile:

```ts
interface TransactionItemScope {
  transaction: Transaction
  account: Account | undefined
  layout: 'table' | 'mobile'
}
```

`account` may be absent while account data is unavailable. `mobile-item` replaces the entire mobile item, taking precedence over its individual field slots. Only fields displayed by the selected variant invoke their slots.

`TransactionTable` accepts:

- `variant`: `full` (default) or `recent`. Full mode shows the desktop table from `lg`; recent mode from `md`. Smaller viewports use the mobile list.
- `columns`: optional Nuxt UI `TableColumn<Transaction>[]` for desktop column order, visibility, headings, or cell render functions. This does not change the mobile layout; use field slots or `mobile-item` for that.
- `caption`: accessible table/list description.
- `ui`: merged utility classes for `root`, `table`, `list`, `item`, `th`, and `td`.

For example, reuse a custom amount display across both layouts:

```vue
<TransactionTable :transactions="transactions" :accounts="accounts">
  <template #amount="{ transaction, layout }">
    <MoneyDisplay
      :amount-minor="transaction.amountMinor"
      :direction="transaction.direction"
      :class="layout === 'mobile' ? 'font-bold' : 'font-semibold'"
    />
  </template>
</TransactionTable>
```

The same `#amount` slot works directly on `RecentTransactions`. It forwards supplied field slots to the shared table, including when the parent conditionally adds/removes a slot. Override the recent activity `default` slot to replace the entire transaction presentation instead; it receives `{ transactions, accounts, refreshing }`.

`RecentTransactions` defaults to five items; `limit` is normalized to an integer from 1 to 100. Changing it updates the query key and fetches the corresponding page size. Its `header` slot receives `{ title }` inside the existing heading. Data-state slots receive the same scopes as DataState, with `loading` exposing `label`.

```vue
<RecentTransactions :accounts="accounts" :limit="3" title="Latest payments">
  <template #status="{ transaction }">
    <TransactionStatusBadge :status="transaction.status">
      <template #default="{ label }">Payment: {{ label }}</template>
    </TransactionStatusBadge>
  </template>
</RecentTransactions>
```

### TransactionFilters

Field slots replace the contents of the existing responsive field wrappers. `extra-fields` appends content to the field grid. `draft` is typed as read-only; call `update(patch)` to modify supported filters. New filter keys still require extending the filter contract and API schema.

`actions` also receives `apply()` and `clear()`. `apply()` runs the existing validation and is ignored while busy. `clear()` clears local edits and emits the existing `clear` event. The `error` slot receives `{ message }` inside the existing alert.

```vue
<TransactionFilters
  :filters="filters"
  :accounts="accounts"
  :busy="isFetching"
  @apply="applyFilters"
  @clear="clearFilters"
>
  <template #search="{ draft, update }">
    <label for="custom-transaction-search">Find a payment</label>
    <UInput
      id="custom-transaction-search"
      :model-value="draft.query"
      @update:model-value="update({ query: String($event) })"
    />
  </template>
  <template #actions="{ busy, apply, clear }">
    <UButton type="button" :loading="busy" @click="apply">Search</UButton>
    <UButton type="button" variant="ghost" @click="clear">Reset filters</UButton>
  </template>
</TransactionFilters>
```

`idPrefix` defaults to `transaction`. Supply distinct prefixes if rendering multiple default filter forms on one page; give custom controls their own unique IDs and labels as well.

### TransactionPagination

All slots receive `{ pagination, busy }`:

- `page-size` additionally receives `{ sizes, setPageSize }`.
- `controls` additionally receives `{ canPrevious, canNext, setPage }`.
- `summary` can replace the page-count text.

`setPage` rejects busy, fractional, unchanged, or out-of-range requests. `setPageSize` accepts only the configured choices and is ignored while busy or unchanged. These callbacks emit the existing `page` and `pageSize` events; the consuming page owns query state.

`pageSizes` defaults to `[10, 20, 50, 100]`; the current size is included, duplicates are removed, and choices are limited to positive integers up to the API maximum of 100. `selectId` defaults to `transaction-page-size`; override it for multiple instances.

```vue
<TransactionPagination
  :pagination="pagination"
  :busy="isFetching"
  @page="setPage"
  @page-size="setPageSize"
>
  <template #controls="{ pagination: current, canNext, setPage: goToPage }">
    <UButton :disabled="!canNext" @click="goToPage(current.page + 1)">More results</UButton>
  </template>
</TransactionPagination>
```

### ResetDemoButton

- `trigger`: `{ open, disabled }`. Call `open()` to prepare and display the confirmation dialog.
- `body`: `{ pending, error }`; `error` is a boolean. Custom content should present failures when it is true.
- `actions`: `{ pending, confirm, cancel }`. Confirmation remains required before the reset mutation can run. Confirm/cancel callbacks reject calls while pending; confirm also requires an open dialog and ready demo services.
- `success`: replaces the completion text inside the live-status wrapper.

```vue
<ResetDemoButton>
  <template #trigger="{ open, disabled }">
    <UButton :disabled="disabled" @click="open">Restore sample data</UButton>
  </template>
</ResetDemoButton>
```

No reset runs merely by opening the dialog. The component stays hidden outside demo mode.

### Skeleton and formatted values

`BankingSkeleton.count` controls the repeated items, with defaults of three accounts, five transaction rows, or two generic blocks. Explicit counts are normalized to integers from 0 to 100. `showSummary` affects only the account summary placeholder. Custom skeleton content remains inside an `aria-hidden` wrapper.

```vue
<BankingSkeleton variant="transactions" :count="3">
  <template #transaction="{ index }">
    <USkeleton class="bank-skeleton h-10" :class="index === 0 ? 'w-48' : 'w-32'" />
  </template>
</BankingSkeleton>

<MaskedAccountNumber :account-number="account.accountNumber">
  <template #default="{ masked }">Account {{ masked }}</template>
</MaskedAccountNumber>
```

## SpendingDashboard

Import from `src/features/insights/components/SpendingDashboard.vue`. The required `insight` prop uses `SpendingInsight` from `src/domain/spending/spendingInsight.ts`; monetary totals are nonnegative decimal strings in minor units, formatted exactly through `MoneyDisplay`. Optional `ui` overrides merge classes for `root`, `summary`, `trend` and `breakdown`; ordinary root attributes are forwarded.

The `summary`, `trend` and `breakdown` slots each receive `{ insight }` with working default content. Trend and breakdown retain their section headings when overridden. Custom summary content should provide an appropriate heading and exact amount/count. Custom charts should retain accessible text values; the default trend pairs decorative bars with a visible monthly amounts list. The accounting-scope explanation remains outside the slots.

This component only renders supplied data. Query loading/error/retry, URL filters and API ownership checks belong to the page/composables/loader. It does not fetch, mutate banking state or infer categories.
