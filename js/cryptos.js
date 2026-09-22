const grid=document.getElementById("cryptoDirectoryGrid");
const input=document.getElementById("cryptoDirectorySearch");
const count=document.getElementById("cryptoDirectoryCount");
const favoritesGrid=document.getElementById("cryptoFavoritesGrid");
const favoritesCount=document.getElementById("cryptoFavoritesCount");
const loadStatus=document.getElementById("cryptoLoadStatus");

const API="/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=";
const FAVORITES_KEY="gugeeFavoriteCryptos";
const MAX_FAVORITES=5;
let allCoins=[],loading=false;

const fallbackCoins=[
{id:"bitcoin",name:"Bitcoin",symbol:"btc",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/1/large/bitcoin.png"},
{id:"ethereum",name:"Ethereum",symbol:"eth",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/279/large/ethereum.png"},
{id:"tether",name:"Tether",symbol:"usdt",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/325/large/Tether.png"},
{id:"binancecoin",name:"BNB",symbol:"bnb",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png"},
{id:"solana",name:"Solana",symbol:"sol",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/4128/large/solana.png"},
{id:"ripple",name:"XRP",symbol:"xrp",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png"},
{id:"usd-coin",name:"USDC",symbol:"usdc",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/6319/large/usdc.png"},
{id:"dogecoin",name:"Dogecoin",symbol:"doge",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/5/large/dogecoin.png"}
];

function logoFor(c){
  return c.image||("https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(c.symbol||"").toLowerCase())+"@2x.png");
}

function getFavorites(){
  try{
    const value=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]");
    return Array.isArray(value)?value.slice(0,MAX_FAVORITES):[];
  }catch{return [];}
}

function saveFavorites(items){
  localStorage.setItem(FAVORITES_KEY,JSON.stringify(items.slice(0,MAX_FAVORITES)));
}

function isFavorite(id){
  return getFavorites().some(x=>x.id===id);
}

function toggleFavorite(id){
  const coin=allCoins.find(c=>c.id===id);
  if(!coin)return;
  let favorites=getFavorites();
  const exists=favorites.some(x=>x.id===id);
  if(exists){
    favorites=favorites.filter(x=>x.id!==id);
  }else{
    if(favorites.length>=MAX_FAVORITES){
      alert("You can select up to 5 favorite cryptocurrencies.");
      return;
    }
    favorites.push({id:coin.id,name:coin.name,symbol:coin.symbol,image:coin.image,current_price:coin.current_price,price_change_percentage_24h:coin.price_change_percentage_24h});
  }
  saveFavorites(favorites);
  renderFavorites();
  render();
}

function coinCard(c){
  const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);
  const price=Number(c.current_price);
  const fav=isFavorite(c.id);
  return '<div class="crypto-directory-card" role="link" tabindex="0" data-coin-link="'+encodeURIComponent(c.id)+'">'+
    '<button class="crypto-favorite-button '+(fav?"active":"")+'" data-favorite="'+String(c.id).replace(/"/g,"&quot;")+'" aria-label="'+(fav?"Remove from favorites":"Add to favorites")+'" title="'+(fav?"Remove from favorites":"Add to favorites")+'">'+(fav?"★":"☆")+'</button>'+
    '<a class="crypto-directory-main" href="crypto.html?coin='+encodeURIComponent(c.id)+'">'+
    '<img src="'+logoFor(c)+'" alt="'+String(c.name||"Crypto")+' logo" loading="lazy" onerror="this.onerror=null;this.src=\'https://assets.coincap.io/assets/icons/'+encodeURIComponent(String(c.symbol||"").toLowerCase())+'@2x.png\';">'+
    '<span class="crypto-directory-info"><b>'+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+'</small></span>'+
    '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--")+'</strong>'+
    '<span class="'+(ch>=0?"positive":"negative")+'">'+(Number.isFinite(ch)&&price>0?(ch>=0?"+":"")+ch.toFixed(2)+"%":"Live")+'</span>'+
    '</a></div>';
}

function render(){
  const q=input.value.trim().toLowerCase();
  const favoriteIds=new Set(getFavorites().map(x=>x.id));
  const filtered=allCoins.filter(c=>!favoriteIds.has(c.id)&&(!q||String(c.name||"").toLowerCase().includes(q)||String(c.symbol||"").toLowerCase().includes(q)||String(c.id||"").toLowerCase().includes(q)));
  count.textContent=filtered.length+" cryptocurrencies";
  grid.innerHTML=filtered.length?filtered.map(coinCard).join(""):'<div class="exchange-directory-empty">No cryptocurrency found.</div>';
  grid.querySelectorAll(".crypto-directory-card[data-coin-link]").forEach(card=>{
    const openCoin=()=>{ window.location.href="crypto.html?coin="+decodeURIComponent(card.dataset.coinLink); };
    card.addEventListener("click",event=>{
      if(event.target.closest("[data-favorite]"))return;
      openCoin();
    });
    card.addEventListener("keydown",event=>{
      if((event.key==="Enter"||event.key===" ")&&!event.target.closest("[data-favorite]")){
        event.preventDefault();
        openCoin();
      }
    });
  });
  grid.querySelectorAll("[data-favorite]").forEach(button=>{
    button.addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(button.dataset.favorite);
    });
  });
}

function renderFavorites(){
  const favorites=getFavorites();
  favoritesCount.textContent=favorites.length+" / "+MAX_FAVORITES;
  if(!favorites.length){
    favoritesGrid.innerHTML='<div class="crypto-favorites-empty">Choose up to 5 cryptocurrencies below. Your selections stay saved in this browser.</div>';
    return;
  }
  favoritesGrid.innerHTML=favorites.map(c=>{
    const live=allCoins.find(x=>x.id===c.id)||c;
    const price=Number(live.current_price);
    const ch=Number(live.price_change_percentage_24h_in_currency??live.price_change_percentage_24h);
    return '<div class="crypto-favorite-card">'+
      '<a href="crypto.html?coin='+encodeURIComponent(live.id)+'" class="crypto-favorite-link">'+
      '<img src="'+logoFor(live)+'" alt="'+String(live.name||"Crypto")+' logo" onerror="this.onerror=null;this.src=\'https://assets.coincap.io/assets/icons/'+encodeURIComponent(String(live.symbol||"").toLowerCase())+'@2x.png\';">'+
      '<span><b>'+String(live.name||"Unknown")+'</b><small>'+String(live.symbol||"").toUpperCase()+'</small></span>'+
      '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--")+'</strong>'+
      '</a><button class="crypto-favorite-remove" data-favorite="'+String(live.id).replace(/"/g,"&quot;")+'" title="Remove">×</button></div>';
  }).join("");
  favoritesGrid.querySelectorAll(".crypto-favorite-remove").forEach(button=>{
    button.addEventListener("click",()=>toggleFavorite(button.dataset.favorite));
  });
}

async function load(){
  if(loading)return;
  loading=true;
  loadStatus.textContent="Loading 1000...";
  if(!allCoins.length){
    allCoins=fallbackCoins.slice();
    render();
    renderFavorites();
  }
  try{
    const pages=[1,2,3,4];
    const loaded=[];
    for(const page of pages){
      loadStatus.textContent="Loading "+Math.min(page*250,1000)+"/1000...";
      const r=await fetch(API+page+"&sparkline=false&price_change_percentage=24h,7d,30d",{cache:"no-store"});
      const body=await r.text();
      if(!r.ok)throw new Error(body||("HTTP "+r.status));
      const rows=JSON.parse(body);
      if(!Array.isArray(rows)||!rows.length)throw new Error("Invalid cryptocurrency response on page "+page);
      loaded.push(...rows);
    }
    const map=new Map();
    [...fallbackCoins,...loaded].forEach(c=>map.set(c.id,c));
    allCoins=Array.from(map.values()).slice(0,1000);
    loadStatus.textContent="1000 loaded";
    render();
    renderFavorites();
  }catch(error){
    console.error("Crypto directory error:",error);
    loadStatus.textContent="Live list unavailable — showing saved fallback";
    render();
    renderFavorites();
  }finally{
    loading=false;
  }
}

input.addEventListener("input",render);
renderFavorites();
render();
load();
