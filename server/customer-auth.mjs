import {createHash,createHmac,randomInt,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {demoAccounts} from './demo-auth.mjs';
import {problem,phoneNumber,cleanText} from './commerce-store.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
export function appendCookie(res,value){const previous=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(Array.isArray(previous)?previous:previous?[previous]:[]),value])}
export function smsTransport({dataDir,development=false,env=process.env,fetcher=fetch}){
 const demo=demoAccounts(env);if(demo)return {mode:'demo',accounts:demo,async send(){}};
 if(env.LISHA_SMS_DRIVER==='kavenegar'||env.KAVENEGAR_API_KEY){
  if(!env.KAVENEGAR_API_KEY||!env.KAVENEGAR_TEMPLATE)return {mode:'unavailable',async send(){problem('سرویس پیامک هنوز تنظیم نشده است.',503)}};
  return {mode:'sms',async send({phone,code}){
   let result;
   try{const response=await fetcher(`https://api.kavenegar.com/v1/${encodeURIComponent(env.KAVENEGAR_API_KEY)}/verify/lookup.json`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({receptor:phone,token:code,template:env.KAVENEGAR_TEMPLATE,type:'sms'}),signal:AbortSignal.timeout(12000)});result=await response.json();if(!response.ok||result?.return?.status!==200)throw Error('delivery')}
   catch{problem('پیامک ارسال نشد؛ کمی بعد دوباره تلاش کن.',503)}
  }};
 }
 if(development&&env.NODE_ENV!=='production'&&(!env.LISHA_SMS_DRIVER||env.LISHA_SMS_DRIVER==='development'))return {mode:'development',async send(message){
  const folder=path.join(dataDir,'development-otp');await mkdir(folder,{recursive:true});await writeFile(path.join(folder,`${message.phone}.json`),JSON.stringify({...message,notice:'LOCAL DEVELOPMENT ONLY - no SMS sent'}),{mode:0o600});
 }};
 return {mode:'unavailable',async send(){problem('ورود پیامکی هنوز به پنل پیامک متصل نشده است.',503)}};
}
export class CustomerAuth{
 constructor(store,{sms,now=Date.now,secureCookie=false}={}){this.store=store;this.sms=sms;this.now=now;this.secureCookie=secureCookie;this.secret=store.setting('otpSecret');this.demo=sms.mode==='demo';this.demoAccounts=this.demo?sms.accounts:[]}
 digest(id,phone,code,purpose='customer'){return createHmac('sha256',this.secret).update(`${purpose}:${id}:${phone}:${code}`).digest('hex')}
 isAdminPhone(phone){return this.demo?this.demoAccounts.some(a=>a.phone===phone&&a.role==='admin'):this.store.isAdmin(phone)}
 sessionDigest(token){return sha(this.demo?`demo:${token}`:token)}
 checkPurpose(phone,purpose){
  if(this.demo&&!this.demoAccounts.some(a=>a.phone===phone))problem('در نسخهٔ دمو از شماره و رمز حساب آزمایشی استفاده کن.',403);
  if(!['customer','admin'].includes(purpose))problem('روش ورود معتبر نیست.');
  if(purpose==='admin'&&!this.isAdminPhone(phone))problem('این شماره دسترسی مدیریت ندارد؛ از پروفایل مشتری وارد شو.',403);
  if(purpose==='customer'&&this.isAdminPhone(phone))problem('این شماره مربوط به مدیر است؛ از صفحهٔ ورود مدیریت در /admin وارد شو.',403);
 }
 limit(key,max,windowMs){
  const now=this.now();this.store.db.prepare('DELETE FROM limits WHERE created_at<?').run(now-86400000);
  const count=this.store.db.prepare('SELECT COUNT(*) AS n FROM limits WHERE key=? AND created_at>?').get(key,now-windowMs).n;
  if(count>=max)problem('تعداد تلاش‌ها زیاد شده؛ کمی بعد دوباره امتحان کن.',429);
  this.store.db.prepare('INSERT INTO limits VALUES(?,?)').run(key,now);
 }
 async request(value,ip,purpose='customer'){
  if(this.demo)problem('برای ورود دمو، شماره و رمز ثابت را وارد کن.');
  const phone=phoneNumber(value),now=this.now();this.checkPurpose(phone,purpose);if(this.sms.mode==='unavailable')problem('ورود پیامکی هنوز به پنل پیامک متصل نشده است.',503);
  const id=randomUUID(),code=String(randomInt(100000,1000000)),expiresAt=now+120000;
  this.store.transaction(()=>{
   const recent=this.store.db.prepare('SELECT created_at FROM otp WHERE phone=? ORDER BY created_at DESC LIMIT 1').get(phone);
   if(recent&&recent.created_at>now-60000)problem('برای دریافت کد تازه یک دقیقه صبر کن.',429);
   this.limit(`otp:ip:${sha(ip)}`,20,3600000);this.limit(`otp:phone:${sha(phone)}`,5,3600000);
   this.store.db.prepare('UPDATE otp SET consumed=1 WHERE phone=?').run(phone);
   this.store.db.prepare('INSERT INTO otp(id,phone,digest,expires_at,created_at) VALUES(?,?,?,?,?)').run(id,phone,this.digest(id,phone,code,purpose),expiresAt,now);
  });
  try{await this.sms.send({id,phone,code,expiresAt})}catch(e){this.store.db.prepare('UPDATE otp SET consumed=1 WHERE id=?').run(id);throw e}
  return {challengeId:id,expiresAt,retryAfter:60,mode:this.sms.mode};
 }
 verify(body,req,res,purpose='customer'){
  if(this.demo)problem('برای ورود دمو، شماره و رمز ثابت را وارد کن.');
  const phone=phoneNumber(body.phone),code=String(body.code||'').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
  if(!/^[0-9]{6}$/.test(code)||typeof body.challengeId!=='string')problem('کد شش‌رقمی معتبر وارد کن.');
  let customer,error;
  this.store.transaction(()=>{
   this.limit(`verify:${sha(phone)}`,20,3600000);
   const row=this.store.db.prepare('SELECT * FROM otp WHERE id=? AND phone=?').get(body.challengeId,phone);
   if(!row||row.consumed||row.attempts>=5||row.expires_at<=this.now()){error='کد نامعتبر است یا زمان آن تمام شده؛ کد تازه بگیر.';return}
   this.store.db.prepare('UPDATE otp SET attempts=attempts+1 WHERE id=?').run(row.id);
   if(!timingSafeEqual(Buffer.from(row.digest,'hex'),Buffer.from(this.digest(row.id,phone,code,purpose),'hex'))){error='کد واردشده درست نیست.';return}
   this.checkPurpose(phone,purpose);
   this.store.db.prepare('UPDATE otp SET consumed=1 WHERE id=?').run(row.id);
   customer=this.store.db.prepare('SELECT * FROM customers WHERE phone=?').get(phone);
   if(!customer){const id=randomUUID();this.store.db.prepare('INSERT INTO customers(id,phone,created_at) VALUES(?,?,?)').run(id,phone,this.now());customer=this.store.db.prepare('SELECT * FROM customers WHERE id=?').get(id)}
  });
  if(error)problem(error,400);
  if(this.sms.mode==='development')unlink(path.join(this.store.dataDir,'development-otp',`${phone}.json`)).catch(()=>{});
  return this.startSession(customer,req,res);
 }
 verifyDemo(body,req,res,purpose='customer'){
  if(!this.demo)problem('ورود با رمز ثابت فعال نیست.',404);
  const ip=req.socket.remoteAddress||'local';this.limit(`demo:ip:${sha(ip)}`,100,3600000);
  const phone=phoneNumber(body.phone);this.limit(`demo:phone:${sha(phone)}`,30,3600000);
  const account=this.demoAccounts.find(a=>a.phone===phone&&a.role===purpose);
  const code=String(body.code||'').replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
  if(!account||!timingSafeEqual(Buffer.from(sha(code),'hex'),Buffer.from(sha(account.code),'hex')))problem('شماره یا رمز ورود دمو درست نیست.',400);
  const customer=this.store.transaction(()=>{
   let row=this.store.db.prepare('SELECT * FROM customers WHERE phone=?').get(phone);
   if(!row){const id=randomUUID();this.store.db.prepare('INSERT INTO customers(id,phone,name,created_at) VALUES(?,?,?,?)').run(id,phone,account.name,this.now());row=this.store.db.prepare('SELECT * FROM customers WHERE id=?').get(id)}
   return row;
  });
  return this.startSession(customer,req,res);
 }
 startSession(customer,req,res){
  const previous=this.sessionToken(req);if(previous)this.store.db.prepare('DELETE FROM sessions WHERE digest=?').run(this.sessionDigest(previous));
  const token=randomBytes(32).toString('hex');this.store.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(this.sessionDigest(token),customer.id,this.now()+7*86400000);
  appendCookie(res,`lisha_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${this.secureCookie||req.socket.encrypted?'; Secure':''}`);
  return this.publicCustomer(customer);
 }
 sessionToken(req){return /(?:^|;\s*)lisha_auth=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]}
 identity(req){
  const token=this.sessionToken(req);if(!token)return null;
  const row=this.store.db.prepare('SELECT c.* FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.digest=? AND s.expires_at>?').get(this.sessionDigest(token),this.now());return row?this.publicCustomer(row):null;
 }
 publicCustomer(row){return {id:row.id,name:row.name,phone:row.phone,role:this.isAdminPhone(row.phone)?'admin':'customer',createdAt:row.created_at}}
 logout(req,res){const token=this.sessionToken(req);if(token)this.store.db.prepare('DELETE FROM sessions WHERE digest=?').run(this.sessionDigest(token));appendCookie(res,`lisha_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secureCookie||req.socket.encrypted?'; Secure':''}`)}
 require(user){if(!user)problem('برای ادامه ابتدا با شماره موبایل وارد شو.',401);return user}
 requireAdmin(user){this.require(user);if(user.role!=='admin')problem('این بخش فقط برای مدیر فروشگاه است.',403);return user}
 update(user,body){this.require(user);const name=cleanText(body.name,80);if(!name)problem('نام و نام خانوادگی را وارد کن.');this.store.db.prepare('UPDATE customers SET name=? WHERE id=?').run(name,user.id);return {...user,name}}
}
