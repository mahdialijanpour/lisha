import React,{useRef} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {slots,views,sizes,fitDimensions,models} from '../shared/print-spec';

export function PhotoGarment({kind='sweatshirts',color='#faf7f0',size='M',prints={},view='front',activeSlot='',compact=false}){
 const side=['right','left'].includes(view),source=`/assets/${kind}-${side?'side':view}.png`;
 const sizeSpec=sizes.find(s=>s[0]===size)||sizes[1],pixelPerCm=56/sizeSpec[1];
 return <div className={`photo-garment ${compact?'compact-photo':''}`} aria-label={`${models[kind]?.name||'لباس'}، نمای ${views[view]}`}>
  <div className={`photo-fabric ${view==='left'?'mirror-base':''}`} style={{'--garment-mask':`url("${source}")`,'--garment-color':color}}><img src={source} alt={`${models[kind]?.name} خام بدون پس‌زمینه، نمای ${views[view]}`} width="900" height="900"/><span className="garment-color-layer" aria-hidden="true"/></div>
  {Object.entries(prints).filter(([id,p])=>slots[id]?.view===view&&(p.previewUrl||p.art)).map(([id,p])=>{const s=slots[id],d=fitDimensions(id,p.widthCm,p.width,p.height);return <img key={id} className={`photo-print ${activeSlot===id?'selected-print':''}`} src={p.previewUrl||p.art} alt={`طرح ${s.name}، ${d.widthCm} در ${d.heightCm} سانتی‌متر`} style={{left:`${s.photoCenter.x}%`,top:`${s.photoCenter.y}%`,width:`${d.widthCm*pixelPerCm}%`,height:`${d.heightCm*pixelPerCm}%`}}/>})}
 </div>;
}
export function PhotoPrintViewer({view,setView,...props}){
 const start=useRef(null),ids=Object.keys(views);const step=direction=>setView(ids[(ids.indexOf(view)+direction+4)%4]);
 return <div className="photo-viewer"><div className="photo-turn-stage" onPointerDown={e=>{if(e.pointerType==='mouse'&&e.button!==0)return;start.current=e.clientX;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerUp={e=>{if(start.current!==null&&Math.abs(e.clientX-start.current)>35)step(e.clientX>start.current?-1:1);start.current=null}} onPointerCancel={()=>{start.current=null}}>
  <PhotoGarment key={`${props.kind}-${view}`} {...props} view={view}/><span className="photo-view-badge">{views[view]}</span>
 </div><div className="photo-view-switcher" aria-label="نماهای لباس">{ids.map(id=><button key={id} aria-pressed={id===view} onClick={()=>setView(id)}>{views[id]}</button>)}</div><div className="photo-turn-hint"><button aria-label="نمای قبلی" onClick={()=>step(-1)}><ChevronRight size={17}/></button><span>۴ نمای عکاسی · برای عوض‌کردن نما بکش</span><button aria-label="نمای بعدی" onClick={()=>step(1)}><ChevronLeft size={17}/></button></div></div>;
}
