/** Launch a loopback-only partner report service with a configured upstream.
 * No upstream credentials are persisted by this launcher.
 */
import {createPartnerReportApi} from './partner-report-api.js';
import {PartnerRegistry} from './partner-registry.js';
import {createPartnerSpendImport} from './partner-spend-import.js';
import type {ReadOnlySpendAdapter} from './partner-pilot.js';
export function createConfiguredPartnerService(config:{
 registryFile:string;partnerId:string;customerId:string;
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
 });
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
