import { defineConfig } from 'vite';
import './server/env.mjs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import {createPrintApi} from './server/api.mjs';
import {prepareDemoCatalog} from './server/demo-catalog.mjs';
async function install(server,development){
 const dataDir=path.resolve(process.env.LISHA_DATA_DIR||'data');
 if(process.env.LISHA_DEMO_AUTH==='true')await prepareDemoCatalog({dataDir,onlyIfNew:true});
 const api=createPrintApi({dataDir,development});server.middlewares.use(api);server.httpServer?.once('close',()=>api.close());
}
export default defineConfig({ plugins: [react(),{name:'lisha-commerce-api',async configureServer(server){await install(server,true)},async configurePreviewServer(server){await install(server,false)}}], server: { host: '127.0.0.1',fs:{deny:['.env','.env.*','**/*.{crt,pem}','**/.git/**','**/data/**','**/.sites-local/**','**/development-otp/**','**/*.sqlite*',`${path.resolve(process.env.LISHA_DATA_DIR||'data').replaceAll('\\','/')}/**`]} } });
