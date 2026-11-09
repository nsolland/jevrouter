/** Local operator entrypoint. No public listener, no credentials on argv.
 * Environment variables are inherited from the operator's secret manager.
 */
import {randomBytes} from 'node:crypto';
import {PartnerRegistry} from './partner-registry.js';
import {createConfiguredPartnerService,listenPartnerService} from './partner-service.js';
const required=(env:NodeJS.ProcessEnv,key:string)=>{
 const v=env[key];if(!v)throw Error('missing_environment:'+key);return v;
};
export async function startPartnerServiceFromEnv(env:NodeJS.ProcessEnv=process.env){
 const registryFile=required(env,'SPEND_REGISTRY_FILE');
 const partnerId=required(env,'SPEND_PARTNER_ID');
 const customerId=required(env,'SPEND_CUSTOMER_ID');
 const port=Number(env.SPEND_PORT??'8787');
 const litellm=env.SPEND_LITELLM_URL?{
  baseUrl:env.SPEND_LITELLM_URL,
  apiKey:required(env,'SPEND_LITELLM_KEY'),
  teamId:required(env,'SPEND_LITELLM_TEAM')}:undefined;
 const langfuse=env.SPEND_LANGFUSE_URL?{
  baseUrl:env.SPEND_LANGFUSE_URL,
  publicKey:required(env,'SPEND_LANGFUSE_PUBLIC_KEY'),
  secretKey:required(env,'SPEND_LANGFUSE_SECRET_KEY')}:undefined;
 const server=createConfiguredPartnerService({registryFile,partnerId,customerId,
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
