/** Launch a loopback-only partner report service with a configured upstream.
 * No upstream credentials are persisted by this launcher.
 */
import {createPartnerReportApi} from './partner-report-api.js';
import {PartnerRegistry} from './partner-registry.js';
import {CustomerValueStore} from './customer-value-store.js';
import {CavoDecisionFileStore} from './cavo-decision-loop.js';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const cavoStore=(dir:string,partnerId:string,customerId:string)=>new CavoDecisionFileStore(
 join(dir,createHash('sha256').update(JSON.stringify([partnerId,customerId])).digest('hex')+'.json')); 
import {PartnerReportHistory} from './partner-report-history.js';
import {createPartnerSpendImport,readAttributedSpend} from './partner-spend-import.js';
import type {ReadOnlySpendAdapter} from './partner-pilot.js';
export function createConfiguredPartnerService(config:{
 registryFile:string;partnerId:string;customerId:string;historyFile?:string;requestsDirectory?:string;customerValueFile?:string;cavoDirectory?:string;
 langfuse?:{baseUrl:string;publicKey:string;secretKey:string;fetcher?:typeof fetch};
 litellm?:{baseUrl:string;apiKey:string;teamId:string;fetcher?:typeof fetch};
 invoices?:ReadOnlySpendAdapter;
}){
 if(!config.registryFile||!config.partnerId||!config.customerId||
  (!config.langfuse&&!config.litellm&&!config.invoices))
  throw Error('invalid_service_configuration');
 const registry=new PartnerRegistry(config.registryFile);
 return createPartnerReportApi(registry,async(partnerId,customerId,from,to)=>{
  if(partnerId!==config.partnerId||customerId!==config.customerId)
   throw Error('service_scope_denied');
  return createPartnerSpendImport({partnerId,customerId,
   from:from+'T00:00:00Z',to:to+'T23:59:59Z',
   langfuse:config.langfuse,litellm:config.litellm,invoices:config.invoices});
 },config.historyFile?new PartnerReportHistory(config.historyFile):undefined,
  (partnerId,customerId)=>partnerId===config.partnerId&&customerId===config.customerId?
   [config.langfuse?'langfuse':null,config.litellm?'litellm':null,config.invoices?'invoices':null].filter((x):x is string=>x!==null):[],config.requestsDirectory,
  (partnerId,customerId,from,to)=>{
   if(partnerId!==config.partnerId||customerId!==config.customerId)throw Error('service_scope_denied');
   return readAttributedSpend({partnerId,customerId,from:from+'T00:00:00Z',
    to:to+'T23:59:59Z',langfuse:config.langfuse,litellm:config.litellm,
    invoices:config.invoices});
  },undefined,config.customerValueFile?new CustomerValueStore(config.customerValueFile):undefined,
 config.cavoDirectory?(p,c)=>cavoStore(config.cavoDirectory!,p,c):undefined);
}
/** Multi-partner white-label runtime. Each exact tenant binding has its own sources.
 * Customer creation never grants access to another tenant's upstream credentials.
 */
export function createMultiPartnerService(config:{
 registryFile:string;historyFile?:string;requestsDirectory?:string;customerValueFile?:string;cavoDirectory?:string;
 tenants:Array<{partnerId:string;customerId:string;
  langfuse?:{baseUrl:string;publicKey:string;secretKey:string;fetcher?:typeof fetch};
  litellm?:{baseUrl:string;apiKey:string;teamId:string;fetcher?:typeof fetch};
  invoices?:ReadOnlySpendAdapter}>;
}){
 const bindings=new Map<string,(typeof config.tenants)[number]>();
 for(const tenant of config.tenants){
  if(!tenant.partnerId||!tenant.customerId||
   (!tenant.langfuse&&!tenant.litellm&&!tenant.invoices))throw Error('invalid_tenant_binding');
  const key=JSON.stringify([tenant.partnerId,tenant.customerId]);
  if(bindings.has(key))throw Error('duplicate_tenant_binding');
  bindings.set(key,tenant);
 }
 if(!bindings.size)throw Error('no_tenant_bindings');
 return createPartnerReportApi(new PartnerRegistry(config.registryFile),
  async(partnerId,customerId,from,to)=>{
   const tenant=bindings.get(JSON.stringify([partnerId,customerId]));
   if(!tenant)throw Error('service_scope_denied');
   return createPartnerSpendImport({partnerId,customerId,
    from:from+'T00:00:00Z',to:to+'T23:59:59Z',
    langfuse:tenant.langfuse,litellm:tenant.litellm,invoices:tenant.invoices});
  },config.historyFile?new PartnerReportHistory(config.historyFile):undefined,
  (partnerId,customerId)=>{const tenant=bindings.get(JSON.stringify([partnerId,customerId]));
   return tenant?[tenant.langfuse?'langfuse':null,tenant.litellm?'litellm':null,
    tenant.invoices?'invoices':null].filter((x):x is string=>x!==null):[];},config.requestsDirectory,
  (partnerId,customerId,from,to)=>{
   const tenant=bindings.get(JSON.stringify([partnerId,customerId]));
   if(!tenant)throw Error('service_scope_denied');
   return readAttributedSpend({partnerId,customerId,from:from+'T00:00:00Z',
    to:to+'T23:59:59Z',langfuse:tenant.langfuse,litellm:tenant.litellm,
    invoices:tenant.invoices});
  },undefined,config.customerValueFile?new CustomerValueStore(config.customerValueFile):undefined,
 config.cavoDirectory?(p,c)=>cavoStore(config.cavoDirectory!,p,c):undefined);
}
export async function listenPartnerService(server:ReturnType<typeof createPartnerReportApi>,
 port:number,host='127.0.0.1'){
 if(host!=='127.0.0.1'&&host!=='::1')throw Error('public_bind_forbidden');
 if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error('invalid_port');
 await new Promise<void>((resolve,reject)=>{
  server.once('error',reject);server.listen(port,host,()=>{
   server.off('error',reject);resolve();
  });
 });
 return server.address();
}
