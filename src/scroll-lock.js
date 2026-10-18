// Fix the page in place while the native dialog keeps its own scroll container.
export function lockPageScroll(){
 const root=document.documentElement,body=document.body;
 const x=window.scrollX,y=window.scrollY;
 const rootProperties=['overflow','overscroll-behavior','scroll-behavior','scrollbar-gutter'];
 const bodyProperties=['position','top','left','width','overflow'];
 const remember=(element,properties)=>properties.map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]);
 const rootStyles=remember(root,rootProperties),bodyStyles=remember(body,bodyProperties);
 root.style.setProperty('scrollbar-gutter','stable');
 root.style.setProperty('overflow','hidden');
 root.style.setProperty('overscroll-behavior','none');
 root.style.setProperty('scroll-behavior','auto');
 body.style.setProperty('position','fixed');
 body.style.setProperty('top',`${-y}px`);
 body.style.setProperty('left',`${-x}px`);
 body.style.setProperty('width','100%');
 body.style.setProperty('overflow','hidden');
 let released=false;
 return ()=>{
  if(released)return;released=true;
  const restore=(element,properties)=>properties.forEach(([name,value,priority])=>value?element.style.setProperty(name,value,priority):element.style.removeProperty(name));
  restore(body,bodyStyles);
  restore(root,rootStyles.filter(([name])=>name!=='scroll-behavior'));
  window.scrollTo({left:x,top:y,behavior:'instant'});
  restore(root,rootStyles.filter(([name])=>name==='scroll-behavior'));
 };
}
