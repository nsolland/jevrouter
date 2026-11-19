/** Typed model/endpoint registry for decision providers.
 * A model identifier is not an endpoint, a key is not an entitlement,
 * and provider selection never grants authority or triggers execution.
 */
import type {JevProvider} from "./types.js";
import {HttpJevProvider,OpenSparkJevProvider} from "./provider.js";
import {ZeroGpuSystemOneProvider} from "./intelligence-zerogpu.js";

export type DecisionProviderId="typesafe"|"zerogpu-d1.1"|"open-spark";
export type DecisionProviderDescriptor={
  readonly id:DecisionProviderId;
  readonly operation:"typed-decision";
  readonly model:string;
  readonly endpoint:string;
  readonly transport:"remote"|"local";
  readonly requiredCredential:"api-key"|"optional";
};
export const DECISION_PROVIDER_CATALOG:Readonly<Record<DecisionProviderId,DecisionProviderDescriptor>>=Object.freeze({
 typesafe:Object.freeze({id:"typesafe",operation:"typed-decision",model:"jev-latest",endpoint:"https://api.typesafe.ai/v1/systemone",transport:"remote",requiredCredential:"api-key"}),
 "zerogpu-d1.1":Object.freeze({id:"zerogpu-d1.1",operation:"typed-decision",model:"d1.1",endpoint:"https://api.zerogpu.ai/v1/systemone",transport:"remote",requiredCredential:"api-key"}),
 "open-spark":Object.freeze({id:"open-spark",operation:"typed-decision",model:"spark-s1-4b-v3",endpoint:"http://127.0.0.1:8400/v1/evaluate",transport:"local",requiredCredential:"optional"})
});
export type CreateDecisionProviderOptions={
  provider:DecisionProviderId;
  apiKey?:string;
  timeoutMs?:number;
};
/** Explicit provider selection; no silent fallback from a rejected model. */
export function createDecisionProvider(options:CreateDecisionProviderOptions):JevProvider {
 if(!options||!Object.hasOwn(DECISION_PROVIDER_CATALOG,options.provider))throw new Error("unknown decision provider");
 if(options.timeoutMs!==undefined&&(!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<100||options.timeoutMs>120000))throw new Error("invalid timeout");
 const {provider,apiKey,timeoutMs}=options;
 if(provider==="open-spark")return new OpenSparkJevProvider({apiKey,timeoutMs});
 if(typeof apiKey!=="string"||!apiKey.trim())throw new Error("API key required for remote decision provider");
 if(provider==="zerogpu-d1.1")return new ZeroGpuSystemOneProvider({apiKey,timeoutMs});
 return new HttpJevProvider({apiKey,timeoutMs});
}
/** Distinguishes local configuration from provider response; 403 never proves why access was denied. */
export type ProviderAccessClassification="credential_missing"|"authentication_or_entitlement_rejected"|"rate_limited"|"provider_unavailable"|"network_or_timeout"|"response_invalid"|"available";
export function classifyProviderAccess(status:number|null, errorCode?:string):ProviderAccessClassification{
 if(errorCode==="credential_missing")return "credential_missing";
 if(status===401||status===403)return "authentication_or_entitlement_rejected";
 if(status===429)return "rate_limited";
 if(status!==null&&status>=500&&status<=599)return "provider_unavailable";
 if(errorCode==="jev_timeout"||errorCode==="jev_http_error")return "network_or_timeout";
 if(errorCode==="jev_malformed_response")return "response_invalid";
 if(status!==null&&status>=200&&status<300)return "available";
 return "network_or_timeout";
}
