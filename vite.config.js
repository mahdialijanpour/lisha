import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {createPrintApi} from './server/api.mjs';
const api=()=>createPrintApi({dataDir:process.env.LISHA_DATA_DIR});
export default defineConfig({ plugins: [react(),{name:'lisha-print-api',configureServer(server){server.middlewares.use(api())},configurePreviewServer(server){server.middlewares.use(api())}}], server: { host: '127.0.0.1' } });
