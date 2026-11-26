import test from "node:test";
import assert from "node:assert/strict";
import {compileEmpiricalWorldModel} from "../dist/empirical-world-model.js";
import {compileSequential,candidatesForJev} from "../dist/sequential-intelligence.js";
const settings={states:["base","target"],actions:["inspect","hold"],minimumSupport:8,maxRiskUpperBound:0.5};
function fixture(){
 const rows=[];
 for(const state of settings.states)for(const action of settings.actions){
  for(let n=0;n<12;n++){
   rows.push({scenarioId:`${state}:${action}:${n}`,state,action,nextState:action==="inspect"?"target":state,
    reward:action==="inspect"?2:0,safe:!(state==="base"&&action==="inspect"&&n===0),
    partition:n<10?"train":"holdout",terminal:state==="target"});
  }
 }
 return rows;
}
test("evidence adapter excludes observed hazardous actions",()=>{
 const x=compileEmpiricalWorldModel(fixture(),settings);
 assert.equal(x.report.acceptedPairs,3);
 assert.equal(x.report.holdoutObservations,8);
 const p=compileSequential({states:settings.states,actions:settings.actions,horizon:2},x.model);
 assert.deepEqual(candidatesForJev(p,"base",["inspect","hold"]).map(x=>x.action),["hold"]);
});
test("unsupported actions fail closed and never become candidates",()=>{
 const x=compileEmpiricalWorldModel(fixture().filter(x=>!(x.state==="base"&&x.action==="hold"&&x.partition==="train")),settings);
 assert.equal(x.model("base","hold")[0].safe,false);
 const p=compileSequential({states:settings.states,actions:settings.actions,horizon:2},x.model);
 assert.equal(p.states.base.abstain,true);
});
test("holdout does not contaminate training",()=>{
 const a=compileEmpiricalWorldModel(fixture(),settings);
 const b=compileEmpiricalWorldModel(fixture().map(x=>x.partition==="holdout"?{...x,reward:999,safe:false}:x),settings);
 for(const state of settings.states)for(const action of settings.actions)assert.deepEqual(a.model(state,action),b.model(state,action));
 assert.notEqual(a.report.holdoutUnsafeRate,b.report.holdoutUnsafeRate);
});
test("invalid evidence and insufficient coverage reject",()=>{
 assert.throws(()=>compileEmpiricalWorldModel([...fixture(),fixture()[0]],settings),/duplicate/);
 assert.throws(()=>compileEmpiricalWorldModel(fixture(),{...settings,delta:1}),/invalid empirical/);
 const x=compileEmpiricalWorldModel(fixture(),{...settings,minimumSupport:20});
 assert.equal(x.report.acceptedPairs,0);
 assert.throws(()=>x.model("other","hold"),/out of domain/);
});
