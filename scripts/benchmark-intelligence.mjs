#!/usr/bin/env node
/**
 * CPU-only benchmark of local compiled-candidate plumbing.
 * NEVER claims to benchmark a Jev neural model, a GPU, or remote ZeroGPU.
 */
import { performance } from "node:perf_hooks";
import {compileScenarios,decideCompiled} from "../dist/intelligence-compilation.js";
import {compileSequential,candidatesForJev} from "../dist/sequential-intelligence.js";
import {requestSequentialJevChoice} from "../dist/intelligence-jev-adapter.js";

const iterations=Number(process.argv[2]??10000);
if(!Number.isSafeInteger(iterations)||iterations<100||iterations>200000)throw Error("iterations must be 100..200000");
const evidence=[];
for(let i=0;i<50;i++){
 evidence.push({scenarioId:"a:"+i,state:"clear",action:"scan",reward:1,safe:true,partition:"train"});
 evidence.push({scenarioId:"b:"+i,state:"clear",action:"hold",reward:0.2,safe:true,partition:"train"});
}
const policy=compileScenarios(evidence);
const plan=compileSequential({states:["clear","blocked"],actions:["scan","hold"],horizon:3},(state,action)=>{
 const safe=!(state==="blocked"&&action==="scan");
 return [{nextState:state,reward:action==="scan"?1:0.2,safe,terminal:true}];
});
const mockedJev=async req=>({
 status:"choice",action:req.candidates[0].action,
 probabilities:Object.fromEntries(req.candidates.map((c,i)=>[c.action,i===0?1:0])),
 confidence:1
});
function metrics(data) {
 const xs=data.slice().sort((a,b)=>a-b);
 const pct=p=>xs[Math.min(xs.length-1,Math.ceil(p*xs.length)-1)];
 return {samples:xs.length,p50_ms:+pct(0.5).toFixed(6),p95_ms:+pct(0.95).toFixed(6),p99_ms:+pct(0.99).toFixed(6),mean_ms:+(xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(6)};
}
async function measure(fn) {
 for(let i=0;i<500;i++)await fn();
 const times=[];
 for(let i=0;i<iterations;i++){const start=performance.now();await fn();times.push(performance.now()-start);}
 return metrics(times);
}
const lookup=await measure(()=>decideCompiled(policy,"clear",["scan","hold"]));
const sequential=await measure(()=>candidatesForJev(plan,"clear",["scan","hold"]));
const simulatedJev=await measure(()=>requestSequentialJevChoice(plan,"clear",["scan","hold"],mockedJev));
console.log(JSON.stringify({
 benchmark:"intelligence-local-plumbing",
 environment:"node-cpu",network:false,modelInference:false,
 iterations,lookup,sequentialCandidates:sequential,mockedJevAdapter:simulatedJev,
 warning:"Mocked provider timings are NOT Jev model inference and NOT drone/edge latency"
},null,2));
