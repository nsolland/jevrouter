#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { assessComputePortfolio, marketContext } from "./compute-market-signals.mjs";

function flag(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

export async function main() {
  const input = flag("--input");
  if (!input) throw new Error("usage: node scripts/compute-opportunity-assess.mjs --input candidates.json [--out report.json]");
  const document = JSON.parse(await readFile(input, "utf8"));
  const candidates = Array.isArray(document) ? document : document?.candidates;
  const report = {
    ...assessComputePortfolio(candidates),
    marketSignals: marketContext(),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const output = flag("--out");
  if (output) {
    await writeFile(output, serialized, { flag: "wx" });
    console.log(JSON.stringify({ file: output, opportunities: report.opportunities.length, execution: report.execution }));
  } else {
    console.log(serialized);
  }
}

if (process.argv[1]?.endsWith("compute-opportunity-assess.mjs")) {
  main().catch(error => {
    console.error(`compute-opportunity-assess: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
