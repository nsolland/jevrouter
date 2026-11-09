import {provisionPartnerFromEnv,startPartnerServiceFromEnv} from './partner-operator.js';
const mode=process.argv[2];
try{
 if(mode==='provision'){
  const result=await provisionPartnerFromEnv();
  process.stdout.write(JSON.stringify(result)+'\n');
 }else if(mode==='serve'){
  const {address}=await startPartnerServiceFromEnv();
  process.stdout.write('partner service listening on '+JSON.stringify(address)+'\n');
 }else{
  process.stderr.write('Usage: partner-spend-cli provision|serve\n');
  process.exitCode=2;
 }
}catch(e){
 process.stderr.write('partner service failed: '+(e as Error).message+'\n');
 process.exitCode=1;
}
