import { defineConfig } from 'vite';
import './server/env.mjs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import {createPrintApi} from './server/api.mjs';
function install(server,development){const api=createPrintApi({dataDir:process.env.LISHA_DATA_DIR,development});server.middlewares.use(api);server.httpServer?.once('close',()=>api.close())}
export default defineConfig({ plugins: [react(),{name:'lisha-commerce-api',configureServer(server){install(server,true)},configurePreviewServer(server){install(server,false)}}], server: { host: '127.0.0.1',fs:{deny:['.env','.env.*','**/*.{crt,pem}','**/.git/**','**/data/**','**/.sites-local/**','**/development-otp/**','**/*.sqlite*',`${path.resolve(process.env.LISHA_DATA_DIR||'data').replaceAll('\\','/')}/**`]} } });
