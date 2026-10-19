import './pricing.css';
import React,{useEffect,useState} from 'react';
import {money,fa} from './data';
import {useAuth,useCatalog} from './commerce-context';
import {sendJson,orderItems} from './print-api';
export function PriceBreakdown({value,qty=1,explain=true}){
 if(!value)return null;
 return <div className="live-print-price" aria-live="polite"><div className="print-price-heading"><b>قیمت این دلخوشی</b>{value.pricing.sample&&<small>تعرفهٔ نمونه</small>}</div><p><span>لباس خام{qty>1?` × ${fa(qty)}`:''}</span><strong>{money(value.basePrice*qty)} تومان</strong></p>{value.charges.map(c=><p key={c.slotId}><span>{c.label}<small>{fa(c.widthCm)} × {fa(c.heightCm)} سانتی‌متر{c.method==='area'?` · ${fa(c.areaCm2)} سانتی‌متر مربع × ${money(c.ratePerCm2)} تومان`:''}{qty>1?` · ${fa(qty)} عدد`:''}</small></span><strong>{money(c.amountToman*qty)} تومان</strong></p>)}<p className="print-price-total"><b>جمع با چاپ</b><strong>{money(value.unitTotal*qty)} تومان</strong></p>{explain&&<small className="price-explainer">{value.pricing.mode==='area'?'محاسبه بر اساس مساحت کادر چاپ است؛ مبلغ هر محل رو به بالای تومان گرد می‌شود.':`جلو و پشت: ${money(value.pricing.mainPrint)}؛ طرح تا ۱۰ سانت: ${money(value.pricing.smallPrint)}؛ هر سمت کلاه: ${money(value.pricing.hoodPrint)} تومان. محل‌های دیگر بر اساس مساحت محاسبه می‌شوند.`}</small>}</div>;
}
export function useCartQuote(cart){
 const {customer}=useAuth();const {pricing,allProducts,shippingFee,shippingPolicy}=useCatalog();const fingerprint=JSON.stringify(orderItems(cart));const [state,setState]=useState({quote:null,error:'',busy:!!cart.length,key:''});
 useEffect(()=>{let live=true;const key=`${fingerprint}:${pricing?.version}:${shippingFee}:${shippingPolicy?.mode}:${customer?.id||'guest'}`;if(!cart.length){setState({quote:null,error:'',busy:false,key});return}setState({quote:null,error:'',busy:true,key});const timer=setTimeout(async()=>{try{const quote=await sendJson('/cart/quote',{items:JSON.parse(fingerprint)});if(live)setState({quote,error:'',busy:false,key})}catch(e){if(live)setState({quote:null,error:e.message,busy:false,key})}},200);return()=>{live=false;clearTimeout(timer)}},[fingerprint,pricing?.version,allProducts,shippingFee,shippingPolicy?.mode,customer?.id]);
 const current=state.key===`${fingerprint}:${pricing?.version}:${shippingFee}:${shippingPolicy?.mode}:${customer?.id||'guest'}`;return current?state:{quote:null,error:'',busy:!!cart.length};
}
