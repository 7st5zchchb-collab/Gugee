(function(){
const pulseGainers=document.getElementById("pulseGainers");
const pulseLosers=document.getElementById("pulseLosers");
const pulseVolume=document.getElementById("pulseVolume");
const API_BASES=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
function pulseLogo(c){return c.image||"https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(c.symbol||"").toLowerCase())+"@2x.png"}
function pulseMoney(v){const n=Number(v);if(!Number.isFinite(n))return"--";if(n>=1000)return"$"+n.toLocaleString("en-US",{maximumFractionDigits:2});if(n>=1)return"$"+n.toLocaleString("en-US",{maximumFractionDigits:4});return"$"+n.toLocaleString("en-US",{maximumFractionDigits:8});}
function pulseCompact(v){const n=Number(v);if(!Number.isFinite(n))return"--";return"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(n)}
function pulseItems(list){
 return list.slice(0,5).map(c=>{
   const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h),cls=ch>=0?"positive":"negative";
   return '<a class="market-pulse-item" href="crypto.html?coin='+encodeURIComponent(c.id)+'"><img src="'+pulseLogo(c)+'" alt="" loading="lazy"><span class="market-pulse-name"><b>'+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+'</small></span><span class="market-pulse-value"><b>'+pulseMoney(c.current_price)+'</b><span class="'+cls+'">'+(Number.isFinite(ch)?(ch>=0?"+":"")+ch.toFixed(2)+"%":"--")+'</span></span></a>'
 }).join("");
}
function renderPulse(coins){
 const valid=coins.filter(c=>Number.isFinite(Number(c.current_price)));
 const changes=valid.filter(c=>Number.isFinite(Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h)));
 const gainers=[...changes].sort((a,b)=>Number(b.price_change_percentage_24h_in_currency??b.price_change_percentage_24h)-Number(a.price_change_percentage_24h_in_currency??a.price_change_percentage_24h));
 const losers=[...changes].sort((a,b)=>Number(a.price_change_percentage_24h_in_currency??a.price_change_percentage_24h)-Number(b.price_change_percentage_24h_in_currency??b.price_change_percentage_24h));
 const volume=[...valid].sort((a,b)=>Number(b.total_volume||0)-Number(a.total_volume||0));
 if(pulseGainers)pulseGainers.innerHTML=pulseItems(gainers)||'<div class="market-pulse-empty">No data</div>';
 if(pulseLosers)pulseLosers.innerHTML=pulseItems(losers)||'<div class="market-pulse-empty">No data</div>';
 if(pulseVolume)pulseVolume.innerHTML=volume.slice(0,5).map(c=>'<a class="market-pulse-item" href="crypto.html?coin='+encodeURIComponent(c.id)+'"><img src="'+pulseLogo(c)+'" alt="" loading="lazy"><span class="market-pulse-name"><b>'+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+'</small></span><span class="market-pulse-value"><b>'+pulseMoney(c.current_price)+'</b><span>'+pulseCompact(c.total_volume)+'</span></span></a>').join("");
}
async function loadPulse(){
 try{
  const limit=1000;
  let data=null;
  for(const base of API_BASES){
   try{const r=await fetch(base+"/api/coingecko/top1000",{cache:"no-store",headers:{accept:"application/json"}});if(r.ok){const payload=await r.json();data=Array.isArray(payload?.coins)?payload.coins:[];break}}catch{}
  }
  if(Array.isArray(data))renderPulse(data);
 }catch{}
}
loadPulse();
setInterval(loadPulse,60000);
})();
(function(){
const API_BASES=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
function baseFetch(path){return Promise.all(API_BASES.map(base=>fetch(base+path,{cache:"no-store",headers:{accept:"application/json"}}).then(r=>r.ok?r.json():Promise.reject()).catch(()=>null))).then(xs=>xs.find(Boolean))}
function money(v){const n=Number(v);if(!Number.isFinite(n))return"--";if(n>=1000)return"$"+n.toLocaleString("en-US",{maximumFractionDigits:2});if(n>=1)return"$"+n.toLocaleString("en-US",{maximumFractionDigits:4});return"$"+n.toLocaleString("en-US",{maximumFractionDigits:8})}
function compact(v){const n=Number(v);return Number.isFinite(n)?"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(n):"--"}
function logo(c){return c.image||"https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(c.symbol||"").toLowerCase())+"@2x.png"}
function mainCard(prefix,c){
 if(!c)return;
 document.getElementById("mainAsset"+prefix+"Logo").src=logo(c);
 document.getElementById("mainAsset"+prefix+"Price").textContent=money(c.current_price);
 const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h), el=document.getElementById("mainAsset"+prefix+"Change");
 el.textContent=Number.isFinite(ch)?(ch>=0?"+":"")+ch.toFixed(2)+"%":"--";el.className=ch>=0?"positive":"negative";
 document.getElementById("mainAsset"+prefix+"Cap").textContent=compact(c.market_cap);
 document.getElementById("mainAsset"+prefix+"Volume").textContent=compact(c.total_volume);
}
async function loadMainAssets(){
 const payload=await baseFetch("/api/coingecko/top1000");
 const data=Array.isArray(payload?.coins)?payload.coins.filter(c=>["bitcoin","ethereum","solana"].includes(c.id)):[];
 if(!Array.isArray(data))return;
 const by=Object.fromEntries(data.map(c=>[c.id,c]));
 mainCard("Btc",by.bitcoin);mainCard("Eth",by.ethereum);mainCard("Sol",by.solana);
 const u=document.getElementById("mainAssetsUpdated");if(u)u.textContent="Updated "+new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
}
async function loadTrending(){
 const data=await baseFetch("/api/coingecko/search/trending");
 const list=document.getElementById("marketTrendingList");if(!list)return;
 const coins=(data?.coins||[]).slice(0,7).map(x=>x.item).filter(Boolean);
 list.innerHTML=coins.length?coins.map((c,i)=>'<a class="market-pulse-item" href="crypto.html?coin='+encodeURIComponent(c.id)+'"><img src="'+(c.small||c.thumb||"")+'" alt="" loading="lazy"><span class="market-pulse-name"><b>'+(i+1)+". "+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+' • Rank '+(c.market_cap_rank||"--")+'</small></span><span class="market-pulse-value"><b>'+((c.data?.price||"")?String(c.data.price):"--")+'</b><span>'+String(c.data?.price_change_percentage_24h?.usd??"--")+'</span></span></a>').join(""):'<div class="market-pulse-empty">Trending data unavailable</div>';
}
async function loadHeatmap(){
 const payload=await baseFetch("/api/coingecko/top1000");
 const data=Array.isArray(payload?.coins)?payload.coins.slice(0,30):[];
 const box=document.getElementById("marketHeatmap");if(!box||!Array.isArray(data))return;
 box.innerHTML=data.map(c=>{const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);const size=Math.max(1,Math.min(3.4,Math.log10(Math.max(1,Number(c.market_cap||0)))-7));const cls=ch>=0?"positive":"negative";return '<a class="heat-cell '+cls+'" style="flex-grow:'+size+'" href="crypto.html?coin='+encodeURIComponent(c.id)+'"><img src="'+logo(c)+'" alt="" loading="lazy"><b>'+String(c.symbol||"").toUpperCase()+'</b><span>'+(Number.isFinite(ch)?(ch>=0?"+":"")+ch.toFixed(2)+"%":"--")+'</span></a>'}).join("");
}
async function refresh(){
 await Promise.all([loadMainAssets(),loadTrending(),loadHeatmap()]);
}
refresh();setInterval(refresh,60000);
})();
(function(){
const apiBases=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
async function get(path){for(const base of apiBases){try{const r=await fetch(base+path,{cache:"no-store",headers:{accept:"application/json"}});if(r.ok)return await r.json()}catch{}}return null}
function money(v){const n=Number(v);return Number.isFinite(n)?"$"+n.toLocaleString("en-US",{maximumFractionDigits:2}):"--"}
function compact(v){const n=Number(v);return Number.isFinite(n)?"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(n):"--"}
async function sentiment(){
 let d=null;try{const r=await fetch("https://api.alternative.me/fng/?limit=1",{cache:"no-store"});if(r.ok)d=await r.json()}catch{}
 const x=d?.data?.[0]; if(!x)return;
 const value=Number(x.value); document.getElementById("sentimentValue").textContent=Number.isFinite(value)?value:"--";
 document.getElementById("sentimentLabel").textContent=x.value_classification||"Unknown";
 document.getElementById("sentimentTime").textContent=x.timestamp?new Date(Number(x.timestamp)*1000).toLocaleString():"--";
 document.getElementById("sentimentUpdated").textContent="Updated "+new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
 const m=document.getElementById("sentimentMarker"); if(m)m.style.left=Math.max(0,Math.min(100,value))+"%";
}
async function globalStats(){
 const d=await get("/api/coingecko/global"); const x=d?.data;if(!x)return;
 document.getElementById("pulseActiveCrypto").textContent=Number(x.active_cryptocurrencies||0).toLocaleString();
 document.getElementById("pulseGlobalVolume").textContent=compact(x.total_volume?.usd);
 const capChange=Number(x.market_cap_change_percentage_24h_usd);
 const capEl=document.getElementById("pulseMarketCapChange");capEl.textContent=Number.isFinite(capChange)?(capChange>=0?"+":"")+capChange.toFixed(2)+"%":"--";capEl.className=capChange>=0?"positive":"negative";
 const dom=Number(x.market_cap_percentage?.btc);document.getElementById("pulseBtcDominance").textContent=Number.isFinite(dom)?dom.toFixed(2)+"%":"--";document.getElementById("dominanceFill").style.width=Math.max(0,Math.min(100,dom||0))+"%";
}
async function btcVolume(){
 const payload=await get("/api/coingecko/top1000");const x=(payload?.coins||[]).find(c=>c.id==="bitcoin");if(x)document.getElementById("pulseBtcVolume").textContent=compact(x.total_volume);
}
async function refreshExtras(){await Promise.all([sentiment(),globalStats(),btcVolume()])}
refreshExtras();setInterval(refreshExtras,60000);
})();

(function(){
const bases=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
async function get(path){for(const base of bases){try{const r=await fetch(base+path,{cache:"no-store",headers:{accept:"application/json"}});if(r.ok)return await r.json()}catch{}}return null}
function compact(v){const n=Number(v);return Number.isFinite(n)?"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(n):"--"}
async function loadCategories(){
 const data=await get("/api/coingecko/coins/categories?order=market_cap_desc");
 const box=document.getElementById("marketCategories");if(!box)return;
 const rows=Array.isArray(data)?data.slice(0,12):[];
 box.innerHTML=rows.length?rows.map(c=>{
   const ch=Number(c.market_cap_change_24h),cls=ch>=0?"positive":"negative";
   return '<a class="market-category" href="cryptos.html"><div class="market-category-top"><b>'+String(c.name||"Unknown")+'</b><small>'+compact(c.market_cap)</small></div><div class="market-category-value"><span>24H</span><strong class="'+cls+'">'+(Number.isFinite(ch)?(ch>=0?"+":"")+ch.toFixed(2)+"%":"--")+'</strong></div></a>';
 }).join(""):'<div class="market-pulse-empty">Sector data unavailable</div>';
}
loadCategories();setInterval(loadCategories,60000);
})();