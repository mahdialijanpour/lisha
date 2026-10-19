import '../server/env.mjs';
import path from 'node:path';
import {exportDemoCatalog} from '../server/demo-catalog.mjs';

const sourceDir=path.resolve(process.argv[2]||process.env.LISHA_DATA_DIR||'data');
const catalog=await exportDemoCatalog(sourceDir);
console.log(`Exported ${catalog.products.length} products and ${catalog.media.length} catalog images to demo-catalog/. No accounts, orders, sessions or private uploads were exported.`);
