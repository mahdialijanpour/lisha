import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CommerceStore} from './commerce-store.mjs';
import {demoAccounts} from './demo-auth.mjs';

const bundleDir=fileURLToPath(new URL('../demo-catalog/',import.meta.url));
const settingKeys=['printPricing','shippingMode','shippingFee','shippingPolicyV2'];
const productKeys=['id','type','kind','name','subtitle','description','category','price','image','badge','color','status'];
const variantKeys=['id','product_id','sku','size','color_id','color_name','color_hex','stock','price','active','version'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]));
const validMedia=m=>/^[a-f0-9]{32}$/.test(m.id)&&new RegExp(`^${m.id}\\.(jpg|png|webp)$`).test(m.file)&&['image/jpeg','image/png','image/webp'].includes(m.mime);

// Export only the catalog; customer, session and order tables never enter the bundle.
export async function exportDemoCatalog(sourceDir,targetDir=bundleDir){
 const db=new DatabaseSync(path.join(sourceDir,'commerce.sqlite'),{readOnly:true});
 let catalog;
 try{
  db.exec('BEGIN');
  const products=db.prepare('SELECT payload FROM products ORDER BY rowid').all().map(row=>pick(JSON.parse(row.payload),productKeys));
  const mediaIds=new Set(products.map(p=>/^\/api\/catalog\/media\/([a-f0-9]{32})$/.exec(p.image)?.[1]).filter(Boolean));
  const media=db.prepare('SELECT id,file,mime FROM media').all().filter(m=>mediaIds.has(m.id));
  if(media.length!==mediaIds.size||media.some(m=>!validMedia(m)))throw Error('A catalog image is missing or invalid.');
  const variants=db.prepare('SELECT * FROM variants ORDER BY rowid').all().map(v=>pick(v,variantKeys));
  const settings=Object.fromEntries(settingKeys.flatMap(key=>{const row=db.prepare('SELECT value FROM settings WHERE key=?').get(key);return row?[[key,JSON.parse(row.value)]]:[]}));
  catalog={version:1,products,variants,media,settings};db.exec('COMMIT');
 }finally{db.close()}
 await mkdir(path.join(targetDir,'media'),{recursive:true});
 for(const m of catalog.media)await copyFile(path.join(sourceDir,'catalog',m.file),path.join(targetDir,'media',m.file));
 await writeFile(path.join(targetDir,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
 return catalog;
}

export async function prepareDemoCatalog({dataDir,env=process.env,catalogDir=bundleDir,onlyIfNew=false}){
 if(!demoAccounts(env))throw Error('Enable LISHA_DEMO_AUTH and configure both demo accounts first.');
 if(onlyIfNew&&existsSync(path.join(dataDir,'commerce.sqlite'))){
  // Retry our own interrupted first import, but never replace an existing live catalog.
  const existing=new DatabaseSync(path.join(dataDir,'commerce.sqlite'),{readOnly:true});
  try{
   const pending=existing.prepare('SELECT value FROM settings WHERE key=?').get('demoCatalogPending');
   if(pending?.value!=='true')return {skipped:true};
  }finally{existing.close()}
 }
 const catalog=JSON.parse(await readFile(path.join(catalogDir,'catalog.json'),'utf8'));
 if(catalog.version!==1||!catalog.products?.length||!Array.isArray(catalog.variants)||!Array.isArray(catalog.media)||catalog.media.some(m=>!validMedia(m)))throw Error('Invalid demo catalog bundle.');
 const store=new CommerceStore(dataDir);
 try{
  if(store.setting('demoCatalogSeeded'))return {skipped:true};
  const assertEmpty=()=>{
   if(['customers','orders','payments','sessions'].some(table=>store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n))throw Error('Demo import requires a new data directory; existing accounts and orders will not be overwritten.');
  };
  assertEmpty();store.setSetting('demoCatalogPending',true);
  await mkdir(path.join(dataDir,'catalog'),{recursive:true});
  for(const m of catalog.media)await copyFile(path.join(catalogDir,'media',m.file),path.join(dataDir,'catalog',m.file));
  store.transaction(()=>{
   assertEmpty();
   if(store.setting('demoCatalogSeeded'))return;
   store.db.exec('DELETE FROM inventory_ledger; DELETE FROM variants; DELETE FROM products; DELETE FROM media;');
   for(const p of catalog.products)store.db.prepare('INSERT INTO products(id,payload,updated_at) VALUES(?,?,?)').run(p.id,JSON.stringify(pick(p,productKeys)),Date.now());
   for(const v of catalog.variants){
    const stock=v.active?Math.max(10,v.stock):v.stock;
    store.db.prepare('INSERT INTO variants VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(v.id,v.product_id,v.sku,v.size,v.color_id,v.color_name,v.color_hex,stock,v.price,v.active,v.version);
    store.ledger(v.id,stock,'demo_initial_stock','demo-setup');
   }
   for(const m of catalog.media)store.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(m.id,m.file,m.mime,Date.now());
   for(const key of settingKeys)if(Object.hasOwn(catalog.settings||{},key))store.setSetting(key,catalog.settings[key]);
   store.setSetting('demoCatalogSeeded',true);
   store.db.prepare('DELETE FROM settings WHERE key=?').run('demoCatalogPending');
   store.audit('demo-setup','demo.catalog.prepare','catalog',{products:catalog.products.length});
  });
  return {products:catalog.products.length,media:catalog.media.length};
 }finally{store.close()}
}
