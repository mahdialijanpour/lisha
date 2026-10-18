import React,{useEffect} from 'react';
import {Link,NavLink,useLocation} from 'react-router-dom';
import {ShoppingBag,Heart,UserRound,Shirt,Paintbrush,ArrowLeft,ArrowUpLeft,House,BookOpen,MessageCircle,HelpCircle,ChevronLeft,Flower2,Coffee} from 'lucide-react';
import {money,fa} from './data';
import {cartTotal} from './store';

export function SideMenu({close,favoriteCount}){
 return <nav className="menu-content" aria-label="بخش‌های فروشگاه">
  <div className="menu-welcome"><span>یه دور توی دنیای قشنگمون بزن ♡</span><NavLink to="/" end onClick={close}><House size={16}/>خانه</NavLink></div>
  <div className="menu-personal menu-personal-top"><NavLink to="/wishlist/" onClick={close}><Heart size={18}/><span>علاقه‌مندی‌ها</span><b>{fa(favoriteCount)}</b></NavLink><NavLink to="/my-account/" onClick={close}><UserRound size={18}/><span>پروفایل من</span><ChevronLeft size={15}/></NavLink></div>
  <div className="menu-group-label"><span>یه دلخوشی پیدا کن</span><span>۰۱</span></div>
  <NavLink className="menu-shop-link" to="/shop/" onClick={close}><span className="menu-icon"><ShoppingBag size={21}/></span><span><strong>همه‌ی گوگولی‌ها</strong><small>یک عالمه طرح برای دنیای تو</small></span><ArrowLeft size={20}/></NavLink>
  <div className="menu-categories">
   <NavLink to="/product-category/hoodies/" onClick={close}><img src="/assets/coffee-cat.webp" alt=""/><span>هودی‌ها<small>گرم و بغل‌کردنی</small></span><ChevronLeft size={15}/></NavLink>
   <NavLink to="/product-category/tote-bags/" onClick={close}><img src="/assets/tote.webp" alt=""/><span>توت‌بگ‌ها<small>همراهِ هر روزت</small></span><ChevronLeft size={15}/></NavLink>
   <NavLink to="/product-category/sweatshirts/" onClick={close}><img className="menu-sweatshirt" src="/assets/sweatshirts-front.png" alt=""/><span>دورس‌ها<small>نرم و راحت، با طرح تو</small></span><ChevronLeft size={15}/></NavLink>
   <NavLink to="/product-category/mugs/" onClick={close}><i className="menu-category-art" aria-hidden="true"><Coffee size={29}/></i><span>ماگ‌ها<small>برای یه جرعه حال خوب</small></span><ChevronLeft size={15}/></NavLink>
  </div>
  <NavLink className="menu-custom" to="/custom-print/" onClick={close}><Paintbrush size={24}/><span><strong>دورس و هودی با طرح خودت</strong><small>این یکی رو خودت طراحی کن!</small></span></NavLink>
  <div className="menu-group-label"><span>بیشتر با هم آشنا بشیم</span><span>۰۲</span></div>
  <div className="menu-explore">{[['/about/','قصه‌ی لیشا',Flower2],['/journal/','دفترچه‌ی لیشا',BookOpen],['/faq/','سؤال‌های پرتکرار',HelpCircle],['/contact/','ارتباط با ما',MessageCircle]].map(([url,title,Icon])=><NavLink to={url} key={url} onClick={close}><Icon size={17}/>{title}<ChevronLeft size={14}/></NavLink>)}</div>
  <div className="menu-bottom"><Link to="/reviews/" onClick={close}>قصه‌های شما</Link><Link to="/terms-and-condition/" onClick={close}>قوانین و مقررات</Link></div>
 </nav>;
}

export function StickyCart({cart,open,hidden}){
 const {pathname}=useLocation();
 const visible=cart.length>0&&!/^\/(cart|checkout)\/?$/.test(pathname);
 useEffect(()=>{document.body.classList.toggle('has-cart-dock',visible);return()=>document.body.classList.remove('has-cart-dock')},[visible]);
 if(!visible||hidden)return null;
 const count=cart.reduce((sum,item)=>sum+item.qty,0);
 return <aside className="cart-dock" aria-label="خلاصه‌ی سبد خرید">
  <button className="dock-summary" onClick={open} aria-label={`باز کردن سبد خرید با ${fa(count)} محصول`}>
   <span className="dock-bag"><ShoppingBag size={23}/><b>{fa(count)}</b></span>
   <span className="dock-copy"><strong>یه سبد حالِ خوب!</strong><small>{fa(count)} تا دلخوشی منتظرته</small></span>
   <span className="dock-thumbs" aria-hidden="true">{cart.slice(0,3).map(item=><span key={item.key}>{item.image?<img src={`/assets/${item.image}`} alt=""/>:<Shirt size={22}/>}</span>)}{cart.length>3&&<b>+{fa(cart.length-3)}</b>}</span>
  </button>
  <div className="dock-total"><small>جمع سبدت</small><strong>{money(cartTotal(cart))}<span> تومان</span></strong></div>
  <Link className="dock-action" to="/cart/">دیدن سبد<ArrowLeft size={19}/></Link>
 </aside>;
}
