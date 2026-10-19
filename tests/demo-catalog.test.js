import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,rename} from 'node:fs/promises';
import {CommerceStore} from '../server/commerce-store.mjs';
import {exportDemoCatalog,prepareDemoCatalog} from '../server/demo-catalog.mjs';

const env={LISHA_DEMO_AUTH:'true',LISHA_DEMO_ADMIN_PHONE:'09999990001',LISHA_DEMO_ADMIN_CODE:'735291',LISHA_DEMO_CUSTOMER_PHONE:'09999990002',LISHA_DEMO_CUSTOMER_CODE:'426815'};

test('portable catalog excludes private data, restores images and preserves later demo changes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lisha-catalog-'));
 const sourceDir=path.join(root,'source'),catalogDir=path.join(root,'bundle'),dataDir=path.join(root,'data');
 try{
  const source=new CommerceStore(sourceDir);
  const mediaId='a'.repeat(32),orphanId='b'.repeat(32),image=Buffer.from('public catalog image');
  try{
   await mkdir(path.join(sourceDir,'catalog'),{recursive:true});
   await writeFile(path.join(sourceDir,'catalog',mediaId+'.png'),image);
   await writeFile(path.join(sourceDir,'catalog',orphanId+'.png'),'unused image');
   source.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(mediaId,mediaId+'.png','image/png',1);
   source.db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(orphanId,orphanId+'.png','image/png',1);
   const p=source.product('coffee-cat',{admin:true});
   source.db.prepare('UPDATE products SET payload=? WHERE id=?').run(JSON.stringify({...p,name:'Portable product',image:`/api/catalog/media/${mediaId}`,privateNote:'PRIVATE-NEVER-EXPORT'}),p.id);
   source.db.prepare('INSERT INTO customers VALUES(?,?,?,?)').run('private-customer','09123456789','PRIVATE-NEVER-EXPORT',1);
   source.db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?)').run('private-order','private-customer','private-request','private-hash','{"private":"PRIVATE-NEVER-EXPORT"}','draft',1);
   source.setSetting('privateProviderKey','PRIVATE-NEVER-EXPORT');
   source.setSetting('shippingMode','recipient');
   source.setSetting('shippingFee',0);
   source.db.prepare('UPDATE variants SET stock=17 WHERE product_id=?').run(p.id);
  }finally{source.close()}
  const bundle=await exportDemoCatalog(sourceDir,catalogDir);
  assert.equal(bundle.media.length,1);
  assert.deepEqual(await readdir(path.join(catalogDir,'media')),[mediaId+'.png']);
  const text=await readFile(path.join(catalogDir,'catalog.json'),'utf8');
  assert.equal(text.includes('PRIVATE-NEVER-EXPORT'),false);
  assert.equal(text.includes('09123456789'),false);
  assert.equal(text.includes('otpSecret'),false);
  assert.deepEqual(Object.keys(bundle).sort(),['media','products','settings','variants','version']);
  await assert.rejects(prepareDemoCatalog({dataDir,env:{},catalogDir}),/Enable LISHA_DEMO_AUTH/);
  const result=await prepareDemoCatalog({dataDir,env,catalogDir,onlyIfNew:true});
  assert.equal(result.products,bundle.products.length);
  assert.deepEqual(await readFile(path.join(dataDir,'catalog',mediaId+'.png')),image);
  const target=new CommerceStore(dataDir);
  try{
   assert.equal(target.product('coffee-cat').name,'Portable product');
   assert.equal(target.product('coffee-cat',{admin:true}).variants[0].stock,17);
   assert.equal(target.db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,0);
   assert.equal(target.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
   assert.equal(target.setting('privateProviderKey'),null);
   target.db.prepare('UPDATE variants SET stock=2 WHERE product_id=?').run('coffee-cat');
   target.db.prepare('INSERT INTO customers VALUES(?,?,?,?)').run('demo-buyer','09999990002','Demo buyer',1);
   target.db.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?)').run('demo-order','demo-buyer','demo-request','demo-hash','{}','draft',1);
  }finally{target.close()}
  assert.equal((await prepareDemoCatalog({dataDir,env,catalogDir})).skipped,true);
  assert.equal((await prepareDemoCatalog({dataDir,env,catalogDir,onlyIfNew:true})).skipped,true);
  const reopened=new CommerceStore(dataDir);
  try{
   assert.equal(reopened.product('coffee-cat',{admin:true}).variants[0].stock,2);
   assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
  }finally{reopened.close()}
  // A live directory without the demo marker must never be replaced.
  await assert.rejects(prepareDemoCatalog({dataDir:sourceDir,env,catalogDir}),/new data directory/);
  const unchanged=new CommerceStore(sourceDir);
  try{assert.equal(unchanged.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1)}finally{unchanged.close()}
  // A missing bundled image must not leave the next startup with zero-stock defaults.
  const retryDir=path.join(root,'retry');
  const imagePath=path.join(catalogDir,'media',mediaId+'.png');
  await rename(imagePath,imagePath+'.held');
  await assert.rejects(prepareDemoCatalog({dataDir:retryDir,env,catalogDir,onlyIfNew:true}),/ENOENT/);
  await rename(imagePath+'.held',imagePath);
  assert.equal((await prepareDemoCatalog({dataDir:retryDir,env,catalogDir,onlyIfNew:true})).products,bundle.products.length);
  assert.equal((await prepareDemoCatalog({dataDir:retryDir,env,catalogDir,onlyIfNew:true})).skipped,true);
 }finally{
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^lisha-catalog-/);
  await rm(root,{recursive:true,force:true});
 }
});
