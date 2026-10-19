import {existsSync} from 'node:fs';
// Never expose provider secrets through VITE_ variables.
if(existsSync('.env'))process.loadEnvFile('.env');
