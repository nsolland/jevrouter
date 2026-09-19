import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapabilityManifest, JevProvider, JevRawResponse } from "../src/types.js";

const capabilities: CapabilityManifest[] = [
  {
    id: "search.web",
    name: "Web search",
    type: "mcp_tool",
    description: "Search the public web",
    permissions: [],
    risk: { level: "low" },
  },
  {
    id: "deploy.prod",
    name: "Production deploy",
    type: "cli",
    description: "Deploy the current release to production",
    permissions: ["deploy"],
    risk: { level: "high" },
    policy: { requires_confirmation: true },
  },
];

class CountingProvider implements JevProvider {
  readonly name = "test";
  calls = 0;
  constructor(private readonly raw: JevRawResponse) {}
  async decide(): Promise<JevRawResponse> {
    this.calls += 1;
    return this.raw;
  }
}

async function loadAdapter(): Promise<any> {
  const modulePath: string = "../src/justwork.js";
  return import(modulePath);
}

test("JustWork uses an explicit deterministic capability before Jev and marks consequential work for the authority gate", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "deploy.prod", probabilities: { "search.web": 0.1, "deploy.prod": 0.9 }, confidence: 0.9 } },
  });
  const adapter = new JustWorkAdapter(provider, capabilities, { allowed_risk_levels: ["low", "high"] });

  const result = await adapter.route({ request: "search now", capability_id: "search.web", consequential: true });

  assert.equal(provider.calls, 0);
  assert.equal(result.source, "deterministic");
  assert.deepEqual(result.dispatch, {
    kind: "capability",
    capability_id: "search.web",
    requires_authority_gate: true,
    reason: null,
  });
});

test("JustWork policy-checks an explicit capability before dispatch", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "search.web", probabilities: { "search.web": 0.9, "deploy.prod": 0.1 }, confidence: 0.9 } },
  });
  const adapter = new JustWorkAdapter(provider, capabilities, { allowed_risk_levels: ["low", "high"] });

  const result = await adapter.route({ request: "deploy this", capability_id: "deploy.prod", actor_permissions: [] });

  assert.equal(provider.calls, 0);
  assert.equal(result.source, "deterministic");
  assert.equal(result.route.status, "no_decision");
  assert.equal(result.dispatch.kind, "reasoning_fallback");
  assert.match(result.dispatch.reason ?? "", /actor_missing_permissions:deploy/);
});

test("JustWork sends an ordinary high-confidence Jev selection directly to the capability", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "search.web", probabilities: { "search.web": 0.9, "deploy.prod": 0.1 }, confidence: 0.9 } },
  });
  const adapter = new JustWorkAdapter(provider, capabilities, { min_confidence: 0.55, allowed_risk_levels: ["low", "high"] });

  const result = await adapter.route({ request: "find the current release notes" });

  assert.equal(provider.calls, 1);
  assert.equal(result.source, "jev");
  assert.equal(result.dispatch.kind, "capability");
  assert.equal(result.dispatch.capability_id, "search.web");
  assert.equal(result.dispatch.requires_authority_gate, false);
});

test("JustWork sends Jev no_decision to the reasoning fallback", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "search.web", probabilities: { "search.web": 0.51, "deploy.prod": 0.49 }, confidence: 0.2 } },
  });
  const adapter = new JustWorkAdapter(provider, capabilities, { min_confidence: 0.55, allowed_risk_levels: ["low", "high"] });

  const result = await adapter.route({ request: "do the thing" });

  assert.equal(result.route.status, "no_decision");
  assert.equal(result.dispatch.kind, "reasoning_fallback");
  assert.equal(result.dispatch.capability_id, null);
});

test("JustWork keeps confirmation-required choices as human exceptions", async () => {
  const { JustWorkAdapter } = await loadAdapter();
  const provider = new CountingProvider({
    answers: { tool: { type: "choice", choice: "deploy.prod", probabilities: { "search.web": 0.1, "deploy.prod": 0.9 }, confidence: 0.9 } },
  });
  const adapter = new JustWorkAdapter(provider, capabilities, { min_confidence: 0.55, allowed_risk_levels: ["low", "high"] });

  const result = await adapter.route({ request: "deploy this", actor_permissions: ["deploy"], consequential: true });

  assert.equal(result.route.status, "needs_confirmation");
  assert.equal(result.dispatch.kind, "human_review");
  assert.equal(result.dispatch.capability_id, "deploy.prod");
  assert.equal(result.dispatch.requires_authority_gate, true);
});
