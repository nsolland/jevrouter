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
<section><h2>Cost report</h2><form id="report"><div class="grid">
<label>Customer ID<input id="customer" required></label>
<label>From<input id="from" type="date" required></label>
<label>To<input id="to" type="date" required></label>
<label>Currency<input id="currency" value="USD" required></label></div>
<button type="submit">Generate report</button></form>
<div id="summary" class="grid" aria-live="polite"></div>
<p id="reconciliation" class="warning" role="status"></p>
<details><summary>Evidence and full report</summary><pre id="result"></pre></details></section>
<section><h2>Report history</h2><button type="button" id="load-history">Load saved reports</button><p id="history-status" role="status"></p><div id="history"></div></section>
</main><script src="/portal.js"></script></body></html>`;
export const partnerPortalJs = `
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
