import React,{useEffect,useRef,useState} from 'react';
import {Link,NavLink} from 'react-router-dom';
import {Menu,Search,ShoppingBag,UserRound} from 'lucide-react';
import {fa} from './data';
import './header.css';

export function SiteHeader({logo,count,onOpen}){
 const [merged,setMerged]=useState(false);
 const brandRef=useRef(null);
 const menuRef=useRef(null);
 useEffect(()=>{
  let frame=0;
  const update=()=>{
   frame=0;
   // A little hysteresis keeps the two states stable near the join point.
   setMerged(previous=>previous?window.scrollY>24:window.scrollY>64);
  };
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update)};
  update();
  window.addEventListener('scroll',onScroll,{passive:true});
  return()=>{window.removeEventListener('scroll',onScroll);cancelAnimationFrame(frame)};
 },[]);
 useEffect(()=>{
  if(merged&&brandRef.current?.contains(document.activeElement))menuRef.current?.focus({preventScroll:true});
 },[merged]);
 return <header className={`header liquid-header${merged?' is-merged':''}`}>
  <div className="header-liquid-surface" aria-hidden="true"><span/><span/></div>
  <nav className="nav-group header-primary" aria-label="منوی اصلی">
   <button ref={menuRef} aria-label="منو" onClick={()=>onOpen('menu')}><Menu/><span>منو</span></button>
   <NavLink to="/" end>خانه</NavLink><NavLink to="/shop/">فروشگاه</NavLink>
   <NavLink className="custom-nav" to="/custom-print/">چاپ دلخواه </NavLink>
  </nav>
  <div ref={brandRef} className="header-brand" inert={merged?true:undefined} aria-hidden={merged?true:undefined}>{logo}</div>
  <div className="header-mini-brand" inert={!merged?true:undefined} aria-hidden={!merged?true:undefined}>{logo}</div>
  <nav className="nav-group nav-tools" aria-label="ابزارهای فروشگاه">
   <button onClick={()=>onOpen('search')} aria-label="جستجو"><Search/><span>جستجو</span></button>
   <Link to="/my-account/" aria-label="پروفایل"><UserRound/><span>پروفایل</span></Link>
   <button onClick={()=>onOpen('cart')} aria-label="سبد خرید"><ShoppingBag/><span>سبد</span><b className="cart-count">{fa(count)}</b></button>
  </nav>
 </header>;
}
