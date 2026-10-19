import {slots,productionPlacement} from './print-spec.js';

export const defaultPricing={version:1,mode:'fixed',sample:true,ratePerCm2:34,mainPrint:350000,smallPrint:150000,hoodPrint:150000};
export const roundMoney=value=>Math.ceil(value);
export function printCharge(placement,pricing=defaultPricing){
 const frame=placement.printFrameCm||{width:placement.widthCm,height:placement.heightCm};
 const areaHundredths=Math.round(frame.width*100)*Math.round(frame.height*100);
 const areaCm2=areaHundredths/10000;
 let method='area',amount=roundMoney(areaHundredths*pricing.ratePerCm2/10000);
 if(pricing.mode==='fixed'){
  if(['front.center','back.center'].includes(placement.slotId)){method='main';amount=pricing.mainPrint}
  else if(slots[placement.slotId].part==='hood'){method='hood';amount=pricing.hoodPrint}
  else if(Math.max(frame.width,frame.height)<=10){method='small';amount=pricing.smallPrint}
 }
 return {slotId:placement.slotId,label:`${placement.partName} · ${placement.positionName}`,widthCm:frame.width,heightCm:frame.height,artworkWidthCm:placement.widthCm,artworkHeightCm:placement.heightCm,areaCm2,method,ratePerCm2:method==='area'?pricing.ratePerCm2:null,amountToman:amount,currency:'IRT'};
}
export function designPrice(basePrice,placements,pricing=defaultPricing){
 const charges=placements.map(p=>printCharge(p,pricing));const printing=charges.reduce((n,p)=>n+p.amountToman,0);
 return {basePrice,printing,unitTotal:basePrice+printing,charges,pricing:{...pricing},currency:'IRT'};
}
export function cartDesignPrice(basePrice,custom,pricing=defaultPricing){
 const placements=custom.placements||Object.entries(custom.prints||{}).filter(([id,p])=>slots[id]&&p.assetId).map(([id,p])=>productionPlacement(id,p,{...p,id:p.assetId}));
 return designPrice(basePrice,placements,pricing);
}
