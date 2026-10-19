import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {createPrintApi} from '../server/api.mjs';
import {smsTransport} from '../server/customer-auth.mjs';

const env={NODE_ENV:'production',LISHA_DEMO_AUTH:'true',LISHA_DEMO_ADMIN_PHONE:'09999990001',LISHA_DEMO_ADMIN_CODE:'735291',LISHA_DEMO_CUSTOMER_PHONE:'09999990002',LISHA_DEMO_CUSTOMER_CODE:'426815'};

test('fixed demo login is explicit, role-separated, repeatable and isolated from normal sessions',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lisha-demo-'));
 let handler=createPrintApi({dataDir:dir,env,gateway:{provider:'test',available:true,create(){assert.fail('Demo must not start a real gateway')}}});
 const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 function client(){let cookie='';return {get cookie(){return cookie},async call(url,body,status=200){const r=await fetch(origin+'/api'+url,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const next=r.headers.getSetCookie().find(c=>c.startsWith('lisha_auth='));if(next)cookie=next.split(';')[0];const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result}}}
 const admin=client(),customer=client(),anonymous=client(),adminBody={phone:env.LISHA_DEMO_ADMIN_PHONE,code:env.LISHA_DEMO_ADMIN_CODE},customerBody={phone:env.LISHA_DEMO_CUSTOMER_PHONE,code:env.LISHA_DEMO_CUSTOMER_CODE};
 try{
  assert.equal(smsTransport({dataDir:dir,env:{NODE_ENV:'production',LISHA_DEMO_AUTH:'false'}}).mode,'unavailable');
  assert.throws(()=>smsTransport({dataDir:dir,env:{LISHA_DEMO_AUTH:'true'}}));
  assert.throws(()=>smsTransport({dataDir:dir,env:{...env,LISHA_DEMO_CUSTOMER_PHONE:env.LISHA_DEMO_ADMIN_PHONE}}));
  assert.equal((await anonymous.call('/auth/session')).mode,'demo');
  const catalog=await anonymous.call('/catalog');assert.equal(catalog.payment.available,false);assert.equal(JSON.stringify(catalog).includes(env.LISHA_DEMO_ADMIN_CODE),false);
  await anonymous.call('/auth/admin/demo',{...adminBody,code:'000000'},400);
  await anonymous.call('/auth/admin/demo',customerBody,400);
  await anonymous.call('/auth/demo',adminBody,400);
  await anonymous.call('/auth/demo',{...customerBody,phone:'09999990003'},400);
  assert.equal(handler.store.db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,0);
  await anonymous.call('/auth/request',{phone:customerBody.phone},400);
  assert.equal((await admin.call('/auth/admin/demo',adminBody)).customer.role,'admin');
  assert.equal((await customer.call('/auth/demo',customerBody)).customer.role,'customer');
  await customer.call('/admin/products',undefined,403);await admin.call('/admin/products');
  assert.equal(handler.store.isAdmin(adminBody.phone),false);
  const before=await customer.call('/auth/session');await customer.call('/auth/logout',{});
  assert.equal((await customer.call('/auth/demo',customerBody)).customer.id,before.customer.id);
  assert.equal((await admin.call('/auth/admin/demo',adminBody)).customer.role,'admin');
  handler.close();handler=createPrintApi({dataDir:dir,env:{NODE_ENV:'production'}});
  assert.equal((await admin.call('/auth/session')).customer,null);
  assert.equal((await customer.call('/auth/session')).customer,null);
  await admin.call('/admin/products',undefined,401);
  await anonymous.call('/auth/admin/demo',adminBody,404);
  await anonymous.call('/auth/demo',customerBody,404);
 }finally{
  await new Promise(r=>server.close(r));handler.close();
  assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^lisha-demo-/);await rm(dir,{recursive:true,force:true});
 }
});
