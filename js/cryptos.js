const input=document.getElementById("cryptoDirectorySearch");
const count=document.getElementById("cryptoDirectoryCount");
const favoritesGrid=document.getElementById("cryptoFavoritesGrid");
const favoritesCount=document.getElementById("cryptoFavoritesCount");
const loadStatus=document.getElementById("cryptoLoadStatus");
const othersPreview=document.getElementById("cryptoOthersPreview");

const API_BASES=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
const DIRECT_COIN_GECKO="https://api.coingecko.com/api/v3/coins/markets";
const FAVORITES_KEY="gugeeFavoriteCryptos";
const MAX_FAVORITES=5;
const PAGE_SIZE=100;
let allCoins=[],loading=false,currentPage=1;

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
function saveFavorites(items){localStorage.setItem(FAVORITES_KEY,JSON.stringify(items.slice(0,MAX_FAVORITES)));}
function isFavorite(id){return getFavorites().some(x=>x.id===id);}

function toggleFavorite(id){
  const coin=allCoins.find(c=>c.id===id);
  if(!coin)return;
  let favorites=getFavorites();
  const exists=favorites.some(x=>x.id===id);
  if(exists) favorites=favorites.filter(x=>x.id!==id);
  else{
    if(favorites.length>=MAX_FAVORITES){alert("You can select up to 5 favorite cryptocurrencies.");return;}
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
    '<img src="'+logoFor(c)+'" alt="'+String(c.name||"Crypto")+' logo" loading="lazy">'+
    '<span class="crypto-directory-info"><b>'+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+'</small></span>'+
    '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--")+'</strong>'+
    '<span class="'+(ch>=0?"positive":"negative")+'">'+(Number.isFinite(ch)&&price>0?(ch>=0?"+":"")+ch.toFixed(2)+"%":"Live")+'</span>'+
    '</a></div>';
}

function attachCards(){
  othersPreview.querySelectorAll(".crypto-directory-card[data-coin-link]").forEach(card=>{
    const openCoin=()=>{window.location.href="crypto.html?coin="+decodeURIComponent(card.dataset.coinLink);};
    card.addEventListener("click",event=>{if(event.target.closest("[data-favorite]"))return;openCoin();});
    card.addEventListener("keydown",event=>{
      if((event.key==="Enter"||event.key===" ")&&!event.target.closest("[data-favorite]")){event.preventDefault();openCoin();}
    });
  });
  othersPreview.querySelectorAll("[data-favorite]").forEach(button=>{
    button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();toggleFavorite(button.dataset.favorite);});
  });
}

function ensurePagination(){
  let box=document.getElementById("cryptoPagination");
  if(!box){
    box=document.createElement("div");
    box.id="cryptoPagination";
    box.className="crypto-pagination";
    othersPreview.parentElement.appendChild(box);
  }
  return box;
}

function renderPagination(totalPages){
  const box=ensurePagination();
  if(totalPages<=1){box.innerHTML="";box.style.display="none";return;}
  box.style.display="flex";
  const buttons=[];
  const start=Math.max(1,currentPage-2);
  const end=Math.min(totalPages,start+4);
  for(let p=start;p<=end;p++) buttons.push('<button type="button" class="'+(p===currentPage?"active":"")+'" data-page="'+p+'">'+p+'</button>');
  box.innerHTML=
    '<button type="button" class="crypto-page-arrow" data-page="'+Math.max(1,currentPage-1)+'" '+(currentPage===1?"disabled":"")+' aria-label="Previous page">‹</button>'+
    buttons.join("")+
    '<button type="button" class="crypto-page-arrow" data-page="'+Math.min(totalPages,currentPage+1)+'" '+(currentPage===totalPages?"disabled":"")+' aria-label="Next page">›</button>'+
    '<span class="crypto-page-label">Page '+currentPage+' / '+totalPages+'</span>';
  box.querySelectorAll("button[data-page]").forEach(button=>button.addEventListener("click",()=>{
    const page=Number(button.dataset.page);
    if(page===currentPage)return;
    currentPage=page;
    render();
    othersPreview.scrollIntoView({behavior:"smooth",block:"start"});
  }));
}

function render(){
  if(!othersPreview)return;
  const q=input.value.trim().toLowerCase();
  const favoriteIds=new Set(getFavorites().map(x=>x.id));
  const filtered=allCoins.filter(c=>!favoriteIds.has(c.id)&&(!q||String(c.name||"").toLowerCase().includes(q)||String(c.symbol||"").toLowerCase().includes(q)||String(c.id||"").toLowerCase().includes(q)));
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  if(currentPage>totalPages)currentPage=totalPages;
  const start=(currentPage-1)*PAGE_SIZE;
  const pageItems=filtered.slice(start,start+PAGE_SIZE);
  count.textContent=(allCoins.length||1000)+" cryptocurrencies";
  othersPreview.innerHTML=pageItems.length?pageItems.map(coinCard).join(""):'<div class="exchange-directory-empty">No cryptocurrency found.</div>';
  attachCards();
  renderPagination(totalPages);
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
    return '<div class="crypto-favorite-card">'+
      '<a href="crypto.html?coin='+encodeURIComponent(live.id)+'" class="crypto-favorite-link">'+
      '<img src="'+logoFor(live)+'" alt="'+String(live.name||"Crypto")+' logo" loading="lazy">'+
      '<span><b>'+String(live.name||"Unknown")+'</b><small>'+String(live.symbol||"").toUpperCase()+'</small></span>'+
      '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--")+'</strong>'+
      '</a><button class="crypto-favorite-remove" data-favorite="'+String(live.id).replace(/"/g,"&quot;")+'" title="Remove">×</button></div>';
  }).join("");
  favoritesGrid.querySelectorAll(".crypto-favorite-remove").forEach(button=>button.addEventListener("click",()=>toggleFavorite(button.dataset.favorite)));
}

async function load(){
  if(loading)return;
  loading=true;
  loadStatus.textContent="Loading cryptocurrencies...";
  if(!allCoins.length){
    allCoins=fallbackCoins.slice();
    render();
    renderFavorites();
  }
  try{
    let payload=null;
    let lastError=null;
    for(const base of API_BASES){
      try{
        const r=await fetch(base+"/api/coingecko/top1000",{cache:"no-store",headers:{accept:"application/json"}});
        const body=await r.text();
        if(!r.ok)throw new Error(body||("HTTP "+r.status));
        const parsed=JSON.parse(body);
        if(!parsed||!Array.isArray(parsed.coins)||parsed.coins.length<1)throw new Error("No cryptocurrency data");
        payload=parsed;
        break;
      }catch(error){lastError=error;}
    }
    if(!payload){
      const pages=await Promise.all([1,2,3,4].map(async page=>{
        const r=await fetch(DIRECT_COIN_GECKO+"?vs_currency=usd&order=market_cap_desc&per_page=250&page="+page+"&sparkline=false&price_change_percentage=24h",{cache:"no-store",headers:{accept:"application/json"}});
        const body=await r.text();
        if(!r.ok)throw new Error(body||("CoinGecko HTTP "+r.status));
        return JSON.parse(body);
      }));
      const map=new Map();
      pages.flat().forEach(coin=>map.set(coin.id,coin));
      payload={coins:Array.from(map.values()).slice(0,1000)};
    }
    if(!payload||!Array.isArray(payload.coins)||payload.coins.length<1)throw lastError||new Error("No cryptocurrency data");
    allCoins=payload.coins.slice(0,1000);
    currentPage=1;
    loadStatus.textContent=allCoins.length+" loaded";
    render();
    renderFavorites();
  }catch(error){
    console.error("Crypto directory error:",error);
    loadStatus.textContent="Live list unavailable";
    render();
    renderFavorites();
  }finally{loading=false;}
}



input.addEventListener("input",()=>{
  currentPage=1;
  render();
});

window.addEventListener("storage",event=>{
  if(event.key===FAVORITES_KEY){
    renderFavorites();
    render();
  }
});

load();

setInterval(()=>{load();},60000);
