import React,{createContext,useContext,useEffect,useState,useCallback} from 'react';
import {defaultPricing} from '../shared/pricing';
import {api,sendJson} from './print-api';
const Auth=createContext(),Catalog=createContext();
export const useAuth=()=>useContext(Auth);
export const useCatalog=()=>useContext(Catalog);
export const assetUrl=image=>image?.startsWith('/')?image:`/assets/${image}`;
export function CommerceProvider({children}){
 const [customer,setCustomer]=useState(null),[authLoading,setAuthLoading]=useState(true),[mode,setMode]=useState('unavailable'),[authError,setAuthError]=useState('');
 const [catalog,setCatalog]=useState(null),[error,setError]=useState('');
 const refresh=useCallback(async()=>{try{const result=await api('/catalog');setCatalog(result);setError('')}catch(e){setError(e.message)}},[]);
 const refreshAuth=useCallback(async()=>{try{const result=await api('/auth/session');setCustomer(result.customer);setMode(result.mode);setAuthError('')}catch(e){setAuthError(e.message)}finally{setAuthLoading(false)}},[]);
 useEffect(()=>{refresh();refreshAuth();const focus=()=>{refresh();refreshAuth()};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus)},[refresh,refreshAuth]);
 const logout=async()=>{await sendJson('/auth/logout',{});setCustomer(null)};
 return <Auth.Provider value={{customer,setCustomer,loading:authLoading,mode,error:authError,refresh:refreshAuth,logout}}><Catalog.Provider value={{products:(catalog?.products||[]).filter(p=>p.type==='ready'),allProducts:catalog?.products||[],pricing:catalog?.pricing||defaultPricing,shippingFee:catalog?.shippingFee,shippingPolicy:catalog?.shippingPolicy,payment:catalog?.payment,loading:!catalog&&!error,error,refresh}}>{children}</Catalog.Provider></Auth.Provider>;
}
