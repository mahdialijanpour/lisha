import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import path from 'node:path';
import {products as seedProducts} from '../src/data.js';
import {models,colors,sizes} from '../shared/print-spec.js';
import {defaultPricing} from '../shared/pricing.js';

export const problem=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export const cleanText=(value,max=600)=>typeof value==='string'?value.trim().slice(0,max):'';
export const integer=(n,min=0,max=1_000_000_000)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function phoneNumber(value){
 const digits=String(value||'').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[\s()-]/g,'').replace(/^(\+98|0098)/,'0');
 if(!/^09\d{9}$/.test(digits))problem('شماره موبایل را به صورت ۰۹xxxxxxxxx وارد کن.');return digits;
}
const categories=['hoodies','sweatshirts','tote-bags','mugs'];
export const productImage=value=>{
 const image=cleanText(value,200);
 if(/^[a-zA-Z0-9_-]+\.(png|webp|jpe?g)$/.test(image))return `/assets/${image}`;
 if(/^\/assets\/[a-zA-Z0-9_-]+\.(png|webp|jpe?g)$/.test(image)||/^\/api\/catalog\/media\/[a-f0-9]{32}$/.test(image))return image;
 problem('تصویر را از فایل‌های سایت انتخاب یا بارگذاری کن.');
};
export class CommerceStore{
 constructor(dataDir){
  mkdirSync(dataDir,{recursive:true});this.dataDir=path.resolve(dataDir);
  this.db=new DatabaseSync(path.join(this.dataDir,'commerce.sqlite'),{timeout:5000});
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,phone TEXT NOT NULL UNIQUE,name TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS administrators(phone TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS otp(id TEXT PRIMARY KEY,phone TEXT NOT NULL,digest TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS limits(key TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS limits_lookup ON limits(key,created_at);
   CREATE TABLE IF NOT EXISTS claims(resource_type TEXT NOT NULL,resource_id TEXT NOT NULL,customer_id TEXT NOT NULL REFERENCES customers(id),PRIMARY KEY(resource_type,resource_id,customer_id));
   CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS variants(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),sku TEXT NOT NULL UNIQUE,size TEXT NOT NULL,color_id TEXT NOT NULL,color_name TEXT NOT NULL,color_hex TEXT NOT NULL,stock INTEGER NOT NULL CHECK(stock>=0),price INTEGER,active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1,UNIQUE(product_id,size,color_id));
   CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),authority TEXT UNIQUE,provider TEXT NOT NULL,status TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),state TEXT NOT NULL,redirect_url TEXT,reference TEXT,expires_at INTEGER NOT NULL,processing_at INTEGER,created_at INTEGER NOT NULL,error TEXT);
   CREATE TABLE IF NOT EXISTS reservations(payment_id TEXT NOT NULL REFERENCES payments(id),variant_id TEXT NOT NULL REFERENCES variants(id),qty INTEGER NOT NULL CHECK(qty>0),expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(payment_id,variant_id));
   CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,file TEXT NOT NULL,mime TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,resource TEXT NOT NULL,details TEXT NOT NULL,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS inventory_ledger(id TEXT PRIMARY KEY,variant_id TEXT NOT NULL,delta INTEGER NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL);
   PRAGMA user_version=1;`);
  this.transaction(()=>{
   if(!this.setting('otpSecret'))this.setSetting('otpSecret',randomBytes(32).toString('hex'));
   if(this.setting('catalogSeeded'))return;
   for(const p of seedProducts){
    const tote=p.category==='tote-bags';this.seedProduct({...p,type:'ready',status:'active',image:productImage(p.image),description:p.subtitle},(tote?['تک‌سایز']:sizes.map(s=>s[0])).map(size=>({size,colorId:tote?'cream':'black',colorName:tote?'کرم طبیعی':'مشکی',colorHex:tote?'#e6d8bc':'#303039'})));
   }
   for(const [kind,m] of Object.entries(models))this.seedProduct({id:`blank-${kind}`,name:`${m.name} با چاپ دلخواه`,category:kind,type:'custom',kind,status:'active',price:m.price,image:`/assets/${m.image}`,description:'لباس خام برای چاپ طرح دلخواه',subtitle:'از خیال تو، روی لباس'},sizes.flatMap(([size])=>colors.map(c=>({size,colorId:c.id,colorName:c.name,colorHex:c.hex}))));
   this.setSetting('catalogSeeded',true);this.setSetting('shippingFee',null);
  });
  this.transaction(()=>{
   if(this.setting('printPricingV1'))return;
   this.setSetting('printPricing',{...defaultPricing});
   for(const row of this.db.prepare('SELECT * FROM products').all()){
    const p=JSON.parse(row.payload);
    if(p.category==='hoodies'&&p.type==='ready'||p.id==='blank-hoodies'){
     p.price=p.type==='ready'?5200000:4950000;
     this.db.prepare('UPDATE products SET payload=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify(p),Date.now(),p.id);
     this.db.prepare('UPDATE variants SET price=NULL,version=version+1 WHERE product_id=?').run(p.id);
    }
   }
   this.setSetting('printPricingV1',true);this.audit('migration','pricing.demo-v1','catalog');
  });
  this.transaction(()=>{
   if(this.setting('sweatshirtBasePriceV2'))return;
   const row=this.db.prepare('SELECT payload FROM products WHERE id=?').get('blank-sweatshirts');
   if(row){
    const p=JSON.parse(row.payload);p.price=models.sweatshirts.price;
    this.db.prepare('UPDATE products SET payload=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify(p),Date.now(),'blank-sweatshirts');
    this.db.prepare('UPDATE variants SET price=NULL,version=version+1 WHERE product_id=? AND price=990000').run('blank-sweatshirts');
   }
   this.setSetting('sweatshirtBasePriceV2',true);this.audit('migration','pricing.sweatshirt-base-v2','blank-sweatshirts');
  });
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value}catch(e){this.db.exec('ROLLBACK');throw e}}
 setting(key){const row=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);return row?JSON.parse(row.value):null}
 setSetting(key,value){this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value))}
 audit(actor,action,resource,details={}){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),actor,action,resource,JSON.stringify(details),Date.now())}
 ledger(variant,delta,reason,actor){this.db.prepare('INSERT INTO inventory_ledger VALUES(?,?,?,?,?,?)').run(randomUUID(),variant,delta,reason,actor,Date.now())}
 seedProduct(p,variants){
  this.db.prepare('INSERT INTO products(id,payload,updated_at) VALUES(?,?,?)').run(p.id,JSON.stringify(p),Date.now());
  for(const v of variants)this.db.prepare('INSERT INTO variants(id,product_id,sku,size,color_id,color_name,color_hex,stock) VALUES(?,?,?,?,?,?,?,0)').run(randomUUID(),p.id,`${p.id}-${v.colorId}-${v.size}`,v.size,v.colorId,v.colorName,v.colorHex);
 }
 reserved(id,now=Date.now(),exceptPayment=''){
  return this.db.prepare('SELECT COALESCE(SUM(r.qty),0) AS qty FROM reservations r JOIN payments p ON p.id=r.payment_id WHERE r.variant_id=? AND r.consumed=0 AND r.expires_at>? AND r.payment_id<>? AND p.status IN (\'creating\',\'pending\',\'verifying\',\'uncertain\')').get(id,now,exceptPayment).qty;
 }
 variant(row){return {id:row.id,sku:row.sku,size:row.size,colorId:row.color_id,colorName:row.color_name,colorHex:row.color_hex,stock:row.stock,reserved:this.reserved(row.id),available:Math.max(0,row.stock-this.reserved(row.id)),price:row.price,active:!!row.active,version:row.version}}
 product(id,{admin=false}={}){
  const row=this.db.prepare('SELECT * FROM products WHERE id=?').get(id);if(!row)return null;
  const p=JSON.parse(row.payload);if(!admin&&p.status!=='active')return null;
  const variants=this.db.prepare('SELECT * FROM variants WHERE product_id=? ORDER BY rowid').all(id).map(v=>this.variant(v)).filter(v=>admin||v.active);
  return {...p,...(p.type==='ready'&&['hoodies','sweatshirts'].includes(p.category)?{includedPrint:{widthCm:20,heightCm:30,fit:'contain',includedInPrice:true}}:{}),version:row.version,variants:variants.map(v=>admin?v:(({stock,reserved,version,...publicVariant})=>publicVariant)(v)),available:variants.filter(v=>v.active).reduce((n,v)=>n+v.available,0)};
 }
 products(admin=false){return this.db.prepare('SELECT id FROM products ORDER BY rowid').all().map(p=>this.product(p.id,{admin})).filter(Boolean)}
 saveProduct(body,actor,id){
  if(!body||typeof body!=='object')problem('اطلاعات محصول معتبر نیست.');
  const current=id?this.product(id,{admin:true}):null;
  if(id&&!current)problem('محصول پیدا نشد.',404);
  if(current&&body.version!==current.version)problem('محصول یا موجودی آن تغییر کرده؛ اطلاعات تازه را دریافت کن.',409);
  const productId=id||cleanText(body.id,80)||`product-${randomBytes(8).toString('hex')}`;
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productId))problem('شناسه محصول فقط شامل حروف انگلیسی کوچک، عدد و خط تیره باشد.');
  if(!current&&this.product(productId,{admin:true}))problem('این شناسه محصول از قبل وجود دارد.',409);
  const type=current?.type||body.type||'ready',kind=current?.kind||body.kind;
  const p={id:productId,type,name:cleanText(body.name,120),subtitle:cleanText(body.subtitle,180),description:cleanText(body.description,6000),category:body.category,price:body.price,image:productImage(body.image),badge:cleanText(body.badge,50),color:/^#[a-fA-F0-9]{6}$/.test(body.color||'')?body.color:'#eee5f7',status:body.status, ...(type==='custom'?{kind}:{})};
  if(!p.name||!categories.includes(p.category)||!integer(p.price,1000,100_000_000)||!['active','draft','archived'].includes(p.status)||!['ready','custom'].includes(type)||(type==='custom'&&!Object.hasOwn(models,kind)))problem('نام، دسته‌بندی، قیمت، نوع یا وضعیت محصول معتبر نیست.');
  if(!Array.isArray(body.variants)||!body.variants.length||body.variants.length>100)problem('حداقل یک تنوع و حداکثر ۱۰۰ تنوع محصول تعریف کن.');
  const keys=new Set(),skus=new Set();const variants=body.variants.map(v=>{
   if(!v||typeof v!=='object')problem('اطلاعات تنوع معتبر نیست.');
   const key=`${v.size}:${v.colorId}`,sku=cleanText(v.sku,100);
   if(keys.has(key)||skus.has(sku)||!sku||!['تک‌سایز',...sizes.map(s=>s[0])].includes(v.size)||!/^[a-z0-9-]{1,40}$/.test(v.colorId||'')||!cleanText(v.colorName,60)||!/^#[a-fA-F0-9]{6}$/.test(v.colorHex||'')||!integer(v.stock,0,1_000_000)||(v.price!==null&&v.price!==undefined&&!integer(v.price,1000,100_000_000)))problem('رنگ، سایز، کد کالا، قیمت یا موجودی تنوع معتبر نیست.');
   if(type==='custom'&&(!colors.some(c=>c.id===v.colorId)||!sizes.some(s=>s[0]===v.size)))problem('برای لباس چاپ دلخواه، رنگ و سایز را از گزینه‌های طراح انتخاب کن.');
   keys.add(key);skus.add(sku);return {...v,sku,colorName:cleanText(v.colorName,60),price:v.price??null};
  });
  return this.transaction(()=>{
   const live=id?this.product(id,{admin:true}):null;if(live&&live.version!==body.version)problem('محصول هم‌زمان تغییر کرده؛ دوباره دریافت کن.',409);
   if(!current)this.db.prepare('INSERT INTO products(id,payload,updated_at) VALUES(?,?,?)').run(productId,JSON.stringify(p),Date.now());
   else this.db.prepare('UPDATE products SET payload=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify(p),Date.now(),productId);
   const kept=new Set();
   for(const v of variants){
    const existing=this.db.prepare('SELECT * FROM variants WHERE product_id=? AND size=? AND color_id=?').get(productId,v.size,v.colorId);
    const collision=this.db.prepare('SELECT id FROM variants WHERE sku=?').get(v.sku);if(collision&&collision.id!==existing?.id)problem('کد کالا تکراری است.',409);
    if(existing&&v.version!==existing.version)problem('موجودی این تنوع تغییر کرده؛ محصول را دوباره دریافت کن.',409);
    const variantId=existing?.id||randomUUID(),reserved=existing?this.reserved(existing.id):0;
    if(v.stock<reserved)problem(`موجودی نمی‌تواند از ${reserved} عدد رزروشده کمتر باشد.`,409);
    if(existing)this.db.prepare('UPDATE variants SET sku=?,color_name=?,color_hex=?,stock=?,price=?,active=?,version=version+1 WHERE id=?').run(v.sku,v.colorName,v.colorHex,v.stock,v.price,v.active===false?0:1,variantId);
    else this.db.prepare('INSERT INTO variants(id,product_id,sku,size,color_id,color_name,color_hex,stock,price,active) VALUES(?,?,?,?,?,?,?,?,?,?)').run(variantId,productId,v.sku,v.size,v.colorId,v.colorName,v.colorHex,v.stock,v.price,v.active===false?0:1);
    const delta=v.stock-(existing?.stock||0);if(delta)this.ledger(variantId,delta,'admin_adjustment',actor);kept.add(variantId);
   }
   for(const v of this.db.prepare('SELECT id FROM variants WHERE product_id=?').all(productId))if(!kept.has(v.id)){
    if(this.reserved(v.id)>0)problem('تنوع رزروشده را نمی‌توان حذف کرد؛ بعد از پایان پرداخت دوباره تلاش کن.',409);
    this.db.prepare('UPDATE variants SET active=0,version=version+1 WHERE id=?').run(v.id);
   }
   this.audit(actor,current?'product.update':'product.create',productId,{name:p.name});return this.product(productId,{admin:true});
  });
 }
 getOrder(id){const row=this.db.prepare('SELECT payload FROM orders WHERE id=?').get(id);return row?JSON.parse(row.payload):null}
 saveOrder(order){this.db.prepare('UPDATE orders SET payload=?,status=? WHERE id=?').run(JSON.stringify(order),order.status,order.id)}
 payments(orderId){return this.db.prepare('SELECT id,provider,status,amount,reference,expires_at,created_at,error FROM payments WHERE order_id=? ORDER BY created_at DESC').all(orderId)}
 receipt(order){return {...order,payments:this.payments(order.id).map(p=>({id:p.id,provider:p.provider,status:p.status,amountToman:p.amount,reference:p.reference,expiresAt:p.expires_at,createdAt:p.created_at,error:p.error}))}}
 orders(customerId){return this.db.prepare(customerId?'SELECT payload FROM orders WHERE customer_id=? ORDER BY created_at DESC':'SELECT payload FROM orders ORDER BY created_at DESC').all(...(customerId?[customerId]:[])).map(r=>this.receipt(JSON.parse(r.payload)))}
 claimed(type,id,customerId){return !!customerId&&!!this.db.prepare('SELECT 1 FROM claims WHERE resource_type=? AND resource_id=? AND customer_id=?').get(type,id,customerId)}
 hasClaim(type,id){return !!this.db.prepare('SELECT 1 FROM claims WHERE resource_type=? AND resource_id=?').get(type,id)}
 claim(type,id,customerId){this.db.prepare('INSERT OR IGNORE INTO claims VALUES(?,?,?)').run(type,id,customerId)}
 isAdmin(phone){return !!this.db.prepare('SELECT 1 FROM administrators WHERE phone=?').get(phone)}
 addAdmin(phone){this.db.prepare('INSERT OR IGNORE INTO administrators VALUES(?,?)').run(phoneNumber(phone),Date.now())}
 close(){this.db.close()}
}
