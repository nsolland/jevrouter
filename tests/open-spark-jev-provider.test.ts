import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenSparkJevProvider } from "../src/provider.js";
import { createProvider, providerConfiguration } from "../src/runtime.js";
import type { CapabilityManifest } from "../src/types.js";

const candidates: CapabilityManifest[] = [
  { id: "read", name: "Read", type: "mcp_tool", description: "Read records" },
  { id: "write", name: "Write", type: "mcp_tool", description: "Write records" },
];

test("OpenSparkJevProvider sends the Jev-compatible wire format to the local evaluator", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(input);
    seenInit = init;
    return new Response(JSON.stringify({
      model: "spark-s1-4b-v3",
      answers: {
        tool: {
          type: "choice",
          choice: "read",
          probabilities: { read: 0.92, write: 0.08 },
          confidence: 0.92,
        },
      },
      usage: { input_tokens: 12, output_tokens: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const provider = new OpenSparkJevProvider({
    endpoint: "http://127.0.0.1:8400/v1/evaluate",
    model: "spark-s1-4b-v3",
  });
  const raw = await provider.decide({
    state: { request: "read the records" },
    candidates,
    questions: { tool: { type: "choice" } },
  });

  assert.equal(provider.name, "open-spark-jev:spark-s1-4b-v3");
  assert.equal(seenUrl, "http://127.0.0.1:8400/v1/evaluate");
  assert.equal(seenInit?.method, "POST");
  const headers = new Headers(seenInit?.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.has("authorization"), false);
  assert.deepEqual(JSON.parse(String(seenInit?.body)), {
    state: { request: "read the records" },
    model: "spark-s1-4b-v3",
    questions: {
      tool: {
        type: "choice",
        instructions: "Which single capability should handle this request? Choose only from the supplied options.",
        criteria: {
          read: "Read: Read records [type=mcp_tool]",
          write: "Write: Write records [type=mcp_tool]",
        },
      },
    },
  });
  assert.equal(raw.model, "spark-s1-4b-v3");
});

test("open-spark-jev runtime selection does not require a hosted API key", () => {
  assert.deepEqual(providerConfiguration("open-spark-jev", {}), { provider: "open-spark-jev", key: null });
  const provider = createProvider("open-spark-jev", {
    endpoint: "http://127.0.0.1:8400/v1/evaluate",
    model: "spark-s1-1.7b-v3",
  });
  assert.equal(provider.name, "open-spark-jev:spark-s1-1.7b-v3");
});
