#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createProvider, evaluateChoiceHoldout, validateChoiceHoldout } from "../dist/index.js";

const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};

async function main() {
  const datasetPath = value("--dataset");
  const providerNames = value("--providers")?.split(",").map(s => s.trim());
  if (!args.includes("--live") || !datasetPath || !providerNames?.length || providerNames.some(p => !["zuse", "typesafe", "openrouter", "open-spark-jev"].includes(p))) {
    throw new Error("Requires --live --dataset <frozen.jsonl> --providers zuse,typesafe; live calls may transmit case data and incur charges");
  }
  if (new Set(providerNames).size !== providerNames.length || providerNames.length < 2) {
    throw new Error("At least two distinct provider arms are required");
  }
  const content = await readFile(datasetPath, "utf8");
  const cases = content.split(/\r?\n/).filter(s => s.trim()).map(line => JSON.parse(line));
  validateChoiceHoldout(cases, 200);
  // Resolve *every* credential before the first external request.
  const providers = providerNames.map(name => createProvider(name, { cache: false }));
  const results = [];
  for (const provider of providers) results.push(await evaluateChoiceHoldout(cases, provider));
  console.log(JSON.stringify({
    assessment: "typed_classification_only_not_execution_authority",
    holdout_minimum_met: true,
    arms: results,
    note: "Vendor prices and usage-cost information are not validated here. No cost-per-accepted-decision claim is made.",
  }, null, 2));
}

main().catch(error => {
  console.error(`typed-decision comparison: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
