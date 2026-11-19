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

## Optional ZeroGPU d1.1 decision provider

ZeroGPU documents POST https://api.zerogpu.ai/v1/systemone as a native typed decision endpoint. The x-project-id header is optional. `createZeroGpuCompilationDecisionProvider` connects this endpoint through the existing `HttpJevProvider`, preserving external Jev choice semantics and abstention on failures. Pass `process.env.ZGPU_API_KEY ?? process.env.ZEROGPU_API_KEY` as apiKey at runtime; never store the key in code.

Example: `const provider = createZeroGpuCompilationDecisionProvider({apiKey: process.env.ZGPU_API_KEY ?? ""}); const choice = await requestSequentialJevChoice(plan,"base",["inspect","hold"],provider);`

This is remote decision inference, not edge/offline execution. The older 403 response from GET /v1/models does not by itself establish whether POST /v1/systemone accepts the key. A live authenticated decision is still unverified. Locally on Acer at 91af93d, `npm run typecheck` and `npm test` passed (238/238, 0 failed), with mock HTTP transport for the ZeroGPU tests.

## Reproducible local CPU latency benchmark (Acer)

Run `npm run build && node scripts/benchmark-intelligence.mjs 5000` (Node 22). Benchmark measures pure compiled lookup, sequential candidate filtering, and a **mocked** Jev adapter. It does not invoke ZeroGPU or a real Jev decision model. Recorded on Acer (2026-11-19), 5000 samples each:

| Path | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|
| `decideCompiled` | 0.002204 | 0.005912 | 0.012543 |
| `candidatesForJev` | 0.002334 | 0.003617 | 0.007063 |
| `requestSequentialJevChoice` with mocked provider | 0.023564 | 0.041669 | 0.107083 |

`npm run typecheck`: PASS; `npm test`: 238/238 PASS. CPU-level timings can change with host load, JIT, GC and hardware. No physical edge latency, live d1.1 inference or safety claim is established. No systemone command exists in the installed Hermes ZeroGPU lean CLI; its earlier working `llama-3.1-8b-instruct-fast` chat call is a distinct endpoint.

## Actual small learned CPU policy prototype (Acer, experimental)

Added `scripts/train_compact_student.py` (offline scikit-learn MLP training), `scripts/compact_student_runtime.py` (dependency-free portable Python inference) and `scripts/test_compact_student.py` (two integrity and no-decision tests). The student is a 5-feature → 16 ReLU → 3-action model, trained from a **synthetic rule-based teacher**, not Jev, real flight logs or ZeroGPU. An offline trained policy is only advisory; Jev remains the separate final decision model in the architecture, and safety-critical control must remain external.

Reproducible Acer command: `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 PYTHONDONTWRITEBYTECODE=1 python3 scripts/train_compact_student.py --epochs 60 --train-count 4500 --test-count 1500 --artifact /tmp/intcomp-student-v1.json`.

Observed at SHA `6fe989507bf81af65ea4bd124515b7145421b839`: 2/2 Python tests, 238/238 Node tests and TypeScript typecheck all passed. Learned portable artifact: 3,396 bytes, digest `8da1a6bb8f714e9d0fef27ee5d440f4fca961b86c201826e9085177a634333f9`. Training had 2,936 in-scope synthetic observations and a separate 992-observation in-scope synthetic holdout: raw accuracy 90.73%; selective accuracy among 749 accepted decisions 97.60%; selective coverage 75.50%. Another 500-observation timing probe showed p50 0.0833 ms, p95 0.1133 ms, p99 0.2041 ms in pure Python CPU. Do not equate these numbers with Jev inference latency, autonomous safety, calibration, flight hardware performance, or generalization. Training reached 60 maximum iterations before full convergence; accuracy and latency are benchmark observations only. The earlier PyTorch attempt failed under Acer resource pressure with bus error; CPU sklearn training completed.

The exported artifact is local under `/tmp`, **not shipped with repository and not deployed**. For production evaluation, use independent real-world episode-grouped holdouts, OOD checks, a domain safety mechanism, power/thermal profiling and physical hardware-in-loop tests. No real-world physical model or local Jev weights were available in this run.

## Portable synthetic student: correction and independent runtime verification (2026-11-19)

A learned **synthetic** 5→16→3 MLP student has been saved as
`examples/intelligence/synthetic-student-v1.json` (3,396 bytes, file SHA-256
`5b50ada87490bce30fc4ddceccfaf362555c57e9c8795d1bc3b240a23066752c`).
It is research-only and contains no Jev weights or flight observations.
The model is not a substitute for Jev: it proposes an advisory action and is
subject to separate domain and execution checks.

An independent seeded 20,000-case synthetic probe found **259**
hazard-incompatible `inspect` suggestions among 9,560 accepted choices before
the correction. Adding a **separate** observation-based synthetic-domain
eligibility screen reduced this to **0 out of 9,301 accepted** under that
same probe; the screen abstains when incompatible with its toy teacher rules.
This does not prove the absence of failures under new scenarios or real-world
flight safety. Softmax confidence remains uncalibrated; numeric overflow now
also triggers `no_decision`.

The identical model JSON was copied to a separate Mac worker and loaded with
stdlib-only Python code without numpy, scikit-learn, training libraries or
network inference. SHA-256 matched. On Acer at commit `d3beaf0`: 6/6 compact
student Python tests, 238/238 Node tests and TypeScript typecheck passed.
The original Acer working branch was restored.

Reproduce with:
```sh
python3 -m unittest discover -s scripts -p 'test_compact_student.py'
python3 scripts/benchmark_compact_student.py \
  --artifact examples/intelligence/synthetic-student-v1.json \
  --samples 5000 --repetitions 3
```

On the Mac worker, 3 × 5,000 real student-inference trials after warm-up
returned 2,330 choices and 2,670 abstentions per trial; zero conflicts with
the same **synthetic** rule. The p50 was 0.126–0.133 ms, but p99 ranged
**4.26–17.84 ms**, with a maximum above 69 ms. Tail latency on this loaded
virtual worker is therefore **not bounded** to a real-time deadline.
Measurements exclude sensors, data preprocessing outside the model,
actuation, an actual Jev inference call, and drone hardware. The attached
model is an inspectable prototype, not a qualified deployment package,
cryptographically authenticated supply-chain artifact or certified model.
