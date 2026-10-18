import React,{useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Check,ArrowLeft,Download,Package} from 'lucide-react';
import {parts,slots,views,productionPlacement,calibration} from '../shared/print-spec';
import {money,fa} from './data';
import {api,sendJson,orderItems} from './print-api';
import {PhotoGarment} from './photo-print-viewer';

function normalized(custom){
 if(custom?.placements)return {...custom,color:custom.color.hex,colorName:custom.color.name,prints:Object.fromEntries(custom.placements.map(p=>[p.slotId,{...p,width:p.pixelWidth,height:p.pixelHeight}]))};
 return custom;
}
function placementsOf(custom){
 if(custom?.placements)return custom.placements;
 return Object.entries(custom?.prints||{}).filter(([id,p])=>slots[id]&&p.assetId).map(([id,p])=>productionPlacement(id,p,{...p,id:p.assetId}));
}
export function CartPrintPhoto({custom,size}){
 const c=normalized(custom),placements=placementsOf(custom),view=placements.some(p=>p.view==='front')?'front':placements[0]?.view||'front';
 return <PhotoGarment kind={c.kind} color={c.color} size={size} prints={c.prints} view={view} compact/>;
}
export function PrintSpecList({custom,compact=false}){
 const placements=placementsOf(custom);
 if(!placements.length)return <p className="photo-print-summary-note">این طرح قدیمی است؛ فایل اصلی و محل‌های جدید را در طراح لباس انتخاب کن.</p>;
 return <div className="print-spec-list">{placements.map(p=><div className="print-spec-row" key={p.slotId}><img src={p.previewUrl} alt={`طرح ${p.partName} ${p.positionName}`}/><div><b>{p.partName} · {p.positionName}</b><span>عرض {fa(p.widthCm)} × ارتفاع {fa(p.heightCm)} سانتی‌متر</span><small>مرکز طرح: {fa(Math.abs(p.centerOffsetCm.x))} سانتی‌متر {p.centerOffsetCm.x<0?'راست':p.centerOffsetCm.x>0?'چپ':'از محور وسط'} و {fa(p.centerOffsetCm.y)} سانتی‌متر پایین از {p.anchor}</small><small dir="auto">{p.fileName}</small>{!compact&&<><small><b dir="ltr">{p.pixelWidth} × {p.pixelHeight} px · {p.effectiveDpi} DPI</b> · {fa(Math.round(p.bytes/1024))} کیلوبایت</small><a href={p.originalUrl} download>دریافت فایل اصلی</a></>}</div></div>)}</div>;
}
export function OrderReview({items}){
 return <div className="print-review-list">{items.map((item,index)=>{
  const c=normalized(item.custom),placements=placementsOf(item.custom),viewIds=[...new Set(placements.map(p=>p.view))];
  return <article key={item.key||item.line||index} className="print-review-item"><h3>{item.name}</h3><p className="print-review-meta">سایز <b dir="auto">{item.size}</b> · تعداد {fa(item.qty)}{c&&<> · {c.colorName} · {fa(placements.length)} محل چاپ</>}</p>{c&&<><div className="photo-review-grid">{viewIds.map(view=><figure key={view}><PhotoGarment kind={c.kind} size={item.size} color={c.color} prints={c.prints} view={view}/><figcaption>نمای {views[view]}</figcaption></figure>)}</div><PrintSpecList custom={item.custom}/>{c.note&&<p className="print-note">توضیحات چاپ: {c.note}</p>}<p className="photo-print-summary-note">{calibration.notice}</p></>}</article>;
 })}</div>;
}
export function ServerCheckout({cart,setCart}){
 const [saved,setSaved]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const request=useRef(null),inFlight=useRef(false);
 async function submit(event){
  event.preventDefault();if(inFlight.current)return;setError('');
  const form=new FormData(event.currentTarget),submitted=cart.map(i=>({...i}));
  const body={confirmed:form.get('confirmed')==='on',customer:{name:form.get('name'),phone:form.get('phone'),note:form.get('note')},items:orderItems(submitted)};
  const fingerprint=JSON.stringify(body);if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,key:crypto.randomUUID()};
  setBusy(true);inFlight.current=true;
  try{const result=await sendJson('/orders',{...body,idempotencyKey:request.current.key});setSaved(result);setCart(current=>current.filter(item=>!submitted.some(s=>s.key===item.key&&JSON.stringify(s)===JSON.stringify(item))));window.scrollTo({top:0,behavior:'instant'})}catch(e){setError(e.message)}finally{setBusy(false);inFlight.current=false}
 }
 if(saved)return <section className="wrap print-order-success"><header><Check/><h2>درخواست قشنگت به سرور رسید ♡</h2><p>کد درخواست: <b dir="ltr">{saved.id}</b><br/>وضعیت: در انتظار بررسی چاپ · پرداخت نشده</p><p>فایل‌های اصلی و همهٔ اندازه‌ها ذخیره شدند. چاپ، قیمت نهایی و ارسال پس از بررسی تأیید می‌شوند.</p><p>{saved.customer.name} · <b dir="ltr">{saved.customer.phone}</b></p>{saved.customer.note&&<p>{saved.customer.note}</p>}<div className="receipt-actions"><a className="button" href={`/api/orders/${saved.id}`} download={`${saved.id}.json`}>دریافت جزئیات کامل <Download size={17}/></a><a className="text-link" href={saved.printTicketUrl} target="_blank" rel="noreferrer">برگهٔ چاپ <Package size={15}/></a><Link className="text-link" to="/my-account/">درخواست‌های من <ArrowLeft size={15}/></Link></div></header><OrderReview items={saved.items}/></section>;
 if(!cart.length)return <section className="wrap empty"><h2>اول یه دلخوشی انتخاب کن</h2><Link className="button" to="/shop/">دیدن فروشگاه <ArrowLeft size={17}/></Link></section>;
 const legacy=cart.some(i=>i.custom?.schemaVersion!==3&&i.custom);
 return <section className="wrap checkout-layout server-checkout"><form onSubmit={submit}><h2>یه بار با هم مرور کنیم</h2><p className="checkout-total-note">این مشخصات و فایل‌های اصلی به سرور ارسال می‌شوند. انتخاب‌های چاپت را در همین صفحه ببین و تأیید کن.</p><OrderReview items={cart}/><label>نام و نام خانوادگی<input name="name" required maxLength="80" autoComplete="name" placeholder="نامت رو برامون بنویس"/></label><label>شمارهٔ تماس<input name="phone" type="tel" required minLength="7" maxLength="30" autoComplete="tel" dir="ltr" placeholder="0912…"/></label><label>یادداشت سفارش<textarea name="note" rows="3" maxLength="1000" placeholder="توضیحی که برای بررسی سفارش لازمه…"/></label><label className="confirm-print-request"><input type="checkbox" name="confirmed" required/>فایل‌ها، مدل، رنگ، سایز، محل و اندازهٔ تمام چاپ‌ها را بررسی کردم؛ می‌دانم ابعاد نمونه و اجرای چاپ باید پیش از تولید تأیید شوند.</label>{legacy&&<p className="error">یک طرح قدیمی در سبد داری. ابتدا از سبد وارد ویرایش آن شو و فایل اصلی را دوباره بارگذاری کن.</p>}{error&&<p role="alert" className="error">{error}</p>}<button className="button" type="submit" disabled={busy||legacy}>{busy?'در حال ارسال و ذخیره روی سرور…':'ارسال درخواست چاپ'} <Check size={18}/></button></form><aside className="order-summary"><Package/><h2>خلاصهٔ درخواست تو</h2>{cart.map(i=><p key={i.key}><span>{i.name} × {fa(i.qty)}</span><b>{money(i.price*i.qty)}</b></p>)}<div className="cart-total">مبلغ پایه <strong>{money(cart.reduce((n,i)=>n+i.qty*i.price,0))} تومان</strong></div><p className="checkout-total-note">هزینهٔ چاپ چند محل و ارسال پس از بررسی مشخص می‌شود. این مرحله پرداخت ندارد.</p><Link className="text-link" to="/cart/">ویرایش سبد <ArrowLeft size={17}/></Link></aside></section>;
}
export function BackendOrders(){
 const [orders,setOrders]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 async function load(){setBusy(true);setError('');try{setOrders(await api('/orders'))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[]);
 return <div className="backend-order-list"><h2>درخواست‌های ارسال‌شدهٔ تو</h2><p className="checkout-total-note">درخواست‌های سرور با نشست همین مرورگر نمایش داده می‌شوند. ورود و بازیابی روی دستگاه دیگر هنوز فعال نیست.</p>{busy&&<p role="status">در حال دریافت درخواست‌ها…</p>}{error&&<p role="alert">{error}</p>}{!busy&&!error&&!orders.length&&<p>هنوز درخواستی به سرور نفرستادی.</p>}{orders.map(order=><details key={order.id}><summary><b dir="ltr">{order.id}</b><span>در انتظار بررسی چاپ</span></summary><p className="print-review-meta">{order.customer.name} · {new Date(order.createdAt).toLocaleDateString('fa-IR')} · پرداخت نشده</p><a className="text-link" href={`/api/orders/${order.id}`} download={`${order.id}.json`}>دریافت جزئیات کامل <Download size={15}/></a><div className="receipt-actions"><a className="text-link" href={order.printTicketUrl} target="_blank" rel="noreferrer">برگهٔ چاپ <Package size={15}/></a></div><OrderReview items={order.items}/>{order.customer.note&&<p>{order.customer.note}</p>}</details>)}<button className="text-link" disabled={busy} onClick={load}>دریافت دوبارهٔ درخواست‌ها</button></div>;
}
