// One catalog is used by the editor and the API. All production distances are cm.
export const specVersion = 'lisha-print-3.1';
export const models = {
 sweatshirts:{name:'دورس',sku:'LS-CREW-01',price:4950000,image:'sweatshirts-front.png'},
 hoodies:{name:'هودی',sku:'LS-HOOD-NOCORD-01',price:4950000,image:'hoodies-front.png',drawstrings:false}
};
export const colors = [
 {id:'lilac',hex:'#c7b0e1',name:'یاسی'},{id:'cream',hex:'#faf7f0',name:'شیری'},
 {id:'black',hex:'#3b3942',name:'مشکی'},{id:'sage',hex:'#d5dfce',name:'سبز مریم‌گلی'},
 {id:'navy',hex:'#202d49',name:'سورمه‌ای'},{id:'brown',hex:'#6b4538',name:'قهوه‌ای'}
];
export const sizes = [['S',52,66],['M',56,70],['L',60,74],['XL',64,78],['2XL',68,80]];
export const parts = {front:'جلوی لباس',back:'پشت لباس',rightSleeve:'آستین راست',leftSleeve:'آستین چپ',hood:'کلاه هودی'};
export const views = {front:'روبه‌رو',right:'سمت راست',back:'پشت',left:'سمت چپ'};
const slot = (part,name,view,anchor,dx,dy,maxW,maxH,px,py,extra={}) => ({part,name,view,anchor,centerOffsetCm:{x:dx,y:dy},maxWidthCm:maxW,maxHeightCm:maxH,photoCenter:{x:px,y:py},...extra});
// Distances are draft defaults, to be calibrated against the supplier's actual blanks.
// +x is the wearer's left; +y is towards the hem. Origin is defined by each anchor.
export const slots = {
 'front.center':slot('front','وسط سینه','front','وسط درز یقه جلو',0,23,20,30,50,46,{fixedFrame:true}),
 'front.upperRight':slot('front','بالا راست','front','وسط درز یقه جلو',-12,12,10,10,37,35),
 'front.upperLeft':slot('front','بالا چپ','front','وسط درز یقه جلو',12,12,10,10,63,35),
 'front.pocket':slot('front','روی جیب','front','وسط درز یقه جلو',0,44,20,12,50,73,{hoodieOnly:true}),
 'front.pocketRight':slot('front','سمت راست جیب','front','وسط درز یقه جلو',-12,44,7,10,35,73,{hoodieOnly:true}),
 'front.pocketLeft':slot('front','سمت چپ جیب','front','وسط درز یقه جلو',12,44,7,10,65,73,{hoodieOnly:true}),
 'back.center':slot('back','وسط پشت','back','وسط درز یقه پشت',0,30,20,30,50,57,{fixedFrame:true}),
 'rightSleeve.upper':slot('rightSleeve','بالای آستین','right','وسط درز سرشانه راست',0,12,10,12,49,39),
 'rightSleeve.middle':slot('rightSleeve','وسط آستین','right','وسط درز سرشانه راست',0,29,10,16,49,58),
 'rightSleeve.lower':slot('rightSleeve','پایین آستین','right','وسط درز سرشانه راست',0,44,8,10,49,78),
 'leftSleeve.upper':slot('leftSleeve','بالای آستین','left','وسط درز سرشانه چپ',0,12,10,12,51,39),
 'leftSleeve.middle':slot('leftSleeve','وسط آستین','left','وسط درز سرشانه چپ',0,29,10,16,51,58),
 'leftSleeve.lower':slot('leftSleeve','پایین آستین','left','وسط درز سرشانه چپ',0,44,8,10,51,78),
 'hood.right':slot('hood','سمت راست کلاه','right','وسط تاج کلاه، سمت راست',0,12,10,10,48,14,{hoodieOnly:true}),
 'hood.left':slot('hood','سمت چپ کلاه','left','وسط تاج کلاه، سمت چپ',0,12,10,10,52,14,{hoodieOnly:true}),
 'hood.center':slot('hood','وسط کلاه','back','وسط تاج کلاه، پشت',0,12,10,10,50,18,{hoodieOnly:true})
};
export const slotIds = (kind,part) => Object.hasOwn(models,kind)?Object.keys(slots).filter(id=>(!slots[id].hoodieOnly||kind==='hoodies')&&(!part||slots[id].part===part)):[];
export const printEntries = custom => Object.entries(custom?.prints||{}).filter(([id,p])=>slots[id]&&slotIds(custom.kind).includes(id)&&p.assetId);
export function fitDimensions(slotId,widthCm,pixelWidth,pixelHeight){
 const s=slots[slotId], ratio=pixelHeight/pixelWidth;
 const maxWidth=Math.floor(Math.min(s.maxWidthCm,s.maxHeightCm/ratio)*100)/100;
 const width=s.fixedFrame?maxWidth:Math.max(Math.min(.5,maxWidth),Math.min(maxWidth,Number(widthCm)||Math.min(16,maxWidth)));
 return {widthCm:Math.round(width*100)/100,heightCm:Math.round(width*ratio*100)/100,maxWidthCm:Math.floor(maxWidth*100)/100};
}
export function productionPlacement(slotId,print,asset){
 const s=slots[slotId];const dimensions=fitDimensions(slotId,print.widthCm,asset.width,asset.height);
 return {slotId,part:s.part,partName:parts[s.part],positionName:s.name,view:s.view,unit:'cm',widthCm:dimensions.widthCm,heightCm:dimensions.heightCm,...(s.fixedFrame?{printFrameCm:{width:s.maxWidthCm,height:s.maxHeightCm},fit:'contain'}:{}),rotationDegrees:0,anchor:s.anchor,centerOffsetCm:{...s.centerOffsetCm},coordinateConvention:'wearer-left +x; towards-hem +y; offsets locate artwork center',keepAspectRatio:true,crop:'none',background:'preserve-original',assetId:asset.id,fileName:asset.fileName,pixelWidth:asset.width,pixelHeight:asset.height,sourcePixelWidth:asset.sourcePixelWidth||asset.width,sourcePixelHeight:asset.sourcePixelHeight||asset.height,exifOrientation:asset.exifOrientation||1,autoOrientOriginal:true,effectiveDpi:Math.round(asset.width/(dimensions.widthCm/2.54)),sha256:asset.sha256,bytes:asset.bytes,mime:asset.mime,originalUrl:asset.originalUrl,previewUrl:asset.previewUrl};
}
export const calibration = {version:'reference-1',status:'requires_supplier_confirmation',unit:'cm',notice:'اندازه‌های لباس و فاصله‌های محل چاپ نمونه‌اند؛ پیش از تولید با لباس واقعی تأیید می‌شوند.'};
