import React from 'react';
import {Link} from 'react-router-dom';
import {ChevronLeft,Flower2,Heart} from 'lucide-react';
export function PageHead({title,sub,english}){return <section className="page-head wrap"><nav className="page-head-crumbs" aria-label="مسیر صفحه"><Link to="/">خانه</Link><ChevronLeft size={12}/><span>{title}</span></nav><div className="page-head-card"><div className="page-head-copy">{english&&<span className="page-head-english" dir="ltr">{english}</span>}<h1>{title}</h1>{sub&&<p>{sub}</p>}</div><div className="page-head-art" aria-hidden="true"><Flower2/><Heart/><span>یه کوچولو حالِ خوب</span></div></div></section>}
