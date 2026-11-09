import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PartnerReportHistory} from '../src/partner-report-history.js';
test('history persists and isolates tenant snapshots across instances',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'spend-history-')),'reports.json');
 const history=new PartnerReportHistory(file);
 const base={from:'2026-11-01',to:'2026-11-30',currency:'USD',report:{amount:12}};
 await Promise.all(Array.from({length:8},(_,i)=>history.append({...base,
  partnerId:i%2?'other':'p',customerId:i%2?'c2':'c1'})));
 const reopened=new PartnerReportHistory(file);
 assert.equal((await reopened.list('p','c1')).length,4);
 assert.equal((await reopened.list('p','c2')).length,0);
 assert.equal((await reopened.list('other','c2')).length,4);
 const files=await readdir(file+'.snapshots');
 assert.equal(files.length,8);
 assert.equal((await stat(join(file+'.snapshots',files[0]))).mode&0o777,0o600);
});
