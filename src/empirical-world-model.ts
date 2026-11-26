/**
 * Evidence-backed discrete transition adapter for offline sequential planning.
 * Observed transitions do not establish real-world safety or causality.
 * No runtime actuation, training, authorization or Jev decision is performed here.
 */
import type {Transition,TransitionModel} from "./sequential-intelligence.js";
export type TransitionObservation = {
  scenarioId:string; state:string; action:string; nextState:string;
  reward:number; safe:boolean; terminal?:boolean; partition:"train"|"holdout";
};
export type EmpiricalSettings = {
  states:readonly string[]; actions:readonly string[];
  minimumSupport:number; maxRiskUpperBound:number; delta?:number;
};
export type EmpiricalReport = {
  observedPairs:number; acceptedPairs:number; rejectedPairs:number;
  trainObservations:number; holdoutObservations:number;
  coverage:number; holdoutUnsafeRate:number|null;
};
export type EmpiricalModel = {model:TransitionModel;report:EmpiricalReport};
function validName(s:unknown):s is string{return typeof s==="string"&&s.trim().length>0;}
function key(state:string,action:string){return JSON.stringify([state,action]);}
export function compileEmpiricalWorldModel(
  observations:readonly TransitionObservation[],settings:EmpiricalSettings
):EmpiricalModel {
 const {states,actions,minimumSupport,maxRiskUpperBound}=settings,delta=settings.delta??0.05;
 if(!Array.isArray(observations)||!Array.isArray(states)||!Array.isArray(actions)||
  !states.length||!actions.length||[...states,...actions].some(x=>!validName(x))||
  new Set(states).size!==states.length||new Set(actions).size!==actions.length||
  !Number.isSafeInteger(minimumSupport)||minimumSupport<1||
  !Number.isFinite(maxRiskUpperBound)||maxRiskUpperBound<=0||maxRiskUpperBound>=1||
  !Number.isFinite(delta)||delta<=0||delta>=1||observations.length>1000000)throw new Error("invalid empirical spec");
 const knownStates=new Set(states),knownActions=new Set(actions),seen=new Set<string>();
 const train=new Map<string,TransitionObservation[]>();let holdout=0,holdoutUnsafe=0,trainCount=0;
 for(const row of observations){
  if(!row||!validName(row.scenarioId)||!knownStates.has(row.state)||!knownActions.has(row.action)||
    !knownStates.has(row.nextState)||!Number.isFinite(row.reward)||typeof row.safe!=="boolean"||
    (row.terminal!==undefined&&typeof row.terminal!=="boolean")||
    (row.partition!=="train"&&row.partition!=="holdout"))throw new Error("invalid transition evidence");
  if(seen.has(row.scenarioId))throw new Error("duplicate scenario id");
  seen.add(row.scenarioId);
  if(row.partition==="holdout"){holdout++;if(!row.safe)holdoutUnsafe++;continue;}
  trainCount++;const k=key(row.state,row.action);const bucket=train.get(k)??[];
  bucket.push(row);train.set(k,bucket);
 }
 const compiled=new Map<string,readonly Transition[]>();let accepted=0;
 for(const state of states)for(const action of actions){
  const k=key(state,action),rows=train.get(k)??[],unsafe=rows.filter(r=>!r.safe).length;
  // One-sided Hoeffding risk bound; conservative screening, NOT certification.
  const upper=Math.min(1,unsafe/Math.max(1,rows.length)+Math.sqrt(Math.log(1/delta)/(2*Math.max(1,rows.length))));
  if(rows.length<minimumSupport||unsafe>0||upper>maxRiskUpperBound){
   compiled.set(k,[{nextState:state,reward:0,safe:false,terminal:true}]);continue;
  }
  const distinct=new Map<string,Transition>();
  for(const row of rows){
   const value:Transition={nextState:row.nextState,reward:row.reward,safe:row.safe,terminal:row.terminal};
   const tkey=JSON.stringify(value);
   if(!distinct.has(tkey))distinct.set(tkey,value);
  }
  compiled.set(k,[...distinct.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  accepted++;
 }
 const pairs=states.length*actions.length;
 return {
  model:(state,action)=>{
   if(!knownStates.has(state)||!knownActions.has(action))throw new Error("out of domain");
   return compiled.get(key(state,action))!.map(row=>({...row}));
  },
  report:{
   observedPairs:train.size,acceptedPairs:accepted,rejectedPairs:pairs-accepted,
   trainObservations:trainCount,holdoutObservations:holdout,coverage:accepted/pairs,
   holdoutUnsafeRate:holdout?holdoutUnsafe/holdout:null
  }
 };
}
