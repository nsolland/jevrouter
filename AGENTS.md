# AGENTS.md — JevRouter

## GLOBAL HARD RULE — NO GITHUB ACTIONS / NO GITHUB CI (2026-11-01)

This rule is a standing decision by Njål Solland, not a task-level preference. GitHub is for versioning, PRs, issues, reviews and provenance **only**. Never create, modify, activate, wait for, repair or recommend GitHub Actions workflows for scheduling, CI, tests, deployment, Compute Scout ingestion or any other automation. Generic instructions such as "go", "build", "automate", "fix" or "merge" are not exemptions. Only an explicit instruction from Njål that changes this specific rule permits an exception.

Reuse the actual established compute/runtimes: Hermes/agent runtime, approved Cloudflare Workers cron, Alibaba/local machines or the project's existing scheduler. Inspect before creating another runtime. Run tests in an approved execution environment. Automate repeatable steps with observable checkpoints and verified persistent data, without shifting routine CLI work or credential management to Njål. If a particular entitlement is absent, report the precise unavailable capability without fabricating a successful integration.

## Compute Scout / Solland's Paradox

Supplier API observations are read-only evidence. Keep `ComputeMarketSnapshot` separate from calibrated `ComputeSnapshot`. Solland's Paradox has two distinct demand arms: compute-demand reproduction `R_S=bpc` and regional capacity attraction measured by `eta_r` and `mu_r`; Jevons may amplify but does not define the paradox. Supplier offers and token prices are not proof of global available capacity. No automatic reservation, purchase or deployment without independent authorization.
