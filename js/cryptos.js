const input=document.getElementById("cryptoDirectorySearch");
const count=document.getElementById("cryptoDirectoryCount");
const favoritesGrid=document.getElementById("cryptoFavoritesGrid");
const favoritesCount=document.getElementById("cryptoFavoritesCount");
const loadStatus=document.getElementById("cryptoLoadStatus");
const othersPreview=document.getElementById("cryptoOthersPreview");

const API_BASES=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,"")])].filter(Boolean);
const FAVORITES_KEY="gugeeFavoriteCryptos";
const MAX_FAVORITES=5;
const PAGE_SIZE=10;
let allCoins=[],loading=false,currentPage=1;
try{
 const cached=JSON.parse(localStorage.getItem("gugeeTopCoinsCache")||"null");
 if(cached&&Array.isArray(cached.coins)&&cached.coins.length){
  allCoins=cached.coins;
  queueMicrotask(()=>{render();renderFavorites();});
 }
}catch{}



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
    favorites.push({id:coin.id,name:coin.name,symbol:coin.symbol,image:coin.image,current_price:coin.current_price,price_change_percentage_24h:coin.price_change_percentage_24h,price_change_percentage_7d_in_currency:coin.price_change_percentage_7d_in_currency,price_change_percentage_30d_in_currency:coin.price_change_percentage_30d_in_currency,market_cap:coin.market_cap,total_volume:coin.total_volume});
  }
  saveFavorites(favorites);
  renderFavorites();
  render();
}

function changeValue(v){
  const n=v==null?NaN:Number(v);
  return Number.isFinite(n)?(n>=0?"+":"")+n.toFixed(2)+"%":"--";
}
function changeClass(v){
  const n=v==null?NaN:Number(v);
  return n>0?"positive":n<0?"negative":"neutral";
}
function compactValue(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>0?new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(n):"--";
}
function coinCard(c){
 const price=Number(c.current_price),d24=c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h,d7=c.price_change_percentage_7d_in_currency??c.price_change_percentage_7d,d30=c.price_change_percentage_30d_in_currency??c.price_change_percentage_30d;
 const fav=isFavorite(c.id),id=encodeURIComponent(c.id),name=esc(c.name||"Unknown"),symbol=esc(String(c.symbol||"").toUpperCase());
 return '<div class="crypto-directory-card" role="link" tabindex="0" data-coin-link="'+id+'">'+
 '<button type="button" class="crypto-favorite-button '+(fav?"active":"")+'" data-favorite="'+esc(c.id)+'" aria-label="'+(fav?"Remove from favorites":"Add to favorites")+'">'+(fav?"★":"☆")+'</button>'+
 '<a class="crypto-directory-main" href="crypto.html?coin='+id+'">'+
 '<img src="'+esc(logoFor(c))+'" alt="'+name+' logo" loading="lazy">'+
 '<span class="crypto-directory-info"><b>'+name+'</b><small>'+symbol+'</small></span>'+
 '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}): "$0.00")+'</strong>'+
 '<span class="'+changeClass(d24)+'">'+changeValue(d24)+'</span>'+
 '<small class="crypto-directory-extra">24H '+changeValue(d24)+' · 7D '+changeValue(d7)+' · 30D '+changeValue(d30)+' · MC '+compactValue(c.market_cap)+' · Vol '+compactValue(c.total_volume)+'</small>'+
 '</a></div>';
}
function esc(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
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
  count.textContent=allCoins.length+" cryptocurrencies • "+filtered.length+" in list";
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
    const price=Number(live.current_price); const ch=Number(live.price_change_percentage_24h_in_currency??live.price_change_percentage_24h);
    return '<div class="crypto-favorite-card">'+
      '<a href="crypto.html?coin='+encodeURIComponent(live.id)+'" class="crypto-favorite-link">'+
      '<img src="'+esc(logoFor(live))+'" alt="'+esc(live.name||"Crypto")+' logo" loading="lazy">'+
      '<span><b>'+esc(live.name||"Unknown")+'</b><small>'+esc(String(live.symbol||"").toUpperCase())+'</small></span>'+
      '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--")+'</strong>'+
      '</a><button class="crypto-favorite-remove" data-favorite="'+String(live.id).replace(/"/g,"&quot;")+'" title="Remove">×</button></div>';
  }).join("");
  favoritesGrid.querySelectorAll(".crypto-favorite-remove").forEach(button=>button.addEventListener("click",()=>toggleFavorite(button.dataset.favorite)));
}

async function load(){
 if(loading)return;
 loading=true;if(!allCoins.length)loadStatus.textContent="Updating cryptocurrencies...";else loadStatus.textContent=allCoins.length+" cached · updating live...";
 try{
  const payload=await window.gugeeMarketData.fetch("/api/coingecko/top1000");
  if(!Array.isArray(payload?.coins)||!payload.coins.length)throw Error("No live coins returned");
  allCoins=[...new Map(payload.coins.filter(x=>x?.id).map(x=>[x.id,x])).values()].slice(0,1000);
  try{localStorage.setItem("gugeeTopCoinsCache",JSON.stringify({time:Date.now(),coins:allCoins}));}catch{}
  currentPage=1;loadStatus.textContent=allCoins.length+" loaded"+(payload.partial?" · partial coverage":"");
  render();renderFavorites();
 }catch(error){
  console.error("Crypto directory error:",error);loadStatus.textContent="Live list unavailable";
  if(!allCoins.length){othersPreview.innerHTML='<div class="exchange-directory-empty">Live data unavailable. Please try again.</div>';count.textContent="0 cryptocurrencies"}
 }finally{loading=false}
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
window.addEventListener("gugee-market-update",event=>{if(event.detail?.path!=="/api/coingecko/top1000")return;const coins=event.detail.value?.coins;if(!Array.isArray(coins)||!coins.length)return;allCoins=coins;try{localStorage.setItem("gugeeTopCoinsCache",JSON.stringify({time:Date.now(),coins}));}catch{}loadStatus.textContent=allCoins.length+" loaded"+(event.detail.value.partial?" · partial coverage":"");render();renderFavorites();});
