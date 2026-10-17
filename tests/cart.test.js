import test from 'node:test';
import assert from 'node:assert/strict';
import {addItem,setQuantity,cartTotal} from '../src/store.js';
test('different sizes remain separate, same size combines and totals stay correct',()=>{
 let cart=addItem([],{key:'cat-M',price:890000,qty:1});
 cart=addItem(cart,{key:'cat-L',price:890000,qty:2});
 cart=addItem(cart,{key:'cat-M',price:890000,qty:2});
 assert.equal(cart.length,2); assert.equal(cart[0].qty,3); assert.equal(cartTotal(cart),4450000);
});
test('quantity is capped at ten and removing an item changes the total',()=>{
 let cart=addItem([],{key:'tote',qty:9,price:390000});
 cart=addItem(cart,{key:'tote',qty:5,price:390000});
 assert.equal(cart[0].qty,10);assert.equal(cartTotal(cart),3900000);
 cart=setQuantity(cart,'tote',0);assert.equal(cart.length,0);assert.equal(cartTotal(cart),0);
});
