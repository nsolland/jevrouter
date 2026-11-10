/** Local operator entrypoint. No public listener, no credentials on argv.
 * Environment variables are inherited from the operator's secret manager.
 */
import {randomBytes} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {PartnerRegistry} from './partner-registry.js';
import {createConfiguredPartnerService,createMultiPartnerService,listenPartnerService} from './partner-service.js';
const required=(env:NodeJS.ProcessEnv,key:string)=>{
 const v=env[key];if(!v)throw Error('missing_environment:'+key);return v;
};
export async function startPartnerServiceFromEnv(env:NodeJS.ProcessEnv=process.env){
 const registryFile=required(env,'SPEND_REGISTRY_FILE');
 const port=Number(env.SPEND_PORT??'8787');
 if(env.SPEND_TENANTS_FILE){
  const file=env.SPEND_TENANTS_FILE;
  const info=await stat(file);
  if(!info.isFile()||(info.mode&0o077)!==0)throw Error('insecure_tenants_file_permissions');
  const parsed:unknown=JSON.parse(await readFile(file,'utf8'));
  if(!parsed||typeof parsed!=='object'||!('tenants' in parsed)||
   !Array.isArray(parsed.tenants))throw Error('invalid_tenants_configuration');
  const tenants=parsed.tenants as Array<{partnerId:string;customerId:string;
   litellm?:{baseUrl:string;apiKey:string;teamId:string};
   langfuse?:{baseUrl:string;publicKey:string;secretKey:string}}>;
  const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
  const endpoint=(v:unknown)=>nonempty(v)&&(()=>{try{
   const u=new URL(v);return u.protocol==='https:'||
    (u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname));
  }catch{return false;}})();
  for(const t of tenants){
   if(!t||!nonempty(t.partnerId)||!nonempty(t.customerId)||
    (!t.litellm&&!t.langfuse)||
    (t.litellm&&(!endpoint(t.litellm.baseUrl)||!nonempty(t.litellm.apiKey)||
      !nonempty(t.litellm.teamId)))||
    (t.langfuse&&(!endpoint(t.langfuse.baseUrl)||!nonempty(t.langfuse.publicKey)||
      !nonempty(t.langfuse.secretKey))))throw Error('invalid_tenants_configuration');
  }
  const server=createMultiPartnerService({registryFile,historyFile:env.SPEND_HISTORY_FILE,tenants});
  const address=await listenPartnerService(server,port);
  return {server,address};
 }
 const partnerId=required(env,'SPEND_PARTNER_ID');
 const customerId=required(env,'SPEND_CUSTOMER_ID');
 const litellm=env.SPEND_LITELLM_URL?{
  baseUrl:env.SPEND_LITELLM_URL,
  apiKey:required(env,'SPEND_LITELLM_KEY'),
  teamId:required(env,'SPEND_LITELLM_TEAM')}:undefined;
 const langfuse=env.SPEND_LANGFUSE_URL?{
  baseUrl:env.SPEND_LANGFUSE_URL,
  publicKey:required(env,'SPEND_LANGFUSE_PUBLIC_KEY'),
  secretKey:required(env,'SPEND_LANGFUSE_SECRET_KEY')}:undefined;
 const server=createConfiguredPartnerService({registryFile,partnerId,customerId,
  historyFile:env.SPEND_HISTORY_FILE,
  langfuse,litellm});
 const address=await listenPartnerService(server,port);
 return {server,address};
}
export async function provisionPartnerFromEnv(env:NodeJS.ProcessEnv=process.env){
 const registry=new PartnerRegistry(required(env,'SPEND_REGISTRY_FILE'));
 const partnerId=required(env,'SPEND_PARTNER_ID');
 const token=env.SPEND_PARTNER_TOKEN??randomBytes(32).toString('hex');
 await registry.provision({partnerId,
  productName:required(env,'SPEND_BRAND_NAME'),
  supportEmail:required(env,'SPEND_SUPPORT_EMAIL'),
  domain:required(env,'SPEND_BRAND_DOMAIN'),
  legalEntity:required(env,'SPEND_LEGAL_ENTITY')},token);
 return {partnerId,token};
}
