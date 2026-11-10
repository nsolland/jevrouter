/** Local persistent partner registry. Tokens are stored as scrypt hashes,
 * never plaintext. File is mode 0600; writes use atomic rename.
 */
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {PartnerBrand,PartnerCustomer} from './partner-white-label.js';
type Principal={partnerId:string;tokenHash:string;tokenSalt:string;role:'owner'|'operator'};
type Registry={version:1;partners:PartnerBrand[];customers:PartnerCustomer[];principals:Principal[]};
const empty=():Registry=>({version:1,partners:[],customers:[],principals:[]});
const digest=(token:string,salt:string)=>scryptSync(token,salt,32).toString('hex');
export class PartnerRegistry{
 private static pending=new Map<string,Promise<void>>();
 private async exclusive<T>(work:()=>Promise<T>):Promise<T>{
  const prior=PartnerRegistry.pending.get(this.file)??Promise.resolve();
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const next=prior.then(()=>gate);
  PartnerRegistry.pending.set(this.file,next);
  await prior;
  try{return await work();}finally{release();
   if(PartnerRegistry.pending.get(this.file)===next)PartnerRegistry.pending.delete(this.file);}
 }
 constructor(private readonly file:string){}
 private async load():Promise<Registry>{
  try{const r=JSON.parse(await readFile(this.file,'utf8')) as Registry;
   if(r.version!==1||!Array.isArray(r.partners)||!Array.isArray(r.customers)||
    !Array.isArray(r.principals))throw Error('invalid_partner_registry');
   return r;
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return empty();throw e;}
 }
 private async save(r:Registry){
  await mkdir(dirname(this.file),{recursive:true,mode:0o700});
  const tmp=this.file+'.'+randomBytes(8).toString('hex')+'.tmp';
  await writeFile(tmp,JSON.stringify(r),{mode:0o600,flag:'wx'});
  await rename(tmp,this.file);await chmod(this.file,0o600);
 }
 async provision(brand:PartnerBrand,token:string){
  if(!brand.partnerId||token.length<32)throw Error('invalid_partner_credentials');
  return this.exclusive(async()=>{
  const r=await this.load();
  if(r.partners.some(x=>x.partnerId===brand.partnerId))throw Error('partner_exists');
  const salt=randomBytes(16).toString('hex');
  r.partners.push(brand);
  r.principals.push({partnerId:brand.partnerId,tokenSalt:salt,
   tokenHash:digest(token,salt),role:'owner'});
  await this.save(r);
  });
 }
 async authenticate(partnerId:string,token:string){
  const r=await this.load();
  const candidates=r.principals.filter(x=>x.partnerId===partnerId);
  const p=candidates.find(x=>{if(!token)return false;const actual=Buffer.from(digest(token,x.tokenSalt),'hex');
   const expected=Buffer.from(x.tokenHash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);});
  if(!p||!token)throw Error('partner_auth_denied');
  return {partnerId,role:p.role};
 }
 async addCustomer(partnerId:string,token:string,customer:PartnerCustomer){
  if(customer.partnerId!==partnerId||!customer.customerId)
   throw Error('customer_scope_denied');
  return this.exclusive(async()=>{
  const actor=await this.authenticate(partnerId,token);
  if(actor.role!=='owner')throw Error('role_forbidden');
  const r=await this.load();
  if(r.customers.some(c=>c.partnerId===partnerId&&c.customerId===customer.customerId))
   throw Error('customer_exists');
  r.customers.push(customer);await this.save(r);
  });
 }
 async rotateToken(partnerId:string,oldToken:string,newToken:string){
  if(newToken.length<32)throw Error('invalid_partner_credentials');
  return this.exclusive(async()=>{
   const actor=await this.authenticate(partnerId,oldToken);
   if(actor.role!=='owner')throw Error('role_forbidden');
   const r=await this.load();
   const principal=r.principals.find(p=>p.partnerId===partnerId&&p.role==='owner');
   if(!principal)throw Error('partner_auth_denied');
   principal.tokenSalt=randomBytes(16).toString('hex');
   principal.tokenHash=digest(newToken,principal.tokenSalt);
   await this.save(r);
  });
 }
 async issueOperator(partnerId:string,ownerToken:string,operatorToken:string){
  if(operatorToken.length<32)throw Error('invalid_partner_credentials');
  return this.exclusive(async()=>{
   const actor=await this.authenticate(partnerId,ownerToken);
   if(actor.role!=='owner')throw Error('role_forbidden');
   const r=await this.load();
   const salt=randomBytes(16).toString('hex');
   r.principals.push({partnerId,tokenSalt:salt,tokenHash:digest(operatorToken,salt),role:'operator'});
   await this.save(r);
  });
 }
 async partnerOverview(partnerId:string,token:string){
  await this.authenticate(partnerId,token);
  const r=await this.load();
  const brand=r.partners.find(b=>b.partnerId===partnerId);
  if(!brand)throw Error('partner_missing');
  return {brand,customers:r.customers.filter(c=>c.partnerId===partnerId)};
 }
 async customer(partnerId:string,token:string,customerId:string){
  await this.authenticate(partnerId,token);
  const r=await this.load();
  const customer=r.customers.find(c=>c.partnerId===partnerId&&c.customerId===customerId);
  if(!customer||!customer.enabled)throw Error('customer_scope_denied');
  const brand=r.partners.find(b=>b.partnerId===partnerId);
  if(!brand)throw Error('partner_missing');
  return {brand,customer};
 }
}
