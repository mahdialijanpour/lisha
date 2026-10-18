// Parametric cotton shell. Coordinates are shared by the fabric and print
// patches so decals follow the torso, sleeves and hood when the model rotates.
const TAU=Math.PI*2;
const interpolate=(knots,t)=>{for(let i=1;i<knots.length;i++){if(t<=knots[i][0]){const a=knots[i-1],b=knots[i],before=knots[Math.max(0,i-2)],after=knots[Math.min(knots.length-1,i+1)],span=b[0]-a[0],f=Math.max(0,(t-a[0])/span),m0=(b[1]-before[1])/(b[0]-before[0]),m1=(after[1]-a[1])/(after[0]-a[0]);return (2*f**3-3*f*f+1)*a[1]+(f**3-2*f*f+f)*span*m0+(-2*f**3+3*f*f)*b[1]+(f**3-f*f)*span*m1}}return knots.at(-1)[1]};
export const torsoWidth=y=>interpolate([[-.94,.61],[-.8,.66],[-.25,.71],[.48,.74],[.68,.72],[.82,.58],[.96,.29]],y);
export const torsoDepth=y=>interpolate([[-.94,.24],[-.8,.28],[-.2,.32],[.5,.3],[.7,.26],[.96,.17]],y);
export function torsoPoint(u,v){const y=-.94+v*1.9,angle=u*TAU;const wrinkle=.005*Math.sin(y*28+angle*5)*Math.sin(angle*3);return [torsoWidth(y)*Math.sin(angle),y,(torsoDepth(y)+wrinkle)*Math.cos(angle)]}
export function sleevePoint(side,t,angle,offset=0){
 const sign=side==='leftSleeve'?1:-1;
 const cx=sign*(.53+.61*t),cy=.67-1.49*t;
 const radius=interpolate([[0,.09],[.12,.253],[.3,.25],[.55,.209],[.88,.158],[1,.14]],t)+offset;
 return [cx+radius*.926*Math.cos(angle),cy+radius*sign*.379*Math.cos(angle),radius*.94*Math.sin(angle)];
}
export function hoodPoint(u,v,offset=0){
 const angle=.62+u*(TAU-1.24),y=.85+v*.88;
 const profile=Math.sqrt(Math.max(.0001,1-((v-.39)/.61)**2));
 const rx=.4*profile+offset;
 const rz=.34*profile+offset;
 return [rx*Math.sin(angle),y,-.015+rz*Math.cos(angle)];
}
export function surfaceMesh(point,cols=48,rows=32){
 const positions=[],uvs=[],normals=[],indices=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){positions.push(...point(x/cols,y/rows));uvs.push(x/cols,y/rows);normals.push(0,0,0)}
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b)}
 for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];const n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];for(const k of [a,b,c])for(let j=0;j<3;j++)normals[k+j]+=n[j]}
 for(let i=0;i<normals.length;i+=3){const length=Math.hypot(...normals.slice(i,i+3))||1;for(let j=0;j<3;j++)normals[i+j]/=length}
 return {positions,uvs,normals,indices};
}
export function printPoint(zone,x,y){
 if(zone==='front'||zone==='back'){const yy=Math.max(-.91,Math.min(.89,y)),radius=torsoWidth(yy),depth=torsoDepth(yy);return [zone==='back'?-x:x,yy,(zone==='front'?1:-1)*(depth*Math.sqrt(Math.max(.02,1-(x/radius)**2))+.009)]}
 if(zone==='leftSleeve'||zone==='rightSleeve'){const centerAngle=zone==='leftSleeve'?0:Math.PI;return sleevePoint(zone,.5-y/1.49,centerAngle-x/.22,.009)}
 const v=Math.max(.06,Math.min(.93,(y-.85)/.88));
 // The printable hood panel is on the outside/back of the hood.
 return hoodPoint((Math.PI+x/.37-.62)/(TAU-1.24),v,.009);
}
export function garmentShell(kind){
 const surfaces=[{mesh:surfaceMesh(torsoPoint),shade:1}];
 for(const side of ['leftSleeve','rightSleeve']){
  surfaces.push({mesh:surfaceMesh((u,v)=>sleevePoint(side,v,u*TAU),40,28),shade:1});
  surfaces.push({mesh:surfaceMesh((u,v)=>sleevePoint(side,.91+v*.095,u*TAU,.006),40,8),shade:.91,rib:true});
 }
 surfaces.push({mesh:surfaceMesh((u,v)=>{const p=torsoPoint(u,v*.07);p[0]*=1.014;p[2]*=1.014;return p},48,8),shade:.92,rib:true});
 const collar=(u,v)=>{const a=u*TAU,b=v*TAU,r=.031;return [(.295+r*Math.cos(b))*Math.sin(a),.96+r*Math.sin(b),(.176+r*Math.cos(b))*Math.cos(a)]};
 surfaces.push({mesh:surfaceMesh(collar,48,10),shade:.91,rib:true});
 if(kind==='hoodies'){
  surfaces.push({mesh:surfaceMesh(hoodPoint,48,30),shade:.98});
  for(const u of [0,1])surfaces.push({mesh:surfaceMesh((a,v)=>{const p=hoodPoint(u,v),r=.013,t=a*TAU;return [p[0]+r*Math.cos(t),p[1],p[2]+r*Math.sin(t)]},12,34),shade:.90});
  // A shaped pocket panel, following the front of the torso.
  surfaces.push({mesh:surfaceMesh((u,v)=>{const y=-.73+v*.46,w=.38-.09*v;const p=printPoint('front',(u*2-1)*w,y);p[2]+=.008;return p},30,18),shade:.96});
 }
 return surfaces;
}
