import '../server/env.mjs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {copyFile,mkdir} from 'node:fs/promises';
import {CommerceStore} from '../server/commerce-store.mjs';
import {demoAccounts} from '../server/demo-auth.mjs';

if(!demoAccounts(process.env))throw Error('Set LISHA_DEMO_AUTH=true and both demo accounts in .env first.');
const sourceDir=path.resolve(process.env.LISHA_DEMO_SOURCE_DIR||'data');
const targetDir=path.resolve(process.env.LISHA_DATA_DIR||'.sites-local/demo');
if(sourceDir===targetDir)throw Error('The demo must use a separate data directory.');
const store=new CommerceStore(targetDir);
try{
 if(store.setting('demoCatalogSeeded')){console.log('Demo catalog is already prepared; existing demo changes were preserved.');}
 else{
  if(store.db.prepare('SELECT COUNT(*) AS n FROM customers').get().n||store.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n)throw Error('Use a new, empty demo data directory.');
  const source=new DatabaseSync(path.join(sourceDir,'commerce.sqlite'),{readOnly:true});
  try{
   const products=source.prepare('SELECT * FROM products').all(),variants=source.prepare('SELECT * FROM variants').all(),media=source.prepare('SELECT * FROM media').all();
   await mkdir(path.join(targetDir,'catalog'),{recursive:true});
   for(const m of media){
    if(!/^[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(m.file))throw Error('Unexpected catalog image filename.');
    await copyFile(path.join(sourceDir,'catalog',m.file),path.join(targetDir,'catalog',m.file));
   }
   store.transaction(()=>{
    store.db.exec('DELETE FROM inventory_ledger; DELETE FROM variants; DELETE FROM products; DELETE FROM media;');
    for(const p of products)store.db.prepare('INSERT INTO products VALUES(?,?,?,?)').run(p.id,p.payload,p.version,p.updated_at);
    for(const v of variants){const stock=v.active?Math.max(10,v.stock):v.stock;store.db.prepare('INSERT INTO variants VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(v.id,v.product_id,v.sku,v.size,v.color_id,v.color_name,v.color_hex,stock,v.price,v.active,v.version);store.ledger(v.id,stock,'demo_initial_stock','demo-setup');}
    for(const m of media)store.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(m.id,m.file,m.mime,m.created_at);
    for(const key of ['printPricing','shippingMode','shippingFee','shippingPolicyV2']){const row=source.prepare('SELECT value FROM settings WHERE key=?').get(key);if(row)store.setSetting(key,JSON.parse(row.value));}
    store.setSetting('demoCatalogSeeded',true);store.audit('demo-setup','demo.catalog.prepare','catalog',{products:products.length});
   });
   console.log(`Demo prepared: ${products.length} products. Customer accounts, orders and private uploads were not copied.`);
  }finally{source.close()}
 }
}finally{store.close()}
