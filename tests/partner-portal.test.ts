import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerReportApi} from '../src/partner-report-api.js';
test('same-origin partner portal serves UI and script with restrictive CSP',async()=>{
 const registry=new PartnerRegistry(join(await mkdtemp(join(tmpdir(),'portal-')),'db.json'));
 const server=createPartnerReportApi(registry,async()=>{throw Error('not_called');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const a=server.address();if(!a||typeof a==='string')throw Error('no_port');
  const base='http://127.0.0.1:'+a.port;
  const html=await fetch(base+'/portal');
  assert.equal(html.status,200);
  assert.match(html.headers.get('content-security-policy')??'',/default-src 'none'/);
  assert.match(html.headers.get('content-security-policy')??'',/style-src 'sha256-/);
  const markup=await html.text();
  assert.match(markup,/AI Value & Spend Intelligence/);
  assert.match(markup,/Create customer/);
  assert.match(markup,/Report history/);
  assert.match(markup,/Unreconciled|Evidence and full report/);
  const js=await fetch(base+'/portal.js');
  assert.equal(js.status,200);
  const script=await js.text();
  assert.match(script,/authorization:'Bearer '/);
  assert.match(script,/fetch\('\/customers'/);
  assert.match(script,/replaceChildren/);
  assert.match(script,/load-history/);
  assert.match(script,/\/history/);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
