import { test } from "node:test";
import assert from "node:assert/strict";
import * as providerModule from "../src/provider.js";
import type { CapabilityManifest, JevRawResponse, JevRouteRequest } from "../src/types.js";

interface SparkProviderLike {
  readonly name: string;
  decide(request: JevRouteRequest): Promise<JevRawResponse>;
}

type SparkProviderConstructor = new (options?: {
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
}) => SparkProviderLike;

const candidates: CapabilityManifest[] = [
  { id: "tool.read", name: "Read", type: "mcp_tool", description: "Read data", risk: { level: "low" } },
  { id: "tool.write", name: "Write", type: "mcp_tool", description: "Write data", risk: { level: "medium" } },
];

test("SparkS1Provider uses the local Jev-compatible evaluate contract", async () => {
  const SparkS1Provider = (providerModule as unknown as { SparkS1Provider?: SparkProviderConstructor }).SparkS1Provider;
  assert.equal(typeof SparkS1Provider, "function", "provider must export SparkS1Provider");

  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(input);
    seenInit = init;
    return new Response(JSON.stringify({
      model: "spark-s1-4b-v3",
      answers: {
        tool: {
          type: "choice",
          choice: "tool.read",
          probabilities: { "tool.read": 0.9, "tool.write": 0.1 },
          confidence: 0.9,
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const provider = new SparkS1Provider();
    const raw = await provider.decide({ state: { request: "read the data" }, candidates });

    assert.equal(provider.name, "open-spark-jev:spark-s1-4b-v3");
    assert.equal(seenUrl, "http://127.0.0.1:8400/v1/evaluate");
    assert.equal(seenInit?.method, "POST");

    const headers = new Headers(seenInit?.headers);
    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("content-type"), "application/json");

    const body = JSON.parse(String(seenInit?.body)) as Record<string, unknown>;
    assert.deepEqual(body.state, { request: "read the data" });
    assert.equal(body.model, "spark-s1-4b-v3");
    assert.deepEqual(Object.keys(body.questions as Record<string, unknown>), ["tool"]);
    assert.deepEqual(
      Object.keys(((body.questions as Record<string, { criteria: Record<string, unknown> }>).tool.criteria)),
      ["tool.read", "tool.write"],
    );
    assert.deepEqual(raw.answers, {
      tool: {
        type: "choice",
        choice: "tool.read",
        probabilities: { "tool.read": 0.9, "tool.write": 0.1 },
        confidence: 0.9,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
