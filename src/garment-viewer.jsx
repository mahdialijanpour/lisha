import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {RotateCw,Pause,MoveHorizontal,RotateCcw} from 'lucide-react';
import {createGarmentViewer} from './garment-webgl';
import {fa} from './data';
import {printZones} from './print-layout';

export const GarmentViewer=forwardRef(function GarmentViewer({kind,color,prints,activeZone},ref){
 const canvas=useRef(),engine=useRef();const [error,setError]=useState('');const [angle,setAngle]=useState(0);const [auto,setAuto]=useState(false);
 useEffect(()=>{try{engine.current=createGarmentViewer(canvas.current,{onAngle:setAngle,onError:setError,onInteract:()=>setAuto(false)})}catch{setError('نمای سه‌بعدی در این مرورگر در دسترس نیست. مرورگر دارای WebGL را امتحان کن.')}return()=>{engine.current?.dispose();engine.current=null}},[]);
 useEffect(()=>{engine.current?.setModel(kind)},[kind]);
 useEffect(()=>{engine.current?.setColor(color)},[color]);
 useEffect(()=>{engine.current?.setPrints(prints)},[prints,kind]);
 useEffect(()=>{setAuto(false);engine.current?.setAngle(printZones[activeZone]?.angle||0)},[activeZone,kind]);
 useEffect(()=>{engine.current?.setSpin(auto)},[auto]);
 useImperativeHandle(ref,()=>({capture:()=>engine.current?.capture()||''}),[]);
 return <div className="garment-360">
  <div className="viewer-stage"><div className="viewer-floor" aria-hidden="true"/><canvas ref={canvas} tabIndex="0" aria-label="پیش‌نمایش سه‌بعدی لباس؛ برای چرخاندن از کشیدن یا کلیدهای جهت استفاده کن"/>{error&&<div className="viewer-error" role="alert">{error}</div>}<span className="viewer-badge">۳۶۰°</span></div>
  <div className="viewer-hint"><MoveHorizontal size={15}/><span>برای چرخاندن لباس، بکش</span></div>
  <div className="viewer-actions"><button className={auto?'active':''} aria-pressed={auto} onClick={()=>setAuto(a=>!a)}>{auto?<Pause size={15}/>:<RotateCw size={15}/>}چرخش خودکار</button><button onClick={()=>{setAuto(false);engine.current?.setAngle(printZones[activeZone]?.angle||0)}}><RotateCcw size={15}/>برگشت به محل چاپ</button></div>
  <label className="viewer-angle"><span>زاویه‌ی دید <b>{fa(Math.round(angle))}°</b></span><input aria-label="زاویه چرخش لباس" type="range" min="0" max="360" step="1" value={Math.round(angle)} onChange={e=>{setAuto(false);setAngle(Number(e.target.value));engine.current?.setAngle(Number(e.target.value))}}/></label>
 </div>;
});
