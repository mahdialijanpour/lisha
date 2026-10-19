import {phoneNumber} from './commerce-store.mjs';

// Fixed credentials are available only through an explicit server-side demo flag.
export function demoAccounts(env){
 if(env.LISHA_DEMO_AUTH!=='true')return null;
 const accounts=['ADMIN','CUSTOMER'].map(kind=>{
  const phone=phoneNumber(env[`LISHA_DEMO_${kind}_PHONE`]);
  const code=env[`LISHA_DEMO_${kind}_CODE`];
  if(!/^\d{6}$/.test(code||''))throw Error('Demo login requires two configured six-digit codes.');
  return {phone,code,role:kind==='ADMIN'?'admin':'customer',name:kind==='ADMIN'?'مدیر دمو':'مشتری دمو'};
 });
 if(accounts[0].phone===accounts[1].phone)throw Error('Demo admin and customer phone numbers must differ.');
 return accounts;
}
