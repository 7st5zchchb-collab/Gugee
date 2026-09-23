const grid=document.getElementById("othersGrid");
const input=document.getElementById("othersSearch");
const count=document.getElementById("othersCount");
const status=document.getElementById("othersStatus");

const API_BASES=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
const DIRECT_COIN_GECKO="https://api.coingecko.com/api/v3/coins/markets";
const API=API_BASES[0]+"/api/coingecko/top1000";
const FAVORITES_KEY="gugeeFavoriteCryptos";
const MAX_FAVORITES=5;
let allCoins=[],loading=false;

function getFavorites(){
  try{
    const value=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]");
    return Array.isArray(value)?value.slice(0,MAX_FAVORITES):[];
  }catch{return [];}
}
function saveFavorites(items){localStorage.setItem(FAVORITES_KEY,JSON.stringify(items.slice(0,MAX_FAVORITES)));}
function logoFor(c){return c.image||("https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(c.symbol||"").toLowerCase())+"@2x.png");}

function toggleFavorite(id){
  const coin=allCoins.find(c=>c.id===id);
  if(!coin)return;
  let favorites=getFavorites();
  if(favorites.some(x=>x.id===id)){
    favorites=favorites.filter(x=>x.id!==id);
  }else{
    if(favorites.length>=MAX_FAVORITES){
      alert("You can select up to 5 favorite cryptocurrencies.");
      return;
    }
    favorites.push({id:coin.id,name:coin.name,symbol:coin.symbol,image:coin.image,current_price:coin.current_price,price_change_percentage_24h:coin.price_change_percentage_24h});
  }
  saveFavorites(favorites);
  render();
}

function card(c){
  const price=Number(c.current_price);
  const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);
  const fav=getFavorites().some(x=>x.id===c.id);
  return '<div class="crypto-directory-card">'+
    '<button class="crypto-favorite-button '+(fav?"active":"")+'" data-favorite="'+String(c.id).replace(/"/g,"&quot;")+'" title="'+(fav?"Remove from favorites":"Add to favorites")+'">'+(fav?"★":"☆")+'</button>'+
    '<a class="crypto-directory-main" href="crypto.html?coin='+encodeURIComponent(c.id)+'">'+
    '<img src="'+logoFor(c)+'" alt="'+String(c.name||"Crypto")+' logo" loading="lazy" onerror="this.onerror=null;this.src=\'https://assets.coincap.io/assets/icons/'+encodeURIComponent(String(c.symbol||"").toLowerCase())+'@2x.png\';">'+
    '<span class="crypto-directory-info"><b>'+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+'</small></span>'+
    '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--")+'</strong>'+
    '<span class="'+(ch>=0?"positive":"negative")+'">'+(Number.isFinite(ch)&&price>0?(ch>=0?"+":"")+ch.toFixed(2)+"%":"Live")+'</span>'+
    '</a></div>';
}

function render(){
  const q=input.value.trim().toLowerCase();
  const favorites=new Set(getFavorites().map(x=>x.id));
  const filtered=allCoins.filter(c=>!q||String(c.name||"").toLowerCase().includes(q)||String(c.symbol||"").toLowerCase().includes(q)||String(c.id||"").toLowerCase().includes(q));
  count.textContent=(filtered.length||allCoins.length)+" cryptocurrencies";
  grid.innerHTML=filtered.length?filtered.map(card).join(""):'<div class="exchange-directory-empty">No cryptocurrency found.</div>';
  grid.querySelectorAll("[data-favorite]").forEach(button=>button.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(button.dataset.favorite);
  }));
}

async function fetchServerList(){
  let lastError=null;
  for(const base of API_BASES){
    try{
      const r=await fetch(base+"/api/coingecko/top1000",{cache:"no-store",headers:{accept:"application/json"}});
      const body=await r.text();
      if(!r.ok)throw new Error(body||("HTTP "+r.status));
      const payload=JSON.parse(body);
      if(!payload||!Array.isArray(payload.coins)||payload.coins.length<900)throw new Error("Invalid server crypto list");
      return payload.coins.slice(0,1000);
    }catch(error){lastError=error;}
  }
  throw lastError||new Error("Gugee API unavailable");
}
async function fetchLegacyServerList(){
  const pages=[1,2,3,4];
  const loaded=[];
  for(const page of pages){
    const r=await fetch(DIRECT_COIN_GECKO+"?vs_currency=usd&order=market_cap_desc&per_page=250&page="+page+"&sparkline=false&price_change_percentage=24h",{cache:"no-store",headers:{accept:"application/json"}});
    const body=await r.text();
    if(!r.ok)throw new Error(body||("CoinGecko HTTP "+r.status));
    const rows=JSON.parse(body);
    if(!Array.isArray(rows)||!rows.length)throw new Error("Invalid CoinGecko page "+page);
    loaded.push(...rows);
  }
  return loaded.slice(0,1000);
}
async function load(){
  if(loading)return;
  loading=true;
  status.textContent="Loading 1000 cryptocurrencies...";
  if(!grid.children.length)grid.innerHTML='<div class="exchange-directory-empty">Loading 1000 cryptocurrency cards...</div>';
  try{
    let coins;
    try{
      coins=await fetchServerList();
    }catch(serverError){
      console.warn("Gugee API failed, using CoinGecko fallback:",serverError);
      coins=await fetchLegacyServerList();
    }
    const map=new Map();
    coins.forEach(c=>map.set(c.id,c));
    allCoins=Array.from(map.values()).slice(0,1000);
    count.textContent=allCoins.length+" cryptocurrencies";
    status.textContent=allCoins.length+" loaded";
    render();
  }catch(error){
    console.error("Others directory error:",error);
    allCoins=[];
    count.textContent="0 cryptocurrencies";
    status.textContent="Loading failed";
    if(!grid.children.length)grid.innerHTML='<div class="exchange-directory-empty">Could not load the 1000 cryptocurrencies. Please refresh the page.</div>';
  }finally{
    loading=false;
  }
}
input.addEventListener("input",render);
window.addEventListener("storage",event=>{if(event.key===FAVORITES_KEY)render();});
load();