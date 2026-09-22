const searchForm = document.getElementById("cryptoSearch");
const searchInput = document.getElementById("searchInput");
const searchSuggestions = document.getElementById("searchSuggestions");
let searchTimer;

const exchangeDirectory = [
  { name: "Binance", symbol: "Exchange", target: "binance" },
  { name: "Bybit", symbol: "Exchange", target: "bybit" },
  { name: "Coinbase", symbol: "Exchange", target: "coinbase" },
  { name: "Kraken", symbol: "Exchange", target: "kraken" },
  { name: "OKX", symbol: "Exchange", target: "okx" },
  { name: "KuCoin", symbol: "Exchange", target: "kucoin" },
  { name: "Bitget", symbol: "Exchange", target: "bitget" },
  { name: "Gate.io", symbol: "Exchange", target: "gate" },
  { name: "MEXC", symbol: "Exchange", target: "mexc" },
  { name: "Crypto.com", symbol: "Exchange", target: "cryptocom" },
  { name: "Gemini", symbol: "Exchange", target: "gemini" },
  { name: "Bitstamp", symbol: "Exchange", target: "bitstamp" },
  { name: "Bitfinex", symbol: "Exchange", target: "bitfinex" },
  { name: "HTX", symbol: "Exchange", target: "htx" },
  { name: "Poloniex", symbol: "Exchange", target: "poloniex" },
  { name: "BitMart", symbol: "Exchange", target: "bitmart" },
  { name: "LBank", symbol: "Exchange", target: "lbank" },
  { name: "BingX", symbol: "Exchange", target: "bingx" },
  { name: "Phemex", symbol: "Exchange", target: "phemex" },
  { name: "WhiteBIT", symbol: "Exchange", target: "whitebit" },
  { name: "CoinEx", symbol: "Exchange", target: "coinex" },
  { name: "XT.COM", symbol: "Exchange", target: "xt" },
  { name: "Deepcoin", symbol: "Exchange", target: "deepcoin" },
  { name: "AscendEX", symbol: "Exchange", target: "ascendex" },
  { name: "Bitrue", symbol: "Exchange", target: "bitrue" },
  { name: "CoinW", symbol: "Exchange", target: "coinw" },
  { name: "DigiFinex", symbol: "Exchange", target: "digifinex" },
  { name: "Toobit", symbol: "Exchange", target: "toobit" },
  { name: "WEEX", symbol: "Exchange", target: "weex" },
  { name: "P2PB2B", symbol: "Exchange", target: "p2pb2b" }
,
  { name: "Upbit", symbol: "Exchange", target: "upbit" },
  { name: "Bitflyer", symbol: "Exchange", target: "bitflyer" },
  { name: "Bithumb", symbol: "Exchange", target: "bithumb" },
  { name: "Coinone", symbol: "Exchange", target: "coinone" },
  { name: "Korbit", symbol: "Exchange", target: "korbit" },
  { name: "BitMEX", symbol: "Exchange", target: "bitmex" },
  { name: "Deribit", symbol: "Exchange", target: "deribit" },
  { name: "WOO X", symbol: "Exchange", target: "woo" },
  { name: "HashKey", symbol: "Exchange", target: "hashkey" },
  { name: "Bitkub", symbol: "Exchange", target: "bitkub" },
  { name: "Indodax", symbol: "Exchange", target: "indodax" },
  { name: "Mercado Bitcoin", symbol: "Exchange", target: "mercado" },
  { name: "Foxbit", symbol: "Exchange", target: "foxbit" },
  { name: "Bitso", symbol: "Exchange", target: "bitso" },
  { name: "Ripio", symbol: "Exchange", target: "ripio" },
  { name: "Rain", symbol: "Exchange", target: "rain" },
  { name: "Coincheck", symbol: "Exchange", target: "coincheck" },
  { name: "Zaif", symbol: "Exchange", target: "zaif" },
  { name: "Bitbank", symbol: "Exchange", target: "bitbank" },
  { name: "OKCoin", symbol: "Exchange", target: "okcoin" },
  { name: "BloFin", symbol: "Exchange", target: "blofin" },
  { name: "BTSE", symbol: "Exchange", target: "btse" },
  { name: "Bitunix", symbol: "Exchange", target: "bitunix" },
  { name: "dYdX", symbol: "Exchange", target: "dydx" },
  { name: "Coinmetro", symbol: "Exchange", target: "coinmetro" },
  { name: "CoinZoom", symbol: "Exchange", target: "coinzoom" },
  { name: "Bit2Me", symbol: "Exchange", target: "bit2me" },
  { name: "LATOKEN", symbol: "Exchange", target: "latoken" },
  { name: "Tokocrypto", symbol: "Exchange", target: "tokocrypto" },
  { name: "CoinSpot", symbol: "Exchange", target: "coinspot" },
  { name: "Independent Reserve", symbol: "Exchange", target: "independentreserve" },
  { name: "CEX.IO", symbol: "Exchange", target: "cex" },
  { name: "Currency.com", symbol: "Exchange", target: "currencycom" },
  { name: "TimeX", symbol: "Exchange", target: "timex" },
  { name: "NovaDAX", symbol: "Exchange", target: "novadax" },
  { name: "Bitexen", symbol: "Exchange", target: "bitexen" },
  { name: "Icrypex", symbol: "Exchange", target: "icrypex" },
  { name: "Paribu", symbol: "Exchange", target: "paribu" },
  { name: "BTCTurk", symbol: "Exchange", target: "btcturk" },
  { name: "Bitci", symbol: "Exchange", target: "bitci" },
  { name: "Pionex", symbol: "Exchange", target: "pionex" },
  { name: "BitTrade", symbol: "Exchange", target: "bittrade" },
  { name: "Uphold", symbol: "Exchange", target: "uphold" },
  { name: "BigONE", symbol: "Exchange", target: "bigone" },
  { name: "Bitvavo", symbol: "Exchange", target: "bitvavo" },
  { name: "EXMO", symbol: "Exchange", target: "exmo" },
  { name: "BTC Markets", symbol: "Exchange", target: "btcmarkets" }
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
        window.location.href = "exchange.html?exchange=" + encodeURIComponent(button.dataset.exchange);
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
    .filter(exchange => exchange.name.toLowerCase().includes(normalized))
    .slice(0, 8);

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
    window.location.href = "exchange.html?exchange=" + encodeURIComponent(exchange.target);
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

const homeExchangeGrid = document.getElementById("homeExchangeGrid");
const homeExchanges = [
  {name:"Binance",provider:"binance",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/binance"},
  {name:"Coinbase",provider:"coinbase",symbol:"BTC-USD/ticker",logo:"https://cdn.simpleicons.org/coinbase"},
  {name:"Kraken",provider:"kraken",symbol:"XBTUSD",logo:"https://cdn.simpleicons.org/kraken"},
  {name:"Bybit",provider:"bybit",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bybit"},
  {name:"OKX",provider:"okx",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/okx"},
  {name:"KuCoin",provider:"kucoin",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/kucoin"},
  {name:"Bitget",provider:"bitget",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bitget"},
  {name:"Gate.io",provider:"gate",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/gate"},
  {name:"MEXC",provider:"mexc",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/mexc"},
  {name:"Crypto.com",provider:"cryptocom",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/crypto-dot-com"},
  {name:"Gemini",provider:"gemini",symbol:"BTCUSD",logo:"https://cdn.simpleicons.org/gemini"},
  {name:"Bitstamp",provider:"bitstamp",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bitstamp"},
  {name:"Bitfinex",provider:"bitfinex",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bitfinex"},
  {name:"HTX",provider:"htx",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/htx"},
  {name:"Poloniex",provider:"poloniex",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/poloniex"},
  {name:"BitMart",provider:"bitmart",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bitmart"},
  {name:"LBank",provider:"lbank",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/lbank"},
  {name:"BingX",provider:"bingx",symbol:"BTC-USDT",logo:"https://cdn.simpleicons.org/bingx"},
  {name:"Phemex",provider:"phemex",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/phemex"},
  {name:"WhiteBIT",provider:"whitebit",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/whitebit"},
  {name:"CoinEx",provider:"coinex",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/coinex"},
  {name:"XT.COM",provider:"xt",symbol:"BTC_USDT",logo:"https://cdn.simpleicons.org/xt"},
  {name:"Deepcoin",provider:"deepcoin",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/deepcoin"},
  {name:"AscendEX",provider:"ascendex",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/ascendex"},
  {name:"Bitrue",provider:"bitrue",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bitrue"},
  {name:"CoinW",provider:"coinw",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/coinw"},
  {name:"DigiFinex",provider:"digifinex",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/digifinex"},
  {name:"Toobit",provider:"toobit",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/toobit"},
  {name:"WEEX",provider:"weex",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/weex"},
  {name:"P2PB2B",provider:"p2pb2b",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/p2pb2b"}
];
function homeExchangeMoney(v){return Number.isFinite(v)?v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}):"--"}
async function loadHomeExchanges(){
  if(!homeExchangeGrid)return;
  const rows=await Promise.all(homeExchanges.map(async e=>{
    try{
      const r=await fetch("/api/exchanges?provider="+encodeURIComponent(e.provider)+"&symbol="+encodeURIComponent(e.symbol));
      if(!r.ok)throw new Error();
      const d=await r.json();let price=null,change=null;
      if(e.provider==="binance"){price=Number(d.lastPrice);change=Number(d.priceChangePercent)}
      if(e.provider==="coinbase"){price=Number(d.price)}
      if(e.provider==="kraken"){const x=d.result?.XXBTZUSD||Object.values(d.result||{})[0];price=Number(x?.c?.[0])}
      if(e.provider==="bybit"){const x=d.result?.list?.[0];price=Number(x?.lastPrice);change=Number(x?.price24hPcnt)*100}
      if(e.provider==="okx"){const x=d.data?.[0];price=Number(x?.last);change=Number(x?.open24h)?(price/Number(x.open24h)-1)*100:null}
      if(e.provider==="kucoin"){price=Number(d.data?.last);change=Number(d.data?.changeRate)*100}
      if(e.provider==="bitget"){const x=d.data?.[0];price=Number(x?.lastPr);change=Number(x?.change24h)*100}
      if(e.provider==="gate"){const x=Array.isArray(d)?d[0]:d;price=Number(x?.last);change=Number(x?.change_percentage)}
      if(e.provider==="mexc"){price=Number(d.lastPrice);change=Number(d.priceChangePercent)}
      if(e.provider==="cryptocom"){const x=d.result?.data?.[0];price=Number(x?.k);change=Number(x?.c)}
      if(e.provider==="gemini"){price=Number(d.close);change=d.open?(price/Number(d.open)-1)*100:null}
      if(e.provider==="bitstamp"){price=Number(d.last)}
      if(e.provider==="bitfinex"){price=Number(d[6]);change=Number(d[5])*100}
      if(e.provider==="htx"){price=Number(d.tick?.close)}
      if(e.provider==="poloniex"){const x=Array.isArray(d)?d[0]:d;price=Number(x?.close);change=Number(x?.percentChange)*100}
      if(e.provider==="bitmart"){const x=d.data?.tickers?.[0]||d.data?.[0];price=Number(x?.last_price)}
      if(e.provider==="lbank"){const x=d.data?.[0]?.data?.[0]||d.data?.[0]||d.data;price=Number(x?.latest)}
      if(e.provider==="bingx"){const x=d.data?.[0];price=Number(x?.lastPrice);change=Number(x?.priceChangePercent)}
      if(e.provider==="phemex"){const x=d.result?.tick||d.result?.data?.[0];price=Number(x?.closeEp)/1e8||Number(x?.close)}
      if(e.provider==="whitebit"){const x=Array.isArray(d)?d[0]:d;price=Number(x?.last_price);change=Number(x?.change)}
      if(e.provider==="coinex"){const x=d.data?.[0]||d.data;price=Number(x?.last);change=x?.open?(price/Number(x.open)-1)*100:null}
      if(e.provider==="xt"){const x=d.result?.[0]||d.data?.[0]||d;price=Number(x?.p||x?.price)}
      if(e.provider==="deepcoin"){const x=d.data?.[0]||d.data;price=Number(x?.last)}
      if(e.provider==="ascendex"){price=Number(d.data?.close)}
      if(e.provider==="bitrue"){price=Number(d.lastPrice);change=Number(d.priceChangePercent)}
      if(e.provider==="coinw"){price=Number(d.data?.last||d.last)}
      if(e.provider==="digifinex"){const x=d.ticker?.[0]||d.data?.[0];price=Number(x?.last)}
      if(e.provider==="toobit"){const x=Array.isArray(d)?d[0]:d;price=Number(x?.lastPrice);change=Number(x?.priceChangePercent)}
      if(e.provider==="weex"){const x=d.data?.[0]||d.data;price=Number(x?.last);change=Number(x?.change24h)}
      if(e.provider==="p2pb2b"){const x=d.result||d.data||d;price=Number(x?.last)}
      return {...e,price,change};
    }catch{return {...e,price:null,change:null}}
  }));
  homeExchangeGrid.innerHTML=rows.map(x=>{
    const cls=x.change==null?"neutral":x.change>=0?"positive":"negative";
    const ch=x.change==null?"--":(x.change>=0?"+":"")+x.change.toFixed(2)+"%";
    return '<a class="exchange-card" href="exchange.html?exchange='+x.provider+'"><div class="exchange-home-brand"><img src="'+x.logo+'" alt="'+x.name+' logo" loading="lazy"><b>'+x.name+'</b></div><strong>'+homeExchangeMoney(x.price)+'</strong><span class="'+cls+'">'+ch+' · 24H</span></a>';
  }).join("");
}
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

loadHomeExchanges();
setInterval(loadHomeExchanges,60000);
