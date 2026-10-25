import assert from 'node:assert/strict';
const paths=['/','/social-boosting','/numbers','/pricing','/long-term-rentals','/temporary-email','/developers','/faq','/ads','/legal/terms','/legal/privacy','/services/whatsapp','/services/telegram','/services/google'];
const titles=new Set();
for(const path of paths){
 const response=await fetch('http://localhost:3000'+path); assert.equal(response.status,200);
 const html=await response.text();
 const title=html.match(/<title>(.*?)<\/title>/s)?.[1]; assert.ok(title); assert.ok(!titles.has(title),path+' duplicate title');titles.add(title);
 for(const tag of ['name="description"','rel="canonical"','property="og:title"','property="og:description"','name="twitter:title"','name="twitter:description"']) assert.ok(html.includes(tag),path+' missing '+tag);
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1,path+' heading');
 for(const [,json] of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(json);
 if(path==='/'){
 assert.equal(title,'Boostlier SMM Panel | Fast &amp; Cheap Social Media Growth');
 assert.ok(html.includes('Buy followers, likes, views and engagement for your social media accounts - Facebook, Instagram, Tiktok, Youtube, etc.'));
 }
}
const sitemap=await (await fetch('http://localhost:3000/sitemap.xml')).text();
assert.ok(!sitemap.includes('/dedicated-numbers'));
for(const path of paths.filter(p=>p!=='/')) assert.ok(sitemap.includes(path));
console.log('SEO passed: 14 public pages, unique metadata, canonical/social tags, headings, structured data, exact homepage copy and sitemap.');
