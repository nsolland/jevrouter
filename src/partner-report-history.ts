/** Tenant-scoped, append-only report snapshots with atomic file replacement.
 * Contains aggregate report data only. Never store authorization headers.
 */
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
export type ReportSnapshot={id:string;partnerId:string;customerId:string;
 createdAt:string;from:string;to:string;currency:string;report:unknown};
export class PartnerReportHistory{
 private static pending=new Map<string,Promise<void>>();
 constructor(private readonly file:string){}
 private async read():Promise<ReportSnapshot[]>{
  try{const data=JSON.parse(await readFile(this.file,'utf8')) as unknown;
   if(!Array.isArray(data))throw Error('invalid_report_history');
   return data as ReportSnapshot[];
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 }
 async append(input:Omit<ReportSnapshot,'id'|'createdAt'>):Promise<ReportSnapshot>{
  const prior=PartnerReportHistory.pending.get(this.file)??Promise.resolve();
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const next=prior.then(()=>gate);PartnerReportHistory.pending.set(this.file,next);
  await prior;
  try{
   const snapshot={...input,id:randomUUID(),createdAt:new Date().toISOString()};
   const records=await this.read();records.push(snapshot);
   await mkdir(dirname(this.file),{recursive:true,mode:0o700});
   const temp=this.file+'.'+randomUUID()+'.tmp';
   await writeFile(temp,JSON.stringify(records),{mode:0o600,flag:'wx'});
   await rename(temp,this.file);await chmod(this.file,0o600);
   return snapshot;
  }finally{release();if(PartnerReportHistory.pending.get(this.file)===next)
   PartnerReportHistory.pending.delete(this.file);}
 }
 async list(partnerId:string,customerId:string):Promise<ReportSnapshot[]>{
  return (await this.read()).filter(x=>x.partnerId===partnerId&&x.customerId===customerId);
 }
}
