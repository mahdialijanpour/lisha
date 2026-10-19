// Production smoke check: disposable data, no real payments or SMS.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
await readFile(path.join(root,'dist/index.html')).catch(()=>{throw Error('Run npm run build before npm run demo:check.')});
const dataDir=await mkdtemp(path.join(os.tmpdir(),'lisha-demo-check-'));
const env={...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'0',LISHA_DATA_DIR:dataDir,LISHA_PUBLIC_URL:'http://127.0.0.1',LISHA_DEMO_AUTH:'true',LISHA_DEMO_ADMIN_PHONE:'09999990001',LISHA_DEMO_ADMIN_CODE:'735291',LISHA_DEMO_CUSTOMER_PHONE:'09999990002',LISHA_DEMO_CUSTOMER_CODE:'426815'};
let running;
async function start(){
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 const closed=new Promise(resolve=>child.once('close',resolve));running={child,closed};
 return new Promise((resolve,reject)=>{
  let output='';const timeout=setTimeout(()=>reject(Error('Production startup timed out.')),15000);
  child.once('error',e=>{clearTimeout(timeout);reject(e)});
  child.once('close',code=>{clearTimeout(timeout);reject(Error(`Server stopped (${code}): ${output}`))});
  child.stderr.on('data',bytes=>{output+=bytes});
  child.stdout.on('data',bytes=>{output+=bytes;const match=/Lisha ready on port (\d+)/.exec(output);if(match){clearTimeout(timeout);resolve(`http://127.0.0.1:${match[1]}`)}});
 });
}
async function stop(){if(!running)return;const {child,closed}=running;running=null;child.kill();await closed}
function client(origin){
 const cookies=new Map();
 return async(route,body,status=200)=>{
  const response=await fetch(origin+'/api'+route,{method:body===undefined?'GET':'POST',headers:{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  for(const cookie of response.headers.getSetCookie()){const [pair]=cookie.split(';'),equals=pair.indexOf('=');cookies.set(pair.slice(0,equals),pair.slice(equals+1))}
  const result=await response.json();assert.equal(response.status,status,`${route}: ${JSON.stringify(result)}`);return result;
 };
}
try{
 let origin=await start();
 const guest=client(origin),customer=client(origin),admin=client(origin);
 const catalog=await guest('/catalog');
 assert.equal(catalog.loginMode,'demo');assert.equal(catalog.payment.available,false);
 assert.ok(catalog.products.length>0);assert.ok(catalog.products.every(p=>p.available>0));
 for(const route of ['/','/shop/','/custom-print/','/cart/','/checkout/','/my-account/','/admin/']){
  const response=await fetch(origin+route);assert.equal(response.status,200,route);assert.match(response.headers.get('content-type'),/text\/html/);
 }
 for(const p of catalog.products){const response=await fetch(origin+p.image);assert.equal(response.status,200,p.image);assert.match(response.headers.get('content-type'),/^image\//)}
 await guest('/admin/products',undefined,401);await guest('/favorites',undefined,401);
 const customerLogin=await customer('/auth/demo',{phone:env.LISHA_DEMO_CUSTOMER_PHONE,code:env.LISHA_DEMO_CUSTOMER_CODE});assert.equal(customerLogin.customer.role,'customer');
 const adminLogin=await admin('/auth/admin/demo',{phone:env.LISHA_DEMO_ADMIN_PHONE,code:env.LISHA_DEMO_ADMIN_CODE});assert.equal(adminLogin.customer.role,'admin');
 await customer('/admin/products',undefined,403);await admin('/favorites',undefined,403);
 const product=catalog.products.find(p=>p.type==='ready'),variant=product.variants.find(v=>v.available>0);
 assert.ok(product&&variant);
 const items=[{productId:product.id,variantId:variant.id,colorId:variant.colorId,size:variant.size,qty:1}];
 const quote=await customer('/cart/quote',{items});
 assert.equal(quote.totals.productsTotal,variant.price??product.price);assert.equal(quote.totals.finalTotal,quote.totals.productsTotal+quote.totals.shipping);
 await customer('/favorites',{productId:product.id,saved:true});
 const checkout={idempotencyKey:randomUUID(),confirmed:true,expectedProductsTotal:quote.totals.productsTotal,items,customer:{name:'مشتری آزمایش خودکار',phone:env.LISHA_DEMO_CUSTOMER_PHONE,province:'تهران',city:'تهران',street:'نشانی مصنوعی برای تست؛ ارسال واقعی ندارد',postalCode:'1111111111'}};
 await guest('/checkout',checkout,401);
 const order=await customer('/checkout',checkout,201);
 assert.equal(order.paymentStatus,'not_paid');assert.equal(order.totals.finalTotal,quote.totals.finalTotal);
 assert.equal((await customer('/checkout',checkout,201)).id,order.id);
 assert.ok((await admin('/admin/orders')).some(o=>o.id===order.id));
 assert.equal((await customer(`/orders/${order.id}`)).id,order.id);
 await guest(`/orders/${order.id}`,undefined,401);
 await customer(`/orders/${order.id}/pay`,{provider:'zarinpal',expectedTotal:order.totals.finalTotal},503);
 await stop();origin=await start();
 const returning=client(origin);await returning('/auth/demo',{phone:env.LISHA_DEMO_CUSTOMER_PHONE,code:env.LISHA_DEMO_CUSTOMER_CODE});
 assert.equal((await returning(`/orders/${order.id}`)).id,order.id);
 assert.ok((await returning('/favorites')).productIds.includes(product.id));
 console.log(`Demo check passed: ${catalog.products.length} products, photos, page routes, both fixed logins, permissions, quote, checkout, idempotency and persistence after restart. No real payment or SMS was sent.`);
}finally{
 await stop();
 assert.equal(path.dirname(path.resolve(dataDir)),path.resolve(os.tmpdir()));assert.match(path.basename(dataDir),/^lisha-demo-check-/);
 await rm(dataDir,{recursive:true,force:true});
}
