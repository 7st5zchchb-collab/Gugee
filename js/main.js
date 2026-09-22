const searchForm = document.getElementById("cryptoSearch");
const searchInput = document.getElementById("searchInput");
const searchSuggestions = document.getElementById("searchSuggestions");
let searchTimer;

const exchangeDirectory = [
  { name: "Binance", symbol: "Exchange", target: "binance" },
  { name: "Bybit", symbol: "Exchange", target: "bybit" },
  { name: "Coinbase", symbol: "Exchange", target: "coinbase" },
  { name: "Kraken", symbol: "Exchange", target: "kraken" }
];

function escapeSearchText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function renderSearchResults(coins, exchanges, query) {
  const coinItems = coins.map(coin =>
    '<button type="button" class="suggestion" data-kind="coin" data-coin="' +
    escapeSearchText(coin.id) + '">' +
    '<span class="suggestion-name">' + escapeSearchText(coin.name) + '</span>' +
    '<span class="suggestion-symbol">' + escapeSearchText((coin.symbol || "").toUpperCase()) + '</span>' +
    '</button>'
  ).join("");

  const exchangeItems = exchanges.map(exchange =>
    '<button type="button" class="suggestion" data-kind="exchange" data-exchange="' +
    escapeSearchText(exchange.target) + '">' +
    '<span class="suggestion-name">' + escapeSearchText(exchange.name) + '</span>' +
    '<span class="suggestion-symbol">EXCHANGE</span>' +
    '</button>'
  ).join("");

  searchSuggestions.innerHTML = coinItems + exchangeItems;
  searchSuggestions.classList.toggle("show", Boolean(coinItems || exchangeItems));

  searchSuggestions.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
      if (button.dataset.kind === "exchange") {
        window.location.href = "markets.html#exchanges";
        return;
      }
      window.location.href = "crypto.html?coin=" + encodeURIComponent(button.dataset.coin);
    });
  });
}

async function searchEverything(query) {
  const response = await fetch("/api/coingecko/search?query=" + encodeURIComponent(query));
  if (!response.ok) throw new Error("Search request failed");

  const data = await response.json();
  const normalized = query.toLowerCase();

  const coins = (data.coins || []).slice(0, 6);
  const exchanges = exchangeDirectory
    .filter(exchange => exchange.name.toLowerCase().startsWith(normalized))
    .slice(0, 4);

  return { coins, exchanges };
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();

  if (query.length < 1) {
    searchSuggestions.innerHTML = "";
    searchSuggestions.classList.remove("show");
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      const { coins, exchanges } = await searchEverything(query);
      renderSearchResults(coins, exchanges, query);
    } catch (error) {
      console.error("Gugee search:", error);
      searchSuggestions.innerHTML = "";
      searchSuggestions.classList.remove("show");
    }
  }, 250);
});

document.addEventListener("click", event => {
  if (!searchForm.contains(event.target)) searchSuggestions?.classList.remove("show");
});

searchForm.addEventListener("submit", async event => {
  event.preventDefault();
  const query = searchInput.value.trim();

  if (!query) {
    searchInput.focus();
    return;
  }

  const exchange = exchangeDirectory.find(item => item.name.toLowerCase() === query.toLowerCase());
  if (exchange) {
    window.location.href = "markets.html#exchanges";
    return;
  }

  try {
    const { coins } = await searchEverything(query);
    const exact = coins.find(coin =>
      coin.id.toLowerCase() === query.toLowerCase() ||
      coin.name.toLowerCase() === query.toLowerCase() ||
      (coin.symbol || "").toLowerCase() === query.toLowerCase()
    );
    const selected = exact || coins[0];

    if (selected) {
      window.location.href = "crypto.html?coin=" + encodeURIComponent(selected.id);
      return;
    }
  } catch (error) {
    console.error("Gugee search submit:", error);
  }

  searchSuggestions.innerHTML = "";
  searchSuggestions.classList.remove("show");
  searchInput.focus();
});

document.querySelectorAll(".coin-link").forEach(button => {
  button.addEventListener("click", () => {
    window.location.href = "crypto.html?coin=" + encodeURIComponent(button.dataset.coin);
  });
});

const marketCoins = ["bitcoin", "ethereum", "solana", "binancecoin"];
const marketCards = document.querySelectorAll(".market-card");

async function loadMarketSnapshot() {
  try {
    const url = "/api/coingecko/coins/markets?vs_currency=usd&ids=" +
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
function saveWatchlist(list){
  const clean=[...new Set(list)];
  localStorage.setItem(WATCHLIST_KEY,JSON.stringify(clean));
  renderWatchlist();
  if(window.gugeeAuth?.getCurrentUser()){
    window.gugeeAuth.api("/api/watchlist",{method:"PUT",body:JSON.stringify({watchlist:clean})}).catch(()=>{});
  }
}
async function syncWatchlistFromServer(){
  if(!window.gugeeAuth?.getCurrentUser())return;
  try{
    const data=await window.gugeeAuth.api("/api/watchlist");
    localStorage.setItem(WATCHLIST_KEY,JSON.stringify(data.watchlist||[]));
    renderWatchlist();
  }catch{}
}
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
    fetch("/api/coingecko/simple/price?ids="+encodeURIComponent(id)+"&vs_currencies=usd&include_24hr_change=true")
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
setTimeout(syncWatchlistFromServer,0);
