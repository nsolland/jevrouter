/** Authenticated report endpoint uses a tenant-bound read-only adapter factory.
 * It does not expose upstream credentials or raw prompt content.
 */
import {createServer} from 'node:http';
import {partnerPortalHtml,partnerPortalJs} from './partner-portal.js';
import {PartnerRegistry} from './partner-registry.js';
import {createPartnerControlHandler} from './partner-control-api.js';
import {runPartnerPilot,type ReadOnlySpendAdapter} from './partner-pilot.js';
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function createPartnerReportApi(registry:PartnerRegistry,
 adapterFor:(partnerId:string,customerId:string,from:string,to:string)=>Promise<ReadOnlySpendAdapter>){
 const control=createPartnerControlHandler(registry);
 return createServer(async(req,res)=>{
  const send=(status:number,payload:unknown)=>{
   res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',
    'x-content-type-options':'nosniff'});res.end(JSON.stringify(payload));};
  try{
   const url=new URL(req.url??'/', 'http://localhost');
   if(req.method==='GET'&&(url.pathname==='/portal'||url.pathname==='/portal.js')){
    const js=url.pathname==='/portal.js';
    res.writeHead(200,{'content-type':js?'text/javascript; charset=utf-8':'text/html; charset=utf-8',
     'cache-control':'no-store','x-content-type-options':'nosniff',
     'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"});
    res.end(js?partnerPortalJs:partnerPortalHtml);return;
   }
   const match=/^\/reports\/([a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
   if(req.method!=='GET'||!match){await control(req,res);return;}
   const partnerId=req.headers['x-partner-id'];
   const auth=req.headers.authorization;
   if(typeof partnerId!=='string'||!auth?.startsWith('Bearer ')){
    send(401,{error:'unauthorized'});return;
   }
   const token=auth.slice(7);
   const {brand,customer}=await registry.customer(partnerId,token,match[1]);
   const from=url.searchParams.get('from')??'';
   const to=url.searchParams.get('to')??'';
   const currency=url.searchParams.get('currency')??'';
   if(!validDate(from)||!validDate(to)||
    from>to||!/^[A-Z]{3}$/.test(currency)){
    send(400,{error:'invalid_report_window'});return;
   }
   const adapter=await adapterFor(partnerId,customer.customerId,from,to);
   const report=await runPartnerPilot({brand,customer,adapter,
    periodStart:from,periodEnd:to,currency});
   const reconciliation='getLastReconciliation' in adapter &&
    typeof adapter.getLastReconciliation==='function'?
    (adapter.getLastReconciliation as ()=>{unresolved:string[];
      suppressed:{id:string;keptId:string}[]}|null)():null;
   const unresolved=reconciliation?.unresolved.length??null;
   send(200,{...report,verification:'UNVERIFIED_SOURCE_RECORDS',
    causalRoi:'NOT_ESTABLISHED',
    reconciliation:{status:unresolved===null?'NOT_AVAILABLE':
     unresolved>0?'POTENTIAL_OVERLAP':'CORRELATED_ONLY',
     unresolvedSourceRecords:unresolved,
     suppressedDuplicates:reconciliation?.suppressed.length??null,
     warning:unresolved===null?'Source-level reconciliation not available':
      unresolved>0?'Unlinked usage sources may overlap; totals are not confirmed':
      'Only explicitly correlated records were deduplicated'}});
  }catch(e){
   const message=(e as Error).message;
   const status=message==='partner_auth_denied'?401:
    message==='customer_scope_denied'?404:
    message==='currency_mismatch'||message==='invalid_assessment'?400:502;
   send(status,{error:status===502?'upstream_report_failed':message});
  }
 });
}
