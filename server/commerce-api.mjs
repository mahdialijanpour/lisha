import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {problem,integer,cleanText,phoneNumber} from './commerce-store.mjs';
import {models,colors,sizes,slotIds,productionPlacement,specVersion,calibration} from '../shared/print-spec.js';
import {defaultPricing,designPrice} from '../shared/pricing.js';
import {printTicket} from './print-ticket.mjs';
import {createCustomerFeatures} from './customer-features.mjs';
import {installFinance,financeReport,saveExpense,createExternalOrder,settleExternal} from './finance.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const digits=v=>String(v||'').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));

export function createCommerceApi({store,auth,payments,dataDir}){
 installFinance(store);
 const customerFeatures=createCustomerFeatures({store,auth});
 if(!store.setting('shippingPolicyV2'))store.transaction(()=>{store.setSetting('shippingMode','recipient');store.setSetting('shippingPolicyV2',true)});
 const shippingPolicy=()=>({mode:store.setting('shippingMode')||'recipient',payer:'customer',collectedBy:store.setting('shippingMode')==='fixed'?'store':'carrier'});
 const shippingFee=()=>shippingPolicy().mode==='recipient'?0:store.setting('shippingFee');
 async function claimLegacy(owner,customerId){
  for(const [folder,type,pattern] of [['assets','asset',/^[a-f0-9]{32}\.json$/],['orders','order',/^LS-[A-F0-9]{16}\.json$/]]){
   const files=await readdir(path.join(dataDir,folder));
   for(const file of files.filter(f=>pattern.test(f))){const record=await readFile(path.join(dataDir,folder,file),'utf8').then(JSON.parse).catch(()=>null);if(record?.owner===owner&&!store.hasClaim(type,record.id))store.claim(type,record.id,customerId)}
  }
 }
 async function itemsFor(body,loadAsset){
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>30)problem('سبد باید بین ۱ تا ۳۰ محصول داشته باشد.');
  const pricing=store.setting('printPricing')||defaultPricing;const items=[];
  for(const [index,item] of body.items.entries()){
   if(!item||typeof item!=='object')problem('اطلاعات محصول معتبر نیست.');
   if(!integer(item.qty,1,10))problem('تعداد هر محصول باید بین ۱ تا ۱۰ باشد.');
   const p=store.product(item.custom?`blank-${item.custom.kind}`:item.productId);
   if(!p||!!item.custom!==(p.type==='custom'))problem('این محصول دیگر برای فروش موجود نیست.',409);
   const matches=p.variants.filter(v=>v.size===item.size&&(!item.colorId||v.colorId===item.colorId)&&(!item.custom||v.colorId===item.custom.colorId));
   const variant=item.variantId?p.variants.find(v=>v.id===item.variantId):matches.length===1?matches[0]:null;
   if(!variant||variant.size!==item.size||(item.custom&&variant.colorId!==item.custom.colorId)||variant.available<item.qty)problem(`موجودی رنگ و سایز «${p.name}» کافی نیست.`,409);
   const line={line:index+1,productId:p.id,variantId:variant.id,sku:variant.sku,name:p.name,qty:item.qty,size:variant.size,color:{id:variant.colorId,name:variant.colorName,hex:variant.colorHex},unitPrice:variant.price??p.price,image:p.image,currency:'IRT',...(p.includedPrint?{includedPrint:p.includedPrint}:{})};
   if(item.custom){
    const c=item.custom;if(c.schemaVersion!==3||!Array.isArray(c.placements)||!c.placements.length||c.placements.length>16)problem('فایل اصلی و محل‌های چاپ را دوباره در طراح لباس انتخاب کن.');
    const used=new Set(),placements=[];
    for(const placement of c.placements){
     if(!slotIds(c.kind).includes(placement.slotId)||used.has(placement.slotId))problem('محل چاپ نامعتبر یا تکراری است.');used.add(placement.slotId);
     const asset=await loadAsset(placement.assetId);if(!Number.isFinite(placement.widthCm)||placement.widthCm<.5)problem('عرض چاپ باید عدد مثبت به سانتی‌متر باشد.');
     const place=productionPlacement(placement.slotId,placement,asset);if(Math.abs(place.widthCm-placement.widthCm)>.015)problem('اندازهٔ چاپ از محدودهٔ این قسمت بزرگ‌تر است.');
     placements.push({...place,sourceFile:path.posix.join('assets',asset.originalFile),previewFile:path.posix.join('assets',asset.previewFile)});
    }
    line.baseUnitPrice=line.unitPrice;line.pricing=designPrice(line.baseUnitPrice,placements,pricing);line.unitPrice=line.pricing.unitTotal;
    const size=sizes.find(s=>s[0]===item.size),model=models[c.kind];
    line.custom={schemaVersion:3,specVersion,kind:c.kind,model:{...model,price:line.baseUnitPrice},color:colors.find(v=>v.id===variant.colorId),garmentMeasurementsCm:{chestWidth:size[1],length:size[2],status:'reference_only'},hoodDrawstrings:c.kind==='hoodies'?false:null,calibration:{...calibration},note:cleanText(c.note,1000),printCount:placements.length,placements,preview:{type:'photo-overlay',views:[...new Set(placements.map(v=>v.view))].map(view=>({view,basePhoto:`/assets/${c.kind}-${['right','left'].includes(view)?'side':view}.png`,mirrorBaseOnly:view==='left',placementIds:placements.filter(v=>v.view===view).map(v=>v.slotId)}))}};
   }
   items.push(line);
  }
  const counts=new Map();for(const item of items){const p=store.product(item.productId),v=p?.variants.find(v=>v.id===item.variantId);counts.set(item.variantId,(counts.get(item.variantId)||0)+item.qty);if(!v||(v.price??p.price)!==(item.baseUnitPrice??item.unitPrice)||v.available<counts.get(item.variantId))problem('قیمت یا موجودی سبد تغییر کرده؛ دوباره بررسی کن.',409)}
  if(!integer(items.reduce((n,i)=>n+i.qty*i.unitPrice,0),1000,99_000_000_000))problem('مبلغ سبد از محدودهٔ مجاز پرداخت بیشتر است.');
  return {items,pricing};
 }
 async function checkout(body,user,loadAsset){
  if(body.confirmed!==true||!/^[a-zA-Z0-9-]{12,80}$/.test(body.idempotencyKey||''))problem('جزئیات سفارش و آدرس را تأیید کن.');
  const key=sha(`${user.id}:${body.idempotencyKey}`),requestHash=sha(JSON.stringify(body));
  const prior=store.db.prepare('SELECT * FROM orders WHERE request_key=?').get(key);
  if(prior){if(prior.request_hash!==requestHash)problem('شناسهٔ ارسال با اطلاعات متفاوت استفاده شده است.',409);return store.receipt(JSON.parse(prior.payload))}
  const input=body.customer||{},address={province:cleanText(input.province,60),city:cleanText(input.city,60),street:cleanText(input.street,600),postalCode:digits(input.postalCode)};
  const customer={name:cleanText(input.name,80),phone:phoneNumber(input.phone||user.phone),accountPhone:user.phone,note:cleanText(input.note,1000),address};
  if(customer.name.length<3||!address.province||!address.city||address.street.length<10||!/^\d{10}$/.test(address.postalCode))problem('نام گیرنده، استان، شهر، آدرس کامل و کدپستی ده‌رقمی را وارد کن.');
  const {items,pricing}=await itemsFor(body,loadAsset);
  // Recheck snapshots after asynchronous asset reads and aggregate duplicate lines.
  return store.transaction(()=>{
   const existing=store.db.prepare('SELECT * FROM orders WHERE request_key=?').get(key);if(existing){if(existing.request_hash!==requestHash)problem('شناسه ارسال تکراری است.',409);return store.receipt(JSON.parse(existing.payload))}
   const counts=new Map();for(const item of items){const p=store.product(item.productId),v=p?.variants.find(v=>v.id===item.variantId);if(!v||(v.price??p.price)!==(item.baseUnitPrice??item.unitPrice))problem('قیمت یا موجودی تغییر کرده؛ سفارش را دوباره بررسی کن.',409);counts.set(v.id,(counts.get(v.id)||0)+item.qty);if(counts.get(v.id)>v.available)problem('تعداد انتخاب‌شده از موجودی بیشتر است.',409)}
   if(JSON.stringify(store.setting('printPricing')||defaultPricing)!==JSON.stringify(pricing))problem('تعرفهٔ چاپ تغییر کرده؛ سبد را دوباره بررسی کن.',409);
   const custom=items.some(i=>i.custom),shipping=shippingFee(),base=items.reduce((n,i)=>n+i.qty*(i.baseUnitPrice??i.unitPrice),0),printing=items.reduce((n,i)=>n+i.qty*(i.pricing?.printing||0),0),id=`LC-${randomBytes(8).toString('hex').toUpperCase()}`;
   if(body.expectedProductsTotal!==undefined&&body.expectedProductsTotal!==base+printing)problem('مبلغ سبد تغییر کرده؛ مبلغ تازه را بررسی کن و دوباره سفارش بده.',409);
   const order={id,customerId:user.id,printTicketUrl:`/api/orders/${id}/print`,schemaVersion:3,specVersion,createdAt:new Date().toISOString(),status:shipping===null?'pending_review':'awaiting_payment',paymentStatus:'not_paid',productionApproved:!custom,customer,customerConfirmedAt:new Date().toISOString(),items,shippingPolicy:shippingPolicy(),pricingPolicy:pricing,totals:{baseProducts:base,printingSurcharge:printing,productsTotal:base+printing,shipping,finalTotal:shipping===null?null:base+printing+shipping,currency:'IRT'},production:{measurementUnit:'cm',approvalRequired:custom,method:custom?'to_be_confirmed':'ready_product',calibration:{...calibration}}};
   store.db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?)').run(id,user.id,key,requestHash,JSON.stringify(order),order.status,Date.now());store.audit(user.id,'order.create',id,{base});return store.receipt(order);
  });
 }
 return async function handle(req,res,ctx){
  const {url,send,body,owner,user,loadAsset,decodeImage}=ctx,p=url.pathname,post=req.method==='POST';
  if(await customerFeatures(req,ctx))return true;
  if(p==='/api/catalog'&&!post){send({pricing:store.setting('printPricing')||defaultPricing,products:store.products(),shippingPolicy:shippingPolicy(),shippingFee:shippingFee(),payment:payments.config(),loginMode:auth.sms.mode});return true}
  if(p==='/api/cart/quote'&&post){const {items,pricing}=await itemsFor(await body(),loadAsset);const base=items.reduce((n,i)=>n+i.qty*(i.baseUnitPrice??i.unitPrice),0),printing=items.reduce((n,i)=>n+i.qty*(i.pricing?.printing||0),0),shipping=shippingFee();send({items,pricing,shippingPolicy:shippingPolicy(),totals:{baseProducts:base,printingSurcharge:printing,productsTotal:base+printing,shipping,finalTotal:shipping===null?null:base+printing+shipping,currency:'IRT'}});return true}
  if(p==='/api/auth/session'&&!post){send({customer:user,mode:auth.sms.mode});return true}
  if(p==='/api/auth/request'&&post){send(await auth.request((await body()).phone,req.socket.remoteAddress||'local'));return true}
  if(p==='/api/auth/verify'&&post){const customer=auth.verify(await body(),req,res);await claimLegacy(owner,customer.id);send({customer});return true}
  if(p==='/api/auth/admin/request'&&post){send(await auth.request((await body()).phone,req.socket.remoteAddress||'local','admin'));return true}
  if(p==='/api/auth/admin/verify'&&post){const customer=auth.verify(await body(),req,res,'admin');send({customer});return true}
  if(p==='/api/auth/demo'&&post){const customer=auth.verifyDemo(await body(),req,res);await claimLegacy(owner,customer.id);send({customer});return true}
  if(p==='/api/auth/admin/demo'&&post){send({customer:auth.verifyDemo(await body(),req,res,'admin')});return true}
  if(p==='/api/auth/logout'&&post){auth.logout(req,res);send({ok:true});return true}
  if(p==='/api/auth/profile'&&post){send({customer:auth.update(user,await body())});return true}
  if(p==='/api/checkout'&&post){auth.require(user);send(await checkout(await body(),user,loadAsset),201);return true}
  if(p==='/api/payments/callback'&&!post){const id=await payments.callback(url.searchParams);res.writeHead(303,{Location:`/payment-result/?order=${encodeURIComponent(id)}`});res.end();return true}
  const orderPath=/^\/api\/orders\/(LC-[A-F0-9]{16})(?:\/(print|pay|retry-payment))?$/.exec(p);
  if(orderPath){
   auth.require(user);const order=store.getOrder(orderPath[1]);if(!order||(order.customerId!==user.id&&user.role!=='admin'))problem('سفارش پیدا نشد.',404);
   if(post&&orderPath[2]==='pay'){const b=await body();send(await payments.start(order.id,user,b));return true}
   if(post&&orderPath[2]==='retry-payment'){send(await payments.retry(order.id,user));return true}
   if(!post&&orderPath[2]==='print'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});res.end(printTicket(order));return true}
   if(!post&&!orderPath[2]){send(store.receipt(order));return true}
   problem('مسیر پیدا نشد.',404);
  }
  const media=/^\/api\/catalog\/media\/([a-f0-9]{32})$/.exec(p);
  if(media&&!post){const m=store.db.prepare('SELECT * FROM media WHERE id=?').get(media[1]);if(!m)problem('تصویر پیدا نشد.',404);const bytes=await readFile(path.join(dataDir,'catalog',m.file));res.writeHead(200,{'Content-Type':m.mime,'Cache-Control':'public, max-age=31536000, immutable'});res.end(bytes);return true}
  if(!p.startsWith('/api/admin/'))return false;
  auth.requireAdmin(user);
  if(p==='/api/admin/finance'&&!post){send(financeReport(store,url.searchParams.get('month')));return true}
  if(p==='/api/admin/expenses'&&post){send(saveExpense(store,await body(),user.id),201);return true}
  const expensePath=/^\/api\/admin\/expenses\/([a-f0-9-]{36})$/.exec(p);
  if(expensePath&&post){send(saveExpense(store,await body(),user.id,expensePath[1]));return true}
  if(p==='/api/admin/external-orders'&&post){send(createExternalOrder(store,await body(),user.id),201);return true}
  const settlePath=/^\/api\/admin\/external-orders\/(LC-[A-F0-9]{16})\/settle$/.exec(p);
  if(settlePath&&post){const b=await body();send(store.transaction(()=>{const o=store.getOrder(settlePath[1]);if(!o)problem('سفارش پیدا نشد.',404);settleExternal(store,o,b,user.id);store.saveOrder(o);store.audit(user.id,'order.external.settle',o.id);return store.receipt(o)}));return true}
  const productAction=/^\/api\/admin\/products\/([a-z0-9-]+)\/action$/.exec(p);
  if(productAction&&post){const b=await body();send(store.transaction(()=>{const product=store.product(productAction[1],{admin:true});if(!product)problem('محصول پیدا نشد.',404);if(b.version!==product.version)problem('محصول تغییر کرده؛ فهرست را تازه کن.',409);if(!['visibility','archive','restore'].includes(b.action))problem('عملیات معتبر نیست.');if(b.action==='archive'&&product.variants.some(v=>v.reserved>0))problem('این محصول رزرو پرداخت دارد؛ پس از پایان پرداخت دوباره اقدام کن.',409);if(b.action==='visibility'&&product.status==='archived')problem('ابتدا محصول حذف‌شده را بازیابی کن.',409);const previous=product.status;product.status=b.action==='archive'?'archived':b.action==='restore'?'draft':product.status==='active'?'draft':'active';store.db.prepare('UPDATE products SET payload=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify(product),Date.now(),product.id);store.audit(user.id,`product.${b.action}`,product.id,{before:previous,after:product.status});return store.product(product.id,{admin:true})}));return true}
  if(p==='/api/admin/products'&&!post){send(store.products(true));return true}
  if(p==='/api/admin/products'&&post){send(store.saveProduct(await body(),user.id),201);return true}
  const productPath=/^\/api\/admin\/products\/([a-z0-9-]+)$/.exec(p);
  if(productPath){if(post)send(store.saveProduct(await body(),user.id,productPath[1]));else{const product=store.product(productPath[1],{admin:true});if(!product)problem('محصول پیدا نشد.',404);send(product)}return true}
  if(p==='/api/admin/media'&&post){
   const b=await body(),{bytes,info}=decodeImage(b.image,5*1024*1024),id=randomBytes(16).toString('hex'),file=`${id}.${info.extension}`;
   await mkdir(path.join(dataDir,'catalog'),{recursive:true});await writeFile(path.join(dataDir,'catalog',file),bytes,{flag:'wx'});store.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(id,file,info.mime,Date.now());store.audit(user.id,'media.upload',id);send({url:`/api/catalog/media/${id}`},201);return true;
  }
  if(p==='/api/admin/settings'){
   if(post){const b=await body();store.transaction(()=>{
    if(b.pricing){
     const input=b.pricing,current=store.setting('printPricing')||defaultPricing;
     if(input.version!==current.version)problem('تعرفه هم‌زمان تغییر کرده؛ تنظیمات را دوباره دریافت کن.',409);
     if(!['fixed','area'].includes(input.mode)||typeof input.sample!=='boolean'||!['ratePerCm2','mainPrint','smallPrint','hoodPrint'].every(k=>integer(input[k],0,100_000_000)))problem('تعرفهٔ چاپ معتبر نیست.');
     const pricing={...Object.fromEntries(['mode','sample','ratePerCm2','mainPrint','smallPrint','hoodPrint'].map(k=>[k,input[k]])),version:current.version+1};store.setSetting('printPricing',pricing);store.audit(user.id,'settings.print-pricing','printPricing',pricing);
    }
    if(b.shippingMode!==undefined){if(!['recipient','fixed'].includes(b.shippingMode))problem('روش ارسال معتبر نیست.');store.setSetting('shippingMode',b.shippingMode);store.audit(user.id,'settings.shipping-mode','shippingMode',{mode:b.shippingMode})}
    if(b.shippingFee!==undefined){if(!integer(b.shippingFee,0,100_000_000))problem('هزینهٔ ارسال باید عدد صحیح به تومان باشد.');store.setSetting('shippingFee',b.shippingFee);if(b.shippingMode===undefined)store.setSetting('shippingMode','fixed');store.audit(user.id,'settings.shipping','shippingFee',{amount:b.shippingFee})}
   })}
   send({pricing:store.setting('printPricing')||defaultPricing,shippingPolicy:shippingPolicy(),shippingFee:shippingFee(),payment:payments.config(),loginMode:auth.sms.mode});return true;
  }
  if(p==='/api/admin/orders'&&!post){send(store.orders());return true}
  const action=/^\/api\/admin\/orders\/(LC-[A-F0-9]{16})\/(quote|fulfill|cancel|approve-production)$/.exec(p);
  if(action&&post){
   const b=await body();const result=store.transaction(()=>{
    const order=store.getOrder(action[1]);if(!order)problem('سفارش پیدا نشد.',404);
    // An expired reservation does not prove the bank transaction failed. Freeze its quote until verification.
    const active=store.db.prepare("SELECT 1 FROM payments WHERE order_id=? AND status IN ('creating','pending','verifying','uncertain')").get(order.id);
    if(action[2]==='approve-production'){
     if(!order.items.some(i=>i.custom)||order.productionApproved||!['awaiting_payment','paid'].includes(order.status))problem('تأیید تولید برای این سفارش مجاز نیست.',409);if(b.productionApproved!==true||!cleanText(b.productionNote,2000))problem('جزئیات بررسی تولید را وارد کن.');order.productionApproved=true;order.production={...order.production,approvedAt:new Date().toISOString(),approvedBy:user.id,approvalNote:cleanText(b.productionNote,2000)};
    }else if(action[2]==='quote'){
     if(order.paymentStatus==='paid'||active||!['pending_review','awaiting_payment'].includes(order.status))problem('امکان تغییر هزینهٔ این سفارش وجود ندارد.',409);
     if(!integer(b.printingSurcharge,0,100_000_000)||!integer(b.shipping,0,100_000_000))problem('هزینهٔ چاپ و ارسال باید عدد صحیح به تومان باشد.');
     if(order.pricingPolicy&&b.printingSurcharge!==order.totals.printingSurcharge)problem('هزینهٔ چاپ این سفارش از تعرفهٔ ثبت‌شده محاسبه شده و قابل تغییر نیست.',409);
     if(order.items.some(i=>i.custom)&&(b.productionApproved!==true||!cleanText(b.productionNote,2000)))problem('روش چاپ، ابعاد واقعی و قابلیت اجرا را بررسی و توضیح تأیید تولید را ثبت کن.');
     if(order.shippingPolicy?.mode==='recipient'&&b.shipping!==0)problem('هزینهٔ ارسال این سفارش مستقیماً به حمل‌کننده پرداخت می‌شود.');
     order.totals={...order.totals,printingSurcharge:b.printingSurcharge,shipping:b.shipping,finalTotal:order.totals.baseProducts+b.printingSurcharge+b.shipping};
     order.productionApproved=true;order.production={...order.production,approvedAt:new Date().toISOString(),approvedBy:user.id,approvalNote:cleanText(b.productionNote,2000)};order.status='awaiting_payment';
    }else if(action[2]==='cancel'){
     if(order.paymentStatus==='paid'||active)problem('سفارش پرداخت‌شده یا پرداخت در حال بررسی را نمی‌توان لغو کرد.',409);order.status='cancelled';order.cancellationNote=cleanText(b.note,1000);
    }else{
     if(order.items.some(i=>i.custom)&&!order.productionApproved)problem('پیش از آماده‌سازی، فایل‌ها و اجرای چاپ را تأیید کن.',409);
     if(order.paymentStatus!=='paid'||order.refundRequired)problem('ابتدا پرداخت موفق و وضعیت موجودی باید تأیید شده باشد.',409);
     const allowed={paid:['processing'],processing:['shipped'],shipped:['completed']};if(!allowed[order.status]?.includes(b.status))problem('تغییر وضعیت سفارش معتبر نیست.',409);
     if(b.status==='shipped'&&!cleanText(b.trackingCode,100))problem('کد پیگیری مرسوله را وارد کن.');order.status=b.status;if(b.trackingCode)order.trackingCode=cleanText(b.trackingCode,100);order.updatedAt=new Date().toISOString();
    }
    store.saveOrder(order);store.audit(user.id,`order.${action[2]}`,order.id,{status:order.status,totals:order.totals});return store.receipt(order);
   });send(result);return true;
  }
  if(p==='/api/admin/inventory-log'&&!post){send(store.db.prepare('SELECT * FROM inventory_ledger ORDER BY created_at DESC LIMIT 300').all());return true}
  problem('مسیر پیدا نشد.',404);
 };
}
