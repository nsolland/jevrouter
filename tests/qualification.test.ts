import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapabilityManifest, JevProvider, JevRawResponse } from "../src/types.js";
import { JustWorkAdapter } from "../src/justwork.js";

class RecordingProvider implements JevProvider {
  readonly name = "recording";
  seen: string[] = [];

  async decide(request: { candidates: CapabilityManifest[] }): Promise<JevRawResponse> {
    this.seen = request.candidates.map((candidate) => candidate.id);
    const choice = this.seen[0];
    if (!choice) throw new Error("expected at least one candidate");
    return {
      answers: {
        tool: {
          type: "choice",
          choice,
          probabilities: Object.fromEntries(this.seen.map((id, index) => [id, index === 0 ? 1 : 0])),
          confidence: 1,
        },
      },
    };
  }
}

function model(id: string, qualification?: Record<string, unknown>): CapabilityManifest {
  return {
    id,
    name: id,
    type: "model",
    description: id,
    risk: { level: "low" },
    metadata: qualification ? { qualification } : {},
  };
}

test("JustWork excludes models that lack measured qualification for the active task class", async () => {
  const provider = new RecordingProvider();
  const capabilities: CapabilityManifest[] = [
    model("model.qualified", {
      status: "qualified",
      task_classes: ["coding"],
      measured_utility: 0.82,
      evidence_source: "ori-eval/run-42",
    }),
    model("model.other-task", {
      status: "qualified",
      task_classes: ["research"],
      measured_utility: 0.91,
      evidence_source: "ori-eval/run-43",
    }),
    model("model.unqualified"),
    { id: "tool.search", name: "Search", type: "mcp_tool", description: "Search", risk: { level: "low" } },
  ];

  const adapter = new JustWorkAdapter(provider, capabilities, { min_confidence: 0 });
  await adapter.route({ request: "write code", task_class: "coding" });

  assert.deepEqual(provider.seen, ["model.qualified", "tool.search"]);
});

test("JustWork fails closed when a task class has no qualified model candidate", async () => {
  const provider = new RecordingProvider();
  const adapter = new JustWorkAdapter(provider, [model("model.unqualified")], { min_confidence: 0 });

  const result = await adapter.route({ request: "write code", task_class: "coding" });

  assert.equal(provider.seen.length, 0);
  assert.equal(result.route.status, "no_decision");
  assert.equal(result.route.decision.selected, null);
});

test("accepts finite harness benchmark evidence on a qualified model configuration", async () => {
  const provider = new RecordingProvider();
  const adapter = new JustWorkAdapter(provider, [
    model("model.harness-qualified", {
      status: "qualified",
      task_classes: ["coding"],
      evidence_source: "agentic-coding-harness-benchmarks/run-21",
      harness: "codex",
      repository: "owner/repo",
      quality: 0.91,
      cost: 0.42,
      latency_ms: 8200,
      compute: "standard",
    }),
  ], { min_confidence: 0 });

  await adapter.route({ request: "fix issue", task_class: "coding" });
  assert.deepEqual(provider.seen, ["model.harness-qualified"]);
});

test("rejects malformed benchmark metrics instead of admitting them", async () => {
  const provider = new RecordingProvider();
  const adapter = new JustWorkAdapter(provider, [
    model("model.bad-evidence", {
      status: "qualified",
      task_classes: ["coding"],
      evidence_source: "benchmark/run-bad",
      harness: "codex",
      quality: Number.NaN,
    }),
  ], { min_confidence: 0 });

  const result = await adapter.route({ request: "fix issue", task_class: "coding" });
  assert.equal(provider.seen.length, 0);
  assert.equal(result.route.status, "no_decision");
});
