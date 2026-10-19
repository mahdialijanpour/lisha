import React from 'react';
import {parts,slots,views,productionPlacement,calibration} from '../shared/print-spec';
import {PriceBreakdown} from './pricing-ui';
import {fa} from './data';
import {PhotoGarment} from './photo-print-viewer';

function normalized(custom){
 if(custom?.placements)return {...custom,color:custom.color.hex,colorName:custom.color.name,prints:Object.fromEntries(custom.placements.map(p=>[p.slotId,{...p,width:p.pixelWidth,height:p.pixelHeight,snapshot:true}]))};
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
 return <div className="print-spec-list">{placements.map(p=><div className="print-spec-row" key={p.slotId}><img src={p.previewUrl} alt={`طرح ${p.partName} ${p.positionName}`}/><div><b>{p.partName} · {p.positionName}</b><span>{p.printFrameCm?`کادر چاپ ${fa(p.printFrameCm.width)} × ${fa(p.printFrameCm.height)} سانتی‌متر`:`عرض ${fa(p.widthCm)} × ارتفاع ${fa(p.heightCm)} سانتی‌متر`}</span>{p.printFrameCm&&<small>خود تصویر: {fa(p.widthCm)} × {fa(p.heightCm)} سانتی‌متر · وسط کادر، بدون کشیدگی</small>}<small>مرکز طرح: {fa(Math.abs(p.centerOffsetCm.x))} سانتی‌متر {p.centerOffsetCm.x<0?'راست':p.centerOffsetCm.x>0?'چپ':'از محور وسط'} و {fa(p.centerOffsetCm.y)} سانتی‌متر پایین از {p.anchor}</small><small dir="auto">{p.fileName}</small>{!compact&&<><small><b dir="ltr">{p.pixelWidth} × {p.pixelHeight} px · {p.effectiveDpi} DPI</b> · {fa(Math.round(p.bytes/1024))} کیلوبایت</small><a href={p.originalUrl} download>دریافت فایل اصلی</a></>}</div></div>)}</div>;
}
export function OrderReview({items}){
 return <div className="print-review-list">{items.map((item,index)=>{
  const c=normalized(item.custom),placements=placementsOf(item.custom),viewIds=[...new Set(placements.map(p=>p.view))];
  return <article key={item.key||item.line||index} className="print-review-item"><h3>{item.name}</h3><p className="print-review-meta">سایز <b dir="auto">{item.size}</b> · تعداد {fa(item.qty)}{!c&&item.color?.name&&<> · {item.color.name}</>}{item.sku&&<> · <small dir="ltr">{item.sku}</small></>}{c&&<> · {c.colorName} · {fa(placements.length)} محل چاپ</>}</p>{!c&&<p className="included-print-note">{item.includedPrint?'چاپ در کادر ۲۰ × ۳۰ سانتی‌متر در قیمت محصول لحاظ شده است.':'قیمت محصول آماده شامل چاپ است.'}</p>}{item.pricing&&<PriceBreakdown value={item.pricing} qty={item.qty}/>} {c&&<><div className="photo-review-grid">{viewIds.map(view=><figure key={view}><PhotoGarment kind={c.kind} size={item.size} color={c.color} prints={c.prints} view={view}/><figcaption>نمای {views[view]}</figcaption></figure>)}</div><PrintSpecList custom={item.custom}/>{c.note&&<p className="print-note">توضیحات چاپ: {c.note}</p>}<p className="photo-print-summary-note">{calibration.notice}</p></>}</article>;
 })}</div>;
}
