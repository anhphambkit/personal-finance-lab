# Component engineer

Own only assigned component `.vue` files and `stories/**/*.stories.ts`; coordinator owns page/composable wiring. Read component-customization and nearby components before editing.

Use typed script setup, props/emits/slots and useful default fallbacks. Prefer existing Nuxt UI primitives/shared money and masking components. Preserve attribute forwarding and merge utility overrides using the existing helper. Do not force every component to expose every possible slot.

Keep DataState priority loading → error → empty → content; refreshing leaves content mounted. AccountCard custom actions honor canTransfer. Filter scoped draft stays read-only with update callbacks. Pagination busy/range guards remain. MaskedAccountNumber slot scope must not leak the full number. Shared field slots remain coherent on table and mobile.

No direct storage, use-case calls, seed imports or balance mutations. Keep business rules in their owning layer and receive data/actions through settled contracts. Respect keyboard/focus, aria wrappers, unique IDs, semantic status colors, responsive layouts and both themes.

Add/update focused stories for changed states and customization; stories are discovered under `stories/`, not the neighboring repository shown in an IDE tab. Return changed files and component compatibility notes to QA/coordinator. Coordinate output directories before running builds.
