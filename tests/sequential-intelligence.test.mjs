import test from "node:test";
import assert from "node:assert/strict";
import {compileSequential,candidatesForJev} from "../dist/sequential-intelligence.js";
const spec={states:["base","target","lost"],actions:["fly","wait"],horizon:3,discount:1};
const model=(state,action)=>{
 if(state==="base"&&action==="fly")return [{nextState:"target",reward:2,safe:true},{nextState:"lost",reward:10,safe:false}];
 if(state==="base"&&action==="wait")return [{nextState:"base",reward:0,safe:true}];
 if(state==="target")return [{nextState:"target",reward:3,safe:true,terminal:true}];
 return [{nextState:"lost",reward:0,safe:false}];
};
test("unsafe branch cannot be averaged away; lost state abstains",()=>{
 const p=compileSequential(spec,model);
 assert.equal(p.states.base.candidates[0].action,"wait");
 assert.equal(p.states.base.candidates.some(x=>x.action==="fly"),false);
 assert.equal(p.states.lost.abstain,true);
 assert.deepEqual(candidatesForJev(p,"unknown",["wait"]),[]);
});
test("deterministic plans and runtime candidate filtering",()=>{
 const p=compileSequential(spec,model);
 assert.deepEqual(p,compileSequential(spec,model));
 assert.deepEqual(candidatesForJev(p,"base",["fly"]),[]);
 assert.equal(candidatesForJev(p,"target",["wait"])[0].action,"wait");
});
test("reject invalid transitions and enforce expansion budgets",()=>{
 assert.throws(()=>compileSequential({...spec,horizon:33},model),/invalid sequential spec/);
 assert.throws(()=>compileSequential({...spec,maxTransitions:1},model),/budget exceeded/);
 assert.throws(()=>compileSequential(spec,()=>[{nextState:"not-known",reward:1,safe:true}]),/invalid transition/);
 assert.throws(()=>compileSequential(spec,()=>[]),/missing transitions/);
});
test("long-term opportunity can outweigh immediate reward",()=>{
 const p=compileSequential({states:["start","gain"],actions:["invest","cash"],horizon:2,discount:1},(s,a)=>{
  if(s==="start"&&a==="invest")return [{nextState:"gain",reward:-1,safe:true}];
  if(s==="start")return [{nextState:"start",reward:0,safe:true,terminal:true}];
  return [{nextState:"gain",reward:a==="cash"?4:0,safe:true,terminal:true}];
 });
 assert.equal(p.states.start.candidates[0].action,"invest");
 assert.equal(p.states.start.candidates[0].value,3);
});
