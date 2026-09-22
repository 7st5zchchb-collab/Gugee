const grid=document.getElementById("cryptoDirectoryGrid");
const input=document.getElementById("cryptoDirectorySearch");
const count=document.getElementById("cryptoDirectoryCount");
const more=document.getElementById("cryptoLoadMore");
const API="/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=";
let page=0,allCoins=[],filtered=[];

const money=v=>{if(!Number.isFinite(v))return "--";if(v>=1000)return "$"+Math.round(v).toLocaleString("en-US");if(v>=1)return "$"+v.toLocaleString("en-US",{maximumFractionDigits:2});return "$"+v.toLocaleString("en-US",{maximumSignificantDigits:6)}};
const pct=v=>Number.isFinite(v)?(v>=0?"+":"")+v.toFixed(2)+"%":"--";

function render(){
  const q=input.value.trim().toLowerCase();
  filtered=allCoins.filter(c=>!q||c.name.toLowerCase().includes(q)||c.symbol.toLowerCase().includes(q)||c.id.toLowerCase().includes(q));
  count.textContent=filtered.length+" cryptocurrencies loaded";
  grid.innerHTML=filtered.length?filtered.map(c=>{
    const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);
    return '<a class="crypto-directory-card" href="crypto.html?coin='+encodeURIComponent(c.id)+'"><img src="'+(c.image||"")+'" alt="'+c.name+' logo" loading="lazy"><span class="crypto-directory-info"><b>'+c.name+'</b><small>'+c.symbol.toUpperCase()+'</small></span><strong>'+money(c.current_price)+'</strong><span class="'+(ch>=0?"positive":"negative")+'">'+pct(ch)+'</span></a>';
  }).join(""):'<div class="exchange-directory-empty">No cryptocurrency found.</div>';
}
async function load(){
  more.disabled=true;more.textContent="Loading...";
  try{
    page+=1;
    const r=await fetch(API+page+"&sparkline=false&price_change_percentage=24h,7d,30d");
    if(!r.ok)throw new Error();
    const rows=await r.json();
    allCoins=allCoins.concat(rows);
    render();
    more.disabled=rows.length<100;
    more.textContent=rows.length<100?"No more":"Load more";
  }catch{
    more.textContent="Try again";
  }
}
input.addEventListener("input",render);
more.addEventListener("click",load);
load();
