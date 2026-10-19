import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {createPrintApi} from '../server/api.mjs';

test('customer favorites and reviews require ownership, persist and derive buyer badges from paid orders',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lisha-customer-')),messages=new Map();
 const options={dataDir:dir,env:{},sms:{mode:'development',async send(m){messages.set(m.phone,m)}}};
 let handler=createPrintApi(options);const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 function client(){let cookie='';return async(p,body,status=200)=>{const r=await fetch(origin+'/api'+p,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const auth=r.headers.getSetCookie().find(c=>c.startsWith('lisha_auth='));if(auth)cookie=auth.split(';')[0];const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value}}
 const anonymous=client(),a=client(),b=client(),admin=client();
 async function login(c,phone,role='customer'){const prefix=role==='admin'?'/auth/admin':'/auth';const challenge=await c(`${prefix}/request`,{phone});return c(`${prefix}/verify`,{phone,code:messages.get(phone).code,challengeId:challenge.challengeId})}
 try{
  handler.store.addAdmin('09999991003');await login(admin,'09999991003','admin');await login(a,'09999991001');await login(b,'09999991002');
  await a('/auth/profile',{name:'نگار نمونه'});
  await anonymous('/favorites',undefined,401);await anonymous('/favorites',{productId:'coffee-cat',saved:true},401);await anonymous('/customer/reviews',undefined,401);
  await admin('/favorites',undefined,403);await admin('/products/coffee-cat/reviews',{rating:5,text:'نظر حساب مدیریت'},403);
  await a('/favorites',{productId:'missing-product',saved:true},404);await a('/favorites',{productId:'coffee-cat',saved:'true'},400);
  assert.deepEqual((await a('/favorites',{productId:'coffee-cat',saved:true})).productIds,['coffee-cat']);
  assert.deepEqual((await a('/favorites',{productId:'coffee-cat',saved:true})).productIds,['coffee-cat']);
  assert.deepEqual((await b('/favorites')).productIds,[]);await b('/favorites',{productId:'coffee-cat',saved:false});assert.deepEqual((await a('/favorites')).productIds,['coffee-cat']);
  await anonymous('/products/coffee-cat/reviews',{rating:5,text:'نظر بدون ورود'},401);
  await a('/products/coffee-cat/reviews',{rating:6,text:'امتیاز اشتباه'},400);await a('/products/coffee-cat/reviews',{rating:4,text:'کم'},400);await a('/products/coffee-cat/reviews',{rating:4,text:'a'.repeat(1501)},400);
  let reviews=await a('/products/coffee-cat/reviews',{rating:4,text:'طرح قشنگی دارد و اندازه‌اش خوب است.',verifiedPurchase:true});
  const reviewId=reviews.reviews[0].id;assert.equal(reviews.total,1);assert.equal(reviews.average,4);assert.equal(reviews.reviews[0].author,'نگار');assert.equal(reviews.reviews[0].verifiedPurchase,false);assert.equal(reviews.reviews[0].isOwn,true);assert.equal(JSON.stringify(reviews).includes('09999991001'),false);
  assert.equal((await anonymous('/products/coffee-cat/reviews')).reviews[0].isOwn,false);assert.equal((await b('/customer/reviews')).reviews.length,0);assert.equal((await anonymous('/reviews')).total,0);
  reviews=await a('/products/coffee-cat/reviews',{rating:5,text:'ویرایش تجربهٔ من برای همین محصول.'});assert.equal(reviews.total,1);assert.equal(reviews.reviews[0].id,reviewId);assert.equal(reviews.average,5);
  let product=await admin('/admin/products/coffee-cat');product=await admin('/admin/products/coffee-cat',{...product,variants:product.variants.map(v=>({...v,stock:2}))});const variant=product.variants.find(v=>v.size==='M');
  const order=await a('/checkout',{idempotencyKey:crypto.randomUUID(),confirmed:true,customer:{name:'نگار نمونه',phone:'09999991001',province:'تهران',city:'تهران',street:'نشانی آزمایشی پلاک ۱۰ واحد ۲',postalCode:'1234567890'},items:[{productId:product.id,variantId:variant.id,size:variant.size,colorId:variant.colorId,qty:1}]},201);
  assert.equal((await anonymous('/reviews')).total,0);
  // Trusted test fixture: no live gateway or payment is executed here.
  const paid=handler.store.getOrder(order.id);paid.paymentStatus='paid';paid.status='paid';handler.store.saveOrder(paid);
  assert.equal((await anonymous('/products/coffee-cat/reviews')).reviews[0].verifiedPurchase,true);assert.equal((await anonymous('/reviews')).total,1);
  assert.equal((await a('/customer/reviews')).reviews[0].verifiedPurchase,true);
  handler.close();handler=createPrintApi(options);
  assert.deepEqual((await a('/favorites')).productIds,['coffee-cat']);assert.deepEqual((await b('/favorites')).productIds,[]);assert.equal((await a('/customer/reviews')).reviews.length,1);
  assert.deepEqual((await a('/favorites',{productId:'coffee-cat',saved:false})).productIds,[]);
  const refunded=handler.store.getOrder(order.id);refunded.refundRequired=true;handler.store.saveOrder(refunded);assert.equal((await anonymous('/reviews')).total,0);
  product=await admin('/admin/products/coffee-cat');await admin('/admin/products/coffee-cat/action',{version:product.version,action:'visibility'});await a('/favorites',{productId:'coffee-cat',saved:true},404);await anonymous('/products/coffee-cat/reviews',undefined,404);
 }finally{await new Promise(r=>server.close(r));handler.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^lisha-customer-/);await rm(dir,{recursive:true,force:true})}
});
