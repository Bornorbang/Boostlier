import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/api/backend/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const data=path.endsWith('/payments/verify')?{status:'successful'}:path.endsWith('/auth/me')?{user:{id:'qa',name:'Customer',email:'qa@example.invalid',role:'customer'}}:path.endsWith('/balance')?{balance_usd:'10.00'}:{items:[],total:0,active_completed_total:0,text:''};
   return route.fulfill({json:data});
  });
  const page=await context.newPage();const started=Date.now();
  await page.goto('http://localhost:3000/payment/return?reference=qa');await page.getByRole('heading',{name:'Wallet funded!'}).waitFor();assert.equal(await page.locator('.payment-return-redirect .payment-return-spinner').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.waitForTimeout(3000);assert.ok(page.url().includes('/payment/return'));await page.waitForURL('**/dashboard',{timeout:10000});assert.ok(Date.now()-started>=3900);await context.close();console.log(`PASS verified success spinner and four-second dashboard redirect at ${width}px`);
 }
 const context=await browser.newContext();await context.route('**/api/backend/payments/verify',route=>route.fulfill({json:{status:'pending'}}));const page=await context.newPage();await page.goto('http://localhost:3000/payment/return?reference=pending');await page.getByRole('heading',{name:'Confirming your payment'}).waitFor();await page.waitForTimeout(4500);assert.ok(page.url().includes('/payment/return'));assert.equal(await page.getByRole('heading',{name:'Wallet funded!'}).count(),0);await context.close();
 console.log('PASS pending payments never show success or auto-redirect');
}finally{await browser.close();}
