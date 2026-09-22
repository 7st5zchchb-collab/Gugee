const grid=document.getElementById("othersGrid");
const input=document.getElementById("othersSearch");
const count=document.getElementById("othersCount");
const status=document.getElementById("othersStatus");

const API="/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=";
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

async function load(){
  if(loading)return;
  loading=true;
  status.textContent="Loading 1000...";
  try{
    const loaded=[];
    for(const page of [1,2,3,4]){
      status.textContent="Loading "+Math.min(page*250,1000)+"/1000...";
      const r=await fetch(API+page+"&sparkline=false&price_change_percentage=24h,7d,30d",{cache:"no-store"});
      const body=await r.text();
      if(!r.ok)throw new Error(body||("HTTP "+r.status));
      const rows=JSON.parse(body);
      if(!Array.isArray(rows)||!rows.length)throw new Error("Invalid response");
      loaded.push(...rows);
    }
    const map=new Map();
    loaded.forEach(c=>map.set(c.id,c));
    allCoins=Array.from(map.values()).slice(0,1000);
    status.textContent="1000 loaded";
    render();
  }catch(error){
    console.error("Others directory error:",error);
    status.textContent="Live list unavailable";
    render();
  }finally{loading=false;}
}

input.addEventListener("input",render);
load();