import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {useAuth} from './commerce-context';
import {api,sendJson} from './print-api';
const CustomerFeatures=createContext();
export const useCustomerFeatures=()=>useContext(CustomerFeatures);
export function CustomerFeaturesProvider({children}){
 const {customer}=useAuth();const owner=customer?.role==='customer'?customer.id:null;
 const [state,setState]=useState({owner:null,ids:[],loading:false}),[prompt,setPrompt]=useState(null),[error,setError]=useState(''),[pendingIds,setPendingIds]=useState([]);
 const pendingAction=useRef(null),mutationQueue=useRef(Promise.resolve()),sequence=useRef(0),activeOwner=useRef(owner);activeOwner.current=owner;
 const refreshFavorites=useCallback(async()=>{
  const run=++sequence.current;if(!owner){setState({owner:null,ids:[],loading:false});return}
  setState(s=>({owner,ids:s.owner===owner?s.ids:[],loading:true}));
  try{const result=await api('/favorites');if(run===sequence.current&&activeOwner.current===owner)setState({owner,ids:result.productIds,loading:false})}catch(e){if(run===sequence.current){setState({owner,ids:[],loading:false});setError(e.message)}}
 },[owner]);
 useEffect(()=>{setError('');setPendingIds([]);refreshFavorites();return()=>{sequence.current++}},[refreshFavorites]);
 const cancelLogin=useCallback(()=>{pendingAction.current=null;setPrompt(null)},[]);
 useEffect(()=>{if(prompt&&owner){const action=pendingAction.current;cancelLogin();Promise.resolve().then(()=>action?.()).catch(e=>setError(e.message))}},[prompt,owner,cancelLogin]);
 function requireCustomer(action,reason='account'){
  if(owner){Promise.resolve().then(action).catch(e=>setError(e.message));return true}
  pendingAction.current=action;setPrompt({reason});return false;
 }
 const favorites=state.owner===owner&&owner?state.ids:[];
 function favorite(id){
  const saved=owner?!favorites.includes(id):true;
  requireCustomer(async()=>{
   const currentOwner=activeOwner.current;if(!currentOwner)return;
   setPendingIds(ids=>[...ids,id]);++sequence.current;setError('');
   try{const work=mutationQueue.current.catch(()=>{}).then(async()=>{if(activeOwner.current!==currentOwner)return;const result=await sendJson('/favorites',{productId:id,saved});if(activeOwner.current===currentOwner)setState({owner:currentOwner,ids:result.productIds,loading:false})});mutationQueue.current=work;await work}
   finally{setPendingIds(ids=>ids.filter(x=>x!==id))}
  },'favorite');
 }
 return <CustomerFeatures.Provider value={{favorites,favorite,pendingIds,loading:state.owner!==owner||state.loading,refreshFavorites,requireCustomer,prompt,cancelLogin,error,clearError:()=>setError('')}}>{children}</CustomerFeatures.Provider>;
}
