import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {createPrintApi} from '../server/api.mjs';
import {CommerceStore} from '../server/commerce-store.mjs';
import {CustomerAuth,smsTransport} from '../server/customer-auth.mjs';
const removeTestDir=async dir=>{const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.match(path.basename(resolved),/^lisha-(auth|commerce)-/);await rm(resolved,{recursive:true,force:true})};
import {zarinpalGateway} from '../server/payment.mjs';

test('blank sweatshirt price migration updates existing catalog once, preserving stock and order snapshots',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lisha-commerce-price-'));let store=new CommerceStore(dir);
 try{
  let product=store.product('blank-sweatshirts',{admin:true});assert.equal(product.price,4950000);
  const variant=product.variants[0];product.price=990000;
  store.db.prepare('UPDATE products SET payload=? WHERE id=?').run(JSON.stringify(product),product.id);
  store.db.prepare('UPDATE variants SET stock=7,price=990000 WHERE id=?').run(variant.id);
  store.db.prepare('DELETE FROM settings WHERE key=?').run('sweatshirtBasePriceV2');
  store.db.prepare('INSERT INTO customers(id,phone,created_at) VALUES(?,?,?)').run('price-migration-customer','09999999999',Date.now());
  const snapshot={id:'LC-1111111111111111',totals:{baseProducts:990000},items:[{unitPrice:990000}]};
  store.db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?)').run(snapshot.id,'price-migration-customer','price-migration','hash',JSON.stringify(snapshot),'awaiting_payment',Date.now());
  store.close();store=new CommerceStore(dir);product=store.product(product.id,{admin:true});
  assert.equal(product.price,4950000);assert.equal(product.variants[0].stock,7);assert.equal(product.variants[0].price,null);assert.deepEqual(store.getOrder(snapshot.id),snapshot);
  product.price=5100000;store.db.prepare('UPDATE products SET payload=? WHERE id=?').run(JSON.stringify(product),product.id);
  store.close();store=new CommerceStore(dir);assert.equal(store.product(product.id).price,5100000);
 }finally{store.close();await removeTestDir(dir)}
});

test('phone OTP expiry, attempt limit, single use and production SMS fail closed',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lisha-auth-')),store=new CommerceStore(dir);let clock=Date.now(),message;
 const auth=new CustomerAuth(store,{now:()=>clock,sms:{mode:'development',async send(m){message=m}}});
 const req={headers:{},socket:{}},res={getHeader(){},setHeader(){}};
 try{
  assert.equal(smsTransport({dataDir:dir,development:false,env:{}}).mode,'unavailable');
  const challenge=await auth.request('۰۹۱۲۳۴۵۶۷۸۹','test');assert.equal(challenge.code,undefined);assert.equal(message.phone,'09123456789');
  const row=store.db.prepare('SELECT * FROM otp WHERE id=?').get(challenge.challengeId);assert.notEqual(row.digest,message.code);assert.equal(row.digest.length,64);
  const wrong=message.code==='111111'?'222222':'111111';for(let i=0;i<5;i++)assert.throws(()=>auth.verify({phone:message.phone,code:wrong,challengeId:message.id},req,res));
  assert.throws(()=>auth.verify({phone:message.phone,code:message.code,challengeId:message.id},req,res));
  clock+=61000;await auth.request(message.phone,'test');const body={phone:message.phone,code:message.code,challengeId:message.id};assert.equal(auth.verify(body,req,res).role,'customer');assert.throws(()=>auth.verify(body,req,res));
  clock+=61000;await auth.request(message.phone,'test');clock+=121000;assert.throws(()=>auth.verify({phone:message.phone,code:message.code,challengeId:message.id},req,res));
 }finally{store.close();await removeTestDir(dir)}
});

test('commerce: permissions, catalog, checkout, stock races, callbacks, print approval and persistence',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lisha-commerce-'));const messages=new Map(),created=new Map();let serial=0,verifyMode='paid';
 const gateway={provider:'test',available:true,publicUrl:'https://test.invalid',async create(input){const authority=`A${String(++serial).padStart(35,'0')}`;created.set(authority,input);return {authority,redirectUrl:`https://test.invalid/pay/${authority}`}},async verify({authority,amount}){assert.equal(amount,created.get(authority).amount);if(verifyMode==='timeout')throw Error('timeout');return {paid:verifyMode==='paid',reference:`REF-${authority}`}}};
 let handler=createPrintApi({dataDir:dir,sms:{mode:'development',async send(m){messages.set(m.phone,m)}},gateway});
 const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 function client(){let cookies={};return async(p,body,headers={})=>{const response=await fetch(origin+p,{method:body===undefined?'GET':'POST',headers:{Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});for(const c of response.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');cookies[k]=v}return response}}
 const a=client(),b=client(),admin=client(),anonymous=client();
 async function json(c,p,body,status=200){const r=await c(p,body);const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));return value}
 async function login(c,phone){const prefix=phone==='09123456781'?'/api/auth/admin':'/api/auth';const challenge=await json(c,`${prefix}/request`,{phone});const m=messages.get(phone);assert.equal(challenge.code,undefined);return json(c,`${prefix}/verify`,{phone,code:m.code,challengeId:challenge.challengeId})}
 const customer={name:'مشتری آزمایشی',phone:'09123456789',province:'تهران',city:'تهران',street:'آدرس آزمایشی پلاک ۱۰ واحد ۲',postalCode:'1234567890'};
 const checkout=(v,extra={})=>({idempotencyKey:crypto.randomUUID(),confirmed:true,customer,items:[{productId:v.productId,variantId:v.id,size:v.size,colorId:v.colorId,qty:1,price:1}],...extra});
 let product,variant,orderA,orderB;
 try{
  await t.test('anonymous and normal accounts cannot access administration',async()=>{
   await json(anonymous,'/api/admin/products',undefined,401);await login(a,'09123456789');await login(b,'09123456780');await json(a,'/api/admin/products',undefined,403);handler.store.addAdmin('09123456781');await login(admin,'09123456781');
   const products=await json(admin,'/api/admin/products');product=products.find(p=>p.type==='ready');variant={...product.variants.find(v=>v.size==='M'),productId:product.id};assert.equal(variant.stock,0);
  });
  await t.test('admin and customer login endpoints enforce roles and bind OTPs to their login purpose',async()=>{
   const probe=client(),normalPhone='09999990021',adminPhone='09999990022';
   const sentBefore=messages.size;
   await json(probe,'/api/auth/admin/request',{phone:normalPhone},403);
   await json(probe,'/api/auth/request',{phone:'09123456781',purpose:'admin'},403);
   assert.equal(messages.size,sentBefore);
   assert.equal((await json(probe,'/api/auth/session')).customer,null);
   const normal=await json(probe,'/api/auth/request',{phone:normalPhone});
   const normalBody={phone:normalPhone,code:messages.get(normalPhone).code,challengeId:normal.challengeId};
   await json(probe,'/api/auth/admin/verify',{...normalBody,purpose:'customer'},400);
   assert.equal((await json(probe,'/api/auth/session')).customer,null);
   assert.equal((await json(probe,'/api/auth/verify',normalBody)).customer.role,'customer');
   await json(probe,'/api/auth/logout',{});
   handler.store.addAdmin(adminPhone);
   const manager=await json(probe,'/api/auth/admin/request',{phone:adminPhone});
   const managerBody={phone:adminPhone,code:messages.get(adminPhone).code,challengeId:manager.challengeId};
   await json(probe,'/api/auth/verify',{...managerBody,purpose:'admin'},400);
   assert.equal((await json(probe,'/api/auth/session')).customer,null);
   assert.equal((await json(probe,'/api/auth/admin/verify',managerBody)).customer.role,'admin');
   assert.equal((await json(probe,'/api/auth/session')).customer.role,'admin');
   await json(probe,'/api/auth/admin/verify',managerBody,400);
  });
  await t.test('catalog stock is explicit; edits use optimistic versions and survive restart',async()=>{
   const update={...product,variants:product.variants.map(v=>({...v,stock:v.id===variant.id?1:0}))};product=await json(admin,`/api/admin/products/${product.id}`,update);await json(admin,`/api/admin/products/${product.id}`,update,409);
   const catalog=await json(anonymous,'/api/catalog');const v=catalog.products.find(p=>p.id===product.id).variants.find(v=>v.id===variant.id);assert.equal(v.available,1);assert.equal(v.stock,undefined);
   await json(admin,'/api/admin/settings',{shippingFee:50000});handler.close();handler=createPrintApi({dataDir:dir,sms:{mode:'development',async send(m){messages.set(m.phone,m)}},gateway});assert.equal((await json(a,'/api/auth/session')).customer.phone,'09123456789');
  });
  await t.test('checkout requires authentication and ignores forged prices, stores address and is idempotent',async()=>{
   const body=checkout(variant);await json(anonymous,'/api/checkout',body,401);orderA=await json(a,'/api/checkout',body,201);assert.equal(orderA.totals.baseProducts,product.price);assert.equal(orderA.totals.finalTotal,product.price+50000);assert.equal(orderA.customer.address.street,customer.street);assert.equal(orderA.items[0].sku,variant.sku);assert.equal((await json(a,'/api/checkout',body,201)).id,orderA.id);await json(a,'/api/checkout',{...body,customer:{...customer,name:'تغییر'}},409);await json(b,`/api/orders/${orderA.id}`,undefined,404);await json(b,`/api/orders/${orderA.id}/print`,undefined,404);orderB=await json(b,'/api/checkout',checkout(variant),201);
  });
  await t.test('two buyers cannot reserve the last unit; pending payment is reused',async()=>{
   const responses=await Promise.all([a(`/api/orders/${orderA.id}/pay`,{}),b(`/api/orders/${orderB.id}/pay`,{})]);assert.deepEqual(responses.map(r=>r.status),[200,409]);await responses[1].json();const started=await responses[0].json();const second=await json(a,`/api/orders/${orderA.id}/pay`,{});assert.equal(second.redirectUrl,started.redirectUrl);assert.equal(created.size,1);assert.equal((await json(anonymous,'/api/catalog')).products.find(p=>p.id===product.id).available,0);
   const stale=await json(admin,`/api/admin/products/${product.id}`);await json(admin,`/api/admin/products/${product.id}`,{...stale,variants:stale.variants.map(v=>({...v,stock:0}))},409);
  });
  await t.test('forged callbacks do not pay; uncertain verification keeps stock; repeated callbacks deduct once',async()=>{
   const [authority,input]=[...created][0];const callback=new URL(input.callbackUrl);callback.searchParams.set('Authority',authority);callback.searchParams.set('Status','OK');const bad=new URL(callback);bad.searchParams.set('state','forged');assert.equal((await anonymous(bad.pathname+bad.search)).status,400);assert.equal((await json(a,`/api/orders/${orderA.id}`)).paymentStatus,'not_paid');
   verifyMode='timeout';assert.equal((await anonymous(callback.pathname+callback.search)).status,303);assert.equal((await json(admin,`/api/admin/products/${product.id}`)).variants.find(v=>v.id===variant.id).reserved,1);
   verifyMode='paid';const before=await json(admin,`/api/admin/products/${product.id}`);assert.equal((await json(admin,`/api/orders/${orderA.id}/retry-payment`,{})).paymentStatus,'paid');await Promise.all([anonymous(callback.pathname+callback.search),anonymous(callback.pathname+callback.search)]);const paid=await json(a,`/api/orders/${orderA.id}`);assert.equal(paid.paymentStatus,'paid');assert.equal(paid.paidAmountToman,product.price+50000);assert.equal((await json(admin,`/api/admin/products/${product.id}`)).variants.find(v=>v.id===variant.id).stock,0);await json(admin,`/api/admin/products/${product.id}`,before,409);assert.equal((await json(admin,'/api/admin/inventory-log')).filter(r=>r.reason.startsWith('payment:')).length,1);
  });
  await t.test('paid orders cannot be repriced/cancelled; fulfillment requires tracking and correct transitions',async()=>{
   await json(admin,`/api/admin/orders/${orderA.id}/quote`,{shipping:0,printingSurcharge:0},409);await json(admin,`/api/admin/orders/${orderA.id}/cancel`,{},409);await json(admin,`/api/admin/orders/${orderA.id}/fulfill`,{status:'completed'},409);await json(admin,`/api/admin/orders/${orderA.id}/fulfill`,{status:'processing'});await json(admin,`/api/admin/orders/${orderA.id}/fulfill`,{status:'shipped'},400);await json(admin,`/api/admin/orders/${orderA.id}/fulfill`,{status:'shipped',trackingCode:'TEST-123'});assert.equal((await json(a,`/api/orders/${orderA.id}`)).trackingCode,'TEST-123');
  });
  await t.test('product CRUD supports draft, publish, variants, images and archive',async()=>{
   const image=await readFile(new URL('../public/assets/blank-sweatshirt.webp',import.meta.url));const media=await json(admin,'/api/admin/media',{image:'data:image/webp;base64,'+image.toString('base64')},201);assert.equal((await anonymous(media.url)).status,200);assert.deepEqual((await fetch(origin+media.url)).headers.getSetCookie(),[]);
   let p=await json(admin,'/api/admin/products',{name:'ماگ آزمایش',category:'mugs',type:'ready',price:200000,status:'draft',image:media.url,variants:[{size:'تک‌سایز',colorId:'cream',colorName:'شیری',colorHex:'#faf7f0',stock:2,sku:'TEST-MUG',price:null}]},201);assert.equal((await json(anonymous,'/api/catalog')).products.some(v=>v.id===p.id),false);
   p=await json(admin,`/api/admin/products/${p.id}`,{...p,status:'active'});assert.equal((await json(anonymous,'/api/catalog')).products.some(v=>v.id===p.id),true);p=await json(admin,`/api/admin/products/${p.id}`,{...p,status:'archived'});assert.equal((await json(anonymous,'/api/catalog')).products.some(v=>v.id===p.id),false);
  });
  await t.test('declined payments release stock; abandoned reservations expire; late payments flag a stock issue',async()=>{
   let p=await json(admin,`/api/admin/products/${product.id}`);p=await json(admin,`/api/admin/products/${p.id}`,{...p,variants:p.variants.map(v=>({...v,stock:v.id===variant.id?1:v.stock}))});
   await json(b,`/api/orders/${orderB.id}/pay`,{});let entry=[...created].at(-1);let callback=new URL(entry[1].callbackUrl);callback.searchParams.set('Authority',entry[0]);verifyMode='declined';await anonymous(callback.pathname+callback.search);assert.equal((await json(anonymous,'/api/catalog')).products.find(p=>p.id===product.id).available,1);
   await json(b,`/api/orders/${orderB.id}/pay`,{});entry=[...created].at(-1);const pending=handler.store.db.prepare('SELECT * FROM payments WHERE authority=?').get(entry[0]);handler.store.db.prepare('UPDATE payments SET expires_at=? WHERE id=?').run(Date.now()-1,pending.id);handler.store.db.prepare('UPDATE reservations SET expires_at=? WHERE payment_id=?').run(Date.now()-1,pending.id);
   assert.equal((await json(anonymous,'/api/catalog')).products.find(p=>p.id===product.id).available,1);
   await json(admin,`/api/admin/orders/${orderB.id}/quote`,{printingSurcharge:0,shipping:100000},409);
   const competing=await json(b,'/api/checkout',checkout(variant),201);await json(b,`/api/orders/${competing.id}/pay`,{});
   callback=new URL(entry[1].callbackUrl);callback.searchParams.set('Authority',entry[0]);verifyMode='paid';await anonymous(callback.pathname+callback.search);const late=await json(b,`/api/orders/${orderB.id}`);assert.equal(late.status,'paid_stock_issue');assert.equal(late.paymentStatus,'paid');assert.equal(late.refundRequired,true);assert.equal((await json(admin,`/api/admin/products/${product.id}`)).variants.find(v=>v.id===variant.id).stock,1);
  });
  await t.test('custom prints are priced immediately and can be paid before production approval',async()=>{
   let p=await json(admin,'/api/admin/products/blank-hoodies');assert.equal(p.price,4950000);p=await json(admin,`/api/admin/products/${p.id}`,{...p,variants:p.variants.map(v=>({...v,stock:v.colorId==='navy'&&v.size==='M'?2:0}))});const v=p.variants.find(v=>v.colorId==='navy'&&v.size==='M');const image=await readFile(new URL('../public/assets/blank-sweatshirt.webp',import.meta.url));const raw='data:image/webp;base64,'+image.toString('base64');const asset=await json(a,'/api/print-assets',{original:raw,preview:raw,fileName:'custom.webp'},201);
   const custom={schemaVersion:3,kind:'hoodies',colorId:'navy',note:'دو طرف کلاه',placements:['hood.right','hood.left','rightSleeve.middle','back.center'].map(slotId=>({slotId,assetId:asset.id,widthCm:slotId==='back.center'?20:8}))};const body=checkout({...v,productId:p.id});body.items[0].custom=custom;
   const quote=await json(a,'/api/cart/quote',{items:body.items});assert.equal(quote.items[0].pricing.printing,800000);assert.equal(quote.items[0].pricing.charges.length,4);assert.equal(quote.totals.finalTotal,5800000);assert.equal(quote.totals.productsTotal,5750000);
   await json(a,'/api/checkout',{...body,expectedProductsTotal:1},409);const order=await json(a,'/api/checkout',{...body,expectedProductsTotal:5750000},201);assert.equal(order.status,'awaiting_payment');assert.equal(order.totals.finalTotal,5800000);assert.equal(order.productionApproved,false);assert.equal(order.items[0].unitPrice,5750000);assert.equal(order.items[0].custom.placements[0].sha256,asset.sha256);assert.deepEqual(order.items[0].custom.placements[3].printFrameCm,{width:20,height:30});
   await json(a,`/api/orders/${order.id}/pay`,{provider:'other',expectedTotal:5800000},400);await json(a,`/api/orders/${order.id}/pay`,{provider:'test',expectedTotal:1},409);await json(a,`/api/orders/${order.id}/pay`,{provider:'test',expectedTotal:5800000});
   const [authority,input]=[...created].at(-1);const callback=new URL(input.callbackUrl);callback.searchParams.set('Authority',authority);await anonymous(callback.pathname+callback.search);assert.equal((await json(a,`/api/orders/${order.id}`)).paymentStatus,'paid');
   await json(admin,`/api/admin/orders/${order.id}/fulfill`,{status:'processing'},409);await json(admin,`/api/admin/orders/${order.id}/approve-production`,{productionApproved:true,productionNote:'ابعاد واقعی و اجرای چاپ بررسی شد.'});await json(admin,`/api/admin/orders/${order.id}/fulfill`,{status:'processing'});
   await json(b,'/api/cart/quote',{items:body.items},404);assert.equal((await b(asset.originalUrl)).status,404);assert.equal((await admin(asset.originalUrl)).status,200);
   const settings=await json(admin,'/api/admin/settings');await json(admin,'/api/admin/settings',{pricing:{...settings.pricing,mode:'area',ratePerCm2:34}});await json(admin,'/api/admin/settings',{pricing:{...settings.pricing,mode:'area'}},409);
   const areaItems=[{...body.items[0],custom:{...custom,placements:[{slotId:'front.center',assetId:asset.id,widthCm:20},{slotId:'front.upperLeft',assetId:asset.id,widthCm:10}]}}];const area=await json(a,'/api/cart/quote',{items:areaItems});assert.equal(area.items[0].pricing.charges[0].amountToman,20400);assert.equal(area.items[0].pricing.charges[1].amountToman,3400);assert.equal(area.totals.productsTotal,4973800);assert.equal((await json(a,`/api/orders/${order.id}`)).paidAmountToman,5800000);
   await json(a,'/api/cart/quote',{items:[...areaItems,...areaItems]},409);
   await json(a,'/api/auth/logout',{});assert.equal((await a(asset.originalUrl)).status,404);await login(a,'09123456782');assert.equal((await a(asset.originalUrl)).status,404);
   handler.store.db.prepare('UPDATE otp SET created_at=created_at-61000 WHERE phone=?').run('09123456789');const fresh=client();await login(fresh,'09123456789');assert.equal((await fresh(asset.originalUrl)).status,200);assert.equal((await json(fresh,`/api/orders/${order.id}`)).id,order.id);
  });
  await t.test('ready sweatshirts, bags and mugs keep their full printed price in area mode',async()=>{
   const crew=await json(admin,'/api/admin/products',{name:'دورس آماده آزمایش',category:'sweatshirts',type:'ready',price:1300000,status:'active',image:'/assets/sweatshirts-front.png',variants:[{size:'S',colorId:'black',colorName:'مشکی',colorHex:'#303039',stock:1,sku:'TEST-READY-CREW',price:null}]},201);
   const mug=await json(admin,'/api/admin/products',{name:'ماگ آماده آزمایش',category:'mugs',type:'ready',price:240000,status:'active',image:'/assets/coffee-cat.webp',variants:[{size:'تک‌سایز',colorId:'cream',colorName:'شیری',colorHex:'#faf7f0',stock:1,sku:'TEST-READY-MUG',price:null}]},201);
   let tote=(await json(admin,'/api/admin/products')).find(p=>p.id==='daisy-tote');tote=await json(admin,`/api/admin/products/${tote.id}`,{...tote,variants:tote.variants.map(v=>({...v,stock:1}))});
   const quote=await json(anonymous,'/api/cart/quote',{items:[crew,mug,tote].map(p=>({productId:p.id,variantId:p.variants[0].id,size:p.variants[0].size,qty:1}))});assert.equal(quote.totals.baseProducts,1930000);assert.equal(quote.totals.printingSurcharge,0);assert.equal(quote.totals.finalTotal,1980000);assert.deepEqual(quote.items[0].includedPrint,{widthCm:20,heightCm:30,fit:'contain',includedInPrice:true});
  });
 }finally{await new Promise(r=>server.close(r));handler.close();await removeTestDir(dir)}
});

test('Zarinpal adapter converts toman to rial and verifies stored amount; no credentials means unavailable',async()=>{
 assert.equal(zarinpalGateway({env:{}}).available,false);const calls=[];
 const gateway=zarinpalGateway({env:{ZARINPAL_MERCHANT_ID:'test',LISHA_PUBLIC_URL:'https://store.example'},fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.includes('request')?{data:{code:100,authority:'A'+'0'.repeat(35)}}:{data:{code:101,ref_id:1234}}}}});
 const p=await gateway.create({amount:123000,callbackUrl:'https://store.example/callback',order:{id:'TEST',customer:{phone:'09123456789'}}});assert.equal(calls[0].body.amount,1230000);assert.equal(calls[0].body.currency,'IRR');assert.ok(p.redirectUrl.startsWith('https://payment.zarinpal.com/pg/StartPay/'));assert.equal((await gateway.verify({amount:123000,authority:p.authority})).paid,true);assert.equal(calls[1].body.amount,1230000);
});
