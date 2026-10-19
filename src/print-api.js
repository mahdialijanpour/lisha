import {fitDimensions,slots} from '../shared/print-spec';
export async function api(path,options={}){
 const response=await fetch(`/api${path}`,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 const result=await response.json().catch(()=>({error:'ارتباط با فروشگاه برقرار نشد؛ دوباره تلاش کن.'}));
 if(!response.ok||result.error)throw new Error(result.error||'ارتباط با سرور انجام نشد.');return result;
}
export const sendJson=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
export function readImageFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('فایل خوانده نشد.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file)})}
export function imagePreview(source){return new Promise((resolve,reject)=>{const image=new Image();image.onerror=()=>reject(new Error('این تصویر باز نشد.'));image.onload=()=>{try{const canvas=document.createElement('canvas'),ratio=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/webp',.85))}catch{reject(new Error('تصویر برای پیش‌نمایش آماده نشد.'))}};image.src=source})}
export function orderItems(cart){return cart.map(item=>({productId:item.id,variantId:item.variantId,colorId:item.colorId,qty:item.qty,size:item.size,...(item.custom?{custom:{schemaVersion:item.custom.schemaVersion,kind:item.custom.kind,colorId:item.custom.colorId,note:item.custom.note,placements:Object.entries(item.custom.prints||{}).map(([slotId,p])=>({slotId,assetId:p.assetId,widthCm:slots[slotId]&&p.width&&p.height?fitDimensions(slotId,p.widthCm,p.width,p.height).widthCm:p.widthCm}))}}:{})}))}
