import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const origin='http://localhost:3000';
const email='admin-qa-'+randomBytes(5).toString('hex')+'@example.invalid';
const password=randomBytes(20).toString('hex');
let cookie='';
async function call(path,method='GET',data){const r=await fetch(origin+'/api/backend'+path,{method,headers:{Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};}
const signup=await call('/auth/signup','POST',{name:'Administrator QA',email,password});assert.equal(signup.status,201);const uid=signup.body.user.id;
assert.equal((await call('/admin/overview')).status,403);
execFileSync('php',['backend/bin/admin.php',email],{stdio:'pipe'});
assert.equal((await call('/admin/overview')).status,200);console.log('PASS administrator permissions change only through authorised backend role promotion');
const adjustment={user_id:uid,amount_usd:'1.23',direction:'credit',reason:'Local QA adjustment; no real money',idempotency_key:randomBytes(10).toString('hex')};
assert.equal((await call('/admin/wallet-adjustment','POST',adjustment)).status,200);assert.equal((await call('/admin/wallet-adjustment','POST',adjustment)).status,200);assert.equal((await call('/admin/user-wallet?id='+uid)).body.balance_usd,'1.23');console.log('PASS administrator adjustment replay credits once and wallet inspection is authorised');
const users=await call('/admin/users?search='+encodeURIComponent(email));assert.equal(users.body.items.length,1);assert.equal(users.body.items[0].password_hash,undefined);console.log('PASS administrator customer search excludes password hashes');
assert.equal((await call('/admin/users','PATCH',{id:uid,status:'disabled'})).status,422);console.log('PASS administrator cannot disable own active account');
const notice=await call('/admin/announcements','POST',{title:'Local QA only',body:'This temporary QA announcement is deleted by the test.'});assert.equal(notice.status,200);assert.equal((await call('/admin/announcements','POST',{id:notice.body.id,title:'Updated QA',body:'Edited by QA.'})).status,200);assert.equal((await call('/admin/announcements','DELETE',{id:notice.body.id})).status,200);console.log('PASS announcements create, edit and delete through real backend permissions');
assert.equal((await call('/admin/user-rewards?id='+uid)).status,200);await call('/auth/logout','POST',{});console.log('PASS administrator customer reward inspection');
