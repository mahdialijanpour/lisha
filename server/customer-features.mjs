import {randomUUID} from 'node:crypto';
import {problem,integer} from './commerce-store.mjs';

export function createCustomerFeatures({store,auth}){
 store.db.exec(`CREATE TABLE IF NOT EXISTS customer_favorites(customer_id TEXT NOT NULL REFERENCES customers(id),product_id TEXT NOT NULL REFERENCES products(id),created_at INTEGER NOT NULL,PRIMARY KEY(customer_id,product_id));
 CREATE TABLE IF NOT EXISTS product_reviews(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),product_id TEXT NOT NULL REFERENCES products(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(customer_id,product_id));
 CREATE INDEX IF NOT EXISTS reviews_product ON product_reviews(product_id,created_at);`);
 const customerOnly=user=>{auth.require(user);if(user.role!=='customer')problem('این بخش مخصوص حساب مشتری است.',403)};
 const favoriteIds=user=>store.db.prepare('SELECT product_id FROM customer_favorites WHERE customer_id=? ORDER BY created_at DESC').all(user.id).map(r=>r.product_id);
 function purchased(customerId){
  const result=new Set();
  for(const row of store.db.prepare('SELECT payload FROM orders WHERE customer_id=?').all(customerId)){
   const o=JSON.parse(row.payload);
   if(o.paymentStatus==='paid'&&!o.refundRequired&&['paid','processing','shipped','completed'].includes(o.status))for(const item of o.items)result.add(item.productId);
  }
  return result;
 }
 function present(rows,user,{own=false,verifiedOnly=false}={}){
  const purchases=new Map();
  return rows.flatMap(r=>{
   const p=store.product(r.product_id,{admin:own});if(!p)return [];
   if(!purchases.has(r.customer_id))purchases.set(r.customer_id,purchased(r.customer_id));
   const verifiedPurchase=purchases.get(r.customer_id).has(r.product_id);if(verifiedOnly&&!verifiedPurchase)return [];
   const name=store.db.prepare('SELECT name FROM customers WHERE id=?').get(r.customer_id)?.name?.trim().split(/\s+/)[0]||'دوست لیشا';
   return [{id:r.id,rating:r.rating,text:r.body,author:name,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString(),verifiedPurchase,isOwn:user?.id===r.customer_id,product:{id:p.id,name:p.name,image:p.image}}];
  });
 }
 return async(req,ctx)=>{
  const {url,user,body,send}=ctx,p=url.pathname,post=req.method==='POST',get=req.method==='GET';
  if(p==='/api/favorites'&&(get||post)){
   customerOnly(user);
   if(post){const input=await body();if(typeof input.saved!=='boolean'||typeof input.productId!=='string')problem('اطلاعات علاقه‌مندی معتبر نیست.');const product=store.product(input.productId);if(input.saved&&(!product||product.type!=='ready'))problem('این محصول برای ذخیره در دسترس نیست.',404);
    if(input.saved)store.db.prepare('INSERT INTO customer_favorites VALUES(?,?,?) ON CONFLICT(customer_id,product_id) DO NOTHING').run(user.id,input.productId,Date.now());
    else store.db.prepare('DELETE FROM customer_favorites WHERE customer_id=? AND product_id=?').run(user.id,input.productId);
   }
   send({productIds:favoriteIds(user)});return true;
  }
  if(p==='/api/customer/reviews'&&get){customerOnly(user);send({reviews:present(store.db.prepare('SELECT * FROM product_reviews WHERE customer_id=? ORDER BY updated_at DESC').all(user.id),user,{own:true})});return true}
  if(p==='/api/reviews'&&get){const reviews=present(store.db.prepare('SELECT * FROM product_reviews ORDER BY created_at DESC').all(),user,{verifiedOnly:true});send({reviews:reviews.slice(0,12),total:reviews.length});return true}
  const match=/^\/api\/products\/([a-z0-9-]+)\/reviews$/.exec(p);
  if(match&&(get||post)){
   const product=store.product(match[1]);if(!product||product.type!=='ready')problem('محصول پیدا نشد.',404);
   if(post){customerOnly(user);const input=await body(),text=typeof input.text==='string'?input.text.trim():'';if(!integer(input.rating,1,5)||text.length<5||text.length>1500)problem('امتیاز ۱ تا ۵ و یک نظر بین ۵ تا ۱۵۰۰ نویسه بنویس.');
    store.db.prepare('INSERT INTO product_reviews VALUES(?,?,?,?,?,?,?) ON CONFLICT(customer_id,product_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,updated_at=excluded.updated_at').run(randomUUID(),user.id,product.id,input.rating,text,Date.now(),Date.now());
    store.audit(user.id,'review.save',product.id,{rating:input.rating});
   }
   const reviews=present(store.db.prepare('SELECT * FROM product_reviews WHERE product_id=? ORDER BY created_at DESC').all(product.id),user);
   send({reviews:reviews.slice(0,100),ownReview:reviews.find(r=>r.isOwn)||null,total:reviews.length,average:reviews.length?Math.round(reviews.reduce((n,r)=>n+r.rating,0)/reviews.length*10)/10:0});return true;
  }
  return false;
 };
}
