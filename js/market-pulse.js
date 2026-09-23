(function(){
const pulseGainers=document.getElementById("pulseGainers");
const pulseLosers=document.getElementById("pulseLosers");
const pulseVolume=document.getElementById("pulseVolume");
const API_BASES=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
function pulseLogo(c){return c.image||"https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(c.symbol||"").toLowerCase())+"@2x.png"}
function pulseMoney(v){const n=Number(v);if(!Number.isFinite(n))return"--";return"$"+n.toLocaleString("en-US",{maximumFractionDigits:n>=1?2:8})}
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
  const limit=100;
  let data=null;
  for(const base of API_BASES){
   try{const r=await fetch(base+"/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page="+limit+"&page=1&sparkline=false&price_change_percentage=24h",{cache:"no-store",headers:{accept:"application/json"}});if(r.ok){data=await r.json();break}}catch{}
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
function money(v){const n=Number(v);return Number.isFinite(n)?"$"+n.toLocaleString("en-US",{maximumFractionDigits:n>=1?2:8}):"--"}
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
 const data=await baseFetch("/api/coingecko/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&order=market_cap_desc&per_page=3&page=1&sparkline=false&price_change_percentage=24h");
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
 const data=await baseFetch("/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=false&price_change_percentage=24h");
 const box=document.getElementById("marketHeatmap");if(!box||!Array.isArray(data))return;
 box.innerHTML=data.map(c=>{const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);const size=Math.max(1,Math.min(3.4,Math.log10(Math.max(1,Number(c.market_cap||0)))-7));const cls=ch>=0?"positive":"negative";return '<a class="heat-cell '+cls+'" style="flex-grow:'+size+'" href="crypto.html?coin='+encodeURIComponent(c.id)+'"><img src="'+logo(c)+'" alt="" loading="lazy"><b>'+String(c.symbol||"").toUpperCase()+'</b><span>'+(Number.isFinite(ch)?(ch>=0?"+":"")+ch.toFixed(2)+"%":"--")+'</span></a>'}).join("");
}
async function refresh(){
 await Promise.all([loadMainAssets(),loadTrending(),loadHeatmap()]);
}
refresh();setInterval(refresh,60000);
})();