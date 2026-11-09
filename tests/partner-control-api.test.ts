import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PartnerRegistry} from '../src/partner-registry.js';
import {createPartnerControlApi} from '../src/partner-control-api.js';
test('HTTP partner control API enforces authentication and customer isolation',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'partner-api-')),'store.json');
 const registry=new PartnerRegistry(file),token='x'.repeat(48),other='y'.repeat(48);
 const brand=(partnerId:string)=>({partnerId,productName:'White Label',
  supportEmail:'ops@example.org',domain:'app.example.org',legalEntity:'Partner Ltd'});
 await registry.provision(brand('p'),token);
 await registry.provision(brand('q'),other);
 const server=createPartnerControlApi(registry);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw Error('missing_server');
  const base='http://127.0.0.1:'+address.port;
  const headers=(partner:string,key:string)=>({
   'x-partner-id':partner,authorization:'Bearer '+key,'content-type':'application/json'});
  const create=await fetch(base+'/customers',{method:'POST',headers:headers('p',token),
   body:JSON.stringify({customerId:'a',displayName:'Customer A',
    enabled:true,allowedDomains:[]})});
  assert.equal(create.status,201);
  const ok=await fetch(base+'/customers/a',{headers:headers('p',token)});
  assert.equal(ok.status,200);
  assert.equal((await ok.json()).customer.customerId,'a');
  assert.equal((await fetch(base+'/customers/a',{headers:headers('q',other)})).status,404);
  assert.equal((await fetch(base+'/customers/a',{headers:headers('p','wrong')})).status,401);
  assert.equal((await fetch(base+'/customers/a')).status,401);
 }finally{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
