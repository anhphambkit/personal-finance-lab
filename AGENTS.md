# Project instructions

## Workflow commands

Use the repo skill [bank](.agents/skills/bank/SKILL.md) for the development workflow. Treat a user message starting with `/bank` as a prompt alias for `$bank`; this does not register a native slash-menu command. Supported modes and execution rules are in [workflow](docs/workflow/README.md).

For substantive feature/fix/UI/API work, follow the relevant workflow even when requested in natural language. Delegate independent bounded work to specialist subagents when available. Small changes may use a reduced set of roles; never manufacture parallel work. Review and security assessment must be independent of implementation when subagents are available. A subagent must not recursively delegate unless the coordinator assigns that explicitly.

## Sources of project rules

Read the applicable sources before editing:

- [Architecture](docs/architecture.md), [ADRs](docs/adr/001-feature-oriented-vue-architecture.md), and `eslint.config.js`: dependency boundaries.
- [Component customization](docs/component-customization.md): props, slots, callbacks and defaults.
- [Testing](docs/testing.md) and [enhancements](docs/enhancements.md): test boundaries and visual baseline policy.
- [Backend handoff](docs/nuxt-migration.md): demo/backend split and SSR integration.
- `package.json`, `.nvmrc`, `.storybook/main.ts`: actual commands/runtime/story discovery.

These are the recorded rules. Do not claim access to preferences from earlier conversations that are absent here. If documentation and code diverge, report the conflict and resolve within task scope, preserving explicit user intent.

## Implementation invariants

- Keep domain pure; contracts use type-only imports; use cases depend on domain/contracts/ports. UI calls the typed API boundary, never repositories, seed data or use cases directly. Follow lint restrictions without adding suppression to bypass them.
- Use Vue SFC TypeScript and existing Nuxt UI primitives, semantic theme tokens and shared formatting. Keep page composition, query orchestration and business logic in their existing layers. Avoid unnecessary abstractions and explicit `any`.
- Preserve typed component props/emits/scoped slots, working defaults, attribute forwarding and existing customization precedence. Use existing class merging for `ui` overrides. Add customization points when useful, not mechanically to every element.
- Retain loading/error/empty/content semantics, background refresh, accessible names, keyboard/focus behavior, masked account numbers, responsive layouts and light/dark support.
- Store monetary values as safe integer minor units, with existing bigint aggregation where applicable. Preserve ownership checks, atomic transfer/recipient persistence, idempotency, and explicit same-key recovery after uncertain outcomes.
- Keep secrets and private upstream URLs out of public runtime config, client bundles, SSR payloads and logs. Mock customer selection is not authentication. Production authorization belongs on the server.
- Match tests to the changed boundary; preserve existing assertions and test isolation. Stories belong under `stories/` as configured, not beside components unless discovery is deliberately changed.
- Never mark unrun checks as passed or silently regenerate visual baselines to make a failure disappear.

## Workspace discipline

Inspect `git status` before work. Preserve unrelated edits and untracked deliverables. Restrict write ownership per agent; the coordinator owns shared contracts/config until delegated explicitly. Do not reset, stash or overwrite another author's work. Use `codex/` for new branches unless requested otherwise.

Use Node/npm versions from the project. Do not install dependencies, edit lockfiles or reformat the whole repository just to make a documentation task pass. No automatic commit, push, merge or deploy unless requested. Keep existing product confirmation dialogs for transfers/reset.
