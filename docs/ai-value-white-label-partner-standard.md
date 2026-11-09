# AI Value & Spend Management — White-label partner delivery standard (v0.1)

## Product ownership
The integrator is the customer-facing vendor. Its own brand, domain, contracts, prices, support and customer reports are the default. The engine supplier is not a required customer-facing brand. Customer data belongs to the customer under applicable agreements. Partner and customer access are separately scoped.

## Delivery method
1. **Discover** — map AI providers, invoices, licences, gateways, shadow AI, users, agents, business processes and data flows. Record collection coverage and missing sources.
2. **Baseline** — establish comparable period, currency, usage units, invoice adjustments, labour baseline, review costs, quality and task outcomes. Avoid mixing currency or double counting bundled usage.
3. **Measure** — collect read-only invoice lines and telemetry; join on customer, provider, billing period and workflow. Reconcile unmatched spend explicitly.
4. **Understand** — classify prompt intent and task; keep original request, proposed refinement and model decision separate. Never infer completed work from a prompt alone.
5. **Optimize** — compare baseline vs proposed routing and refinement on matched tasks; measure acceptance, errors, latency, cost per accepted task and human review.
6. **Validate** — link results to customer-owned business records. Separate correlated benefits from causally attributable savings; report sample sizes and uncertainty.
7. **Assure** — produce partner-branded CFO report, policy, privacy assessment, exceptions, evidence register and monitoring plan.

## Required deliverables
- Source coverage and spend reconciliation with unmatched amount.
- Model and workflow unit economics, with accepted-task denominator.
- Prompt optimization evaluation including failures, not only successes.
- AI usage policy: allowed purposes, roles, data classes, providers, model tiers, budgets, escalation and exception handling.
- CFO and board report with baseline, intervention, observed outcomes, costs, confidence and limitations.
- Privacy and data protection annex: roles, data flow, lawful basis, minimization, retention, deletion, subprocessor list, transfers, security, DPIA screening and incident process.
- Partner-branded implementation and support runbook.

## GDPR gate
Do not assume that a legal basis field proves GDPR compliance. Determine controller/processor roles per activity and contractual arrangement. Avoid collecting raw prompts by default. Pseudonymized identifiers remain personal data where re-identification is possible. Require a documented legal review of necessity, transparency, employment context, special categories, transfer mechanisms and DPIA triggers before production collection. Provide deletion and subject-rights processes in the operational product, not just flags in a report.

## Pilot acceptance (synthetic data only until controls exist)
- One partner, two customers, separate reports and rejected cross-tenant input.
- Two source types: invoice and metered usage.
- Reconciliation and explicit unallocated/unmatched spend.
- Pre-prompt decision and no implicit execution.
- Evidence-linked outcome, never reported as causal ROI without appropriate study design.
- Reproducible local build, typecheck and tests.
- No live customer data, provider keys or claims of production readiness.

## Build-versus-adopt
- Gateway: LiteLLM / Portkey / Bifrost as optional adapters.
- Observability: OpenTelemetry / OpenLIT / Langfuse / Opik as optional adapters.
- Evaluation: Promptfoo / MLflow benchmark methods.
- Routing: benchmark JevRouter against vLLM Semantic Router on identical labelled tasks.
- Differentiation: partner delivery method, business outcome attribution, customer-specific improvement program and evidence-backed reports.
- Review each component's current licence, distribution conditions and SaaS terms before embedding it in a white-label package.

## Commercial validation
Interview partner practice leads and delivery owners; test demand for OEM licensing versus referral/resale versus managed-service licensing. Validate procurement, support ownership, margins, data-residency constraints, branding and customer contracts. Do not assume named integrators are partners without evidence.
