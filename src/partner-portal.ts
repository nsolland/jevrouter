/** Same-origin portal: no third-party assets, no token persistence, no HTML injection. */
export const partnerPortalHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Spend Partner Portal</title><style>
body{font:16px system-ui,sans-serif;margin:0;background:#f6f7f9;color:#17212b}
main{max-width:900px;margin:auto;padding:32px 18px}h1{font-size:1.8rem}h2{font-size:1.2rem}
section{background:white;border:1px solid #dbe0e6;border-radius:10px;padding:20px;margin:16px 0}
label{display:block;margin:10px 0;font-weight:600}input{display:block;box-sizing:border-box;width:100%;padding:10px;border:1px solid #aab4bf;border-radius:5px;margin-top:4px}
button{padding:10px 16px;border:0;border-radius:5px;background:#183c60;color:white;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.metric{padding:12px;background:#edf2f6;border-radius:6px}.metric strong{display:block;font-size:1.4rem}
pre{white-space:pre-wrap;overflow-wrap:anywhere}.warning{color:#8b3500;font-weight:600}
</style></head><body><main><h1>AI Value & Spend Intelligence</h1>
<p>Partner-managed reporting. Source totals may overlap; observed benefits are not causal ROI.</p>
<section><h2>Partner access</h2><div class="grid">
<label>Partner ID<input id="partner" required></label>
<label>Access token (not stored)<input id="token" type="password" autocomplete="off" required></label>
</div></section>
<section><h2>Partner workspace</h2><button type="button" id="load-partner">Load my workspace</button><p id="partner-status" role="status"></p><div id="partner-workspace"></div></section>
<section><h2>Create customer</h2><form id="create-customer">
<div class="grid"><label>Customer ID<input id="new-customer" required></label>
<label>Customer name<input id="customer-name" required></label></div>
<button type="submit">Create customer</button></form><p id="customer-status" role="status"></p></section>
<section><h2>Request a data source</h2><form id="request-source"><label>Source
<select id="source-type"><option value="litellm">LiteLLM</option><option value="langfuse">Langfuse</option></select></label>
<label>Endpoint URL (no credentials)<input id="source-url" type="url" required></label>
<button type="submit">Request operator connection</button></form><p id="request-status" role="status"></p></section>
<section><h2>Customer data sources</h2><button type="button" id="check-sources">Check configured sources</button><p id="source-status" role="status"></p></section>
<section><h2>Cost report</h2><form id="report"><div class="grid">
<label>Customer ID<input id="customer" required></label>
<label>From<input id="from" type="date" required></label>
<label>To<input id="to" type="date" required></label>
<label>Currency<input id="currency" value="USD" required></label></div>
<button type="submit">Generate report</button></form>
<div id="summary" class="grid" aria-live="polite"></div>
<p id="reconciliation" class="warning" role="status"></p>
<details><summary>Evidence and full report</summary><pre id="result"></pre></details></section>
<section><h2>Is Your AI Spend Worth It?</h2>
<p>Top 10% of observed users or agents. Requires attributed usage records; unverified value is not ROI.</p>
<button type="button" id="scan-top">Analyze top 10%</button><p id="scan-status" role="status"></p>
<div id="scan-summary" class="grid"></div><details><summary>Scan evidence</summary><pre id="scan-detail"></pre></details></section>
<section><h2>Customer-owned value criteria</h2>
<p>Requires a separately provisioned customer credential. Partner access tokens cannot approve criteria.</p>
<label>Customer value token (not stored)<input id="customer-value-token" type="password" autocomplete="off"></label>
<button type="button" id="load-rubric">Load customer criteria</button>
<p>Adjust priorities with sliders. Weights are relative and automatically normalized to 100%.
No slider changes the underlying measurements or makes a hypothesis true.</p>
<div id="weight-controls"></div>
<label>New criterion name<input id="new-value-label" placeholder="E.g. employee wellbeing"></label>
<label>What does this mean to your organization?<input id="new-value-description" placeholder="Customer-defined outcome"></label>
<label>Measurement method<input id="new-value-method" placeholder="How will the customer assess this?"></label>
<label>Target<input id="new-value-target" placeholder="Customer-defined target"></label>
<label>Measurement type<select id="new-value-type"><option value="qualitative">Qualitative</option><option value="quantitative">Quantitative</option></select></label>
<button type="button" id="add-value-criterion">Add custom criterion</button>
<button type="button" id="default-weights">Load editable example weights</button>
<button type="button" id="leadership-template">Add leadership opportunity examples</button>
<p>Optional leadership examples: strategic ambition, human-agent organization, and culture.
These are not predefined success measures; customer sets targets and evidence.</p>
<label>Criteria JSON (advanced)<textarea id="value-criteria" rows="7" style="width:100%" spellcheck="false">[{"id":"quality","label":"Quality","weight":100,"enabled":true,"metric":"quality","minimumEvidence":"measured"}]</textarea></label>
<button type="button" id="save-rubric">Save customer criteria</button>
<button type="button" id="rubric-history">View revision history</button>
<label>Hypothesis ID<input id="decision-signal" placeholder="opportunity-..."></label>
<label>Customer decision<select id="decision-choice"><option value="NEEDS_EVIDENCE">Needs evidence</option><option value="ACCEPT">Accept for review</option><option value="REJECT">Reject</option></select></label>
<label>Reason<input id="decision-reason" placeholder="Customer rationale"></label>
<button type="button" id="save-decision">Record customer decision</button>
<button type="button" id="decision-history">View decision history</button>
<pre id="value-history"></pre><p id="rubric-status" role="status"></p>
</section><section><h2>Value evaluator (advisory)</h2><p>Suggested opportunities are not proven savings.
Customer value criteria require separate organizational verification.</p>
<button type="button" id="evaluate-value">List value hypotheses</button>
<p id="value-status" role="status"></p><pre id="value-detail"></pre></section>
<section><h2>CAVO decision and benefit follow-up</h2>
<p>Customer credential required. Values are customer-reported, not independently proven causal ROI.</p>
<label>Event type<select id="cavo-kind"><option value="initiatives">Initiative</option><option value="allocation-rules">Allocation rule</option><option value="costs">Cost event</option><option value="recommendations">Recommendation</option><option value="decisions">Customer decision</option><option value="follow-ups">Follow-up</option></select></label>
<div class="grid"><label>Record ID<input id="cavo-record-id" placeholder="Unique event ID"></label>
<label>Title or description<input id="cavo-description" placeholder="Initiative or recommendation"></label>
<label>Related ID<input id="cavo-related" placeholder="Initiative / recommendation / decision ID"></label>
<label>Amount (minor units)<input id="cavo-amount" type="number" min="0" step="1" value="0"></label>
<label>Customer rationale<input id="cavo-rationale" placeholder="Why this decision?"></label>
<label>Decision<select id="cavo-choice"><option value="PROCEED">Proceed</option><option value="DEFER">Defer</option><option value="REJECT">Reject</option></select></label></div>
<div class="grid">
<label>Actor / workflow<input id="cavo-actor" placeholder="agent-1"></label>
<label>Workflow<input id="cavo-workflow" placeholder="customer-support"></label>
<label>Attempt<select id="cavo-attempt"><option>SUCCESS</option><option>FAILED</option><option>RETRY</option></select></label>
<label>Rule version<input id="cavo-rule-version" type="number" min="1" step="1" value="1"></label>
<label>Allocation unit<input id="cavo-unit" placeholder="support"></label>
<label>Baseline<input id="cavo-baseline" type="number" value="0"></label>
<label>Target<input id="cavo-target" type="number" value="1"></label>
<label>Actual result<input id="cavo-actual" type="number" value="1"></label>
<label>Result unit<input id="cavo-outcome-unit" value="points"></label>
<label>Evidence source ID<input id="cavo-source" placeholder="customer-measurement-1"></label>
<label>Evidence level<select id="cavo-evidence"><option value="HYPOTHESIS">Hypothesis</option><option value="CUSTOMER_ATTESTED">Customer attested</option><option value="MEASURED">Measured</option></select></label>
<label>Implemented<select id="cavo-implemented"><option value="true">Yes</option><option value="false">No</option></select></label>
</div>
<button type="button" id="cavo-template">Prepare event from fields</button>
<button type="button" id="cavo-submit-form">Save directly from fields</button>
<button type="button" id="cavo-run-synthetic">Run synthetic full-cycle demo</button>
<p>Demo creates explicitly labeled synthetic records in this customer's workspace. Use only a test customer.</p>
<p>Review the generated JSON before recording. Initiatives must reference the customer's approved rubric and outcomes.</p>
<label>Event JSON<textarea id="cavo-payload" rows="8" style="width:100%" spellcheck="false">{}</textarea></label>
<button type="button" id="cavo-save">Record event</button>
<button type="button" id="cavo-audit">View history</button>
<label>Decision ID<input id="cavo-decision-id" placeholder="Customer decision ID"></label>
<button type="button" id="cavo-assessment">View follow-up assessment</button>
<p id="cavo-status" role="status"></p><pre id="cavo-result"></pre></section>
<section><h2>Report history</h2><button type="button" id="load-history">Load saved reports</button><p id="history-status" role="status"></p><div id="history"></div></section>
</main><script src="/portal.js"></script></body></html>`;
export const partnerPortalJs = `
async function cavoRequest(path,body){
 const customer=encodeURIComponent(get('customer'));
 const headers={'x-partner-id':get('partner'),'x-customer-value-token':get('customer-value-token')};
 const response=await fetch('/customers/'+customer+'/cavo/'+path,{method:body===undefined?'GET':'POST',
  headers:body===undefined?headers:{...headers,'content-type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
 const result=await response.json();
 if(!response.ok)throw Error(result.error??String(response.status));return result;
}
for(const [id,path] of [['cavo-audit','audit'],['cavo-assessment','assessment']]){
 document.getElementById(id).addEventListener('click',async()=>{
  const status=document.getElementById('cavo-status');status.textContent='Loading';
  try{const suffix=path==='assessment'?'?decisionId='+encodeURIComponent(get('cavo-decision-id')):'';
   const result=await cavoRequest(path+suffix);
   document.getElementById('cavo-result').textContent=JSON.stringify(result,null,2);
   status.textContent='Customer-scoped history loaded';}
  catch(e){status.textContent='CAVO error: '+e.message;}
 });
}
document.getElementById('cavo-run-synthetic').addEventListener('click',async()=>{
 const status=document.getElementById('cavo-status');status.textContent='Running synthetic test cycle';
 try{
  const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/value-rubric',
   {headers:{'x-partner-id':get('partner'),'x-customer-value-token':get('customer-value-token')},cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.rubric?.criteria?.length)throw Error('Customer rubric required');
  const criterion=data.rubric.criteria.find(c=>c.enabled);
  if(!criterion)throw Error('Enable a customer criterion first');
  const prefix='synthetic-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
  const at=new Date().toISOString(),initiative=prefix+'-initiative',recommendation=prefix+'-recommendation',decision=prefix+'-decision';
  const outcome={criterionId:criterion.id,baseline:50,target:60,unit:'synthetic-points',
   evidence:'HYPOTHESIS'};
  await cavoRequest('initiatives',{id:initiative,customerId:get('customer'),
   rubricRevision:data.rubric.revision,title:'SYNTHETIC DEMO: customer value improvement',outcomes:[outcome]});
  await cavoRequest('recommendations',{id:recommendation,initiativeId:initiative,
   description:'SYNTHETIC DEMO: evaluate alternative AI workflow',forecastBenefitMinor:10000,
   forecastCostMinor:2500,assumptions:['Synthetic numbers only','No causal inference']});
  await cavoRequest('decisions',{id:decision,recommendationId:recommendation,
   choice:'PROCEED',rationale:'SYNTHETIC DEMO: customer approval simulation',
   customerActor:'SYNTHETIC_TEST',at});
  await cavoRequest('follow-ups',{id:prefix+'-followup',decisionId:decision,
   implemented:true,at,actualCostMinor:3000,realizedBenefitMinor:4000,
   evidence:'CUSTOMER_ATTESTED',sourceIds:[prefix+'-synthetic-source'],
   outcomes:[{...outcome,actual:55,evidence:'CUSTOMER_ATTESTED'}]});
  const result=await cavoRequest('assessment?decisionId='+encodeURIComponent(decision));
  document.getElementById('cavo-decision-id').value=decision;
  document.getElementById('cavo-result').textContent=JSON.stringify(result,null,2);
  status.textContent='SYNTHETIC DEMO COMPLETE. Not real evidence or verified ROI.';
 }catch(e){status.textContent='Synthetic demo failed: '+e.message;}
});
async function cavoFormPayload(){
 const id=get('cavo-record-id'),description=get('cavo-description'),related=get('cavo-related');
 const amount=Number(get('cavo-amount')),version=Number(get('cavo-rule-version'));
 if(!id||!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(version)||version<1)
  throw Error('Valid event ID, amount and rule version required');
 const kind=get('cavo-kind'),at=new Date().toISOString();
 if(kind==='initiatives'){
  const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/value-rubric',
   {headers:{'x-partner-id':get('partner'),'x-customer-value-token':get('customer-value-token')},cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.rubric)throw Error('Customer rubric unavailable');
  const criterion=data.rubric.criteria.find(c=>c.enabled);
  if(!criterion)throw Error('Enable a customer criterion first');
  return {id,customerId:get('customer'),rubricRevision:data.rubric.revision,
   title:description,outcomes:[{criterionId:criterion.id,baseline:Number(get('cavo-baseline')),
    target:Number(get('cavo-target')),unit:get('cavo-outcome-unit'),evidence:get('cavo-evidence')}]};
 }
 if(kind==='recommendations')return {id,initiativeId:related,description,
  forecastBenefitMinor:amount,assumptions:['Customer-defined forecast; not measured ROI']};
 if(kind==='decisions')return {id,recommendationId:related,choice:get('cavo-choice'),
  rationale:get('cavo-rationale'),customerActor:'CUSTOMER_TOKEN_HOLDER',at};
 if(kind==='follow-ups'){
  const implemented=get('cavo-implemented')==='true',evidence=get('cavo-evidence'),source=get('cavo-source');
  const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/value-rubric',
   {headers:{'x-partner-id':get('partner'),'x-customer-value-token':get('customer-value-token')},cache:'no-store'});
  const data=await response.json();if(!response.ok||!data.rubric)throw Error('Customer rubric unavailable');
  const criterion=data.rubric.criteria.find(c=>c.enabled);
  if(!criterion)throw Error('Enable a customer criterion first');
  return {id,decisionId:related,implemented,at,actualCostMinor:amount,
   evidence,sourceIds:source?[source]:[],outcomes:[{criterionId:criterion.id,
    baseline:Number(get('cavo-baseline')),target:Number(get('cavo-target')),
    actual:Number(get('cavo-actual')),unit:get('cavo-outcome-unit'),evidence,
    ...(source?{sourceId:source}:{})}]};
 }
 if(kind==='costs')return {id,amountMinor:amount,currency:get('currency').toUpperCase(),
  actorId:get('cavo-actor'),workflowId:get('cavo-workflow'),attempt:get('cavo-attempt'),
  ruleId:related,ruleVersion:version};
 return {id,version,method:'DIRECT',shares:{[get('cavo-unit')]:1}};
}
document.getElementById('cavo-template').addEventListener('click',async()=>{
 const status=document.getElementById('cavo-status');
 try{document.getElementById('cavo-payload').value=JSON.stringify(await cavoFormPayload(),null,2);
  status.textContent='Review JSON before recording';}
 catch(e){status.textContent='CAVO error: '+e.message;}
});
document.getElementById('cavo-submit-form').addEventListener('click',async()=>{
 const status=document.getElementById('cavo-status');status.textContent='Saving';
 try{const payload=await cavoFormPayload();const result=await cavoRequest(get('cavo-kind'),payload);
  document.getElementById('cavo-payload').value=JSON.stringify(payload,null,2);
  document.getElementById('cavo-result').textContent=JSON.stringify(result,null,2);
  status.textContent='Event recorded';}
 catch(e){status.textContent='CAVO error: '+e.message;}
});
document.getElementById('cavo-save').addEventListener('click',async()=>{
 const status=document.getElementById('cavo-status');status.textContent='Saving';
 try{const payload=JSON.parse(get('cavo-payload'));
  const result=await cavoRequest(get('cavo-kind'),payload);
  document.getElementById('cavo-result').textContent=JSON.stringify(result,null,2);
  status.textContent='Event recorded';}
 catch(e){status.textContent='CAVO error: '+e.message;}
});
document.getElementById('load-partner').addEventListener('click',async()=>{
 const status=document.getElementById('partner-status'),workspace=document.getElementById('partner-workspace');
 status.textContent='Loading';workspace.replaceChildren();
 try{const response=await fetch('/partner',{headers:headers(),cache:'no-store'});
 const data=await response.json();if(!response.ok){status.textContent='Access error: '+(data.error??response.status);return;}
 document.title=data.brand.productName;
 const heading=document.querySelector('h1');heading.textContent=data.brand.productName;
 status.textContent=data.brand.legalEntity+' | '+data.brand.supportEmail;
 const select=document.createElement('select');select.setAttribute('aria-label','Select customer');
 const placeholder=document.createElement('option');placeholder.textContent='Select customer';placeholder.value='';select.append(placeholder);
 for(const customer of data.customers){const option=document.createElement('option');option.value=customer.customerId;
 option.textContent=customer.displayName+' ('+customer.customerId+')';select.append(option);}
 select.addEventListener('change',()=>{document.getElementById('customer').value=select.value;});workspace.append(select);
 }catch{status.textContent='Partner workspace unavailable';}
});
document.getElementById('request-source').addEventListener('submit',async e=>{
 e.preventDefault();const status=document.getElementById('request-status');status.textContent='Submitting';
 try{const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/source-requests',
 {method:'POST',headers:{...headers(),'content-type':'application/json'},
 body:JSON.stringify({source:get('source-type'),baseUrl:get('source-url')}),cache:'no-store'});
 const data=await response.json();status.textContent=response.ok?'Request queued for operator: '+data.id:
  'Request failed: '+(data.error??response.status);
 }catch{status.textContent='Request unavailable';}
});
document.getElementById('check-sources').addEventListener('click',async()=>{
 const status=document.getElementById('source-status');status.textContent='Checking';
 try{const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/sources',
  {headers:headers(),cache:'no-store'});const data=await response.json();
  status.textContent=response.ok?(data.configured?'Configured: '+data.sources.join(', '):
   'No data sources configured for this customer'):'Source error: '+(data.error??response.status);
 }catch{status.textContent='Source status unavailable';}
});
document.getElementById('scan-top').addEventListener('click',async()=>{
 const status=document.getElementById('scan-status'),summary=document.getElementById('scan-summary');
 const details=document.getElementById('scan-detail');status.textContent='Analyzing';
 summary.replaceChildren();details.textContent='';
 const params=new URLSearchParams({from:get('from'),to:get('to'),currency:get('currency').toUpperCase()});
 try{const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/top-spend?'+params,
 {headers:headers(),cache:'no-store'});const data=await response.json();
 if(!response.ok){status.textContent=data.explanation??('Scan error: '+data.error);return;}
 status.textContent='Observed usage only; causal ROI not established';
 summary.append(metric('Observed actors',String(data.population.observedActors)),
 metric('Top 10% share',data.population.topSharePct+'%'),
 metric('Top-group spend',money(data.spend.topSpendMinor,data.currency)));
 details.textContent=JSON.stringify(data,null,2);
 }catch{status.textContent='Scan unavailable';}
});
const weightExamples=[
 {id:'quality',label:'Quality',metric:'quality',weight:30},
 {id:'time',label:'Time saved',metric:'time_saved',weight:20},
 {id:'revenue',label:'Revenue',metric:'revenue',weight:15},
 {id:'risk',label:'Risk reduction',metric:'risk_reduction',weight:15},
 {id:'experience',label:'Customer experience',metric:'customer_experience',weight:15},
 {id:'cost',label:'Cost reduction',metric:'cost_reduction',weight:5}
];
function renderWeights(){
 const host=document.getElementById('weight-controls');host.replaceChildren();
 let criteria;try{criteria=JSON.parse(get('value-criteria'));}catch{return;}
 const total=criteria.filter(c=>c.enabled).reduce((sum,c)=>sum+c.weight,0);
 for(const c of criteria){
  const row=document.createElement('div');const label=document.createElement('label');
  const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=c.enabled;
  const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='100';
  slider.step='1';slider.value=String(c.weight);
  const number=document.createElement('span');
  number.textContent=' '+c.weight+' / '+(total?Math.round((c.enabled?c.weight:0)/total*1000)/10:0)+'%';
  toggle.addEventListener('change',()=>{c.enabled=toggle.checked;syncWeights(criteria);});
  slider.addEventListener('input',()=>{c.weight=Number(slider.value);syncWeights(criteria);});
  label.append(toggle,document.createTextNode(' '+c.label+' '),slider,number);
  const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
  remove.addEventListener('click',()=>syncWeights(criteria.filter(x=>x.id!==c.id)));
  row.append(label,remove);host.append(row);
 }
}
function syncWeights(criteria){document.getElementById('value-criteria').value=JSON.stringify(criteria,null,2);renderWeights();}
document.getElementById('default-weights').addEventListener('click',()=>{
 syncWeights(weightExamples.map(c=>({...c,enabled:true,minimumEvidence:'customer_attested'})));
});
document.getElementById('add-value-criterion').addEventListener('click',()=>{
 const name=get('new-value-label').trim(),description=get('new-value-description').trim();
 const measurementMethod=get('new-value-method').trim(),target=get('new-value-target').trim();
 const measurementType=get('new-value-type');
 const status=document.getElementById('rubric-status');
 if(!name||name.length>160||description.length>2000||measurementMethod.length>2000||target.length>500){status.textContent='Enter a valid criterion name';return;}
 let criteria;try{criteria=JSON.parse(get('value-criteria'));if(!Array.isArray(criteria))throw Error();}
 catch{status.textContent='Fix criteria JSON before adding';return;}
 if(criteria.length>=50){status.textContent='Maximum 50 criteria';return;}
 const id='custom_'+Math.random().toString(36).slice(2,12);
 criteria.push({id,label:name,description,measurementMethod,target,measurementType,metric:id,weight:10,enabled:true,
  minimumEvidence:'customer_attested'});
 syncWeights(criteria);document.getElementById('new-value-label').value='';
 document.getElementById('new-value-description').value='';
 document.getElementById('new-value-method').value='';document.getElementById('new-value-target').value='';status.textContent='Criterion added; save to apply';
});
document.getElementById('leadership-template').addEventListener('click',()=>{
 const status=document.getElementById('rubric-status');
 let criteria;try{criteria=JSON.parse(get('value-criteria'));if(!Array.isArray(criteria))throw Error();}
 catch{status.textContent='Fix criteria JSON first';return;}
 const examples=[
  ['strategic_ambition','Strategic ambition','Where to invest and how to build, own and protect proprietary intelligence'],
  ['human_agent_teams','Human-agent organization','Redesign work and collaboration between people and agents'],
  ['adoption_culture','AI adoption culture','Human and organizational barriers to AI adoption']
 ];
 for(const [id,label,description] of examples){
  if(criteria.some(c=>c.id===id||c.metric===id))continue;
  if(criteria.length>=50){status.textContent='Maximum 50 criteria';break;}
  criteria.push({id,label,description,metric:id,weight:10,enabled:false,
   measurementType:'qualitative',measurementMethod:'',target:'',
   minimumEvidence:'customer_attested'});
 }
 syncWeights(criteria);status.textContent='Examples added as disabled. Define customer targets, evidence and weights before enabling.';
});
document.getElementById('value-criteria').addEventListener('input',renderWeights);
renderWeights();
let rubricRevision=0;
const rubricUrl=()=>'/customers/'+encodeURIComponent(get('customer'))+'/value-rubric';
const rubricHeaders=()=>({'x-partner-id':get('partner'),
 'x-customer-value-token':get('customer-value-token')});
document.getElementById('load-rubric').addEventListener('click',async()=>{
 const status=document.getElementById('rubric-status');
 try{const response=await fetch(rubricUrl(),{headers:rubricHeaders(),cache:'no-store'});
 const data=await response.json();if(!response.ok){status.textContent=data.error;return;}
 rubricRevision=data.rubric?.revision??0;
 if(data.rubric){document.getElementById('value-criteria').value=JSON.stringify(data.rubric.criteria,null,2);renderWeights();}
 status.textContent='Customer revision '+rubricRevision;
 }catch{status.textContent='Cannot load customer criteria';}
});
document.getElementById('save-rubric').addEventListener('click',async()=>{
 const status=document.getElementById('rubric-status');
 try{const criteria=JSON.parse(get('value-criteria'));
 const response=await fetch(rubricUrl(),{method:'PUT',headers:{...rubricHeaders(),
 'content-type':'application/json'},body:JSON.stringify({expectedRevision:rubricRevision,criteria})});
 const data=await response.json();if(!response.ok){status.textContent=data.error;return;}
 rubricRevision=data.rubric.revision;status.textContent='Saved customer revision '+rubricRevision;
 }catch{status.textContent='Invalid criteria or save failed';}
});
document.getElementById('rubric-history').addEventListener('click',()=>loadValueHistory('history'));
document.getElementById('decision-history').addEventListener('click',()=>loadValueHistory('decisions'));
async function loadValueHistory(kind){
 const output=document.getElementById('value-history');
 try{const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/value-'+kind,
 {headers:rubricHeaders(),cache:'no-store'});
 const data=await response.json();output.textContent=JSON.stringify(data,null,2);
 }catch{output.textContent='History unavailable';}
}
document.getElementById('save-decision').addEventListener('click',async()=>{
 const status=document.getElementById('rubric-status');
 try{const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/value-decisions',
 {method:'POST',headers:{...rubricHeaders(),'content-type':'application/json'},
 body:JSON.stringify({signalId:get('decision-signal'),decision:get('decision-choice'),
 rationale:get('decision-reason'),expectedRevision:rubricRevision,from:get('from'),to:get('to')})});
 const data=await response.json();status.textContent=response.ok?'Customer decision recorded':data.error;
 }catch{status.textContent='Decision not recorded';}
});
document.getElementById('evaluate-value').addEventListener('click',async()=>{
 const status=document.getElementById('value-status'),details=document.getElementById('value-detail');
 status.textContent='Evaluating';details.textContent='';
 const params=new URLSearchParams({from:get('from'),to:get('to'),currency:get('currency').toUpperCase()});
 try{const response=await fetch('/customers/'+encodeURIComponent(get('customer'))+'/value-evaluation?'+params,
 {headers:headers(),cache:'no-store'});const data=await response.json();
 status.textContent=response.ok?(data.rubricStatus+' | Advisory only'):(data.error??'Evaluation failed');
 details.textContent=JSON.stringify(data,null,2);
 }catch{status.textContent='Evaluation unavailable';}
});
document.getElementById('load-history').addEventListener('click',async()=>{
 const status=document.getElementById('history-status'),container=document.getElementById('history');
 status.textContent='Loading';container.replaceChildren();
 try{const response=await fetch('/reports/'+encodeURIComponent(get('customer'))+'/history',{headers:headers(),cache:'no-store'});
 const data=await response.json();
 if(!response.ok){status.textContent='History error: '+(data.error??response.status);return;}
 status.textContent=data.snapshots.length+' saved reports';
 for(const snapshot of data.snapshots){const item=document.createElement('details');const title=document.createElement('summary');
 title.textContent=snapshot.createdAt+' | '+snapshot.from+' – '+snapshot.to+' | '+snapshot.currency;
 const details=document.createElement('pre');details.textContent=JSON.stringify(snapshot.report,null,2);item.append(title,details);container.append(item);}
 }catch{status.textContent='History request failed';}
});
const get=id=>document.getElementById(id).value;
const headers=()=>({'x-partner-id':get('partner'),authorization:'Bearer '+get('token')});
const money=(n,c)=>Number.isSafeInteger(n)?new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(n/100):'Not available';
const metric=(label,value)=>{const box=document.createElement('div');box.className='metric';const name=document.createElement('span');name.textContent=label;const number=document.createElement('strong');number.textContent=value;box.append(name,number);return box;};
document.getElementById('create-customer').addEventListener('submit',async e=>{
 e.preventDefault();const status=document.getElementById('customer-status');status.textContent='Creating customer';
 try{const response=await fetch('/customers',{method:'POST',headers:{...headers(),'content-type':'application/json'},body:JSON.stringify({customerId:get('new-customer'),displayName:get('customer-name'),enabled:true,allowedDomains:[]}),cache:'no-store'});const data=await response.json();status.textContent=response.ok?'Customer created: '+data.customerId:'Customer error: '+data.error;if(response.ok)document.getElementById('customer').value=data.customerId;}
 catch{status.textContent='Customer request failed';}
});
document.getElementById('report').addEventListener('submit',async e=>{
 e.preventDefault();const output=document.getElementById('result'),summary=document.getElementById('summary'),warning=document.getElementById('reconciliation');
 output.textContent='Loading';summary.replaceChildren();warning.textContent='';
 const currency=get('currency').toUpperCase();
 const query=new URLSearchParams({from:get('from'),to:get('to'),currency});
 try{const response=await fetch('/reports/'+encodeURIComponent(get('customer'))+'?'+query,{headers:headers(),cache:'no-store'});
 const data=await response.json();output.textContent=JSON.stringify({httpStatus:response.status,...data},null,2);
 if(!response.ok){warning.textContent='Report error: '+(data.error??response.status);return;}
 const spend=data.report?.spend??{};
 summary.append(metric('Invoice total',money(spend.invoiceMinor,currency)),metric('Metered usage',money(spend.usageMinor,currency)),metric('Unreconciled',money(spend.unreconciledMinor,currency)),metric('ROI status',data.report?.roi?.status??'NOT_ESTABLISHED'));
 warning.textContent=data.reconciliation?.warning??'Source reconciliation not verified';
 }catch{output.textContent='Request failed';warning.textContent='Report unavailable';}
});`;
