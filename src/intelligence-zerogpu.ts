/**
 * ZeroGPU d1.1 System One as an optional remote Jev-compatible decision model.
 * Not a local inference runtime, safety controller, or authorization layer.
 *
 * Environment variables are resolved at call site; secrets are never persisted.
 */
import {HttpJevProvider} from "./provider.js";
import {createNativeJevDecisionAdapter} from "./intelligence-native-jev.js";
import type {JevProvider as IntelligenceChoiceProvider} from "./intelligence-jev-adapter.js";
export type ZeroGpuDecisionOptions={apiKey:string;timeoutMs?:number;endpoint?:string};
export class ZeroGpuSystemOneProvider extends HttpJevProvider {
  override readonly name="zerogpu-d1.1";
  constructor(options:ZeroGpuDecisionOptions){
    if(typeof options.apiKey!=="string"||!options.apiKey.trim())throw new Error("ZeroGPU API key required");
    const endpoint=options.endpoint??"https://api.zerogpu.ai/v1/systemone";
    const url=new URL(endpoint);
    if(url.protocol!=="https:"||url.username||url.password)throw new Error("ZeroGPU endpoint must be HTTPS without embedded credentials");
    super({...options,endpoint,model:"d1.1"});
  }
}
export function createZeroGpuCompilationDecisionProvider(options:ZeroGpuDecisionOptions):IntelligenceChoiceProvider{
  return createNativeJevDecisionAdapter(new ZeroGpuSystemOneProvider(options));
}
