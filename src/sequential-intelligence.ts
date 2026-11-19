/** Bounded offline sequential planning. Never authorizes or executes. */
export type Transition = {nextState:string;reward:number;safe:boolean;terminal?:boolean};
export type TransitionModel = (state:string,action:string)=>readonly Transition[];
export type SequentialSpec = {states:readonly string[];actions:readonly string[];horizon:number;discount?:number;maxTransitions?:number};
export type SequentialChoice = {action:string;value:number;worstCase:number;branches:number};
export type SequentialPlan = {schema:"jev.sequential-plan.v1";horizon:number;states:Record<string,{candidates:SequentialChoice[];abstain:boolean}>;expandedTransitions:number};
export function compileSequential(spec:SequentialSpec,model:TransitionModel):SequentialPlan {
 const {states,actions,horizon}=spec, discount=spec.discount??0.95, limit=spec.maxTransitions??100000;
 if(!Array.isArray(states)||!Array.isArray(actions)||!states.length||!actions.length||new Set(states).size!==states.length||new Set(actions).size!==actions.length||[...states,...actions].some(s=>typeof s!=="string"||!s.trim())||!Number.isSafeInteger(horizon)||horizon<1||horizon>32||!Number.isFinite(discount)||discount<0||discount>1||!Number.isSafeInteger(limit)||limit<1)throw new Error("invalid sequential spec");
 const known=new Set(states);let expanded=0;
 const memo=new Map<string,{value:number;action:string|null}>(),transitions=new Map<string,readonly Transition[]>();
 function outcomes(state:string,action:string):readonly Transition[]{
  const key=JSON.stringify([state,action]),cached=transitions.get(key);if(cached)return cached;
  const rows=model(state,action);if(!Array.isArray(rows)||rows.length===0)throw new Error("missing transitions");
  expanded+=rows.length;if(expanded>limit)throw new Error("transition budget exceeded");
  for(const row of rows)if(!row||!known.has(row.nextState)||!Number.isFinite(row.reward)||typeof row.safe!=="boolean"||(row.terminal!==undefined&&typeof row.terminal!=="boolean"))throw new Error("invalid transition");
  const frozen=rows.map(r=>({...r}));transitions.set(key,frozen);return frozen;
 }
 function choice(state:string,remaining:number):{value:number;action:string|null}{
  if(remaining===0)return {value:0,action:null};
  const key=JSON.stringify([state,remaining]),cached=memo.get(key);if(cached)return cached;
  let best={value:-Infinity,action:null as string|null};
  for(const action of actions){
   let worst=Infinity;
   for(const row of outcomes(state,action)){
    if(!row.safe){worst=-Infinity;break;}
    const child=row.terminal?0:choice(row.nextState,remaining-1).value;
    if(child===-Infinity){worst=-Infinity;break;}
    worst=Math.min(worst,row.reward+discount*child);
   }
   if(worst>best.value||(worst===best.value&&best.action!==null&&action<best.action))best={value:worst,action:worst===-Infinity?null:action};
  }
  memo.set(key,best);return best;
 }
 const output:SequentialPlan["states"]=Object.create(null);
 for(const state of [...states].sort()){
  const candidates:SequentialChoice[]=[];
  for(const action of actions){
   const rows=outcomes(state,action);let worst=Infinity;
   for(const row of rows){
    if(!row.safe){worst=-Infinity;break;}
    const child=row.terminal?0:choice(row.nextState,horizon-1).value;
    if(child===-Infinity){worst=-Infinity;break;}
    worst=Math.min(worst,row.reward+discount*child);
   }
   if(worst!==-Infinity)candidates.push({action,value:worst,worstCase:worst,branches:rows.length});
  }
  candidates.sort((a,b)=>b.value-a.value||a.action.localeCompare(b.action));
  output[state]={candidates,abstain:candidates.length===0};
 }
 return {schema:"jev.sequential-plan.v1",horizon,states:output,expandedTransitions:expanded};
}
/** Jev chooses from candidates separately; this module never replaces Jev. */
export function candidatesForJev(plan:SequentialPlan,state:string,available:readonly string[]):SequentialChoice[]{
 if(plan.schema!=="jev.sequential-plan.v1"||!Array.isArray(available)||new Set(available).size!==available.length||available.some(x=>typeof x!=="string"||!x.trim()))throw new Error("invalid request");
 const entry=Object.hasOwn(plan.states,state)?plan.states[state]:undefined;
 if(!entry||entry.abstain)return [];
 return entry.candidates.filter(x=>available.includes(x.action));
}
