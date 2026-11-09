import test from 'node:test';
import assert from 'node:assert/strict';
import {importLangfuseObservations} from '../src/langfuse-v2-adapter.js';
const args={baseUrl:'https://cloud.langfuse.com',publicKey:'pk-test',secretKey:'sk-test',
 partnerId:'partner',customerId:'customer',from:'2026-11-01T00:00:00Z',
 to:'2026-11-02T00:00:00Z'};
test('Langfuse v2 cursor import excludes IO and retains cost',async()=>{
 const urls:string[]=[];
 const fetcher=async(input:URL|RequestInfo,init?:RequestInit)=>{
  const url=new URL(String(input));urls.push(url.toString());
  assert.equal(url.searchParams.get('fields'),'core,basic,model,usage');
  assert.equal(url.searchParams.has('parseIoAsJson'),false);
  assert.equal(init?.headers&&'Authorization' in init.headers,true);
  const second=!!url.searchParams.get('cursor');
  return new Response(JSON.stringify(second?{data:[],meta:{cursor:null}}:{
   data:[{id:'obs1',type:'GENERATION',startTime:'2026-11-01T12:00:00Z',
    model:'test-model',name:'workflow',totalCost:0.0123,input:'DO NOT INGEST'}],
   meta:{cursor:'cursor1'}}),{status:200});
 };
 const r=await importLangfuseObservations({...args,fetcher:fetcher as typeof fetch});
 assert.equal(r.pages,2);assert.equal(r.usage.length,1);
 assert.equal(r.usage[0].amountMinor,1);
 assert.equal(JSON.stringify(r).includes('DO NOT INGEST'),false);
 assert.equal(urls.length,2);
});
test('Langfuse missing costs are not interpreted as zero',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({data:[{
  id:'obs2',type:'GENERATION',startTime:'2026-11-01T12:00:00Z',
  model:'m',totalCost:null}],meta:{cursor:null}}),{status:200});
 const r=await importLangfuseObservations({...args,fetcher:fetcher as typeof fetch});
 assert.deepEqual(r.unpriced,['obs2']);assert.equal(r.usage.length,0);
});
test('Langfuse rejects insecure remote endpoints',async()=>{
 await assert.rejects(importLangfuseObservations({...args,baseUrl:'http://remote.example'}),
  /langfuse_https_required/);
});
