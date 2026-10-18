import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {models,colors,sizes,slots,slotIds,productionPlacement,specVersion,calibration} from '../shared/print-spec.js';
import {products} from '../src/data.js';
import {printTicket} from './print-ticket.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (message,status=400) => {throw Object.assign(new Error(message),{status})};
const text = (value,max=600) => typeof value==='string'?value.trim().slice(0,max):'';
const idPattern=/^[a-f0-9]{32}$/;
function jpegOrientation(bytes,start,end){
 try{
  if(bytes.toString('ascii',start,start+6)!=='Exif\0\0')return 1;
  const base=start+6,little=bytes.toString('ascii',base,base+2)==='II';
  if(!little&&bytes.toString('ascii',base,base+2)!=='MM')return 1;
  const u16=n=>{if(n<base||n+2>end)throw Error();return little?bytes.readUInt16LE(n):bytes.readUInt16BE(n)};
  const u32=n=>{if(n<base||n+4>end)throw Error();return little?bytes.readUInt32LE(n):bytes.readUInt32BE(n)};
  if(u16(base+2)!==42)return 1;const ifd=base+u32(base+4),count=u16(ifd);
  for(let i=0;i<Math.min(count,1000);i++){const entry=ifd+2+i*12;if(u16(entry)===274&&u16(entry+2)===3&&u32(entry+4)===1){const n=u16(entry+8);return n>=1&&n<=8?n:1}}
 }catch{}
 return 1;
}
export function imageInfo(bytes){
 let width,height,mime,extension,exifOrientation=1;
 if(bytes.length>32&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'){
  width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);mime='image/png';extension='png';
 }else if(bytes.length>30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  const type=bytes.toString('ascii',12,16);mime='image/webp';extension='webp';
  if(type==='VP8X'){width=bytes.readUIntLE(24,3)+1;height=bytes.readUIntLE(27,3)+1}
  else if(type==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=bytes.readUInt16LE(26)&16383;height=bytes.readUInt16LE(28)&16383}
  else if(type==='VP8L'&&bytes[20]===47){const n=bytes.readUInt32LE(21);width=(n&16383)+1;height=((n>>>14)&16383)+1}
 }else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216){
  mime='image/jpeg';extension='jpg';let offset=2;
  while(offset+4<bytes.length){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;if(marker===225)exifOrientation=jpegOrientation(bytes,offset+2,offset+length);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5)}offset+=length;
  }
 }
 if(!width||!height||width>20000||height>20000||width*height>100000000)fail('تصویر معتبر PNG، JPG یا WebP با حداکثر ۱۰۰ مگاپیکسل انتخاب کن.');
 const sourcePixelWidth=width,sourcePixelHeight=height;
 if(exifOrientation>=5)[width,height]=[height,width];
 return {width,height,mime,extension,sourcePixelWidth,sourcePixelHeight,exifOrientation};
}
function decodeImage(data,maxBytes){
 if(typeof data!=='string')fail('فایل اصلی طرح موجود نیست.');
 const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data);
 if(!match)fail('فرمت فایل تصویر معتبر نیست.');
 const bytes=Buffer.from(match[2],'base64');if(bytes.length>maxBytes)fail('حجم فایل بیشتر از حد مجاز است.',413);
 const info=imageInfo(bytes);if(info.mime!==`image/${match[1]}`)fail('نوع فایل با محتوای آن مطابقت ندارد.');
 return {bytes,info};
}
async function jsonBody(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail('درخواست باید JSON باشد.',415);
 const chunks=[];let length=0;
 for await(const chunk of req){length+=chunk.length;if(length>16*1024*1024)fail('حجم درخواست بیش از حد مجاز است.',413);chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail('ساختار درخواست معتبر نیست.')}
}
async function atomicJson(file,value){const temp=`${file}.${randomBytes(8).toString('hex')}.tmp`;await writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await rename(temp,file)}
export function createPrintApi({dataDir=path.resolve('data')}={}){
 const assetsDir=path.join(dataDir,'assets'),ordersDir=path.join(dataDir,'orders');
 const ready=Promise.all([mkdir(assetsDir,{recursive:true}),mkdir(ordersDir,{recursive:true})]);
 let queue=Promise.resolve();
 const locked=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result};
 async function loadAsset(id,owner){
  if(!idPattern.test(id||''))fail('شناسه فایل معتبر نیست.');
  const record=await readFile(path.join(assetsDir,`${id}.json`),'utf8').then(JSON.parse).catch(()=>null);
  if(!record||record.owner!==owner)fail('فایل اصلی پیدا نشد؛ طرح را دوباره بارگذاری کن.',404);
  return record;
 }
 return async function api(req,res,next){
  const url=new URL(req.url,'http://local');if(!url.pathname.startsWith('/api/'))return next?.();
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))};
  try{
   await ready;
   if(!['GET','POST'].includes(req.method))fail('این روش پشتیبانی نمی‌شود.',405);
   const origin=req.headers.origin;
   if(req.method==='POST'&&origin){let host;try{host=new URL(origin).host}catch{fail('مبدأ درخواست معتبر نیست.',403)}if(host!==req.headers.host)fail('ارسال درخواست از این مبدأ مجاز نیست.',403)}
   let token=/(?:^|;\s*)lisha_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
   if(!token){token=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`lisha_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${req.socket.encrypted?'; Secure':''}`)}
   const owner=hash(token);
   if(url.pathname==='/api/health'&&req.method==='GET')return send({ok:true,specVersion});
   if(url.pathname==='/api/print-assets'&&req.method==='POST'){
    const body=await jsonBody(req);const original=decodeImage(body.original,10*1024*1024);const preview=decodeImage(body.preview,750000);
    const id=randomBytes(16).toString('hex');const fileName=text(body.fileName,180).replace(/[\x00-\x1f\\/]/g,'_')||`artwork.${original.info.extension}`;
    const record={id,owner,fileName,...original.info,bytes:original.bytes.length,sha256:hash(original.bytes),createdAt:new Date().toISOString(),originalFile:`${id}.${original.info.extension}`,previewFile:`${id}.preview.${preview.info.extension}`,originalUrl:`/api/print-assets/${id}/original`,previewUrl:`/api/print-assets/${id}/preview`};
    await writeFile(path.join(assetsDir,record.originalFile),original.bytes,{flag:'wx'});await writeFile(path.join(assetsDir,record.previewFile),preview.bytes,{flag:'wx'});await atomicJson(path.join(assetsDir,`${id}.json`),record);
    const {owner:ignored,originalFile,previewFile,...publicRecord}=record;return send(publicRecord,201);
   }
   const assetRoute=/^\/api\/print-assets\/([a-f0-9]{32})\/(original|preview)$/.exec(url.pathname);
   if(assetRoute&&req.method==='GET'){
    const asset=await loadAsset(assetRoute[1],owner);const original=assetRoute[2]==='original';const bytes=await readFile(path.join(assetsDir,original?asset.originalFile:asset.previewFile));
    res.writeHead(200,{'Content-Type':original?asset.mime:imageInfo(bytes).mime,'Content-Disposition':`${original?'attachment':'inline'}; filename="artwork.${original?asset.extension:'webp'}"; filename*=UTF-8''${encodeURIComponent(original?asset.fileName:'preview.webp')}`});return res.end(bytes);
   }
   if(url.pathname==='/api/orders'&&req.method==='POST'){
    const body=await jsonBody(req);
    if(!/^[a-zA-Z0-9-]{12,80}$/.test(body.idempotencyKey||''))fail('شناسه ارسال معتبر نیست.');
    if(body.confirmed!==true)fail('ابتدا جزئیات درخواست چاپ را تأیید کن.');
    const customer={name:text(body.customer?.name,80),phone:text(body.customer?.phone,30),note:text(body.customer?.note,1000)};
    if(!customer.name||!/^\+?[0-9۰-۹٠-٩ ()-]{7,30}$/.test(customer.phone))fail('نام و شماره تماس معتبر را وارد کن.');
    if(!Array.isArray(body.items)||!body.items.length||body.items.length>30)fail('سبد باید بین ۱ تا ۳۰ محصول داشته باشد.');
    const result=await locked(async()=>{
     const idemHash=hash(`${owner}:${body.idempotencyKey}`);const idemFile=path.join(ordersDir,`request-${idemHash}.json`);const requestHash=hash(JSON.stringify(body));
     const previous=await readFile(idemFile,'utf8').then(JSON.parse).catch(()=>null);
     if(previous){if(previous.requestHash!==requestHash)fail('این شناسه قبلاً با جزئیات متفاوت استفاده شده است.',409);return JSON.parse(await readFile(path.join(ordersDir,`${previous.orderId}.json`),'utf8'))}
     const items=[];
     for(const [index,item] of body.items.entries()){
      if(!Number.isInteger(item.qty)||item.qty<1||item.qty>10)fail('تعداد هر محصول باید بین ۱ تا ۱۰ باشد.');
      if(!sizes.some(s=>s[0]===item.size)&&item.size!=='تک‌سایز')fail('سایز انتخاب‌شده معتبر نیست.');
      if(item.custom){
       const c=item.custom,model=Object.hasOwn(models,c.kind)?models[c.kind]:null,color=colors.find(v=>v.id===c.colorId);
       if(!model||!color||!sizes.some(s=>s[0]===item.size))fail('مدل، رنگ یا سایز لباس معتبر نیست.');
       if(c.schemaVersion!==3||!Array.isArray(c.placements)||!c.placements.length||c.placements.length>16)fail('طرح قدیمی است یا فایل اصلی ندارد؛ در طراح لباس دوباره بارگذاری کن.');
       const placements=[],used=new Set();
       for(const p of c.placements){
        if(!slotIds(c.kind).includes(p.slotId)||used.has(p.slotId))fail('محل چاپ نامعتبر یا تکراری است.');used.add(p.slotId);
        const asset=await loadAsset(p.assetId,owner);
        if(!Number.isFinite(p.widthCm)||p.widthCm<.5)fail('عرض چاپ باید عدد مثبت و برحسب سانتی‌متر باشد.');
        const place=productionPlacement(p.slotId,p,asset);if(Math.abs(place.widthCm-p.widthCm)>.015)fail('اندازه چاپ از محدوده مجاز این قسمت بزرگ‌تر است.');
        placements.push({...place,sourceFile:path.posix.join('assets',asset.originalFile),previewFile:path.posix.join('assets',asset.previewFile)});
       }
       const size=sizes.find(s=>s[0]===item.size);
       items.push({line:index+1,productId:'custom',name:`${model.name} با طرح تو`,qty:item.qty,size:item.size,unitPrice:model.price,currency:'IRT',custom:{schemaVersion:3,specVersion,kind:c.kind,model:{...model},color:{...color},garmentMeasurementsCm:{chestWidth:size[1],length:size[2],status:'reference_only'},hoodDrawstrings:c.kind==='hoodies'?false:null,calibration:{...calibration},note:text(c.note,1000),printCount:placements.length,placements,preview:{type:'photo-overlay',views:[...new Set(placements.map(p=>p.view))].map(view=>({view,basePhoto:`/assets/${c.kind}-${['right','left'].includes(view)?'side':view}.png`,mirrorBaseOnly:view==='left',placementIds:placements.filter(p=>p.view===view).map(p=>p.slotId)}))}}});
      }else{
       const product=products.find(p=>p.id===item.productId);if(!product)fail('محصول پیدا نشد.');
       if(product.category==='tote-bags'?item.size!=='تک‌سایز':!sizes.some(s=>s[0]===item.size))fail('سایز این محصول معتبر نیست.');
       items.push({line:index+1,productId:product.id,name:product.name,qty:item.qty,size:item.size,unitPrice:product.price,image:product.image,currency:'IRT'});
      }
     }
     const orderId=`LS-${idemHash.slice(0,16).toUpperCase()}`;
     const recovered=await readFile(path.join(ordersDir,`${orderId}.json`),'utf8').then(JSON.parse).catch(()=>null);
     if(recovered){if(recovered.requestHash!==requestHash)fail('این درخواست قبلاً با جزئیات متفاوت ثبت شده است.',409);await atomicJson(idemFile,{orderId,requestHash});return recovered}
     const order={id:orderId,printTicketUrl:`/api/orders/${orderId}/print`,owner,schemaVersion:3,specVersion,createdAt:new Date().toISOString(),status:'pending_print_review',paymentStatus:'not_paid',productionApproved:false,customer,customerConfirmedAt:new Date().toISOString(),items,totals:{baseProducts:items.reduce((n,p)=>n+p.qty*p.unitPrice,0),printingSurcharge:null,shipping:null,finalTotal:null,currency:'IRT'},production:{measurementUnit:'cm',approvalRequired:true,method:'to_be_confirmed',colorMatching:'requires_confirmation',calibration:{...calibration}},requestHash};
     await writeFile(path.join(ordersDir,`${order.id}.print.html`),printTicket(order,{local:true}));await atomicJson(path.join(ordersDir,`${order.id}.json`),order);await atomicJson(idemFile,{orderId:order.id,requestHash});return order;
    });
    const {owner:ignored,requestHash,...receipt}=result;return send(receipt,201);
   }
   const ticketRoute=/^\/api\/orders\/(LS-[A-F0-9]{16})\/print$/.exec(url.pathname);
   if(ticketRoute&&req.method==='GET'){
    const order=await readFile(path.join(ordersDir,`${ticketRoute[1]}.json`),'utf8').then(JSON.parse).catch(()=>null);
    if(!order||order.owner!==owner)fail('درخواست چاپ پیدا نشد.',404);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});return res.end(printTicket(order));
   }
   const orderRoute=/^\/api\/orders\/(LS-[A-F0-9]{16})$/.exec(url.pathname);
   if(req.method==='GET'&&(orderRoute||url.pathname==='/api/orders')){
    const files=orderRoute?[`${orderRoute[1]}.json`]:(await readdir(ordersDir)).filter(f=>/^LS-[A-F0-9]{16}\.json$/.test(f));
    const orders=[];for(const file of files){const o=await readFile(path.join(ordersDir,file),'utf8').then(JSON.parse).catch(()=>null);if(o?.owner===owner){const {owner:ignored,requestHash,...receipt}=o;orders.push(receipt)}}
    if(orderRoute&&!orders.length)fail('درخواست چاپ پیدا نشد.',404);
    return send(orderRoute?orders[0]:orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
   }
   fail('مسیر پیدا نشد.',404);
  }catch(error){if(error.status)send({error:error.message},error.status);else{console.error('Print API error:',error.code||error.name);send({error:'ذخیره روی سرور انجام نشد؛ دوباره تلاش کن. اطلاعات سبدت حفظ شده.'},500)}}
 };
}
