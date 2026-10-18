# JevAgentHarness 2610.21412: what JevRouter should test

Source: https://arxiv.org/abs/2610.21412v1 (2026-10-15).
This document is a research integration note, not a claim of reproduced results.

JevRouter already supplies typed Jev routing, risk/permission filtering, fallbacks, and receipts. It does not establish task-level success by itself.

The paper motivates these test requirements:
1. Compare single-model, rules, JevRouter and EXUP on the *same* held-out tasks.
2. Record independent verified outcomes, including runs after agent errors.
3. Count full-run cost (including retries and failures), latency, cache hits and model switches.
4. Record wrong/unauthorized effects separately; zero such events in a test is not a safety proof.
5. Preserve decision probabilities, but never confuse confidence with authorization or task completion.
6. Evaluate under distribution shift; include delayed/failed tools and changed states.
7. Shadow mode first; neither Jev nor JevRouter policy is a substitute for HEIMEL's independent effect authorization.

The SDK's `summarizeOutcomes` and `requirePairedTasks` in `src/outcome-eval.ts`
provide a non-executing outcome-analysis primitive. A verifier ID identifies the
verification source; callers must actually verify the result independently.
For zero successful tasks, cost per success is null, not zero.

Commercial deployment of external model weights or training data requires separate license review.
The research harness itself is not bundled into this repository.
