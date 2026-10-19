import {randomBytes,randomUUID} from 'node:crypto';
import {problem,integer} from './commerce-store.mjs';

// Provider amounts are always derived from the saved order, in integer rials.
export function zarinpalGateway({env=process.env,fetcher=fetch}={}){
 const sandbox=env.ZARINPAL_SANDBOX==='true';
 const publicUrl=(env.LISHA_PUBLIC_URL||'').replace(/\/$/,'');
 let validUrl=false;try{const u=new URL(publicUrl);validUrl=u.protocol==='https:'||(sandbox&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))}catch{}
 const available=!!env.ZARINPAL_MERCHANT_ID&&validUrl;
 const api=sandbox?'https://sandbox.zarinpal.com':'https://payment.zarinpal.com';
 const pay=api;
 async function call(method,body){
  const response=await fetcher(`${api}/pg/v4/payment/${method}.json`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({merchant_id:env.ZARINPAL_MERCHANT_ID,...body}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw Error('gateway_unavailable');return result;
 }
 return {provider:'zarinpal',available,sandbox,publicUrl,
  async create({amount,callbackUrl,order}){
   const result=await call('request',{amount:amount*10,currency:'IRR',description:`سفارش لیشا ${order.id}`,callback_url:callbackUrl,metadata:{mobile:order.customer.phone}});
   if(result.data?.code!==100||!/^A[A-Za-z0-9]{10,100}$/.test(result.data.authority||''))problem('درگاه درخواست پرداخت را نپذیرفت؛ دوباره تلاش کن.',502);
   return {authority:result.data.authority,redirectUrl:`${pay}/pg/StartPay/${encodeURIComponent(result.data.authority)}`};
  },
  async verify({authority,amount}){
   const result=await call('verify',{authority,amount:amount*10});
   if([100,101].includes(result.data?.code)&&result.data.ref_id)return {paid:true,reference:String(result.data.ref_id)};
   const code=result.errors?.code??result.data?.code;
   // Only definitive terminal failures release a reservation. A temporary response is retried.
   if([-21,-22,-33,-34,-51,-54].includes(code))return {paid:false};
   throw Error('verification_uncertain');
  }
 };
}

export class Payments{
 constructor(store,gateway){this.store=store;this.gateway=gateway}
 config(){return {available:this.gateway.available,provider:this.gateway.provider,sandbox:!!this.gateway.sandbox}}
 async start(orderId,customer,selection={}){
  if(selection.provider&&selection.provider!==this.gateway.provider)problem('این درگاه برای پرداخت فعال نیست.');
  if(!this.gateway.available)problem('درگاه پرداخت هنوز تنظیم نشده است؛ سفارش تو محفوظ است.',503);
  const store=this.store,db=store.db;let order,payment,reused=false;
  store.transaction(()=>{
   order=store.getOrder(orderId);if(!order||order.customerId!==customer.id)problem('سفارش پیدا نشد.',404);
   if(selection.expectedTotal!==undefined&&selection.expectedTotal!==order.totals.finalTotal)problem('مبلغ سفارش تغییر کرده؛ مبلغ تازه را بررسی و دوباره پرداخت کن.',409);
   if(order.source?.type==='external')problem('دریافت وجه سفارش خارج از سایت در پنل مدیریت ثبت می‌شود.',409);
   if(order.paymentStatus==='paid'||order.refundRequired)problem('این سفارش قبلاً پرداخت شده است.',409);
   if(order.status!=='awaiting_payment'||!integer(order.totals.finalTotal,1000,100_000_000_000))problem('سفارش هنوز برای پرداخت تأیید نشده است.',409);
   const active=db.prepare("SELECT * FROM payments WHERE order_id=? AND status IN ('creating','pending','verifying','uncertain') AND expires_at>? ORDER BY created_at DESC LIMIT 1").get(orderId,Date.now());
   if(active){if(active.status==='pending'&&active.redirect_url){payment=active;reused=true;return}problem('یک پرداخت در حال بررسی است؛ کمی بعد وضعیت سفارش را تازه کن.',409)}
   const counts=new Map();for(const item of order.items)counts.set(item.variantId,(counts.get(item.variantId)||0)+item.qty);
   for(const [id,qty] of counts){const v=db.prepare('SELECT * FROM variants WHERE id=?').get(id),p=v&&store.product(v.product_id);if(!v?.active||!p||v.stock-store.reserved(id)<qty)problem('موجودی یکی از رنگ‌ها یا سایزهای سفارش کافی نیست؛ با فروشگاه هماهنگ کن.',409)}
   payment={id:randomUUID(),state:randomBytes(24).toString('hex'),expires_at:Date.now()+20*60000,amount:order.totals.finalTotal};
   db.prepare('INSERT INTO payments(id,order_id,provider,status,amount,state,expires_at,created_at) VALUES(?,?,?,\'creating\',?,?,?,?)').run(payment.id,orderId,this.gateway.provider,payment.amount,payment.state,payment.expires_at,Date.now());
   for(const [id,qty] of counts)db.prepare('INSERT INTO reservations(payment_id,variant_id,qty,expires_at) VALUES(?,?,?,?)').run(payment.id,id,qty,payment.expires_at);
  });
  if(reused)return {redirectUrl:payment.redirect_url,expiresAt:payment.expires_at};
  try{
   const callbackUrl=`${this.gateway.publicUrl}/api/payments/callback?paymentId=${payment.id}&state=${payment.state}`;
   const result=await this.gateway.create({amount:payment.amount,order,callbackUrl});
   store.transaction(()=>{db.prepare("UPDATE payments SET status='pending',authority=?,redirect_url=? WHERE id=? AND status='creating'").run(result.authority,result.redirectUrl,payment.id);store.audit(customer.id,'payment.start',orderId,{paymentId:payment.id,amount:payment.amount})});
   return {redirectUrl:result.redirectUrl,expiresAt:payment.expires_at};
  }catch(error){db.prepare("UPDATE payments SET status='failed',error=? WHERE id=? AND status='creating'").run('ارتباط اولیه با درگاه برقرار نشد.',payment.id);throw Object.assign(new Error(error.status?error.message:'ارتباط با درگاه برقرار نشد؛ دوباره تلاش کن.'),{status:error.status||503})}
 }
 async callback(query){
  const db=this.store.db,p=db.prepare('SELECT * FROM payments WHERE id=?').get(query.get('paymentId')||'');
  if(!p||p.state!==query.get('state')||!p.authority||p.authority!==query.get('Authority'))problem('اطلاعات برگشت از درگاه معتبر نیست.',400);
  if(['paid','duplicate_paid','paid_stock_issue','failed'].includes(p.status))return p.order_id;
  // Status from the URL is not evidence of payment. Always verify with the provider.
  const claimed=db.prepare("UPDATE payments SET status='verifying',processing_at=? WHERE id=? AND (status IN ('pending','uncertain') OR (status='verifying' AND processing_at<?))").run(Date.now(),p.id,Date.now()-60000);
  if(!claimed.changes)return p.order_id;
  let result;try{result=await this.gateway.verify({authority:p.authority,amount:p.amount})}catch{
   db.prepare("UPDATE payments SET status='uncertain',error=? WHERE id=? AND status='verifying'").run('نتیجهٔ پرداخت نیاز به استعلام دوباره دارد.',p.id);return p.order_id;
  }
  this.store.transaction(()=>{
   const fresh=db.prepare('SELECT * FROM payments WHERE id=?').get(p.id);if(fresh.status!=='verifying')return;
   const order=this.store.getOrder(p.order_id);
   if(!result.paid){db.prepare("UPDATE payments SET status='failed',error=? WHERE id=?").run('پرداخت توسط درگاه تأیید نشد.',p.id);return}
   if(order.paymentStatus==='paid'){
    db.prepare("UPDATE payments SET status='duplicate_paid',reference=? WHERE id=?").run(result.reference,p.id);order.refundRequired=true;order.refundReason='duplicate_payment';this.store.saveOrder(order);return;
   }
   const reservations=db.prepare('SELECT * FROM reservations WHERE payment_id=?').all(p.id);
   const mismatch=order.totals.finalTotal!==p.amount||order.status==='cancelled';
   const shortage=mismatch||reservations.some(r=>{const v=db.prepare('SELECT stock FROM variants WHERE id=?').get(r.variant_id);return !v||v.stock-this.store.reserved(r.variant_id,Date.now(),p.id)<r.qty});
   if(!shortage){
    for(const r of reservations){db.prepare('UPDATE variants SET stock=stock-?,version=version+1 WHERE id=?').run(r.qty,r.variant_id);db.prepare('UPDATE products SET version=version+1,updated_at=? WHERE id=(SELECT product_id FROM variants WHERE id=?)').run(Date.now(),r.variant_id);this.store.ledger(r.variant_id,-r.qty,`payment:${p.id}`,'gateway')}
    db.prepare('UPDATE reservations SET consumed=1 WHERE payment_id=?').run(p.id);
   }
   order.paymentStatus='paid';order.status=shortage?'paid_stock_issue':'paid';order.paidAt=new Date().toISOString();order.paymentReference=result.reference;order.paidAmountToman=p.amount;
   if(shortage){order.refundRequired=true;order.refundReason=mismatch?'order_changed_after_payment_started':'stock_unavailable_after_late_payment'}
   db.prepare('UPDATE payments SET status=?,reference=?,error=NULL WHERE id=?').run(shortage?'paid_stock_issue':'paid',result.reference,p.id);
   this.store.saveOrder(order);this.store.audit('gateway','payment.verified',order.id,{paymentId:p.id,reference:result.reference,shortage});
  });
  return p.order_id;
 }
 async retry(orderId,customer){
  const order=this.store.getOrder(orderId);if(!order||(order.customerId!==customer.id&&customer.role!=='admin'))problem('سفارش پیدا نشد.',404);
  const p=this.store.db.prepare("SELECT * FROM payments WHERE order_id=? AND status IN ('pending','uncertain','verifying') ORDER BY created_at DESC LIMIT 1").get(orderId);
  if(p?.authority)await this.callback(new URLSearchParams({paymentId:p.id,state:p.state,Authority:p.authority}));
  return this.store.receipt(this.store.getOrder(orderId));
 }
}
