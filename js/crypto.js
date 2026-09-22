const params = new URLSearchParams(window.location.search);
const requestedCoin = params.get("coin") || "bitcoin";
const aliases = {btc:"bitcoin",eth:"ethereum",sol:"solana",bnb:"binancecoin"};
const coinId = aliases[requestedCoin.toLowerCase()] || requestedCoin.toLowerCase().trim().replace(/\s+/g,"-");

const els = {
  name: document.getElementById("coinName"), symbol: document.getElementById("coinSymbol"),
  icon: document.getElementById("coinIcon"), iconImage: document.getElementById("coinIconImage"), iconFallback: document.getElementById("coinIconFallback"), price: document.getElementById("coinPrice"),
  change: document.getElementById("coinChange"), marketCap: document.getElementById("marketCap"),
  volume: document.getElementById("volume"), high: document.getElementById("high"), low: document.getElementById("low"),
  supply: document.getElementById("supply"), ath: document.getElementById("ath"), athDate: document.getElementById("athDate"),
  updated: document.getElementById("updated"), athDistance: document.getElementById("athDistance"),
  analysisChange: document.getElementById("analysisChange"), analysis7d: document.getElementById("analysis7d"), analysis30d: document.getElementById("analysis30d"), volatility30d: document.getElementById("volatility30d"), volumeChange30d: document.getElementById("volumeChange30d"), volumeCapRatio: document.getElementById("volumeCapRatio"), athDistance2: document.getElementById("athDistance2"), trend: document.getElementById("trendSignal"), momentum: document.getElementById("momentumSignal"), volumeSignal: document.getElementById("volumeSignal"), rsi14: document.getElementById("rsi14"), ma20: document.getElementById("ma20"), ma50: document.getElementById("ma50"), macdSignal: document.getElementById("macdSignal"), summary: document.getElementById("analysisSummary"), signalTrend: document.getElementById("signalTrend"), signalMomentum: document.getElementById("signalMomentum"), signalVolume: document.getElementById("signalVolume"), signalRisk: document.getElementById("signalRisk"), binance: document.getElementById("binancePrice"), coinbase: document.getElementById("coinbasePrice"), kraken: document.getElementById("krakenPrice"), bybit: document.getElementById("bybitPrice"), spread: document.getElementById("priceSpread"), chart: document.getElementById("chartPlaceholder")
};

const ranges = { "24H": "1", "7D": "7", "30D": "30", "1Y": "365", "5Y": "1825", "MAX": "max" };
let currentRange = "1";
let currentMarket = null;

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
function drawChart(points, volumes) {
  if (!points.length) { els.chart.textContent = "No historical data available."; return; }
  const width = 1000, height = 300, pad = 18;
  const values = points.map(p => p[1]);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const line = points.map((p,i) => {
    const x = pad + (i/(points.length-1 || 1))*(width-pad*2);
    const y = height-pad-((p[1]-min)/range)*(height-pad*2);
    return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
  const area = line + " L " + (width-pad) + " " + (height-pad) + " L " + pad + " " + (height-pad) + " Z";
  els.chart.innerHTML = '<div class="chart-value-row"><span>Low ' + money(min) + '</span><b>' + money(values[values.length-1]) + '</b><span>High ' + money(max) + '</span></div>' +
    '<div class="chart-interactive"><svg class="price-svg" viewBox="0 0 1000 300" preserveAspectRatio="none" role="img" aria-label="Historical price chart">' +
    '<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(53,224,139,.22)"/><stop offset="100%" stop-color="rgba(53,224,139,0)"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#chartFill)"/><path d="' + line + '" fill="none" stroke="#35e08b" stroke-width="3" vector-effect="non-scaling-stroke"/></svg><div class="chart-tooltip" id="chartTooltip"></div><div class="chart-hover-line" id="chartHoverLine"></div><div class="chart-hover-dot" id="chartHoverDot"></div></div>' +
    '<div class="chart-times"><span>' + new Date(points[0][0]).toLocaleDateString() + '</span><span>' + new Date(points[points.length-1][0]).toLocaleDateString() + '</span></div>' +
    '<div class="volume-title">Volume</div><div class="volume-bars">' + volumes.map((v,i) => '<span style="height:' + Math.max(4,Math.min(100,(v[1]/Math.max(...volumes.map(x=>x[1])))*100)) + '%" data-index="' + i + '"></span>').join("") + '</div>';
  const wrap=document.querySelector(".chart-interactive"), tip=document.getElementById("chartTooltip"), lineEl=document.getElementById("chartHoverLine"), dot=document.getElementById("chartHoverDot");
  wrap.addEventListener("mousemove", e => {
    const r=wrap.getBoundingClientRect(), ratio=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    const i=Math.round(ratio*(points.length-1)), p=points[i], v=volumes[Math.min(i,volumes.length-1)]?.[1]||0;
    const x=ratio*100;
    const y=(height-pad-((p[1]-min)/range)*(height-pad*2))/height*100;
    tip.innerHTML='<b>'+money(p[1])+'</b><br><span>'+new Date(p[0]).toLocaleString()+'</span><br><span>Volume: '+compact(v)+'</span>';
    tip.style.left=Math.min(82,Math.max(2,x))+'%'; tip.style.top='8px'; tip.style.display='block';
    lineEl.style.left=x+'%'; lineEl.style.display='block'; dot.style.left=x+'%'; dot.style.top=y+'%'; dot.style.display='block';
  });
  wrap.addEventListener("mouseleave",()=>{tip.style.display="none";lineEl.style.display="none";dot.style.display="none";});
}

async function fetchHistory(days) {
  const url="/api/coingecko/coins/"+encodeURIComponent(coinId)+"/market_chart?vs_currency=usd&days="+days;
  const response=await fetch(url); if(!response.ok) throw new Error("History request failed"); return response.json();
}
function pct(v){return (v>=0?"+":"")+v.toFixed(2)+"%"}
function setMetric(el,v){if(el){el.textContent=pct(v);el.style.color=v>=0?"var(--green)":"#ff5c5c"}}
function calculateAnalysis(data){
  const p=(data.prices||[]).map(x=>x[1]), vols=(data.total_volumes||[]).map(x=>x[1]);
  if(p.length<2)return;
  const pointsPerDay=Math.max(1,Math.floor(p.length/30));
  const priceAtDaysAgo=(days)=>p[Math.max(0,p.length-1-Math.round(pointsPerDay*days))];
  const ret7=(p[p.length-1]/priceAtDaysAgo(7)-1)*100;
  const ret30=(p[p.length-1]/priceAtDaysAgo(30)-1)*100;
  const changes=[]; for(let i=1;i<p.length;i++) changes.push((p[i]/p[i-1]-1)*100);
  const mean=changes.reduce((a,b)=>a+b,0)/changes.length;
  const variance=changes.reduce((a,b)=>a+(b-mean)**2,0)/changes.length;
  const vol=Math.sqrt(variance)*Math.sqrt(24*365);
  const recentVolume=avg(vols.slice(Math.max(0,vols.length-7))); const previousVolume=avg(vols.slice(Math.max(0,vols.length-14),Math.max(0,vols.length-7))); const volChange=previousVolume?((recentVolume/previousVolume)-1)*100:0;
  const last=p[p.length-1], n=p.length;
  const sma=(arr,period)=>arr.length<period?null:avg(arr.slice(-period));
  const ma20=sma(p,20), ma50=sma(p,50);
  const gains=[], losses=[];
  for(let i=1;i<p.length;i++){const d=p[i]-p[i-1]; gains.push(Math.max(d,0)); losses.push(Math.max(-d,0));}
  const rsiPeriod=14, recentG=gains.slice(-rsiPeriod), recentL=losses.slice(-rsiPeriod);
  const avgGain=recentG.length?avg(recentG):0, avgLoss=recentL.length?avg(recentL):0;
  const rsi=avgLoss===0?100:100-(100/(1+(avgGain/avgLoss)));
  const ema=(arr,period)=>{if(arr.length<period)return null;let e=avg(arr.slice(0,period));const k=2/(period+1);for(let i=period;i<arr.length;i++)e=arr[i]*k+e*(1-k);return e;};
  const ema12=ema(p,12), ema26=ema(p,26), macd=ema12!=null&&ema26!=null?ema12-ema26:null;
  if(els.rsi14){els.rsi14.textContent=rsi.toFixed(1);els.rsi14.style.color=rsi>=70?"#ff5c5c":rsi<=30?"var(--green)":"#f5f5f5";}
  if(els.ma20){els.ma20.textContent=ma20==null?"--":money(ma20);els.ma20.style.color=ma20!=null&&last>=ma20?"var(--green)":"#ff5c5c";}
  if(els.ma50){els.ma50.textContent=ma50==null?"--":money(ma50);els.ma50.style.color=ma50!=null&&last>=ma50?"var(--green)":"#ff5c5c";}
  if(els.macdSignal){els.macdSignal.textContent=macd==null?"--":(macd>=0?"Positive":"Negative");els.macdSignal.style.color=macd==null?"#f5f5f5":macd>=0?"var(--green)":"#ff5c5c";} const short=avg(p.slice(Math.max(0,n-24))); const long=avg(p); const momentum=(p[n-1]/p[Math.max(0,n-8)]-1)*100; const recentVol=avg(vols.slice(Math.max(0,vols.length-12))); const oldVol=avg(vols.slice(0,Math.max(1,Math.floor(vols.length/2)))); const volumeRatio=oldVol?recentVol/oldVol:1; els.trend.textContent=short>long?"Uptrend":"Downtrend"; els.trend.style.color=short>long?"var(--green)":"#ff5c5c"; els.momentum.textContent=momentum>=0? "Positive":"Negative"; els.momentum.style.color=momentum>=0?"var(--green)":"#ff5c5c"; els.volumeSignal.textContent=volumeRatio>=1.2?"Strong":"Normal"; els.volumeSignal.style.color=volumeRatio>=1.2?"var(--green)":"#aaa"; els.summary.textContent=(short>long?"Price is trading above its longer average. ":"Price is trading below its longer average.")+(momentum>=0?"Recent momentum is positive. ":"Recent momentum is negative.")+(volumeRatio>=1.2?"Recent volume is elevated.":"Recent volume is within a normal range."); const risk=vol>100?"High":vol>50?"Medium":"Low"; els.signalTrend.textContent=short>long?"Up":"Down"; els.signalMomentum.textContent=momentum>=0?"Positive":"Negative"; els.signalVolume.textContent=volumeRatio>=1.2?"High":"Normal"; els.signalRisk.textContent=risk; [els.signalTrend,els.signalMomentum,els.signalVolume,els.signalRisk].forEach(e=>e.style.color="#f5f5f5"); setMetric(els.analysis30d,ret30); setMetric(els.volatility30d,vol); setMetric(els.volumeChange30d,volChange); setMetric(els.analysis7d,ret7);
}

async function loadChart(days) {
  els.chart.textContent = "Loading " + (days === "max" ? "all-time" : days + "-day") + " history...";
  try {
    const url = "/api/coingecko/coins/" + encodeURIComponent(coinId) + "/market_chart?vs_currency=usd&days=" + days;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Chart API request failed");
    const data = await response.json();
    drawChart(data.prices || [], data.total_volumes || []);
    if(days==="30") calculateAnalysis(data);
  } catch (e) {
    console.error(e);
    els.chart.textContent = "Historical chart could not be loaded. Try again.";
  }
}

async function loadExchanges(symbol) {
  const s = symbol.toUpperCase();
  const pairs = {BTC:["BTCUSDT","BTC-USD","XXBTZUSD","BTCUSDT"],ETH:["ETHUSDT","ETH-USD","XETHZUSD","ETHUSDT"],SOL:["SOLUSDT","SOL-USD","SOLUSD","SOLUSDT"],BNB:["BNBUSDT","BNB-USD","BNBUSD","BNBUSDT"]};
  const p = pairs[s]; if (!p) return;
  const calls = [
    fetch("https://api.binance.com/api/v3/ticker/price?symbol="+p[0]).then(r=>r.json()),
    fetch("https://api.coinbase.com/v2/prices/"+p[1]+"/spot").then(r=>r.json()),
    fetch("https://api.kraken.com/0/public/Ticker?pair="+p[2]).then(r=>r.json()),
    fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol="+p[3]).then(r=>r.json())
  ];
  const [b,c,k,y]=await Promise.allSettled(calls);
  const prices=[];
  if(b.status==="fulfilled" && b.value.price){const v=Number(b.value.price); els.binance.textContent=money(v); prices.push(v);}
  if(c.status==="fulfilled" && c.value.data?.amount){const v=Number(c.value.data.amount); els.coinbase.textContent=money(v); prices.push(v);}
  if(k.status==="fulfilled" && k.value.result){const key=Object.keys(k.value.result)[0]; const v=key?Number(k.value.result[key].c?.[0]):NaN; els.kraken.textContent=Number.isFinite(v)?money(v):"--"; if(Number.isFinite(v)) prices.push(v);}
  if(y.status==="fulfilled" && y.value.result?.list?.[0]?.lastPrice){const v=Number(y.value.result.list[0].lastPrice); els.bybit.textContent=money(v); prices.push(v);}
  if(els.spread && prices.length>1){const min=Math.min(...prices), max=Math.max(...prices); els.spread.textContent=((max/min-1)*100).toFixed(3)+"%";}
}

async function loadCoin() {
  try {
    const url = "/api/coingecko/coins/" + encodeURIComponent(coinId) +
      "?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Coin API request failed");
    const coin = await response.json(), market = coin.market_data;
    currentMarket = market;
    els.name.textContent = coin.name || coinId;
    els.symbol.textContent = (coin.symbol || "").toUpperCase();
    const logo = coin.image?.large || coin.image?.small || coin.image?.thumb || "";
    if (els.iconImage && logo) { els.iconImage.src = logo; els.iconImage.style.display = "block"; if (els.iconFallback) els.iconFallback.style.display = "none"; }
    else if (els.iconFallback) { els.iconFallback.textContent = (coin.symbol || "C").toUpperCase().slice(0,3); els.iconFallback.style.display = "block"; }
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
    const athDistance=(((market.current_price.usd / market.ath.usd)-1)*100).toFixed(2) + "%"; els.athDistance.textContent=athDistance; els.athDistance2.textContent=athDistance;
    els.analysisChange.textContent = (change >= 0 ? "+" : "") + change.toFixed(2) + "%";
    els.analysisChange.style.color = change >= 0 ? "var(--green)" : "#ff5c5c";
    const volumeCapRatio=market.market_cap?.usd>0?(market.total_volume?.usd/market.market_cap.usd)*100:null;
    if(els.volumeCapRatio){els.volumeCapRatio.textContent=volumeCapRatio==null?"--":volumeCapRatio.toFixed(2)+"%";els.volumeCapRatio.style.color=volumeCapRatio>5?"var(--green)":"#aaa";}
    await Promise.all([loadChart(currentRange), loadExchanges((coin.symbol || "").toUpperCase())]);
    try { const analysisData=await fetchHistory("30"); calculateAnalysis(analysisData); } catch(e) { console.error("Gugee analysis:",e); }
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

setInterval(async () => { try { await loadCoin(); } catch(e) { console.error(e); } }, 60000);

const favoriteButton=document.getElementById("favoriteButton");
const WATCHLIST_KEY=window.gugeeAuth?.getCurrentUser()? "gugee_watchlist_"+window.gugeeAuth.emailKey(window.gugeeAuth.getCurrentUser().email) : "gugee_watchlist_guest";
function getFavorites(){return JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"[]")}
function updateFavoriteButton(){
  if(!favoriteButton)return;
  const favorites=getFavorites(), active=favorites.includes(coinId);
  favoriteButton.textContent=active?"★ In Favorites":"☆ Add to Favorites";
  favoriteButton.classList.toggle("active",active);
}
favoriteButton?.addEventListener("click",()=>{
  const favorites=getFavorites(), index=favorites.indexOf(coinId);
  if(index>=0) favorites.splice(index,1); else favorites.push(coinId);
  localStorage.setItem(WATCHLIST_KEY,JSON.stringify(favorites));
  updateFavoriteButton();
});
updateFavoriteButton();

favoriteButton?.addEventListener("click",async()=>{
  const favorites=getFavorites();
  const index=favorites.indexOf(coinId);
  if(index>=0)favorites.splice(index,1);else favorites.push(coinId);
  localStorage.setItem(WATCHLIST_KEY,JSON.stringify(favorites));
  updateFavoriteButton();
  if(window.gugeeAuth?.getCurrentUser()){
    try{await window.gugeeAuth.api("/api/watchlist",{method:"PUT",body:JSON.stringify({watchlist:favorites})});}catch{}
  }
});
async function syncCryptoWatchlist(){
  if(!window.gugeeAuth?.getCurrentUser())return;
  try{
    const data=await window.gugeeAuth.api("/api/watchlist");
    localStorage.setItem(WATCHLIST_KEY,JSON.stringify(data.watchlist||[]));
    updateFavoriteButton();
  }catch{}
}
setTimeout(syncCryptoWatchlist,0);
