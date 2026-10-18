import {garmentShell,surfaceMesh,printPoint} from './garment-geometry';
import {availablePrints,printLayout} from './print-layout';

const vertex=`attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat4 matrix;uniform mat4 rotation;varying vec3 n;varying vec3 p;varying vec2 texcoord;void main(){gl_Position=matrix*vec4(position,1.0);n=mat3(rotation)*normal;p=position;texcoord=uv;}`;
const fragment=`precision mediump float;uniform vec3 color;uniform bool hasTexture;uniform bool rib;uniform sampler2D artwork;varying vec3 n;varying vec3 p;varying vec2 texcoord;void main(){vec4 base=hasTexture?texture2D(artwork,texcoord):vec4(color,1.0);if(base.a<0.025)discard;vec3 norm=normalize(n);if(!gl_FrontFacing)norm=-norm;float light=0.65+0.31*max(0.0,dot(norm,normalize(vec3(-0.7,0.9,1.5))))+0.12*max(0.0,dot(norm,normalize(vec3(1.0,0.2,-0.8))));float knit=sin(p.x*560.0)*sin(p.y*680.0)*0.012;if(rib)knit+=sin(p.x*260.0)*0.025;vec3 result=base.rgb*(light+knit);gl_FragColor=vec4(result,base.a);}`;
const multiply=(a,b)=>{const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out};
const radians=x=>x*Math.PI/180;
const hexColor=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);

export function createGarmentViewer(canvas,{onAngle=()=>{},onError=()=>{},onInteract=()=>{}}={}){
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true,premultipliedAlpha:false});
 if(!gl)throw new Error('WebGL unavailable');
 const shaders=[];
 const compile=(type,code)=>{const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));shaders.push(shader);return shader};
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const attrs=Object.fromEntries(['position','normal','uv'].map(name=>[name,gl.getAttribLocation(program,name)]));
 const uniforms=Object.fromEntries(['matrix','rotation','color','hasTexture','artwork','rib'].map(name=>[name,gl.getUniformLocation(program,name)]));
 gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
 let shells=[],patches=[],kind='sweatshirts',color='#c7b0e1',yaw=0,target=0,pitch=-.05,spin=false,frame=0,last=0,disposed=false,drag=null,visible=true,lastReported=0,printing={};
 const textures=new Map();
 const uploadMesh=mesh=>{const buffers=[];for(const [name,values] of [['position',mesh.positions],['normal',mesh.normals],['uv',mesh.uvs]]){const buffer=gl.createBuffer();buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW)}const index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(mesh.indices),gl.STATIC_DRAW);return {buffers,index,count:mesh.indices.length}};
 const removeMeshes=items=>items.forEach(item=>{item.buffers.forEach(b=>gl.deleteBuffer(b));gl.deleteBuffer(item.index)});
 const request=()=>{if(!frame&&!disposed&&visible&&!document.hidden)frame=requestAnimationFrame(draw)};
 const imageTexture=src=>{
  if(textures.has(src))return textures.get(src);
  const record={texture:null};textures.set(src,record);const image=new window.Image();
  image.onload=()=>{if(disposed||textures.get(src)!==record)return;const texture=gl.createTexture();record.texture=texture;gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);request()};image.onerror=()=>onError('یکی از طرح‌ها در نمای سه‌بعدی باز نشد.');image.src=src;return record;
 };
 function rebuildPrints(){
  removeMeshes(patches);patches=[];
  for(const [zone,print] of Object.entries(availablePrints(kind,printing))){
   const layout=printLayout(zone,print,kind),cos=Math.cos(layout.rotation),sin=Math.sin(layout.rotation);
   const mesh=surfaceMesh((u,v)=>{const x=(u-.5)*layout.width,y=(v-.5)*layout.height;return printPoint(zone,layout.x+x*cos-y*sin,layout.y+x*sin+y*cos)},18,20);
   patches.push({...uploadMesh(mesh),record:imageTexture(print.art)});
  }
  // Release replaced/removed artwork textures rather than accumulating uploads.
  const live=new Set(Object.values(availablePrints(kind,printing)).map(p=>p.art));
  for(const [src,record] of textures)if(!live.has(src)){if(record.texture)gl.deleteTexture(record.texture);textures.delete(src)}
  request();
 }
 function draw(now=performance.now()){
  frame=0;if(disposed)return;
  const dt=Math.min(.05,(now-(last||now))/1000);last=now;
  if(spin&&!drag){yaw+=dt*.36;target=yaw}else if(!drag){yaw+=(target-yaw)*Math.min(1,dt*11)}
  const width=canvas.clientWidth||400,height=canvas.clientHeight||440,dpr=Math.min(window.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
  gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
  const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const ry=new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);
  const rx=new Float32Array([1,0,0,0,0,cp,sp,0,0,-sp,cp,0,0,0,0,1]);
  const rotation=multiply(rx,ry),halfY=1.68,halfX=halfY*width/height;
  const projection=new Float32Array([1/halfX,0,0,0,0,1/halfY,0,0,0,0,-.1,0,0,-.17,0,1]);
  gl.uniformMatrix4fv(uniforms.matrix,false,multiply(projection,rotation));gl.uniformMatrix4fv(uniforms.rotation,false,rotation);
  const rgb=hexColor(color);
  const render=(item,texture=false)=>{
   for(let i=0;i<3;i++){const name=['position','normal','uv'][i];gl.bindBuffer(gl.ARRAY_BUFFER,item.buffers[i]);gl.enableVertexAttribArray(attrs[name]);gl.vertexAttribPointer(attrs[name],name==='uv'?2:3,gl.FLOAT,false,0,0)}
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,item.index);gl.uniform1i(uniforms.hasTexture,texture?1:0);gl.uniform1i(uniforms.rib,item.rib?1:0);gl.uniform3fv(uniforms.color,rgb.map(v=>v*(item.shade||1)));
   if(texture){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,item.record.texture);gl.uniform1i(uniforms.artwork,0)}
   gl.drawElements(gl.TRIANGLES,item.count,gl.UNSIGNED_SHORT,0);
  };
  shells.forEach(item=>render(item));patches.forEach(item=>{if(item.record.texture)render(item,true)});
  if(now-lastReported>100){onAngle(((yaw*180/Math.PI)%360+360)%360);lastReported=now}
  if((spin||Math.abs(target-yaw)>.0001)&&visible&&!document.hidden)request();
 }
 const down=e=>{if(e.button!==0&&e.pointerType==='mouse')return;drag={x:e.clientX,y:e.clientY,yaw,pitch};spin=false;onInteract();canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing'};
 const move=e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.012;target=yaw;pitch=Math.max(-.4,Math.min(.3,drag.pitch+(e.clientY-drag.y)*.004));request()};
 const up=()=>{drag=null;canvas.style.cursor='grab';request()};
 const key=e=>{const step=radians(15);if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();spin=false;onInteract();if(e.key==='ArrowLeft')target-=step;if(e.key==='ArrowRight')target+=step;if(e.key==='ArrowUp')pitch=Math.max(-.4,pitch-.08);if(e.key==='ArrowDown')pitch=Math.min(.3,pitch+.08);if(e.key==='Home')target=0;if(e.key==='End')target=Math.PI;request()}};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('keydown',key);
 const lost=e=>{e.preventDefault();onError('نمای سه‌بعدی متوقف شد؛ صفحه را دوباره باز کن.')};canvas.addEventListener('webglcontextlost',lost);
 const resize=new ResizeObserver(request);resize.observe(canvas);
 const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){last=0;request()}});intersection.observe(canvas);
 const visibility=()=>{last=0;request()};document.addEventListener('visibilitychange',visibility);
 return {
  setModel(value){kind=value;removeMeshes(shells);shells=garmentShell(kind).map(s=>({...uploadMesh(s.mesh),shade:s.shade,rib:s.rib}));rebuildPrints()},
  setColor(value){color=value;request()},setPrints(value){printing=value;rebuildPrints()},
  setAngle(value){spin=false;const wanted=radians(value);target=yaw+Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw));request()},
  setSpin(value){spin=value;last=0;request()},
  capture(){draw();return canvas.toDataURL('image/webp',.82)},
  dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);removeMeshes(shells);removeMeshes(patches);textures.forEach(r=>{if(r.texture)gl.deleteTexture(r.texture)});shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext()}
 };
}
