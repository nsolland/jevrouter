#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {compareScoutWorkload} from './capacity-scout-adapter.mjs';

function flag(name) {
 const i=process.argv.indexOf(name);
 return i<0?null:process.argv[i+1]??null;
}
async function main() {
 const snapshotFile=flag('--scout'),workloadFile=flag('--workload');
 if (!snapshotFile || !workloadFile) throw new Error('usage: node scripts/compare-scout-capacity.mjs --scout snapshot.json --workload measured-workload.json [--out report.json]');
 const [snapshot,workload]=await Promise.all([snapshotFile,workloadFile].map(async p=>JSON.parse(await readFile(p,'utf8'))));
 const result=compareScoutWorkload(snapshot,workload);
 const payload=JSON.stringify(result,null,2)+'\n';
 const out=flag('--out');
 if (out) await writeFile(out,payload,{flag:'wx'});
 else process.stdout.write(payload);
 if (result.status==='abstain') process.exitCode=2;
}
main().catch(e=>{console.error('capacity-comparison: '+e.message);process.exitCode=1});
