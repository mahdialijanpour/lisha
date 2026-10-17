export function readSaved(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
export function addItem(cart,item){const found=cart.find(x=>x.key===item.key);return found?cart.map(x=>x.key===item.key?{...x,qty:Math.min(10,x.qty+item.qty)}:x):[...cart,item];}
export function setQuantity(cart,key,qty){return qty<=0?cart.filter(x=>x.key!==key):cart.map(x=>x.key===key?{...x,qty:Math.min(10,qty)}:x);}
export function cartTotal(cart){return cart.reduce((sum,x)=>sum+x.price*x.qty,0);}
