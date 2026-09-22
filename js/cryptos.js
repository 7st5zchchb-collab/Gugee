const grid=document.getElementById("cryptoDirectoryGrid");
const input=document.getElementById("cryptoDirectorySearch");
const count=document.getElementById("cryptoDirectoryCount");
const more=document.getElementById("cryptoLoadMore");

const API="/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=";
let page=0,allCoins=[],loading=false;

function logoFor(c){
  if(c.image)return c.image;
  const symbol=String(c.symbol||"").toLowerCase();
  return symbol?"https://assets.coincap.io/assets/icons/"+encodeURIComponent(symbol)+"@2x.png":"";
}

function render(){
  const q=input.value.trim().toLowerCase();
  const filtered=allCoins.filter(c=>!q||String(c.name||"").toLowerCase().includes(q)||String(c.symbol||"").toLowerCase().includes(q)||String(c.id||"").toLowerCase().includes(q));
  count.textContent=filtered.length+" cryptocurrencies loaded";
  grid.innerHTML=filtered.length?filtered.map(c=>{
    const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);
    return '<a class="crypto-directory-card" href="crypto.html?coin='+encodeURIComponent(c.id)+'">'+
      '<img src="'+logoFor(c)+'" alt="'+String(c.name||"Crypto")+' logo" loading="lazy" onerror="this.onerror=null;this.src=\'https://assets.coincap.io/assets/icons/'+encodeURIComponent(String(c.symbol||"").toLowerCase())+'@2x.png\';this.style.background=\'#17181c\';">'+
      '<span class="crypto-directory-info"><b>'+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+'</small></span>'+
      '<strong>'+(Number.isFinite(Number(c.current_price))?"$"+Number(c.current_price).toLocaleString("en-US",{maximumFractionDigits:Number(c.current_price)>=1?2:8}):"--")+'</strong>'+
      '<span class="'+(ch>=0?"positive":"negative")+'">'+(Number.isFinite(ch)?(ch>=0?"+":"")+ch.toFixed(2)+"%":"--")+'</span>'+
      '</a>';
  }).join(""):'<div class="exchange-directory-empty">No cryptocurrency found.</div>';
}

async function load(){
  if(loading)return;
  loading=true;
  more.disabled=true;
  more.textContent="Loading...";
  const nextPage=page+1;
  try{
    const r=await fetch(API+nextPage+"&sparkline=false&price_change_percentage=24h,7d,30d",{cache:"no-store"});
    const body=await r.text();
    if(!r.ok)throw new Error(body||("HTTP "+r.status));
    const rows=JSON.parse(body);
    if(!Array.isArray(rows))throw new Error("Invalid cryptocurrency response");
    page=nextPage;
    allCoins=allCoins.concat(rows);
    render();
    more.disabled=rows.length<100;
    more.textContent=rows.length<100?"No more":"Load more";
  }catch(error){
    console.error("Crypto directory error:",error);
    if(!allCoins.length){
      grid.innerHTML='<div class="exchange-directory-empty">Cryptocurrency data is temporarily unavailable. Refresh the page in a moment.</div>';
      count.textContent="Could not load cryptocurrencies";
    }
    more.disabled=false;
    more.textContent="Try again";
  }finally{
    loading=false;
  }
}

input.addEventListener("input",render);
more.addEventListener("click",load);
load();
