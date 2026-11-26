/**
 * Bridges offline candidate planning to JevRouter's actual typed Choice provider.
 * No fallback model, invented probabilities, approval or actuation.
 */
import type {JevProvider as NativeJevProvider} from "./types.js";
import {getChoiceAnswer} from "./provider.js";
import type {JevChoiceRequest,JevChoiceResponse,JevProvider as CompilationJevProvider} from "./intelligence-jev-adapter.js";
export function createNativeJevDecisionAdapter(provider:NativeJevProvider):CompilationJevProvider {
 return async (request:JevChoiceRequest):Promise<JevChoiceResponse>=>{
  const abstain=():JevChoiceResponse=>({status:"no_decision",probabilities:{},confidence:0});
  if(!request||!Array.isArray(request.candidates)||request.candidates.length<2||request.candidates.length>26||
    typeof request.state!=="string"||!request.state.trim()||typeof request.sourceDigest!=="string"||
    !/^[a-f0-9]{64}$/.test(request.sourceDigest))return abstain();
  const names=request.candidates.map(c=>c.action);
  if(new Set(names).size!==names.length||names.some(x=>!x||typeof x!=="string")||
    request.candidates.some(c=>!Number.isFinite(c.estimatedReward)||!Number.isSafeInteger(c.support)||c.support<1))return abstain();
  const criteria:Record<string,string>=Object.create(null);
  for(const c of request.candidates){
    if(c.action==="__proto__"||c.action==="constructor"||c.action==="prototype")return abstain();
    criteria[c.action]=`Offline estimated reward: ${c.estimatedReward}; evidence branches: ${c.support}`;
  }
  try {
   const raw=await provider.decide({
    state:{observed_state:request.state,compiled_source_sha256:request.sourceDigest},
    candidates:[],
    questions:{compiled_choice:{
      type:"choice",
      instructions:"Choose one of the explicitly available, offline-screened actions. Make a typed decision; no action is executed.",
      criteria
    }}
   });
   const answer=getChoiceAnswer(raw,"compiled_choice");
   if(!names.includes(answer.choice))return abstain();
   const keys=Object.keys(answer.probabilities);
   if(keys.length!==names.length||keys.some(k=>!names.includes(k)))return abstain();
   if(Math.abs(Object.values(answer.probabilities).reduce((a,b)=>a+b,0)-1)>0.001)return abstain();
   return {status:"choice",action:answer.choice,confidence:answer.confidence,probabilities:{...answer.probabilities}};
  }catch {return abstain();}
 };
}
