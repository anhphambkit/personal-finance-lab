# Workflow test matrix

Read [project testing](../testing.md) for setup and actual boundaries. Use Node/npm from `package.json`; do not silently switch runtimes. Run build/test jobs sequentially when they share `.nuxt`, `.output`, `storybook-static` or report directories.

## Select by changed boundary

| Scope                            | Required evidence                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs/skills only                 | Changed-file Prettier, local links, skill validation for changed skills, `git diff --check`; no unrelated app rebuild                                                                                                         |
| Runtime code                     | Lint, formatting, links when docs change, targeted behavior tests during iteration; full Vitest + production build before handoff                                                                                             |
| Domain/use-case/repository/money | Runtime gates + relevant validation, atomicity, concurrency, rollback, idempotency/recovery tests; SSR/E2E when externally observable behavior changes                                                                        |
| Component/UI/page/style          | Runtime gates + component/default/slot tests appropriate to behavior; Storybook build/checks for stories or catalog components; app E2E and visual comparison for changed presentation; inspect light/dark and 390/768/1440px |
| API/Nitro/plugins/auth/config    | Runtime gates + schema/HTTP and BFF handler/adapter tests; add authenticated real-service E2E when server-rendered behavior changes                                                                                           |
| Full feature crossing layers     | All relevant rows, including SSR/E2E and Storybook/visual for changed UI                                                                                                                                                      |
| Dependency/toolchain/test config | Static gates, full Vitest/build and affected SSR/browser/Storybook suites; assess new dependencies and lockfile/advisories                                                                                                    |

A purely visual styling change need not invent unit tests; compare rendered behavior. Record skipped checks with a scope reason. An environment-blocked required check is `blocked`, not `skipped` or `passed`. In `verify`, run existing checks without editing source/baselines; `review` may run focused checks read-only when useful.

## Commands and prerequisites

```sh
npm run lint
npm run format:check
npm run check:links
npm run test -- --run
npm run build
npm run test:bff:service
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:e2e:built
npm run build-storybook
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:storybook
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npm run test:visual
git diff --check
```

`build` already runs typecheck; `npm run typecheck` is useful separately during iteration. `test:e2e:built` and `test:visual` require the current app build. `test:storybook` requires the current Storybook build. `test:all` runs Vitest/build/E2E but omits lint, format, links, Storybook and visual checks.

Install Chromium only when needed using the location documented in project testing. If using the default browser cache, omit `PLAYWRIGHT_BROWSERS_PATH` consistently. Visual baselines are macOS-specific; CI Chromium journeys do not imply macOS screenshot equality. Inspect intentional changes and matching environment before running `test:visual:update`; never regenerate baselines solely to silence failure.

For docs-only work use `npx --no-install prettier --check <changed-files>` to avoid conflating unrelated formatting. The link checker covers workflow instructions as well as existing reviewer docs. For skill frontmatter use the available skill-creator `quick_validate.py` against `.agents/skills/bank`, and inspect role routing/relative references as well; a schema check alone cannot prove agent behavior.

## Evidence record

For each check record exact command, exit code, what boundary it covers, relevant artifact path and limitations. Do not copy previous pass counts from verification docs. Keep screenshots/traces/reports under existing ignored output directories. Do not upload artifacts containing private data automatically.

A failed check leads to a scoped fix and rerun of affected checks. If a pre-existing failure is suspected, establish it without overwriting user changes; otherwise report uncertainty. Do not suppress tests/lint/security checks, enable retries to hide flakes, or change snapshots in verify-only mode.
