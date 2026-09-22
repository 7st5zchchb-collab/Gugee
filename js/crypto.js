const params = new URLSearchParams(window.location.search);
const requestedCoin = params.get("coin") || "bitcoin";

const aliases = {
  btc: "bitcoin", eth: "ethereum", sol: "solana", bnb: "binancecoin",
  bitcoin: "bitcoin", ethereum: "ethereum", solana: "solana"
};

const coinId = aliases[requestedCoin.toLowerCase()] || requestedCoin.toLowerCase().trim().replace(/\s+/g, "-");

const els = {
  name: document.getElementById("coinName"),
  symbol: document.getElementById("coinSymbol"),
  price: document.getElementById("coinPrice"),
  change: document.getElementById("coinChange"),
  marketCap: document.getElementById("marketCap"),
  volume: document.getElementById("volume"),
  high: document.getElementById("high"),
  low: document.getElementById("low"),
  supply: document.getElementById("supply"),
  ath: document.getElementById("ath"),
  athDate: document.getElementById("athDate"),
  updated: document.getElementById("updated"),
  athDistance: document.getElementById("athDistance"),
  analysisChange: document.getElementById("analysisChange"),
  chart: document.getElementById("chartPlaceholder")
};

function money(value) {
  if (value == null) return "$--";
  if (value >= 1000) return "$" + Math.round(value).toLocaleString();
  if (value >= 1) return "$" + value.toLocaleString(undefined, {maximumFractionDigits: 2});
  return "$" + value.toLocaleString(undefined, {maximumSignificantDigits: 5});
}

function compact(value) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {notation:"compact", maximumFractionDigits:2}).format(value);
}

function setLoading() {
  els.name.textContent = "Loading...";
  els.symbol.textContent = "LIVE MARKET DATA";
  els.chart.textContent = "Loading market data...";
}

function setError(message) {
  els.name.textContent = "Crypto not found";
  els.symbol.textContent = message;
  els.price.textContent = "$--";
  els.chart.textContent = "Could not load this cryptocurrency.";
}

async function loadCoin() {
  setLoading();

  const url = "https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(coinId) +
    "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("API request failed");
    const coin = await response.json();
    const market = coin.market_data;

    els.name.textContent = coin.name || coinId;
    els.symbol.textContent = (coin.symbol || "").toUpperCase();
    els.coinIcon && (els.coinIcon.textContent = (coin.symbol || "C").toUpperCase().slice(0, 3));
    els.price.textContent = money(market.current_price.usd);
    const change = market.price_change_percentage_24h;
    els.change.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    els.change.style.color = change >= 0 ? "var(--green)" : "#ff5c5c";

    els.marketCap.textContent = money(market.market_cap.usd);
    els.volume.textContent = money(market.total_volume.usd);
    els.high.textContent = money(market.high_24h.usd);
    els.low.textContent = money(market.low_24h.usd);
    els.supply.textContent = compact(market.circulating_supply);
    els.ath.textContent = money(market.ath.usd);

    const athDate = market.ath_date.usd;
    els.athDate.textContent = athDate ? new Date(athDate).toLocaleDateString("en-US", {year:"numeric",month:"short",day:"numeric"}) : "--";
    els.updated.textContent = coin.last_updated ? new Date(coin.last_updated).toLocaleTimeString("en-US", {hour:"2-digit",minute:"2-digit"}) : "--";

    const distance = ((market.current_price.usd / market.ath.usd) - 1) * 100;
    els.athDistance.textContent = distance.toFixed(2) + "%";
    els.analysisChange.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    els.analysisChange.style.color = change >= 0 ? "var(--green)" : "#ff5c5c";

    els.chart.textContent = "Live data loaded. Historical chart is the next connection.";
  } catch (error) {
    console.error(error);
    setError("Check the coin name or API availability.");
  }
}

loadCoin();
