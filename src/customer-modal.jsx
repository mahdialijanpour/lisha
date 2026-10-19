import React,{useEffect,useRef,useState} from 'react';
import {Heart,ShoppingBag,MessageCircle,X,LogOut,UserRound} from 'lucide-react';
import {useAuth} from './commerce-context';
import {useCustomerFeatures} from './customer-context';
import {LoginCard} from './commerce-ui';
import {lockPageScroll} from './scroll-lock';
export function CustomerLoginModal(){
 const {prompt,cancelLogin}=useCustomerFeatures(),auth=useAuth(),dialog=useRef(),[switchError,setSwitchError]=useState(''),[switching,setSwitching]=useState(false);
 useEffect(()=>{if(!prompt)return;const previous=document.activeElement,unlock=lockPageScroll();dialog.current.showModal();return()=>{dialog.current?.close();unlock();if(previous?.isConnected)previous.focus({preventScroll:true})}},[prompt]);
 if(!prompt)return null;
 const [Icon,title,copy]=({favorite:[Heart,'دل‌برده‌هات رو گم نکن','وارد حسابت شو تا این دلخوشی برای خودت ذخیره بشه.'],cart:[ShoppingBag,'یه سلام، قبل از خرید','با ورود به حسابت، این انتخاب به سبدت اضافه می‌شه.'],review:[MessageCircle,'قصهٔ تو هم شنیدنیه','برای ثبت تجربه و نظرت، وارد شو یا حسابت رو بساز.'],account:[UserRound,'یه گوشه مخصوصِ خودت','برای دیدن این بخش وارد حساب مشتری شو.']})[prompt.reason]||[UserRound,'خوش اومدی','برای ادامه وارد شو.'];
 return <dialog ref={dialog} className="customer-login-modal" aria-labelledby="customer-login-title" onCancel={e=>{e.preventDefault();cancelLogin()}} onClick={e=>{if(e.target===e.currentTarget)cancelLogin()}}><div className="customer-modal-heading"><span><Icon size={23}/></span><button className="icon-button" aria-label="بستن ورود مشتری" onClick={cancelLogin}><X size={19}/></button><h2 id="customer-login-title">{title}</h2><p>{copy}</p></div>{auth.customer?.role==='admin'?<div className="customer-role-switch"><p>الان با حساب مدیریت وارد شده‌ای. این بخش مخصوص حساب مشتری است.</p><button className="button" disabled={switching} onClick={async()=>{setSwitching(true);setSwitchError('');try{await auth.logout()}catch(e){setSwitchError(e.message)}finally{setSwitching(false)}}}>خروج از مدیریت و ورود مشتری <LogOut size={16}/></button>{switchError&&<p className="error" role="alert">{switchError}</p>}</div>:<LoginCard/>}</dialog>;
}
