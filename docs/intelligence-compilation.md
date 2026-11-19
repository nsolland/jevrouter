# Intelligence compilation MVP (experimental)

Purpose: perform costly scenario analysis **before** deployment, distil its observations into a compact candidate policy, and let a real Jev provider make the typed final choice at runtime. This prototype does not train Jev.

**Pipeline:** domain-supplied world model -> seeded offline scenarios -> train/holdout evidence -> policy compilation -> Jev candidate request -> external authorization -> external actuation. There is no actuation in this module.

```ts
import { simulateScenarios, compileScenarios, requestCompiledJevChoice } from "jevrouter";
const evidence = simulateScenarios(
  {states:["clear","blocked"],actions:["scan","wait"],trialsPerAction:100,seed:7},
  ({state,action,random})=>({
    reward:(state==="clear" && action==="scan" ? 1 : action==="wait" ? 0.4 : -1) + 0.05*random(),
    safe:!(state==="blocked" && action==="scan")
  })
);
const artifact = compileScenarios(evidence,{minimumSupport:10,minimumMargin:0.05});
const jevProvider = async (request) => {
  // Integrate the real Jev choice API here. Do NOT fabricate probabilities.
  throw new Error("Jev provider must be configured");
};
const decision = await requestCompiledJevChoice(artifact,"clear",["scan","wait"],jevProvider);
// Decision is advice only. No physical action occurs.
```

`npm test` and `npm run typecheck` are expected validation commands, not verified passing in this PR.

## Boundaries and known limitations

- Current simulator supports independent one-step state/action samples, **not** sequential dynamics, partial observability, continuous trajectories, multi-agent coordination, or real drone physics.
- Synthetic world models produce synthetic evidence; do not treat success in simulation as empirical field success.
- The compilation algorithm learns a per-state reward ranking, **not** a neural policy or actual fine-tuned Jev weights.
- A minimum number of safe observations does not prove the action safe in operation; holdout metrics are only simple candidate-label agreement diagnostics and **not** causal performance or safety measures.
- Unknown states, unsafe-only evidence and missing trained winning actions abstain. Fail-safe execution policy and human intervention remain separate.
- Confidence on compiled candidates is only a heuristic reward margin, never calibrated model confidence. The Jev adapter preserves externally returned probabilities without recomputing them.
- Before physical deployments: sequential simulation, hazard models, calibrated uncertainty, OOD checks, stronger scenario coverage, independent holdouts, latency/energy profiling, signed immutable artifact deployment, runtime monitoring and hardware-in-loop validation.

## Observed transition adapter (experimental)

`compileEmpiricalWorldModel(observations,settings)` accepts caller-supplied discrete transition traces
`{scenarioId,state,action,nextState,reward,safe,terminal?,partition}`. It validates
domain membership, evidence integrity, partition labels and duplicate IDs. Only the
**train** partition supplies transitions to `compileSequential`; holdout contributes
descriptive outcome monitoring only. At runtime `requestSequentialJevChoice`
invokes the **external Jev decision model** for the final typed choice; neither the
world-model adapter nor the planner replaces Jev.

Conservative screening rejects state/action pairs with:
- insufficient train support;
- any observed unsafe transition;
- a one-sided Hoeffding screening bound above the configured risk threshold.

Unobserved actions produce an explicit unsafe sentinel, causing sequential planning to
exclude them. This is **not safety certification**: Hoeffding assumes independent
representative observations, which simulator traces or correlated field logs may not
provide. The bound does not protect against unmodeled states, adversarial shift,
partial observability, missing transitions, or simulator-to-reality gaps.
If the caller supplies synthetic traces, all evidence remains synthetic.

```ts
const world = compileEmpiricalWorldModel(traceRows, {
  states: ["base","target"], actions: ["inspect","hold"],
  minimumSupport: 50, maxRiskUpperBound: 0.25
});
const plan = compileSequential(
  {states:["base","target"],actions:["inspect","hold"],horizon:3},
  world.model
);
const choice = await requestSequentialJevChoice(
  plan, "base", ["inspect","hold"], actualJevProvider
);
```

This code produces **decision advice only**. No model deployment, physical motion,
tool execution, signed package, or external authorization is included.
Before field use: calibrated OOD/uncertainty measurement, independent real-world
datasets, temporal holdouts grouped by episode, bounded latency tests, hardware-in-loop,
runtime failsafe, and an authorization boundary.
