import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const origin='http://localhost:3000';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
async function signup(context,email,ref=''){
 const page=await context.newPage();await page.goto(origin+'/auth/signup'+(ref?'?ref='+encodeURIComponent(ref):''));
 await page.getByRole('textbox',{name:'Your name'}).fill('Rewards QA');await page.getByRole('textbox',{name:'Email address'}).fill(email);await page.getByLabel(/^Password/).fill('Rewards-QA-test-password');
 if(ref)assert.equal(await page.locator('input[name="referral_code"]').inputValue(),ref);
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.waitForURL('**/dashboard');return page;
}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await signup(context,`rewards-${Date.now()}@example.invalid`);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/dashboard/rewards');await page.getByRole('heading',{name:'Rewards',exact:true}).waitFor();
 const actual=await(await context.request.get(origin+'/api/backend/rewards')).json();assert.equal(actual.rewards.length,5);
 assert.equal((await context.request.patch(origin+'/api/backend/admin/reward-settings',{data:{enabled:false}})).status(),403);
 const friend=await browser.newContext();await signup(friend,`friend-${Date.now()}@example.invalid`,actual.referral_code.toLowerCase());await friend.close();
 const updated=await(await context.request.get(origin+'/api/backend/rewards')).json();assert.equal(updated.referrals.total,1);assert.equal(updated.referrals.qualified,0);
 let claims=0,balance=0;
 const amounts={monthly_spend:'1.00',streak:'0.50',cashback:'0.50',topup_bonus:'2.50',referral:'1.00'};
 const labels={monthly_spend:'Monthly spending',streak:'Seven-day order streak',cashback:'Rental cashback',topup_bonus:'Top-up bonus',referral:'Referral milestones'};
 const data={...updated,rewards:updated.rewards.map(r=>({...r,progress:r.id==='monthly_spend'?2500:r.id==='streak'?7:r.id==='cashback'?50:r.id==='referral'?10:250,amount_usd:amounts[r.id],eligible:true})),referrals:{total:10,qualified:10},milestones:updated.milestones.map(m=>({...m,unlocked:m.count<=10})),claims:[]};
 await page.route('**/api/backend/rewards',r=>r.fulfill({json:data}));await page.route('**/api/backend/balance',r=>r.fulfill({json:{balance_usd:balance.toFixed(2),reserved_usd:'0.00',currency:'USD'}}));
 await page.route('**/api/backend/rewards/claim',async route=>{const id=route.request().postDataJSON().reward;claims++;const amount=amounts[id];balance+=Number(amount);const r=data.rewards.find(r=>r.id===id);r.eligible=false;r.claimed=id==='monthly_spend';r.claimed_usd=amount;if(!['monthly_spend','streak'].includes(id))r.amount_usd='0.00';if(id==='referral')data.milestones=data.milestones.map(m=>({...m,claimed:m.count<=10}));data.claims.unshift({reward:id,amount_usd:amount,period:id==='monthly_spend'?data.period:id==='streak'?'streak:2026-10-15:2026-10-21':id==='referral'?'milestone:10':'incremental:test',created_at:new Date().toISOString()});await route.fulfill({json:{message:`${amount} USD credited to your wallet.`}});});
 await page.reload();await page.getByRole('region',{name:'Monthly spending',exact:true}).waitFor();assert.equal(await page.locator('.reward-card').count(),5);
 const topup=page.getByRole('region',{name:'Top-up bonus',exact:true});assert.equal(await topup.getByRole('progressbar').count(),0);assert.equal(await topup.locator('.reward-percentage').count(),0);assert.equal(await page.getByRole('region',{name:'Rental cashback',exact:true}).locator('.reward-percentage').count(),0);
 await page.screenshot({path:'artifacts/rewards-desktop.png',fullPage:true});
 for(const id of Object.keys(amounts)){
  const card=page.getByRole('region',{name:labels[id],exact:true});await card.getByRole('button',{name:'Claim reward',exact:true}).click();await card.getByRole('button',{name:id==='monthly_spend'?'Claimed':'Claim reward',exact:true}).waitFor();
  await page.locator('.balance-chip strong').filter({hasText:balance.toFixed(2)}).waitFor();
 }
 assert.equal(claims,5);assert.equal(balance,5.5);assert.equal(await page.getByRole('table',{name:'Reward claims',exact:true}).locator('tbody tr').count(),5);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/rewards-mobile.png',fullPage:true});await page.getByRole('button',{name:'Toggle colour theme'}).click();await page.screenshot({path:'artifacts/rewards-mobile-dark.png',fullPage:true});
 await page.goto(origin+'/dashboard/referral');await page.waitForURL('**/dashboard/rewards');assert.deepEqual(errors,[]);
 console.log('PASS five reward cards, prominent percentages, no top-up counter, all claim actions, immediate wallet updates, referral registration/redirect, customer RBAC, mobile themes and history; fixture earnings only');
}finally{await browser.close();}
