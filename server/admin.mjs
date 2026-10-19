import './env.mjs';
import path from 'node:path';
import {CommerceStore,phoneNumber} from './commerce-store.mjs';
const phone=phoneNumber(process.argv[2]);
const store=new CommerceStore(path.resolve(process.env.LISHA_DATA_DIR||'data'));
try{store.addAdmin(phone);store.audit('local-cli','admin.grant',phone);console.log('Administrator access granted. Sign in with this phone number through the site.')}finally{store.close()}
