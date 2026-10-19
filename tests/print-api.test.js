import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPrintApi,imageInfo} from '../server/api.mjs';
import {slotIds,productionPlacement,fitDimensions,slots} from '../shared/print-spec.js';

test('every garment position has physical dimensions and hood/pocket only belong to hoodies',()=>{
 assert.equal(slotIds('sweatshirts','back').length,1);
 assert.equal(slotIds('hoodies','rightSleeve').length,3);
 assert.equal(slotIds('hoodies','leftSleeve').length,3);
 assert.equal(slotIds('hoodies','hood').length,3);
 assert.equal(slotIds('hoodies','front').length,6);
 assert.equal(slotIds('sweatshirts','front').length,3);
 assert.equal(slotIds('sweatshirts','hood').length,0);
 // A front-facing photo reverses the viewer's left/right relative to the wearer.
 assert.ok(slots['front.upperRight'].photoCenter.x<50);assert.ok(slots['front.upperLeft'].photoCenter.x>50);
 assert.ok(slots['front.pocketRight'].photoCenter.x<50);assert.ok(slots['front.pocketLeft'].photoCenter.x>50);
 for(const id of Object.keys(slots))for(const ratio of [.1,1,10]){const d=fitDimensions(id,100,1000,1000*ratio);assert.ok(d.widthCm<=slots[id].maxWidthCm+.01);assert.ok(d.heightCm<=slots[id].maxHeightCm+.01);assert.ok(Math.abs(d.heightCm-d.widthCm*ratio)<.06)}
});
test('JPEG phone orientation is preserved and physical print dimensions use upright pixels',async()=>{
 const bytes=await readFile(new URL('./fixtures/orientation6.jpg',import.meta.url)),info=imageInfo(bytes);
 assert.equal(info.exifOrientation,6);assert.equal(info.sourcePixelWidth,12);assert.equal(info.sourcePixelHeight,8);assert.equal(info.width,8);assert.equal(info.height,12);
 const p=productionPlacement('front.center',{widthCm:8},{...info,id:'fixture',fileName:'phone.jpg'});
 assert.equal(p.heightCm,30);assert.equal(p.widthCm,20);assert.deepEqual(p.printFrameCm,{width:20,height:30});assert.equal(p.autoOrientOriginal,true);assert.equal(p.exifOrientation,6);
});

test('print API stores originals and complete production tickets, isolates owners and handles retries',async t=>{
 const tempRoot=path.resolve(os.tmpdir()),dataDir=await mkdtemp(path.join(tempRoot,'lisha-api-test-'));
 let handler=createPrintApi({dataDir});
 const server=http.createServer((req,res)=>handler(req,res,()=>{res.writeHead(404);res.end()}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 let cookie='';
 const request=async(endpoint,{body,owner=cookie,headers={}}={})=>{
  const response=await fetch(url+endpoint,{method:body?'POST':'GET',headers:{...(owner?{Cookie:owner}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  if(!cookie&&response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
  return response;
 };
 try{
  const source=await readFile(new URL('../public/assets/blank-sweatshirt.webp',import.meta.url));
  const data='data:image/webp;base64,'+source.toString('base64');let asset,receipt;
  await t.test('original binary survives upload unchanged with verified dimensions and checksum',async()=>{
   const r=await request('/api/print-assets',{body:{original:data,preview:data,fileName:'طرح اصلی.webp'}});assert.equal(r.status,201);asset=await r.json();assert.equal(asset.width,900);assert.equal(asset.sha256,createHash('sha256').update(source).digest('hex'));
   const raw=await request(asset.originalUrl);assert.deepEqual(Buffer.from(await raw.arrayBuffer()),source);
  });
  const base={idempotencyKey:'test-order-123456',confirmed:true,customer:{name:'آزمایش چاپ',phone:'00000000000',note:'این یک سفارش آزمایشی است'},items:[{productId:'custom',qty:2,size:'XL',price:1,custom:{schemaVersion:3,kind:'hoodies',colorId:'navy',note:'بدون حذف پس‌زمینه',placements:[{slotId:'front.pocket',assetId:asset.id,widthCm:10,heightCm:999,centerOffsetCm:{x:999,y:999}},{slotId:'rightSleeve.middle',assetId:asset.id,widthCm:8},{slotId:'hood.right',assetId:asset.id,widthCm:8},{slotId:'hood.left',assetId:asset.id,widthCm:8}]}}]};
  await t.test('server derives cm positions, prices and asset metadata instead of trusting client values',async()=>{
   const r=await request('/api/orders',{body:base});assert.equal(r.status,201);receipt=await r.json();
   assert.equal(receipt.paymentStatus,'not_paid');assert.equal(receipt.productionApproved,false);assert.equal(receipt.items[0].unitPrice,4950000);assert.equal(receipt.items[0].qty,2);assert.equal(receipt.items[0].custom.color.name,'سورمه‌ای');assert.equal(receipt.items[0].custom.placements.length,4);assert.equal(receipt.items[0].custom.hoodDrawstrings,false);
   const p=receipt.items[0].custom.placements[0];assert.deepEqual(p.centerOffsetCm,{x:0,y:44});assert.equal(p.heightCm,10);assert.equal(p.sha256,asset.sha256);assert.ok(p.sourceFile.startsWith('assets/'));assert.equal(receipt.items[0].custom.note,'بدون حذف پس‌زمینه');assert.equal(receipt.customer.phone,'00000000000');assert.equal(receipt.totals.baseProducts,9900000);
   assert.equal(receipt.items[0].custom.calibration.status,'requires_supplier_confirmation');assert.equal(receipt.owner,undefined);
   const saved=JSON.parse(await readFile(path.join(dataDir,'orders',`${receipt.id}.json`),'utf8'));assert.equal(saved.items[0].custom.placements[0].fileName,'طرح اصلی.webp');
   const ticket=await readFile(path.join(dataDir,'orders',`${receipt.id}.print.html`),'utf8');assert.ok(ticket.includes('طرح اصلی.webp'));assert.ok(ticket.includes(asset.sha256));assert.ok(ticket.includes('عرض تصویر 10 × ارتفاع 10'));
  });
  await t.test('concurrent retries and restarting API do not duplicate an order',async()=>{
   const replies=await Promise.all([request('/api/orders',{body:base}),request('/api/orders',{body:base})]);for(const r of replies)assert.equal((await r.json()).id,receipt.id);
   handler.close();handler=createPrintApi({dataDir});assert.equal((await (await request('/api/orders',{body:base})).json()).id,receipt.id);
   assert.equal((await readdir(path.join(dataDir,'orders'))).filter(f=>/^LS-.*\.json$/.test(f)).length,1);
   const conflict=await request('/api/orders',{body:{...base,customer:{...base.customer,name:'different'}}});assert.equal(conflict.status,409);
  });
  await t.test('customer can retrieve complete receipt and print ticket after restart',async()=>{
   const list=await (await request('/api/orders')).json();assert.equal(list.length,1);assert.equal(list[0].items[0].custom.placements[3].slotId,'hood.left');
   assert.equal((await (await request(`/api/orders/${receipt.id}`)).json()).id,receipt.id);
   const ticket=await request(`/api/orders/${receipt.id}/print`);assert.equal(ticket.status,200);assert.ok((await ticket.text()).includes('عرض تصویر 10 × ارتفاع 10'));
  });
  await t.test('another session cannot read or reuse original artwork or orders',async()=>{
   const owner='lisha_session='+'b'.repeat(64);
   assert.equal((await request(asset.originalUrl,{owner})).status,404);
   assert.equal((await request(`/api/orders/${receipt.id}`,{owner})).status,404);
   assert.equal((await request(`/api/orders/${receipt.id}/print`,{owner})).status,404);
   assert.deepEqual(await (await request('/api/orders',{owner})).json(),[]);
   assert.equal((await request('/api/orders',{owner,body:{...base,idempotencyKey:'another-order-12345'}})).status,404);
  });
  await t.test('invalid files, disallowed positions and out-of-range sizes are rejected',async()=>{
   assert.equal((await request('/api/print-assets',{body:{original:'data:image/png;base64,'+Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),preview:data}})).status,400);
   const attempt=async patch=>request('/api/orders',{body:{...base,idempotencyKey:crypto.randomUUID(),...patch}});
   assert.equal((await attempt({confirmed:false})).status,400);
   for(const change of [{kind:'sweatshirts'},{kind:'__proto__'},{kind:'constructor'},{colorId:'fake'},{placements:[{slotId:'front.center',assetId:asset.id,widthCm:999}]},{placements:[base.items[0].custom.placements[0],base.items[0].custom.placements[0]]}])assert.equal((await attempt({items:[{...base.items[0],custom:{...base.items[0].custom,...change}}]})).status,400);
   assert.equal((await request('/api/orders',{body:base,headers:{Origin:'https://external.example'}})).status,403);
  });
 }finally{
  await new Promise(resolve=>server.close(resolve));handler.close();
  const resolved=path.resolve(dataDir);
  if(path.dirname(resolved)===tempRoot&&path.basename(resolved).startsWith('lisha-api-test-'))await rm(resolved,{recursive:true,force:true});
 }
});
