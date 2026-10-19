import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {createPrintApi} from '../server/api.mjs';
import {monthKey} from '../server/finance.mjs';

test('financial month boundaries follow the Persian calendar in Tehran',()=>{
 assert.equal(monthKey('2026-03-20T20:29:59Z'),'1404-12');
 assert.equal(monthKey('2026-03-20T20:30:00Z'),'1405-01');
});

test('finance and external sales are private, durable, idempotent and stock-aware',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lisha-finance-')),messages=new Map();const gateway={provider:'test',available:true,publicUrl:'https://test.invalid',async create(){assert.fail('External orders must never start a gateway payment')}};let handler=createPrintApi({dataDir:dir,gateway,sms:{mode:'development',async send(m){messages.set(m.phone,m)}}});
 const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 function client(){let cookies={};return async(url,body,status=200)=>{const response=await fetch(origin+'/api'+url,{method:body===undefined?'GET':'POST',headers:{Cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; '),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});for(const c of response.headers.getSetCookie()){const [k,v]=c.split(';')[0].split('=');cookies[k]=v}const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result}}
 const admin=client(),buyer=client(),anonymous=client();
 async function login(c,phone){const prefix=phone==='09999999998'?'/auth/admin':'/auth';const challenge=await c(`${prefix}/request`,{phone});return c(`${prefix}/verify`,{phone,code:messages.get(phone).code,challengeId:challenge.challengeId})}
 let product,variant,expense,external;
 const sale=()=>({idempotencyKey:crypto.randomUUID(),customer:{name:'مشتری فروش اینستاگرام',phone:'09999999997'},channel:'instagram',date:'2026-10-18',paid:true,paymentMethod:'transfer',reference:'TEST-RECEIPT',adjustStock:true,items:[{productId:product.id,variantId:variant.id,qty:1,unitPrice:5200000}]});
 try{
  handler.store.addAdmin('09999999998');await login(admin,'09999999998');await login(buyer,'09999999997');
  await t.test('only administrators can view or mutate financial data',async()=>{
   await anonymous('/admin/finance',undefined,401);await buyer('/admin/finance',undefined,403);await buyer('/admin/expenses',{},403);await buyer('/admin/external-orders',{},403);await buyer('/admin/products/coffee-cat/action',{},403);
   product=await admin('/admin/products/coffee-cat');product=await admin(`/admin/products/${product.id}`,{...product,variants:product.variants.map(v=>({...v,stock:5}))});variant=product.variants.find(v=>v.size==='M');
  });
  await t.test('recipient shipping is excluded from checkout and saved in the receipt',async()=>{
   const items=[{productId:product.id,variantId:variant.id,size:variant.size,colorId:variant.colorId,qty:1}],quote=await buyer('/cart/quote',{items});assert.equal(quote.totals.shipping,0);assert.equal(quote.shippingPolicy.mode,'recipient');
   const order=await buyer('/checkout',{idempotencyKey:crypto.randomUUID(),confirmed:true,items,customer:{name:'تست ارسال',phone:'09999999997',province:'تهران',city:'تهران',street:'آدرس تست پلاک ۱ واحد ۲',postalCode:'1234567890'}},201);assert.equal(order.totals.finalTotal,5200000);assert.equal(order.status,'awaiting_payment');assert.equal(order.shippingPolicy.collectedBy,'carrier');
   await admin('/admin/settings',{shippingMode:'fixed',shippingFee:50000});assert.equal((await buyer('/cart/quote',{items})).totals.finalTotal,5250000);assert.equal((await buyer(`/orders/${order.id}`)).totals.finalTotal,5200000);
   await admin('/admin/settings',{shippingMode:'recipient'});assert.equal((await buyer('/cart/quote',{items})).totals.finalTotal,5200000);
   assert.equal((await admin('/admin/finance?month=all')).summary.sales,0);
  });
  await t.test('visibility, archive and restore are versioned and keep inventory',async()=>{
   const before=await admin(`/admin/products/${product.id}`);const hidden=await admin(`/admin/products/${product.id}/action`,{action:'visibility',version:before.version});assert.equal(hidden.status,'draft');assert.equal((await anonymous('/catalog')).products.some(p=>p.id===product.id),false);
   await admin(`/admin/products/${product.id}/action`,{action:'archive',version:before.version},409);
   const archived=await admin(`/admin/products/${product.id}/action`,{action:'archive',version:hidden.version});assert.equal(archived.variants.find(v=>v.id===variant.id).stock,5);
   const restored=await admin(`/admin/products/${product.id}/action`,{action:'restore',version:archived.version});assert.equal(restored.status,'draft');product=await admin(`/admin/products/${product.id}/action`,{action:'visibility',version:restored.version});assert.equal(product.status,'active');
  });
  await t.test('expenses validate money and dates, deduplicate retries and support correction',async()=>{
   const body={idempotencyKey:crypto.randomUUID(),title:'خرید اجناس مهر',category:'inventory',amount:2000000,date:'2026-10-18',note:'تست'};expense=await admin('/admin/expenses',body,201);assert.equal((await admin('/admin/expenses',body,201)).id,expense.id);
   await admin('/admin/expenses',{...body,amount:2000001},409);await admin('/admin/expenses',{...body,idempotencyKey:crypto.randomUUID(),amount:-1},400);await admin('/admin/expenses',{...body,idempotencyKey:crypto.randomUUID(),date:'2026-02-30'},400);
   assert.equal((await admin('/admin/finance?month=1405-07')).summary.expenses,2000000);expense=await admin(`/admin/expenses/${expense.id}`,{...body,version:expense.version,amount:1800000});await admin(`/admin/expenses/${expense.id}`,{...body,version:1},409);
   expense=await admin(`/admin/expenses/${expense.id}`,{...expense,date:'2026-10-18',voided:true});assert.equal((await admin('/admin/finance?month=all')).summary.expenses,0);expense=await admin(`/admin/expenses/${expense.id}`,{...expense,date:'2026-10-18',voided:false});
  });
  await t.test('Instagram sales enter orders and reports once and decrement stock once',async()=>{
   const body=sale();external=await admin('/admin/external-orders',body,201);assert.equal(external.paymentStatus,'paid');assert.equal(external.source.channel,'instagram');assert.equal((await admin('/admin/external-orders',body,201)).id,external.id);
   assert.equal((await admin(`/admin/products/${product.id}`)).variants.find(v=>v.id===variant.id).stock,4);assert.ok((await buyer('/orders')).some(o=>o.id===external.id));const report=await admin('/admin/finance?month=1405-07');assert.equal(report.summary.sales,5200000);assert.equal(report.summary.expenses,1800000);assert.equal(report.summary.balance,3400000);
   await buyer(`/orders/${external.id}/pay`,{},409); // external receipts never create bank transactions
   assert.equal(handler.store.payments(external.id).length,0);
   await admin('/admin/external-orders',{...sale(),items:[{productId:product.id,variantId:variant.id,qty:5,unitPrice:5200000}]},409);assert.equal((await admin('/admin/finance?month=all')).summary.saleCount,1);
  });
  await t.test('unpaid external orders settle exactly once; historic freeform sales need not alter stock',async()=>{
   const pending=await admin('/admin/external-orders',{...sale(),paid:false},201);assert.equal(pending.status,'pending_manual_payment');assert.equal((await admin('/admin/finance?month=all')).summary.sales,5200000);
   const settle={paymentMethod:'cash',date:'2026-03-21'};await admin(`/admin/external-orders/${pending.id}/settle`,settle);await admin(`/admin/external-orders/${pending.id}/settle`,settle);assert.equal((await admin(`/admin/products/${product.id}`)).variants.find(v=>v.id===variant.id).stock,3);
   const historical=await admin('/admin/external-orders',{...sale(),adjustStock:false,date:'2026-03-21',items:[{name:'ماگ قدیمی اینستاگرام',size:'تک‌سایز',color:'سفید',qty:2,unitPrice:300000}]},201);assert.equal(historical.source.inventoryAdjusted,false);assert.equal((await admin('/admin/finance?month=1405-01')).summary.sales,5800000);
   const web=handler.store.orders().find(o=>!o.source);web.paymentStatus='paid';web.paidAt='2026-10-18T12:00:00Z';web.paidAmountToman=web.totals.finalTotal;handler.store.saveOrder(web);assert.equal((await admin('/admin/finance?month=1405-07')).summary.sales,10400000);
  });
  await t.test('financial records persist after restarting and use month validation',async()=>{
   handler.close();handler=createPrintApi({dataDir:dir,gateway,sms:{mode:'development',async send(m){messages.set(m.phone,m)}}});const report=await admin('/admin/finance?month=all');assert.equal(report.summary.sales,16200000);assert.equal(report.summary.expenses,1800000);await admin('/admin/finance?month=1405-13',undefined,400);assert.equal((await anonymous('/catalog')).shippingPolicy.mode,'recipient');
  });
 }finally{await new Promise(r=>server.close(r));handler.close();const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.match(path.basename(resolved),/^lisha-finance-/);await rm(resolved,{recursive:true,force:true})}
});
