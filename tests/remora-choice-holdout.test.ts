import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateChoiceHoldout } from "../src/typed-decision-eval.js";

test("REMORA adapter excludes unlabeled and duplicate clusters, without leaking gold route to state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jev-remora-"));
  try {
    const src = join(dir, "source.jsonl");
    const out = join(dir, "holdout.jsonl");
    const base = { id: "one", cluster_id: "cluster-1", source_dataset: "tau2",
      route: "accept", user_task: "Open the case", available_tools: ["lookup"],
      proposed_tool_name: "lookup", proposed_tool_args: { case: 1 } };
    await writeFile(src, [
      JSON.stringify(base),
      JSON.stringify({ ...base, id: "dup", route: "escalate" }),
      JSON.stringify({ ...base, id: "unknown", cluster_id: "cluster-2", route: null }),
      JSON.stringify({ ...base, id: "two", cluster_id: "cluster-3", route: "verify" }),
    ].join("\n") + "\n");
    const args = ["scripts/remora-choice-holdout.mjs", "--source", src, "--output", out, "--min", "2"];
    const run = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const cases = (await readFile(out, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(cases.length, 2);
    assert.deepEqual(cases.map(c => c.expected), ["accept", "verify"]);
    assert.doesNotThrow(() => validateChoiceHoldout(cases, 2));
    for (const item of cases) assert.equal(JSON.stringify(item.state).includes('"route"'), false);
    const repeat = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.notEqual(repeat.status, 0, "must not overwrite a frozen holdout");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
