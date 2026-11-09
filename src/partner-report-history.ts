/** Tenant-scoped immutable report snapshots.
 * Each report is a separate exclusive-created file: independent processes
 * never rewrite the same JSON document or lose concurrent updates.
 */
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
export type ReportSnapshot={id:string;partnerId:string;customerId:string;
 createdAt:string;from:string;to:string;currency:string;report:unknown};
export class PartnerReportHistory{
 constructor(private readonly file:string){}
 private async legacy():Promise<ReportSnapshot[]>{
  try{const data=JSON.parse(await readFile(this.file,'utf8')) as unknown;
   if(!Array.isArray(data))throw Error('invalid_report_history');
   return data as ReportSnapshot[];
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 }
 private get directory(){return this.file+'.snapshots';}
 async append(input:Omit<ReportSnapshot,'id'|'createdAt'>):Promise<ReportSnapshot>{
  const snapshot={...input,id:randomUUID(),createdAt:new Date().toISOString()};
  await mkdir(dirname(this.file),{recursive:true,mode:0o700});
  await mkdir(this.directory,{recursive:true,mode:0o700});
  await writeFile(join(this.directory,snapshot.id+'.json'),JSON.stringify(snapshot),
   {mode:0o600,flag:'wx'});
  return snapshot;
 }
 async list(partnerId:string,customerId:string):Promise<ReportSnapshot[]>{
  const records=await this.legacy();
  let names:string[]=[];
  try{names=await readdir(this.directory);}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  for(const name of names){
   if(!/^[0-9a-f-]{36}\.json$/.test(name))continue;
   const data=JSON.parse(await readFile(join(this.directory,name),'utf8')) as ReportSnapshot;
   if(!data||typeof data!=='object'||typeof data.partnerId!=='string'||
    typeof data.customerId!=='string')throw Error('invalid_report_history');
   records.push(data);
  }
  return records.filter(x=>x.partnerId===partnerId&&x.customerId===customerId)
   .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 }
}
