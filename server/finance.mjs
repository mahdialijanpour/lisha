import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {problem,integer,cleanText,phoneNumber} from './commerce-store.mjs';

const calendar=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit'});
export function monthKey(value=new Date()){const parts=calendar.formatToParts(new Date(value));return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function dated(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))problem('تاریخ معتبر وارد کن.');const date=new Date(`${value}T12:00:00+03:30`);if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)problem('تاریخ معتبر وارد کن.');return date.toISOString()}
function requestKey(body,actor){if(!/^[a-zA-Z0-9-]{12,80}$/.test(body.idempotencyKey||''))problem('شناسهٔ ثبت معتبر نیست.');return createHash('sha256').update(`${actor}:${body.idempotencyKey}`).digest('hex')}
const hash=body=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
export const expenseCategories={inventory:'خرید اجناس',printing:'چاپ و تولید',packaging:'بسته‌بندی',rent:'اجاره',salary:'حقوق',marketing:'تبلیغات',shipping:'ارسال پرداختی فروشگاه',refund:'بازگشت وجه',other:'سایر هزینه‌ها'};
export const salesChannels={instagram:'اینستاگرام',in_person:'حضوری',phone:'تلفنی',other:'سایر'};
export function installFinance(store){store.db.exec(`CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,request_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL);`)}
export function financeReport(store,month){
 const currentMonth=monthKey();month=month||currentMonth;if(month!=='all'&&!/^1[345]\d{2}-(0[1-9]|1[0-2])$/.test(month))problem('ماه گزارش معتبر نیست.');
 const expenses=store.db.prepare('SELECT payload,version FROM expenses').all().map(r=>({...JSON.parse(r.payload),version:r.version}));
 const sales=store.orders().filter(o=>o.paymentStatus==='paid').map(o=>({id:o.id,date:o.paidAt||o.createdAt,customer:o.customer.name,channel:o.source?.channel||'website',amount:o.totals.productsTotal??o.totals.baseProducts+(o.totals.printingSurcharge||0),shipping:o.totals.shipping||0,total:o.paidAmountToman??o.totals.finalTotal,reference:o.paymentReference||'',needsAttention:!!o.refundRequired}));
 const months=[...new Set([currentMonth,...sales.map(s=>monthKey(s.date)),...expenses.map(e=>monthKey(e.date))])].sort().reverse();
 const matches=(date,selection)=>selection==='all'||monthKey(date)===selection;
 const summarize=selection=>{const paid=sales.filter(s=>matches(s.date,selection)),costs=expenses.filter(e=>!e.voided&&matches(e.date,selection)),revenue=paid.reduce((n,s)=>n+s.amount,0),spending=costs.reduce((n,e)=>n+e.amount,0);return {sales:revenue,expenses:spending,balance:revenue-spending,saleCount:paid.length,shippingCollected:paid.reduce((n,s)=>n+s.shipping,0),needsAttention:paid.filter(s=>s.needsAttention).length}};
 return {month,currentMonth,months,summary:summarize(month),currentSummary:summarize(currentMonth),sales:sales.filter(s=>matches(s.date,month)).sort((a,b)=>b.date.localeCompare(a.date)),expenses:expenses.filter(e=>matches(e.date,month)).sort((a,b)=>b.date.localeCompare(a.date)),categories:expenseCategories,channels:salesChannels,currency:'IRT'};
}
export function saveExpense(store,body,actor,id){return store.transaction(()=>{
 const existing=id&&store.db.prepare('SELECT * FROM expenses WHERE id=?').get(id);if(id&&!existing)problem('هزینه پیدا نشد.',404);
 const key=id?existing.request_key:requestKey(body,actor),digest=hash(body),prior=!id&&store.db.prepare('SELECT * FROM expenses WHERE request_key=?').get(key);
 if(prior){if(prior.request_hash!==digest)problem('شناسهٔ ثبت تکراری با اطلاعات متفاوت است.',409);return {...JSON.parse(prior.payload),version:prior.version}}
 if(existing&&body.version!==existing.version)problem('هزینه هم‌زمان تغییر کرده؛ دوباره دریافت کن.',409);
 const old=existing?JSON.parse(existing.payload):null;
 if(!integer(body.amount,1,99_000_000_000)||!expenseCategories[body.category]||cleanText(body.title,160).length<2)problem('عنوان، دسته و مبلغ هزینه را کامل وارد کن.');
 const expense={id:id||randomUUID(),title:cleanText(body.title,160),category:body.category,amount:body.amount,date:dated(body.date),note:cleanText(body.note,2000),createdAt:old?.createdAt||new Date().toISOString(),createdBy:old?.createdBy||actor,updatedBy:actor,voided:body.voided===true};
 if(existing)store.db.prepare('UPDATE expenses SET payload=?,version=version+1 WHERE id=?').run(JSON.stringify(expense),id);else store.db.prepare('INSERT INTO expenses(id,payload,request_key,request_hash) VALUES(?,?,?,?)').run(expense.id,JSON.stringify(expense),key,digest);
 store.audit(actor,existing?'expense.update':'expense.create',expense.id,{before:old,after:expense});return {...expense,version:existing?existing.version+1:1};
})}
function adjustInventory(store,order,actor){
 if(!order.source.adjustStock||order.source.inventoryAdjusted)return;
 const counts=new Map();for(const i of order.items){if(!i.variantId)problem('برای کسر موجودی، محصول و تنوع کاتالوگ را انتخاب کن.');counts.set(i.variantId,(counts.get(i.variantId)||0)+i.qty)}
 for(const [id,qty] of counts){const v=store.db.prepare('SELECT * FROM variants WHERE id=?').get(id);if(!v||!v.active||v.stock-store.reserved(id)<qty)problem('موجودی آزاد یکی از رنگ‌ها یا سایزها کافی نیست.',409);store.db.prepare('UPDATE variants SET stock=stock-?,version=version+1 WHERE id=?').run(qty,id);store.db.prepare('UPDATE products SET version=version+1,updated_at=? WHERE id=?').run(Date.now(),v.product_id);store.ledger(id,-qty,`external-sale:${order.id}`,actor)}
 order.source.inventoryAdjusted=true;
}
export function settleExternal(store,order,body,actor){
 if(order.source?.type!=='external'||order.status==='cancelled')problem('این سفارش فروش خارج از سایت نیست.',409);
 if(order.paymentStatus==='paid')return order;
 if(!['transfer','cash','pos','other'].includes(body.paymentMethod))problem('روش دریافت وجه را مشخص کن.');
 adjustInventory(store,order,actor);order.paymentStatus='paid';order.status='paid';order.paidAt=dated(body.date||today());order.paidAmountToman=order.totals.finalTotal;order.paymentReference=cleanText(body.reference,120)||'ثبت دستی مدیر';order.manualSettlement={method:body.paymentMethod,recordedBy:actor,recordedAt:new Date().toISOString()};return order;
}
export function createExternalOrder(store,body,actor){return store.transaction(()=>{
 const key=requestKey(body,actor),digest=hash(body),prior=store.db.prepare('SELECT * FROM orders WHERE request_key=?').get(key);
 if(prior){if(prior.request_hash!==digest)problem('شناسهٔ ثبت تکراری با اطلاعات متفاوت است.',409);return store.receipt(JSON.parse(prior.payload))}
 const name=cleanText(body.customer?.name,80),phone=phoneNumber(body.customer?.phone);if(name.length<3||!salesChannels[body.channel]||!Array.isArray(body.items)||body.items.length<1||body.items.length>30||typeof body.adjustStock!=='boolean'||typeof body.paid!=='boolean')problem('مشخصات مشتری، کانال و محصول‌ها را کامل کن.');
 const items=body.items.map((i,index)=>{if(!integer(i.qty,1,1000)||!integer(i.unitPrice,1,1_000_000_000))problem('تعداد و قیمت هر محصول باید عدد صحیح مثبت باشد.');let product,variant;if(i.productId){product=store.product(i.productId,{admin:true});variant=product?.variants.find(v=>v.id===i.variantId);if(!product||!variant)problem('محصول یا رنگ و سایز انتخابی پیدا نشد.');}const title=product?.name||cleanText(i.name,120);if(title.length<2)problem('نام محصول را بنویس.');return {line:index+1,productId:product?.id||null,variantId:variant?.id||null,sku:variant?.sku||'EXTERNAL',name:title,qty:i.qty,unitPrice:i.unitPrice,size:variant?.size||cleanText(i.size,30)||'—',color:{id:variant?.colorId||'other',name:variant?.colorName||cleanText(i.color,50)||'—',hex:variant?.colorHex||'#eee5f7'},image:product?.image||null,currency:'IRT',...(product?.includedPrint?{includedPrint:product.includedPrint}:{})}});
 const total=items.reduce((n,i)=>n+i.qty*i.unitPrice,0);if(!integer(total,1,99_000_000_000))problem('مبلغ کل فروش معتبر نیست.');if(body.adjustStock&&items.some(i=>!i.variantId))problem('برای محصول آزاد، گزینهٔ کسر موجودی را بردار.');
 let customer=store.db.prepare('SELECT id FROM customers WHERE phone=?').get(phone);if(!customer){customer={id:randomUUID()};store.db.prepare('INSERT INTO customers(id,phone,name,created_at) VALUES(?,?,?,?)').run(customer.id,phone,name,Date.now())}
 const id=`LC-${randomBytes(8).toString('hex').toUpperCase()}`,order={id,customerId:customer.id,printTicketUrl:`/api/orders/${id}/print`,schemaVersion:3,createdAt:new Date().toISOString(),orderDate:dated(body.date),status:'pending_manual_payment',paymentStatus:'not_paid',productionApproved:true,source:{type:'external',channel:body.channel,externalReference:cleanText(body.externalReference,120),adjustStock:body.adjustStock,inventoryAdjusted:false,recordedBy:actor},customer:{name,phone,note:cleanText(body.note,2000),address:cleanText(body.address,600)?{province:'',city:'',street:cleanText(body.address,600),postalCode:''}:null},items,shippingPolicy:{mode:'recipient',payer:'customer',collectedBy:'carrier'},totals:{baseProducts:total,printingSurcharge:0,productsTotal:total,shipping:0,finalTotal:total,currency:'IRT'},production:{method:'external_order',approvalRequired:false}};
 if(body.paid)settleExternal(store,order,{...body,date:body.date},actor);
 store.db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?)').run(id,customer.id,key,digest,JSON.stringify(order),order.status,Date.now());store.audit(actor,'order.external.create',id,{total,channel:body.channel,paid:body.paid});return store.receipt(order);
})}
