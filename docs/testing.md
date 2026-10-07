# Testing strategy

The project is mock-only. Tests cover the same browser flow shipped to reviewers; no backend fixture, credentials or mode environment variables are required.

## Commands

| Command                                             | Boundary                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `npm run test -- --run`                             | Domain, use cases, API adapter, persistence and Vue components    |
| `npm run build`                                     | Typecheck plus production Nuxt/Nitro build                        |
| `npm run test:e2e`                                  | Build, then run Chromium against browser MSW and native IndexedDB |
| `npm run test:e2e:built`                            | Run Chromium against the existing production build                |
| `npm run build-storybook && npm run test:storybook` | Component catalog smoke checks                                    |
| `npm run test:visual`                               | macOS visual comparison using the committed baselines             |

The Playwright environment starts only the built Nuxt process on a dynamically allocated loopback port. It passes no mock/backend mode override; this verifies that `npm start` works as the shipped browser demo. Each test gets a new browser context, isolating Service Workers and IndexedDB.

## Boundaries

| Suite             | Request path                                                     | What it proves                                              |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Vitest HTTP       | API client → Node MSW → handlers → use cases → fake IndexedDB    | Contracts, errors, validation and deterministic persistence |
| Component         | Vue/Nuxt UI → Vue Query → Node MSW                               | Loading/error/empty/content and user interactions           |
| Browser           | Browser fetch → Service Worker MSW → handlers → native IndexedDB | Startup, hydration, navigation, persistence and reset       |
| Nitro fail-closed | Direct server `/api/*` request                                   | Browser-only data is never proxied to an arbitrary upstream |

Browser tests must use the application's Service Worker rather than Playwright route mocks. All tests fail on uncaught page errors or hydration mismatch logs. Failure screenshots, traces and reports are written to ignored test-output directories.

Visual baselines are platform-specific. Compare them only with the documented macOS Chromium environment, inspect every changed image in light and dark themes, and never regenerate snapshots merely to silence a failure.

## Future real-backend testing

Adding a real backend is a separate architecture change. It needs authenticated contract tests, isolated test identities and data, CSRF/session coverage, runtime response validation, authorization checks and server-side idempotency tests. Passing the current mock suite does not prove a future bank API is compatible or secure.

## Spending insights

Domain and loader suites verify exact totals, six-month UTC windows, exclusions, pagination completeness/limits, account scope and abort handling. UI tests cover component customization, comparisons, URL state, unchanged-URL reset and error recovery. The browser suite exercises responsive filters, reload/Back and invalid-link recovery. Visual tests include the page in both themes.
