import {readFile,stat} from 'node:fs/promises';
import {scanTopAiSpend,type TopSpendScanInput} from './top-ai-spend-scan.js';
import {configurePartnerSourceFromEnv,provisionCustomerValueFromEnv,issueOperatorFromEnv,provisionPartnerFromEnv,startPartnerServiceFromEnv} from './partner-operator.js';
const mode=process.argv[2];
try{
 if(mode==='provision'){
  const result=await provisionPartnerFromEnv();
  process.stdout.write(JSON.stringify(result)+'\n');
 }else if(mode==='issue-operator'){
  const result=await issueOperatorFromEnv();
  process.stdout.write(JSON.stringify(result)+'\n');
 }else if(mode==='configure-source'){
  const result=await configurePartnerSourceFromEnv();
  process.stdout.write(JSON.stringify(result)+'\n');
 }else if(mode==='provision-customer-value'){
  const result=await provisionCustomerValueFromEnv();
  process.stdout.write(JSON.stringify(result)+'\n');
 }else if(mode==='scan-top-spend'){
  const file=process.env.SPEND_SCAN_INPUT_FILE;
  if(!file)throw Error('missing_environment:SPEND_SCAN_INPUT_FILE');
  const info=await stat(file);
  if(!info.isFile()||(info.mode&0o077)!==0)throw Error('insecure_scan_file_permissions');
  const input=JSON.parse(await readFile(file,'utf8')) as TopSpendScanInput;
  process.stdout.write(JSON.stringify(scanTopAiSpend(input))+'\n');
 }else if(mode==='serve'){
  const {address}=await startPartnerServiceFromEnv();
  process.stdout.write('partner service listening on '+JSON.stringify(address)+'\n');
 }else{
  process.stderr.write('Usage: partner-spend-cli provision|issue-operator|configure-source|provision-customer-value|scan-top-spend|serve\n');
  process.exitCode=2;
 }
}catch(e){
 process.stderr.write('partner service failed: '+(e as Error).message+'\n');
 process.exitCode=1;
}
