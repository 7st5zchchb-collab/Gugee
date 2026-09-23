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