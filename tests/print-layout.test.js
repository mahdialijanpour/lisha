import test from 'node:test';
import assert from 'node:assert/strict';
import {availablePrints,migratePrints,printLayout,printZones} from '../src/print-layout.js';
import {garmentShell,printPoint} from '../src/garment-geometry.js';

test('changing garment excludes hood from saved sweatshirt without losing other designs',()=>{
 const prints={front:{art:'front',x:35},back:{art:'back',rotation:25},hood:{art:'hood'}};
 assert.deepEqual(Object.keys(availablePrints('sweatshirts',prints)),['front','back']);
 assert.equal(availablePrints('hoodies',prints).hood.art,'hood');
 assert.equal(prints.front.x,35);assert.equal(prints.back.rotation,25);
 const legacy=migratePrints({art:'old-upload',fileName:'original.png'});
 assert.equal(legacy.front.art,'old-upload');assert.equal(legacy.front.fileName,'original.png');
});

test('rotated and moved designs stay within each printable area for portrait and landscape artwork',()=>{
 for(const kind of ['hoodies','sweatshirts'])for(const zone of Object.keys(printZones))for(const aspect of [.08,.5,1,3,15])for(const rotation of [-180,-125,-45,0,37,90,170])for(const x of [-100,100]){
  const p=printLayout(zone,{width:aspect*1000,height:1000,rotation,scale:90,x,y:-x},kind);
  const halfW=(Math.abs(p.width*Math.cos(p.rotation))+Math.abs(p.height*Math.sin(p.rotation)))/2;
  const halfH=(Math.abs(p.height*Math.cos(p.rotation))+Math.abs(p.width*Math.sin(p.rotation)))/2;
  assert.ok(Math.abs(p.x)+halfW<=p.zone.width/2+1e-9);
  assert.ok(Math.abs(p.y-p.zone.centerY)+halfH<=p.zone.height/2+1e-9);
 }
});

test('garment meshes remain finite and print sides preserve readable orientation',()=>{
 for(const kind of ['hoodies','sweatshirts'])for(const {mesh} of garmentShell(kind)){
  assert.ok(mesh.positions.every(Number.isFinite));assert.ok(mesh.normals.every(Number.isFinite));
  assert.ok(mesh.indices.every(i=>i>=0&&i<mesh.positions.length/3));
 }
 // Back artwork must reverse world X so its text is not mirrored from behind.
 assert.ok(printPoint('front',.1,0)[0]>printPoint('front',-.1,0)[0]);
 assert.ok(printPoint('back',.1,0)[0]<printPoint('back',-.1,0)[0]);
 assert.ok(printPoint('leftSleeve',0,0)[0]>0);
 assert.ok(printPoint('rightSleeve',0,0)[0]<0);
});
