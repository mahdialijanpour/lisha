import React,{useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Upload,Check,Trash2,ArrowLeft,Image,Ruler,Heart,Plus,Files} from 'lucide-react';
import {money,fa} from './data';
import {models,colors,sizes,parts,slots,slotIds,fitDimensions,calibration} from '../shared/print-spec';
import {sendJson,readImageFile,imagePreview} from './print-api';
import {PhotoPrintViewer} from './photo-print-viewer';
import './custom-studio.css';
import './multi-print.css';
import './photo-print.css';

export function BlankGarment({kind='sweatshirts',color='#faf7f0',art='',scale=32,guide=false}){
 const model=models[kind]||models.sweatshirts,source=`/assets/${model.image}`;
 return <div className={`blank-garment ${kind==='hoodies'?'hoodie-mockup':'sweatshirt-mockup'}`} style={{'--garment-color':color,'--garment-mask':`url("${source}")`}}><img className="blank-garment-base" src={source} alt={`${model.name} خام، نمای روبه‌رو`} width="900" height="900"/><span className="garment-color-layer" aria-hidden="true"/>{art?<img className="garment-artwork" src={art} alt="طرح تو روی لباس" style={{width:`${scale}%`,'--art-height':`${scale*.7}%`}}/>:guide&&<span className="garment-print-zone"><Image size={20}/><small>جای طرح تو</small></span>}</div>;
}
export function BlankGarmentPair(){return <div className="blank-banner" aria-label="دورس و هودی خام برای چاپ دلخواه"><div className="blank-banner-card"><BlankGarment color="#c7b0e1"/><span>دورسِ خام</span></div><div className="blank-banner-card"><BlankGarment kind="hoodies"/><span>هودیِ خام</span></div></div>}

export function CustomStudio({add,initialDesign}){
 const saved=initialDesign?.custom||{},legacy=initialDesign&&saved.schemaVersion!==3;
 const [kind,setKind]=useState(saved.kind==='hoodies'?'hoodies':'sweatshirts');
 const [colorId,setColorId]=useState(saved.colorId||colors.find(c=>c.hex===saved.color)?.id||'lilac');
 const [size,setSize]=useState(initialDesign?.size||'M'),[prints,setPrints]=useState(saved.schemaVersion===3?saved.prints||{}:{});
 const [part,setPart]=useState('front'),[activeSlot,setActiveSlot]=useState('front.center'),[view,setView]=useState('front');
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(saved.note||'');
 const inputRef=useRef(),previewRef=useRef(),settingsRef=useRef(),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[]);
 const color=colors.find(c=>c.id===colorId)||colors[0],model=models[kind];
 const allowed=slotIds(kind),activePrints=Object.fromEntries(Object.entries(prints).filter(([id,p])=>allowed.includes(id)&&p.assetId));
 const entries=Object.entries(activePrints),count=entries.length,targets=activeSlot==='hood.both'?['hood.right','hood.left']:[activeSlot];
 const primary=targets[0],current=prints[primary],s=slots[primary],dimensions=current?fitDimensions(primary,current.widthCm,current.width,current.height):null;
 function jump(ref){ref.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})}
 function chooseSlot(id){setActiveSlot(id);setView(slots[id==='hood.both'?'hood.right':id].view);setError('');if(inputRef.current)inputRef.current.value=''}
 function choosePart(id){setPart(id);chooseSlot(slotIds(kind,id)[0])}
 function chooseKind(id){setKind(id);if((part==='hood'&&id!=='hoodies')||!slotIds(id).includes(primary)){setPart('front');chooseSlot('front.center')}}
 function placeAsset(asset){if(targets.some(id=>fitDimensions(id,22,asset.width,asset.height).maxWidthCm<.5)){setError('نسبت طول و عرض این تصویر برای این محل مناسب نیست.');return}setPrints(previous=>{const next={...previous};for(const id of targets){const d=fitDimensions(id,22,asset.width,asset.height);next[id]={...asset,assetId:asset.assetId||asset.id,widthCm:d.widthCm,heightCm:d.heightCm}}return next})}
 async function upload(event){
  const file=event.target.files?.[0];if(!file||pending)return;setError('');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('یک تصویر PNG، JPG یا WebP انتخاب کن.');return}
  if(file.size>10*1024*1024){setError('حجم فایل اصلی باید حداکثر ۱۰ مگابایت باشه.');return}
  setPending(true);
  try{const original=await readImageFile(file),preview=await imagePreview(original);const asset=await sendJson('/print-assets',{original,preview,fileName:file.name});if(live.current)placeAsset(asset)}catch(e){if(live.current)setError(e.message)}finally{if(live.current)setPending(false)}
 }
 function resize(width){setPrints(previous=>{const next={...previous};for(const id of targets)if(next[id]){const d=fitDimensions(id,width,next[id].width,next[id].height);next[id]={...next[id],widthCm:d.widthCm,heightCm:d.heightCm}}return next})}
 function remove(){setPrints(previous=>{const next={...previous};targets.forEach(id=>delete next[id]);return next});if(inputRef.current)inputRef.current.value=''}
 function save(){if(!count||pending)return;add({id:'custom',name:`${model.name} با طرح تو`,price:model.price,image:null},size,1,{schemaVersion:3,kind,colorId,color:color.hex,colorName:color.name,prints:activePrints,note,calibration})}
 return <>
  <section className="wrap custom-studio print-studio">
   <div ref={previewRef} className="design-preview photo-design-preview multi-design-preview"><div className="preview-topline"><span className="eyebrow">پیش‌نمایش روی عکس لباس</span><span className="preview-model">{model.name} · {color.name}</span></div><PhotoPrintViewer kind={kind} color={color.hex} size={size} prints={activePrints} activeSlot={primary} view={view} setView={setView}/><div className="preview-caption"><span>{parts[s.part]} · {s.name}</span><span>{fa(count)} محل چاپ · سایز <b dir="ltr">{size}</b></span></div><p>عکس‌ها بدون پس‌زمینه‌اند. رنگ و چیدمان تقریبی‌اند؛ اندازه‌های سانتی‌متری در خلاصهٔ طرح ثبت می‌شوند.</p><button className="viewer-return-settings" onClick={()=>jump(settingsRef)}>برگشت به تنظیمات چاپ <ArrowLeft size={13}/></button></div>
   <div className="studio-controls photo-studio-controls"><span className="eyebrow">این یکی، قصه‌ی خودته</span><h2>بیا یه چیز قشنگ بسازیم</h2>
    {legacy&&<p className="notice">طرح قبلی فقط فایل فشردهٔ مرورگر را دارد. برای ارسال فایل اصلی به چاپ، طرح‌ها را دوباره بارگذاری کن.</p>}
    <fieldset><legend><span>۰۱</span> مدل لباس رو انتخاب کن</legend><div className="garment-model-options">{Object.entries(models).map(([id,m])=><button key={id} aria-pressed={kind===id} className={kind===id?'selected':''} onClick={()=>chooseKind(id)}><img src={`/assets/${m.image}`} alt=""/><span><strong>{m.name}</strong><small>{id==='hoodies'?'کلاه‌دار، بدون بند':'یقه‌گرد و راحت'}</small></span><i>{kind===id&&<Check size={13}/>}</i></button>)}</div></fieldset>
    <fieldset><legend><span>۰۲</span> رنگ دلخواهت <small>{color.name}</small></legend><div className="swatches named-swatches">{colors.map(c=><button key={c.id} style={{background:c.hex}} aria-label={c.name} title={c.name} aria-pressed={colorId===c.id} className={colorId===c.id?'selected':''} onClick={()=>setColorId(c.id)}>{colorId===c.id&&<Check size={18}/>}<span>{c.name}</span></button>)}</div></fieldset>
    <fieldset className="studio-size-field"><legend><span>۰۳</span> سایزت رو انتخاب کن</legend><a className="studio-size-guide" href="#print-size-guide">راهنمای سایز <Ruler size={14}/></a><div className="studio-size-options">{sizes.map(([id])=><button key={id} className={size===id?'active':''} aria-pressed={size===id} onClick={()=>setSize(id)}>{id}{size===id&&<Check size={12}/>}</button>)}</div></fieldset>
    <fieldset ref={settingsRef} className="art-upload-field multi-art-field"><legend><span>۰۴</span> روی کدوم قسمت چاپ کنیم؟ <small>{fa(count)} محل چاپ</small></legend>
     <div className="print-zone-options">{Object.entries(parts).filter(([id])=>kind==='hoodies'||id!=='hood').map(([id,name])=><button key={id} className={part===id?'active':''} aria-pressed={part===id} onClick={()=>choosePart(id)}><span>{name}</span><b>{entries.some(([slot])=>slots[slot].part===id)?<Check size={13}/>:<Plus size={13}/>}</b></button>)}</div>
     <div className="placement-presets" aria-label="محل قرارگیری طرح">{slotIds(kind,part).map(id=><button key={id} aria-pressed={activeSlot===id} className={activeSlot===id?'active':''} onClick={()=>chooseSlot(id)}>{slots[id].name}{activePrints[id]&&<Check size={12}/>}</button>)}{part==='hood'&&<button aria-pressed={activeSlot==='hood.both'} className={activeSlot==='hood.both'?'active':''} onClick={()=>chooseSlot('hood.both')}>دو طرف کلاه <Files size={13}/></button>}</div>
     <div className="placement-measurements"><Ruler size={17}/><div><b>{activeSlot==='hood.both'?'سمت راست و چپ کلاه':s.name}</b><span>مرکز طرح: {fa(Math.abs(s.centerOffsetCm.x))} سانتی‌متر {s.centerOffsetCm.x<0?'به راست':s.centerOffsetCm.x>0?'به چپ':'از محور وسط'}، {fa(s.centerOffsetCm.y)} سانتی‌متر پایین‌تر از {s.anchor}</span><small>حداکثر چاپ: {fa(s.maxWidthCm)} × {fa(s.maxHeightCm)} سانتی‌متر · فاصله‌های نمونه، نیازمند تأیید تولید</small></div></div>
     <button className="view-current-part" onClick={()=>{setView(s.view);jump(previewRef)}}>دیدن این قسمت روی لباس <ArrowLeft size={14}/></button>
     <div className="active-print-heading"><strong>طرح {activeSlot==='hood.both'?'دو طرف کلاه':s.name}</strong><span>هر محل، فایل و اندازهٔ مستقل</span></div>
     <label className={`upload-box art-upload ${current?'has-art':''}`}><Upload/><strong>{pending?'دارم فایل اصلی رو روی سرور ذخیره می‌کنم…':current?'جایگزین کردن فایل این محل':'طرح این محل رو انتخاب کن'}</strong><span>PNG، JPG یا WebP · فایل اصلی تا ۱۰ مگابایت</span><input ref={inputRef} disabled={pending} aria-label={`بارگذاری طرح ${activeSlot==='hood.both'?'دو طرف کلاه':s.name}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label>
     {error&&<p role="alert" className="error">{error}</p>}
     {entries.length>0&&<div className="reuse-prints"><small>یا از فایل‌های همین لباس استفاده کن</small><div>{entries.filter(([id])=>!targets.includes(id)).map(([id,p])=><button key={id} disabled={pending} aria-label={`استفاده از طرح ${parts[slots[id].part]} ${slots[id].name}`} onClick={()=>placeAsset(p)}><img src={p.previewUrl} alt=""/><span>{parts[slots[id].part]} · {slots[id].name}</span></button>)}</div></div>}
     {current&&<><div className="art-file-info"><span><Check size={15}/><b dir="auto">{current.fileName}</b></span><button className="text-link" disabled={pending} onClick={remove}><Trash2 size={15}/>حذف طرح{targets.length===2?' دو طرف':''}</button></div><div className="cm-size-panel"><div><span>اندازهٔ چاپ، به سانتی‌متر</span><strong>{fa(dimensions.widthCm)} × {fa(dimensions.heightCm)}</strong></div><label>عرض چاپ (سانتی‌متر)<input aria-label="عرض چاپ به سانتی‌متر" type="number" min="0.5" max={dimensions.maxWidthCm} step="0.01" value={dimensions.widthCm} onChange={e=>resize(Number(e.target.value))}/></label><input aria-label="تنظیم عرض چاپ" type="range" min="0.5" max={dimensions.maxWidthCm} step="0.01" value={dimensions.widthCm} onChange={e=>resize(Number(e.target.value))}/><small>ارتفاع با نسبت فایل اصلی محاسبه می‌شود؛ تصویر کشیده یا بریده نمی‌شود.</small><span className="original-file-status"><Check size={13}/>فایل اصلی روی سرور ذخیره شد · <b dir="ltr">{current.width} × {current.height} px</b></span>{current.width/(dimensions.widthCm/2.54)<150&&<p className="art-resolution-note">وضوح این فایل در اندازهٔ انتخابی پایین است؛ برای نتیجهٔ بهتر فایل بزرگ‌تری بفرست.</p>}</div></>}
     <p className="multi-print-help">برای طرح بعدی محل دیگری را انتخاب کن؛ طرح‌های قبلی می‌مانند. راست و چپ از دید کسی است که لباس را پوشیده. «دو طرف کلاه» یک فایل را در هر دو سمت قرار می‌دهد؛ هر طرف را جدا هم می‌توانی ویرایش کنی.</p>
    </fieldset>
    <label className="print-note-label">توضیحات چاپ <span>همراه سفارش ارسال می‌شود</span><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength="1000" rows="3" placeholder="مثلاً پس‌زمینهٔ سفید چاپ نشه…"/></label>
    {count>0&&<div className="design-selection-list"><h3>انتخاب‌های تو، با همهٔ جزئیات</h3>{entries.map(([id,p])=><div key={id}><img src={p.previewUrl} alt=""/><span><b>{parts[slots[id].part]} · {slots[id].name}</b><small>{fa(p.widthCm)} × {fa(p.heightCm)} سانتی‌متر</small></span><button className="text-link" onClick={()=>{setPart(slots[id].part);chooseSlot(id);jump(settingsRef)}}>ویرایش</button></div>)}</div>}
    <div className="print-purchase"><div><span>قیمت پایهٔ نمونهٔ {model.name}</span><strong>{money(model.price)} <small>تومان</small></strong></div><button className="button" disabled={!count||pending} onClick={save}>{initialDesign?'ذخیرهٔ تغییرات':'افزودن طرح‌ها به سبد'} <ArrowLeft size={18}/></button></div>
    {!count&&<p className="upload-first-note">حداقل برای یک محل، طرح انتخاب کن.</p>}<p className="demo-note">فایل‌های اصلی همین حالا روی سرور ذخیره می‌شوند. در مرحلهٔ بعد، جزئیات کامل را بررسی و درخواست چاپ را ارسال کن. هزینهٔ چاپ و ارسال پس از بررسی تأیید می‌شود؛ پرداخت فعال نیست.</p>
   </div>
  </section>
  <section className="wrap print-guides" aria-label="راهنمای چاپ دلخواه"><div className="print-guides-heading"><span className="eyebrow">قبل از اینکه طرحت جون بگیره</span><h2>از انتخاب طرح تا چاپِ قشنگ</h2><p>فایل اصلی، اندازه و محل هر طرح کنار هم به چاپخانه می‌رسند.</p></div><div className="print-guide-grid">
   <article className="print-guide-card"><span className="guide-number">۰۱</span><Image/><h3>فایل اصلی، با کیفیت خودش</h3><p>PNG شفاف برای طرح بدون کادر مناسب‌تر است. فایل JPG پس‌زمینه‌اش را حفظ می‌کند. فایل اصلی تا ۱۰ مگابایت، بدون فشرده‌سازی مجدد روی سرور ذخیره می‌شود؛ پیش‌نمایش نسخهٔ سبک جداگانه دارد.</p><p>نام فایل، تعداد پیکسل، حجم، اثر انگشت فایل و وضوح چاپ نیز همراه سفارش ثبت می‌شوند.</p></article>
   <article className="print-guide-card"><span className="guide-number">۰۲</span><Ruler/><h3>جای مشخص، اندازهٔ مشخص</h3><p>برای هر محل، عرض را به سانتی‌متر انتخاب کن؛ ارتفاع با حفظ نسبت تصویر محاسبه می‌شود. پشت لباس فقط وسط است؛ آستین‌ها بالا، وسط و پایین دارند. هودی بدون بند، چاپ جیب و سه محل کلاه هم دارد.</p><p>{calibration.notice} روی درز و جیب، امکان اجرا پیش از تولید بررسی می‌شود.</p></article>
   <article className="print-guide-card size-guide-card" id="print-size-guide"><span className="guide-number">۰۳</span><Ruler/><h3>یه سایز راحت برای تو</h3><p>لباس راحت خودت را صاف بگذار و عرض سینه و قد را اندازه بگیر. این جدول نمونه است و هنوز اندازه‌گیری تولیدکننده نیست.</p><table><caption>ابعاد نمونه برحسب سانتی‌متر</caption><thead><tr><th>سایز</th><th>عرض سینه</th><th>قد لباس</th></tr></thead><tbody>{sizes.map(([id,w,h])=><tr key={id} className={size===id?'chosen-size':''}><td dir="ltr">{id}</td><td>{fa(w)}</td><td>{fa(h)}</td></tr>)}</tbody></table></article>
   <article className="print-guide-card"><span className="guide-number">۰۴</span><Heart/><h3>از انتخاب تا تأیید چاپ</h3><p>جزئیات کامل را در سبد و رسید می‌بینی. درخواست به سرور ارسال می‌شود و تا بررسی فایل، روش چاپ، رنگ پارچه و اندازه‌های واقعی، در انتظار تأیید می‌ماند. لباس چاپ‌شده را پشت‌ورو و با آب سرد بشور و مستقیم روی طرح اتو نزن.</p><Link to="/contact/" className="text-link">برای سؤال دربارهٔ چاپ <ArrowLeft size={15}/></Link></article>
  </div></section>
 </>;
}
