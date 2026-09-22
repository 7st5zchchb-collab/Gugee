const searchForm = document.getElementById("cryptoSearch");
const searchInput = document.getElementById("searchInput");
const searchSuggestions = document.getElementById("searchSuggestions");
let searchTimer;

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (query.length < 2) { searchSuggestions.innerHTML = ""; searchSuggestions.classList.remove("show"); return; }
  searchTimer = setTimeout(async () => {
    try {
      const response = await fetch("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(query));
      if (!response.ok) throw new Error("Search request failed");
      const data = await response.json();
      const coins = (data.coins || []).slice(0, 6);
      searchSuggestions.innerHTML = coins.map(coin => '<button type="button" class="suggestion" data-coin="' + coin.id + '"><span class="suggestion-name">' + coin.name + '</span><span class="suggestion-symbol">' + (coin.symbol || "").toUpperCase() + '</span></button>').join("");
      searchSuggestions.classList.toggle("show", coins.length > 0);
      searchSuggestions.querySelectorAll(".suggestion").forEach(btn => btn.addEventListener("click", () => { window.location.href = "crypto.html?coin=" + encodeURIComponent(btn.dataset.coin); }));
    } catch (error) { console.error("Gugee search:", error); }
  }, 300);
});

document.addEventListener("click", event => { if (!searchForm.contains(event.target)) searchSuggestions?.classList.remove("show"); });

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) {
    searchInput.focus();
    return;
  }
  window.location.href = `crypto.html?coin=${encodeURIComponent(query)}`;
});

document.querySelectorAll(".coin-link").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.href = `crypto.html?coin=${encodeURIComponent(button.dataset.coin)}`;
  });
});

const marketCoins = ["bitcoin", "ethereum", "solana", "binancecoin"];
const marketCards = document.querySelectorAll(".market-card");

async function loadMarketSnapshot() {
  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" +
      marketCoins.join(",") + "&order=market_cap_desc&per_page=4&page=1&sparkline=false";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Market API request failed");
    const coins = await response.json();

    coins.forEach((coin) => {
      const index = marketCoins.indexOf(coin.id);
      const card = index >= 0 ? marketCards[index] : null;
      if (!card) return;
      const price = coin.current_price;
      const change = coin.price_change_percentage_24h;
      card.querySelector("strong").textContent = price == null ? "$--" : "$" + price.toLocaleString(undefined, {maximumSignificantDigits: 7});
      const changeEl = card.querySelector(".change");
      changeEl.textContent = change == null ? "--" : (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
      changeEl.style.color = change >= 0 ? "var(--green)" : "#ff5c5c";
    });
  } catch (error) {
    console.error("Gugee market snapshot:", error);
  }
}

loadMarketSnapshot();

const favoriteDefaults = {
  bitcoin: {name:"Bitcoin", symbol:"BTC"},
  ethereum: {name:"Ethereum", symbol:"ETH"},
  solana: {name:"Solana", symbol:"SOL"},
  binancecoin: {name:"BNB", symbol:"BNB"}
};
const watchlistGrid=document.getElementById("watchlistGrid");
const watchlistEmpty=document.getElementById("watchlistEmpty");
const WATCHLIST_KEY=window.gugeeAuth?.getCurrentUser()? "gugee_watchlist_"+window.gugeeAuth.emailKey(window.gugeeAuth.getCurrentUser().email) : "gugee_watchlist_guest";
function getWatchlist(){return JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"[]")}
function saveWatchlist(list){localStorage.setItem(WATCHLIST_KEY,JSON.stringify([...new Set(list)]));renderWatchlist()}
let watchlistFilter="all";
function applyWatchlistFilter(){document.querySelectorAll(".watchlist-card").forEach(card=>{const c=Number(card.dataset.change);card.style.display=watchlistFilter==="all"||Number.isNaN(c)||(watchlistFilter==="gainers"&&c>=0)||(watchlistFilter==="losers"&&c<0)?"":"none"})}
function renderWatchlist(){
  if(!watchlistGrid)return;
  const list=getWatchlist();
  watchlistGrid.innerHTML="";
  watchlistEmpty.style.display=list.length?"none":"block";
  list.forEach(id=>{
    const coin=favoriteDefaults[id]||{name:id,symbol:id.slice(0,4).toUpperCase()};
    const card=document.createElement("a");
    card.className="watchlist-card"; card.href="crypto.html?coin="+encodeURIComponent(id);
    card.innerHTML='<div><b>'+coin.name+'</b><span>'+coin.symbol+'</span></div><div class="watchlist-market"><strong class="watch-price">Loading...</strong><span class="watch-change">--</span></div>';
    watchlistGrid.appendChild(card);
    fetch("https://api.coingecko.com/api/v3/simple/price?ids="+encodeURIComponent(id)+"&vs_currencies=usd&include_24hr_change=true")
      .then(r=>r.json()).then(data=>{
        const item=data[id];
        const priceEl=card.querySelector(".watch-price"), changeEl=card.querySelector(".watch-change");
        if(!item) return;
        priceEl.textContent="$"+Number(item.usd).toLocaleString(undefined,{maximumSignificantDigits:7});
        const change=item.usd_24h_change;
        changeEl.textContent=change==null?"--":(change>=0?"+":"")+change.toFixed(2)+"%"; card.dataset.change=change; applyWatchlistFilter();
        changeEl.style.color=change>=0?"var(--green)":"#ff5c5c";
      }).catch(()=>{});
  });
}
document.getElementById("clearWatchlist")?.addEventListener("click",()=>saveWatchlist([]));
renderWatchlist();
