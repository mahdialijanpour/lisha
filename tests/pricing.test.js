import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPricing,designPrice} from '../shared/pricing.js';
import {productionPlacement,fitDimensions} from '../shared/print-spec.js';
const art={id:'test',width:1000,height:1000};
test('fixed sample pricing charges each print once and both hood sides separately',()=>{
 const placements=['front.center','back.center','front.upperRight','hood.right','hood.left'].map(id=>productionPlacement(id,{widthCm:10},art));
 const p=designPrice(4950000,placements,defaultPricing);assert.equal(p.printing,1150000);assert.equal(p.unitTotal,6100000);assert.equal(p.charges.length,5);
 const replaced=placements.map(p=>({...p,assetId:'replacement'}));assert.equal(designPrice(4950000,replaced,defaultPricing).unitTotal,6100000);
});
test('area pricing bills the 20×30 frame, preserves artwork ratio and rounds each charge to integer toman',()=>{
 const main=productionPlacement('front.center',{widthCm:20},{...art,width:1600,height:900});assert.deepEqual(main.printFrameCm,{width:20,height:30});assert.equal(main.widthCm,20);assert.equal(main.heightCm,11.25);
 const price=designPrice(4950000,[main],{...defaultPricing,mode:'area'});assert.equal(price.charges[0].areaCm2,600);assert.equal(price.printing,20400);assert.equal(price.unitTotal,4970400);
 const small=productionPlacement('front.upperLeft',{widthCm:.51},art);assert.equal(designPrice(0,[small],{...defaultPricing,mode:'area'}).printing,9);
 const d=fitDimensions('front.upperRight',50,1000,1000);assert.equal(d.widthCm,10);assert.equal(d.heightCm,10);
});
