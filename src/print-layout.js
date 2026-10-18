export const printZones={
 front:{name:'جلوی لباس',angle:0,width:.98,height:1.02,centerY:.12},
 back:{name:'پشت لباس',angle:180,width:1.02,height:1.22,centerY:.02},
 rightSleeve:{name:'آستین راست',angle:90,width:.28,height:.83,centerY:0},
 leftSleeve:{name:'آستین چپ',angle:270,width:.28,height:.83,centerY:0},
 hood:{name:'روی کلاه',angle:180,width:.5,height:.46,centerY:1.27}
};
export const zoneIds=kind=>Object.keys(printZones).filter(id=>kind==='hoodies'||id!=='hood');
export function availablePrints(kind,prints={}){return Object.fromEntries(zoneIds(kind).filter(id=>prints[id]?.art).map(id=>[id,prints[id]]))}
export function migratePrints(custom={}){
 if(custom.prints)return custom.prints;
 return custom.art?{front:{art:custom.art,fileName:custom.fileName||'طرح جلو',width:1,height:1,scale:62,x:0,y:0,rotation:0}}:{};
}
export function printLayout(zoneId,print,kind='sweatshirts'){
 const zone={...printZones[zoneId]};
 if(zoneId==='front'&&kind==='hoodies'){zone.height=.69;zone.centerY=.33}
 const scale=Math.max(20,Math.min(90,Number(print.scale)||62))/100;
 const aspect=Math.max(.05,Math.min(20,(print.width||1)/(print.height||1)));
 let width=zone.width*scale,height=width/aspect;
 if(height>zone.height*scale){height=zone.height*scale;width=height*aspect}
 const rotation=(Number(print.rotation)||0)*Math.PI/180;
 // Rotate inside the printable area, including its corners, before positioning.
 const boundsW=Math.abs(width*Math.cos(rotation))+Math.abs(height*Math.sin(rotation));
 const boundsH=Math.abs(height*Math.cos(rotation))+Math.abs(width*Math.sin(rotation));
 const fit=Math.min(1,zone.width/boundsW,zone.height/boundsH);
 width*=fit;height*=fit;
 const extentW=boundsW*fit,extentH=boundsH*fit;
 const clamp=n=>Math.max(-100,Math.min(100,Number(n)||0))/100;
 return {width,height,rotation,x:clamp(print.x)*(zone.width-extentW)/2,y:zone.centerY+clamp(print.y)*(zone.height-extentH)/2,zone};
}
