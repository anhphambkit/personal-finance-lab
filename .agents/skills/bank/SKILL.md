---
name: bank
description: 'Develop features, fix bugs, design components, integrate APIs, or review and verify personal-finance-lab using its project rules and separated specialist agents. Use for the bank workflow; not generic banking advice.'
---

# Bank project workflow

Run the requested mode in the `personal-finance-lab` repository. Resolve the repository from the current workspace, not from another open IDE tab. Read root `AGENTS.md` and [workflow](../../../docs/workflow/README.md) first; then load only relevant role briefs and rule sources.

Invocation: `$bank <mode> <request>`. Modes: `feature` (default), `fix`, `ui`, `api`, `review`, `verify`, `plan`, `resume`. `/bank` is a repository prompt alias, not a built-in slash command. Preserve all text after the mode as user requirements. If scope is missing, ask what to build/review; do not invent a feature.

Act as coordinator. Use actual subagents for independent bounded work when the runtime supports them, with one responsibility and explicit file ownership each. Do not merely narrate fictitious agent runs. Follow the dependency graph and handoff protocol in the workflow. Use available concurrency; never change model, permissions or global settings to enable delegation. If delegation is unavailable, disclose that fact and execute sequentially with the same gates, identifying self-review as such.

For implementation modes, continue through integration, evidence-based QA, independent code/security review, scoped remediation and final report. `plan` stops at a reviewable plan; `review` reports findings without code changes; `verify` runs existing checks without fixing source or accepting new snapshots. `resume` reads the existing run record and revalidates the working tree before continuing.

User instructions override these conventions. Proceed with authorized reversible work; ask only for material missing requirements or actions needing separate authorization. Do not interpret a feature request as permission to deploy, merge, use live banking credentials or send real transactions.
