const grid=document.getElementById("othersGrid");
const input=document.getElementById("othersSearch");
const count=document.getElementById("othersCount");
const status=document.getElementById("othersStatus");
const pagination=document.getElementById("othersPagination");
const favoritesGrid=document.getElementById("othersFavorites");
const favoritesSection=document.getElementById("othersFavoritesSection");

const API_BASES=[...new Set([
  (window.GUGEE_API_BASE||"").replace(/\/$/,""),
  window.location.origin.replace(/\/$/,"")
])].filter(Boolean);

const FAVORITES_KEY="gugeeFavoriteCryptos";
const MAX_FAVORITES=5;
const PER_PAGE=10;
let allCoins=[];
let currentPage=1;
let loading=false;

function getFavorites(){
  try{
    const value=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]");
    return Array.isArray(value)?value.slice(0,MAX_FAVORITES):[];
  }catch{return []}
}

function saveFavorites(items){
  localStorage.setItem(FAVORITES_KEY,JSON.stringify(items.slice(0,MAX_FAVORITES)));
}

function esc(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[char]));
}

function logoFor(coin){
  return coin.image||("https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(coin.symbol||"").toLowerCase())+"@2x.png");
}

function formatPrice(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)return"--";
  if(n===0)return"$0.00";
  if(n>=1000)return"$"+n.toLocaleString("en-US",{maximumFractionDigits:2});
  if(n>=1)return"$"+n.toLocaleString("en-US",{maximumFractionDigits:4});
  if(n>=0.01)return"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:6});
  if(n>=0.000001)return"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:10});
  return"$"+n.toLocaleString("en-US",{maximumFractionDigits:14});
}

function compact(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0
    ?new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(n)
    :"--";
}

function change(value){
  const n=Number(value);
  return Number.isFinite(n)
    ?{text:(n>=0?"+":"")+n.toFixed(2)+"%",cls:n>0?"positive":n<0?"negative":"neutral"}
    :{text:"--",cls:"neutral"};
}

function change24(coin){return coin.price_change_percentage_24h_in_currency??coin.price_change_percentage_24h}
function change7(coin){return coin.price_change_percentage_7d_in_currency??coin.price_change_percentage_7d}
function change30(coin){return coin.price_change_percentage_30d_in_currency??coin.price_change_percentage_30d}
function isFavorite(id){return getFavorites().some(item=>item.id===id)}

function toggleFavorite(id){
  const coin=allCoins.find(item=>item.id===id);
  if(!coin)return;
  let favorites=getFavorites();
  if(isFavorite(id)){
    favorites=favorites.filter(item=>item.id!==id);
  }else{
    if(favorites.length>=MAX_FAVORITES){
      alert("You can select up to 5 favorite cryptocurrencies.");
      return;
    }
    favorites.push({
      id:coin.id,
      name:coin.name,
      symbol:coin.symbol,
      image:coin.image,
      current_price:coin.current_price,
      price_change_percentage_24h:coin.price_change_percentage_24h,
      price_change_percentage_7d_in_currency:coin.price_change_percentage_7d_in_currency,
      price_change_percentage_30d_in_currency:coin.price_change_percentage_30d_in_currency,
      market_cap:coin.market_cap,
      total_volume:coin.total_volume
    });
  }
  saveFavorites(favorites);
  render();
}

function card(coin){
  const d24=change(change24(coin));
  const d7=change(change7(coin));
  const d30=change(change30(coin));
  const rank=coin.market_cap_rank?"#"+coin.market_cap_rank:"";
  return `<article class="others-coin-card">
    <button class="crypto-favorite-button ${isFavorite(coin.id)?"active":""}" data-favorite="${esc(coin.id)}" aria-label="${isFavorite(coin.id)?"Remove from favorites":"Add to favorites"}">${isFavorite(coin.id)?"★":"☆"}</button>
    <a class="others-coin-main" href="crypto.html?coin=${encodeURIComponent(coin.id)}">
      <div class="others-coin-head">
        <img src="${esc(logoFor(coin))}" alt="${esc(coin.name||"Crypto")} logo" loading="lazy">
        <div><b>${esc(coin.name||"Unknown")}</b><small>${esc(String(coin.symbol||"").toUpperCase())} ${rank}</small></div>
      </div>
      <div class="others-price-row">
        <strong>${formatPrice(coin.current_price)}</strong>
        <span class="${d24.cls}">${d24.text}</span>
      </div>
      <div class="others-metrics">
        <div><span>24H</span><b class="${d24.cls}">${d24.text}</b></div>
        <div><span>7D</span><b class="${d7.cls}">${d7.text}</b></div>
        <div><span>30D</span><b class="${d30.cls}">${d30.text}</b></div>
      </div>
      <div class="others-market-row">
        <span>Market Cap</span><b>${compact(coin.market_cap)}</b>
        <span>Volume</span><b>${compact(coin.total_volume)}</b>
      </div>
      <div class="others-analysis-link">Open full analysis →</div>
    </a>
  </article>`;
}

function bindFavorites(root){
  root.querySelectorAll("[data-favorite]").forEach(button=>{
    button.addEventListener("click",event=>{
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(button.dataset.favorite);
    });
  });
}

function filteredCoins(){
  const query=input.value.trim().toLowerCase();
  const favoriteIds=new Set(getFavorites().map(item=>item.id));
  return allCoins.filter(coin=>{
    if(favoriteIds.has(coin.id))return false;
    if(!query)return true;
    return String(coin.name||"").toLowerCase().includes(query)||
      String(coin.symbol||"").toLowerCase().includes(query)||
      String(coin.id||"").toLowerCase().includes(query);
  });
}

function renderFavorites(){
  const favorites=getFavorites().map(saved=>allCoins.find(coin=>coin.id===saved.id)||saved);
  if(!favorites.length){
    favoritesSection.style.display="none";
    favoritesGrid.innerHTML="";
    return;
  }
  favoritesSection.style.display="";
  favoritesGrid.innerHTML=favorites.map(card).join("");
  bindFavorites(favoritesGrid);
}

function renderPagination(total){
  const pages=Math.max(1,Math.ceil(total/PER_PAGE));
  currentPage=Math.min(currentPage,pages);
  if(pages<=1){
    pagination.innerHTML="";
    return;
  }

  const buttons=[];
  const start=Math.max(1,currentPage-2);
  const end=Math.min(pages,start+4);

  buttons.push('<button class="others-page-btn" data-page="'+Math.max(1,currentPage-1)+'" '+(currentPage===1?"disabled":"")+'>←</button>');
  for(let page=start;page<=end;page++){
    buttons.push('<button class="others-page-btn '+(page===currentPage?"active":"")+'" data-page="'+page+'">'+page+'</button>');
  }
  buttons.push('<button class="others-page-btn" data-page="'+Math.min(pages,currentPage+1)+'" '+(currentPage===pages?"disabled":"")+'>→</button>');
  buttons.push('<span class="others-page-dots">Page '+currentPage+' / '+pages+'</span>');

  pagination.innerHTML=buttons.join("");
  pagination.querySelectorAll("[data-page]").forEach(button=>{
    button.addEventListener("click",()=>{
      const page=Number(button.dataset.page);
      if(!page||page===currentPage)return;
      currentPage=page;
      render();
      window.scrollTo({top:0,behavior:"smooth"});
    });
  });
}

function render(){
  renderFavorites();
  const filtered=filteredCoins();
  const pages=Math.max(1,Math.ceil(filtered.length/PER_PAGE));
  if(currentPage>pages)currentPage=pages;
  const start=(currentPage-1)*PER_PAGE;
  const rows=filtered.slice(start,start+PER_PAGE);

  count.textContent=allCoins.length+" cryptocurrencies • "+filtered.length+" in list";
  grid.innerHTML=rows.length
    ?rows.map(card).join("")
    :'<div class="exchange-directory-empty">No cryptocurrency found.</div>';
  bindFavorites(grid);
  renderPagination(filtered.length);
  status.textContent="Page "+currentPage+" • "+rows.length+" shown • live data";
}

async function fetchServerList(){
  let lastError=null;
  for(const base of API_BASES){
    try{
      const response=await fetch(base+"/api/coingecko/top1000",{cache:"no-store",headers:{accept:"application/json"}});
      const body=await response.text();
      if(!response.ok)throw new Error(body||("HTTP "+response.status));
      const payload=JSON.parse(body);
      if(!payload||!Array.isArray(payload.coins)||payload.coins.length<900){
        throw new Error("Invalid server crypto list");
      }
      const unique=new Map();
      payload.coins.forEach(coin=>{
        if(coin&&coin.id)unique.set(coin.id,coin);
      });
      return Array.from(unique.values()).slice(0,1000);
    }catch(error){
      lastError=error;
    }
  }
  throw lastError||new Error("Gugee API unavailable");
}

async function load(){
  if(loading)return;
  loading=true;
  status.textContent="Updating live market data...";
  try{
    allCoins=await fetchServerList();
    render();
  }catch(error){
    console.error("Others crypto directory error:",error);
    status.textContent="Live data unavailable";
    if(!allCoins.length){
      count.textContent="0 cryptocurrencies";
      grid.innerHTML='<div class="exchange-directory-empty">Could not load the 1000 cryptocurrencies. Please refresh the page.</div>';
      pagination.innerHTML="";
    }
  }finally{
    loading=false;
  }
}

input.addEventListener("input",()=>{
  currentPage=1;
  render();
});

window.addEventListener("storage",event=>{
  if(event.key===FAVORITES_KEY){
    currentPage=1;
    render();
  }
});

load();
setInterval(load,60000);
