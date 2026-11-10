/** Authenticated report endpoint uses a tenant-bound read-only adapter factory.
 * It does not expose upstream credentials or raw prompt content.
 */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {partnerPortalHtml,partnerPortalJs} from './partner-portal.js';
import {PartnerRegistry} from './partner-registry.js';
import {PartnerReportHistory} from './partner-report-history.js';
import {createPartnerControlHandler} from './partner-control-api.js';
import {runPartnerPilot,type ReadOnlySpendAdapter} from './partner-pilot.js';
import {scanTopAiSpend} from './top-ai-spend-scan.js';
import {proposeValueHypotheses,evaluateCustomerValue,type ValueRubric} from './customer-value-evaluator.js';
import type {SpendRecord} from './spend-intelligence.js';
import {CustomerValueStore} from './customer-value-store.js';
import type {ValueCriterion} from './customer-value-evaluator.js';
const portalStyle=partnerPortalHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1]??'';
const portalStyleHash=createHash('sha256').update(portalStyle).digest('base64');
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function createPartnerReportApi(registry:PartnerRegistry,
 adapterFor:(partnerId:string,customerId:string,from:string,to:string)=>Promise<ReadOnlySpendAdapter>,
 history?:PartnerReportHistory,
 sourceStatus?:(partnerId:string,customerId:string)=>string[],
 requestsDirectory?:string,
 attributedUsageFor?:(partnerId:string,customerId:string,from:string,to:string)=>Promise<SpendRecord[]>,
 customerRubricFor?:(partnerId:string,customerId:string)=>Promise<ValueRubric|null>,
 customerValueStore?:CustomerValueStore){
 const control=createPartnerControlHandler(registry,requestsDirectory);
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
     'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'sha256-"+portalStyleHash+"'; connect-src 'self'; base-uri 'none'; form-action 'none'"});
    res.end(js?partnerPortalJs:partnerPortalHtml);return;
   }
   const rubricMatch=/^\/customers\/([a-zA-Z0-9_-]{1,128})\/value-rubric$/.exec(url.pathname);
   if(rubricMatch&&(req.method==='GET'||req.method==='PUT')){
    if(!customerValueStore){send(404,{error:'customer_value_store_not_configured'});return;}
    const partnerId=req.headers['x-partner-id'];
    const token=req.headers['x-customer-value-token'];
    if(typeof partnerId!=='string'||typeof token!=='string'||!token){
     send(401,{error:'customer_value_auth_required'});return;
    }
    if(req.method==='GET'){
     // Read access is also authenticated by a no-op optimistic revision check.
     const rubric=await customerValueStore.readAuthorized(partnerId,rubricMatch[1],token);
     send(200,{rubric});return;
    }
    let raw='';for await(const chunk of req){raw+=chunk.toString();
     if(raw.length>32768){send(413,{error:'rubric_too_large'});return;}}
    const body=JSON.parse(raw) as {expectedRevision:number;criteria:ValueCriterion[]};
    const rubric=await customerValueStore.update(partnerId,rubricMatch[1],token,
     body.expectedRevision,body.criteria);
    send(200,{rubric});return;
   }
   const sourcesMatch=/^\/customers\/([a-zA-Z0-9_-]{1,128})\/sources$/.exec(url.pathname);
   if(req.method==='GET'&&sourcesMatch){
    const partnerId=req.headers['x-partner-id'];
    const auth=req.headers.authorization;
    if(typeof partnerId!=='string'||!auth?.startsWith('Bearer ')){
     send(401,{error:'unauthorized'});return;
    }
    await registry.customer(partnerId,auth.slice(7),sourcesMatch[1]);
    const sources=sourceStatus?.(partnerId,sourcesMatch[1])??[];
    send(200,{customerId:sourcesMatch[1],configured:sources.length>0,
     sources,credentialsExposed:false});return;
   }
   const scanMatch=/^\/customers\/([a-zA-Z0-9_-]{1,128})\/top-spend$/.exec(url.pathname);
   if(req.method==='GET'&&scanMatch){
    const partnerId=req.headers['x-partner-id'],auth=req.headers.authorization;
    if(typeof partnerId!=='string'||!auth?.startsWith('Bearer ')){
     send(401,{error:'unauthorized'});return;
    }
    await registry.customer(partnerId,auth.slice(7),scanMatch[1]);
    const from=url.searchParams.get('from')??'',to=url.searchParams.get('to')??'',
     currency=url.searchParams.get('currency')??'';
    if(!validDate(from)||!validDate(to)||from>to||!/^[A-Z]{3}$/.test(currency)){
     send(400,{error:'invalid_report_window'});return;
    }
    if(!attributedUsageFor){
     send(422,{error:'actor_attribution_not_configured',
      explanation:'Provider cost records lack a verified user or agent identifier. No top-decile claim can be made.'});return;
    }
    if(currency!=='USD'){send(422,{error:'source_currency_usd_only'});return;}
    const records=await attributedUsageFor(partnerId,scanMatch[1],from,to);
    const result=scanTopAiSpend({partnerId,tenantId:scanMatch[1],currency,
     periodStart:from,periodEnd:to,records});
    send(200,{...result,sourceVerification:'UNVERIFIED_SOURCE_RECORDS'});return;
   }
   const valueMatch=/^\/customers\/([a-zA-Z0-9_-]{1,128})\/value-evaluation$/.exec(url.pathname);
   if(req.method==='GET'&&valueMatch){
    const partnerId=req.headers['x-partner-id'],auth=req.headers.authorization;
    if(typeof partnerId!=='string'||!auth?.startsWith('Bearer ')){
     send(401,{error:'unauthorized'});return;
    }
    await registry.customer(partnerId,auth.slice(7),valueMatch[1]);
    const from=url.searchParams.get('from')??'',to=url.searchParams.get('to')??'',
     currency=url.searchParams.get('currency')??'';
    if(!validDate(from)||!validDate(to)||from>to||!/^[A-Z]{3}$/.test(currency)){
     send(400,{error:'invalid_report_window'});return;
    }
    if(!attributedUsageFor||currency!=='USD'){
     send(422,{error:'attributed_usd_usage_required'});return;
    }
    const records=await attributedUsageFor(partnerId,valueMatch[1],from,to);
    const hypotheses=proposeValueHypotheses(records,valueMatch[1]);
    const rubric=customerValueStore?await customerValueStore.get(partnerId,valueMatch[1]):
     customerRubricFor?await customerRubricFor(partnerId,valueMatch[1]):null;
    if(!rubric){send(200,{authority:'ADVISORY_ONLY',
     rubricStatus:'CUSTOMER_RUBRIC_NOT_VERIFIED',hypotheses,
     evaluation:null,notice:'No verified customer rubric. Hypotheses are not accepted customer value.'});return;}
    send(200,{authority:'ADVISORY_ONLY',rubricStatus:'CUSTOMER_RUBRIC_SUPPLIED',hypotheses,
     evaluation:evaluateCustomerValue({partnerId,customerId:valueMatch[1],rubric,
      records,signals:hypotheses})});return;
   }
   const historyMatch=/^\/reports\/([a-zA-Z0-9_-]{1,128})\/history$/.exec(url.pathname);
   if(req.method==='GET'&&historyMatch){
    const partnerId=req.headers['x-partner-id'];
    const auth=req.headers.authorization;
    if(typeof partnerId!=='string'||!auth?.startsWith('Bearer ')){send(401,{error:'unauthorized'});return;}
    await registry.customer(partnerId,auth.slice(7),historyMatch[1]);
    if(!history){send(404,{error:'history_not_configured'});return;}
    const snapshots=await history.list(partnerId,historyMatch[1]);
    send(200,{snapshots});return;
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
   const payload={...report,verification:'UNVERIFIED_SOURCE_RECORDS',
    causalRoi:'NOT_ESTABLISHED',
    reconciliation:{status:unresolved===null?'NOT_AVAILABLE':
     unresolved>0?'POTENTIAL_OVERLAP':'CORRELATED_ONLY',
     unresolvedSourceRecords:unresolved,
     suppressedDuplicates:reconciliation?.suppressed.length??null,
     warning:unresolved===null?'Source-level reconciliation not available':
      unresolved>0?'Unlinked usage sources may overlap; totals are not confirmed':
      'Only explicitly correlated records were deduplicated'}};
   if(history)await history.append({partnerId,customerId:customer.customerId,
    from,to,currency,report:payload});
   send(200,payload);
  }catch(e){
   const message=(e as Error).message;
   const status=message==='customer_value_auth_denied'?401:
    message==='rubric_revision_conflict'?409:
    message==='invalid_customer_rubric'||message==='invalid_value_criterion'?400:
    message==='actor_attribution_missing'?422:
    message==='partner_auth_denied'?401:
    message==='customer_scope_denied'?404:
    message==='currency_mismatch'||message==='invalid_assessment'?400:502;
   send(status,{error:status===502?'upstream_report_failed':message});
  }
 });
}
