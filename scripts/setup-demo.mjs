import '../server/env.mjs';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import {exportDemoCatalog,prepareDemoCatalog} from '../server/demo-catalog.mjs';

const dataDir=path.resolve(process.env.LISHA_DATA_DIR||'data');
let temporary;
try{
 // Optional local database source; hosting uses the tracked bundle by default.
 if(process.env.LISHA_DEMO_SOURCE_DIR){
  const sourceDir=path.resolve(process.env.LISHA_DEMO_SOURCE_DIR);
  if(sourceDir===dataDir)throw Error('Source and target data directories must differ.');
  temporary=await mkdtemp(path.join(os.tmpdir(),'lisha-demo-export-'));
  await exportDemoCatalog(sourceDir,temporary);
 }
 const result=await prepareDemoCatalog({dataDir,...(temporary?{catalogDir:temporary}:{})});
 console.log(result.skipped?'Demo catalog already prepared; existing changes were preserved.':`Demo prepared: ${result.products} products in ${dataDir}.`);
}finally{if(temporary)await rm(temporary,{recursive:true,force:true})}
