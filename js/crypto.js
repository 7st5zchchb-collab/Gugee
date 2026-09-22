const params = new URLSearchParams(window.location.search);
const requestedCoin = params.get("coin") || "bitcoin";
const aliases = {btc:"bitcoin",eth:"ethereum",sol:"solana",bnb:"binancecoin"};
const coinId = aliases[requestedCoin.toLowerCase()] || requestedCoin.toLowerCase().trim().replace(/\s+/g,"-");

const els = {
  name: document.getElementById("coinName"), symbol: document.getElementById("coinSymbol"),
  icon: document.getElementById("coinIcon"), price: document.getElementById("coinPrice"),
  change: document.getElementById("coinChange"), marketCap: document.getElementById("marketCap"),
  volume: document.getElementById("volume"), high: document.getElementById("high"), low: document.getElementById("low"),
  supply: document.getElementById("supply"), ath: document.getElementById("ath"), athDate: document.getElementById("athDate"),
  updated: document.getElementById("updated"), athDistance: document.getElementById("athDistance"),
  analysisChange: document.getElementById("analysisChange"), chart: document.getElementById("chartPlaceholder")
};

const ranges = { "24H": "1", "7D": "7", "30D": "30", "1Y": "365", "5Y": "1825", "MAX": "max" };
let currentRange = "1";

function money(v) {
  if (v == null) return "$--";
  if (v >= 1000) return "$" + Math.round(v).toLocaleString();
  if (v >= 1) return "$" + v.toLocaleString(undefined,{maximumFractionDigits:2});
  return "$" + v.toLocaleString(undefined,{maximumSignificantDigits:5});
}
function compact(v) {
  return v == null ? "--" : new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(v);
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
}
function drawChart(points) {
  if (!points.length) { els.chart.textContent = "No historical data available."; return; }
  const width = 1000, height = 300, pad = 18;
  const values = points.map(p => p[1]);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const line = points.map((p,i) => {
    const x = pad + (i/(points.length-1 || 1))*(width-pad*2);
    const y = height-pad-((p[1]-min)/range)*(height-pad*2);
    return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
  const area = line + " L " + (width-pad) + " " + (height-pad) + " L " + pad + " " + (height-pad) + " Z";
  const first = money(values[0]), last = money(values[values.length-1]);
  els.chart.innerHTML = '<div class="chart-value-row"><span>Low ' + money(min) + '</span><b>' + last + '</b><span>High ' + money(max) + '</span></div>' +
    '<svg class="price-svg" viewBox="0 0 1000 300" preserveAspectRatio="none" role="img" aria-label="Historical price chart">' +
    '<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(53,224,139,.22)"/><stop offset="100%" stop-color="rgba(53,224,139,0)"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#chartFill)"/><path d="' + line + '" fill="none" stroke="#35e08b" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>' +
    '<div class="chart-times"><span>' + new Date(points[0][0]).toLocaleDateString() + '</span><span>' + new Date(points[points.length-1][0]).toLocaleDateString() + '</span></div>';
}

async function loadChart(days) {
  els.chart.textContent = "Loading " + (days === "max" ? "all-time" : days + "-day") + " history...";
  try {
    const url = "https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(coinId) + "/market_chart?vs_currency=usd&days=" + days;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Chart API request failed");
    const data = await response.json();
    drawChart(data.prices || []);
  } catch (e) {
    console.error(e);
    els.chart.textContent = "Historical chart could not be loaded. Try again.";
  }
}

async function loadCoin() {
  try {
    const url = "https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(coinId) +
      "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Coin API request failed");
    const coin = await response.json(), market = coin.market_data;
    els.name.textContent = coin.name || coinId;
    els.symbol.textContent = (coin.symbol || "").toUpperCase();
    els.icon.textContent = (coin.symbol || "C").toUpperCase().slice(0,3);
    els.price.textContent = money(market.current_price.usd);
    const change = market.price_change_percentage_24h || 0;
    els.change.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    els.change.style.color = change >= 0 ? "var(--green)" : "#ff5c5c";
    els.marketCap.textContent = money(market.market_cap.usd);
    els.volume.textContent = money(market.total_volume.usd);
    els.high.textContent = money(market.high_24h.usd);
    els.low.textContent = money(market.low_24h.usd);
    els.supply.textContent = compact(market.circulating_supply);
    els.ath.textContent = money(market.ath.usd);
    els.athDate.textContent = market.ath_date.usd ? new Date(market.ath_date.usd).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}) : "--";
    els.updated.textContent = coin.last_updated ? formatTime(coin.last_updated) : "--";
    els.athDistance.textContent = (((market.current_price.usd / market.ath.usd)-1)*100).toFixed(2) + "%";
    els.analysisChange.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    els.analysisChange.style.color = change >= 0 ? "var(--green)" : "#ff5c5c";
    await loadChart(currentRange);
  } catch (e) {
    console.error(e);
    els.name.textContent = "Crypto not found";
    els.symbol.textContent = "Check the coin name or API availability.";
  }
}

document.querySelectorAll(".range").forEach(button => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".range").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    currentRange = ranges[button.textContent.trim()];
    await loadChart(currentRange);
  });
});

loadCoin();
