/** Loopback-only HTTP control API for partner customer administration.
 * TLS and reverse-proxy authentication are required before public deployment.
 */
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {PartnerRegistry} from './partner-registry.js';
import type {PartnerCustomer} from './partner-white-label.js';
const send=(res:ServerResponse,status:number,data:unknown)=>{
 res.writeHead(status,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(JSON.stringify(data));
};
const body=async(req:IncomingMessage)=>{
 let text='';
 for await(const chunk of req){
  text+=String(chunk);if(text.length>32768)throw Error('body_too_large');
 }
 return JSON.parse(text) as unknown;
};
export function createPartnerControlHandler(registry:PartnerRegistry){
 return async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   const path=new URL(req.url??'/', 'http://localhost').pathname;
   if(path==='/health'&&req.method==='GET'){
    send(res,200,{status:'ready',public:false});return;
   }
   const partnerId=req.headers['x-partner-id'];
   const authorization=req.headers.authorization;
   if(typeof partnerId!=='string'||!authorization?.startsWith('Bearer ')){
    send(res,401,{error:'unauthorized'});return;
   }
   const token=authorization.slice(7);
   await registry.authenticate(partnerId,token);
   if(path==='/partner'&&req.method==='GET'){
    const {brand,customers}=await registry.partnerOverview(partnerId,token);
    send(res,200,{brand,customers});return;
   }
   if(path==='/customers'&&req.method==='POST'){
    const data=await body(req);
    if(!data||typeof data!=='object'||Array.isArray(data)){
     send(res,400,{error:'invalid_customer'});return;
    }
    const d=data as Record<string,unknown>;
    if(typeof d.customerId!=='string'||typeof d.displayName!=='string'||
     d.enabled!==true||!Array.isArray(d.allowedDomains)||
     !d.allowedDomains.every(x=>typeof x==='string')){
     send(res,400,{error:'invalid_customer'});return;
    }
    const customer:PartnerCustomer={partnerId,customerId:d.customerId,
     displayName:d.displayName,enabled:true,allowedDomains:d.allowedDomains as string[]};
    await registry.addCustomer(partnerId,token,customer);
    send(res,201,{customerId:customer.customerId});return;
   }
   const match=/^\/customers\/([a-zA-Z0-9_-]{1,128})$/.exec(path);
   if(match&&req.method==='GET'){
    const {brand,customer}=await registry.customer(partnerId,token,match[1]);
    send(res,200,{brand:{productName:brand.productName,domain:brand.domain,
     legalEntity:brand.legalEntity,supportEmail:brand.supportEmail},customer});return;
   }
   send(res,404,{error:'not_found'});
  }catch(e){
   const message=(e as Error).message;
   const status=message==='partner_auth_denied'?401:
    message==='customer_scope_denied'?404:
    message==='customer_exists'?409:
    message==='body_too_large'||message==='invalid_customer'?400:500;
   send(res,status,{error:status===500?'internal_error':message});
  }
 };
}
export function createPartnerControlApi(registry:PartnerRegistry){
 return createServer(createPartnerControlHandler(registry));
}
