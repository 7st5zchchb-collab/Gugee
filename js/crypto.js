const API_BASES=[...new Set([(window.GUGEE_API_BASE||"").replace(/\/$/,""),window.location.origin.replace(/\/$/,""),"https://gugee.onrender.com"])].filter(Boolean);
const params=new URLSearchParams(location.search);
const requestedCoin=params.get("coin")||"bitcoin";
const aliases={btc:"bitcoin",eth:"ethereum",sol:"solana",bnb:"binancecoin",xrp:"ripple",doge:"dogecoin"};
const coinId=aliases[requestedCoin.toLowerCase()]||requestedCoin.toLowerCase().trim().replace(/\s+/g,"-");
const $=id=>document.getElementById(id);
const els={
 name:$("coinName"),symbol:$("coinSymbol"),icon:$("coinIconImage"),fallback:$("coinIconFallback"),price:$("coinPrice"),change:$("coinChange"),
 marketCap:$("marketCap"),volume:$("volume"),high:$("high"),low:$("low"),supply:$("supply"),ath:$("ath"),athDate:$("athDate"),updated:$("updated"),
 chart:$("chartPlaceholder"),periodGrid:$("cryptoPeriodGrid"),dailyMoves:$("dailyMoves"),dailyUpdated:$("dailyAnalysisUpdated"),
 trend:$("signalTrend"),momentum:$("signalMomentum"),volumeSignal:$("signalVolume"),risk:$("signalRisk"),
 rsi:$("rsi14"),rsiState:$("rsiState"),ma20:$("ma20"),ma20State:$("ma20State"),ma50:$("ma50"),ma50State:$("ma50State"),macd:$("macdValue"),macdState:$("macdState"),atr:$("atr14"),boll:$("bollinger"),bollState:$("bollingerState"),
 volatility:$("volatility30d"),drawdown:$("maxDrawdown"),periodHigh:$("periodHigh"),periodLow:$("periodLow"),support:$("support"),resistance:$("resistance"),athDistance:$("athDistance"),
 analysisVolume:$("analysisVolume"),avgVol7:$("avgVolume7d"),avgVol30:$("avgVolume30d"),volChange:$("volumeChange7d"),volRatio:$("volumeCapRatio"),volActivity:$("volumeActivity"),
 summary:$("analysisSummary"),a3:$("analysis3d"),a7:$("analysis7d"),a30:$("analysis30d"),trendText:$("trendSignal"),momentumText:$("momentumSignal"),
 exchangeTable:$("exchangeAnalysisTable"),exchangeStatus:$("exchangeAnalysisStatus"),favorite:$("favoriteButton")
};
const ranges=["1","3","7","30","365","1825","max"];
let coin=null,market=null,latestHistory=null;

function money(v){if(!Number.isFinite(Number(v)))return"$--";v=Number(v);if(Math.abs(v)>=1000)return"$"+Math.round(v).toLocaleString("en-US");if(Math.abs(v)>=1)return"$"+v.toLocaleString("en-US",{maximumFractionDigits:2});return"$"+v.toLocaleString("en-US",{maximumSignificantDigits:6});}
function compact(v){return Number.isFinite(Number(v))?new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(Number(v)):"--";}
function pct(v){return Number.isFinite(Number(v))?(Number(v)>=0?"+":"")+Number(v).toFixed(2)+"%":"--";}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}
function cls(v){return Number(v)>=0?"positive":"negative";}
function set(el,text,color){if(!el)return;el.textContent=text;if(color)el.style.color=color;}
function colorFor(v){return Number(v)>=0?"var(--green)":"#ff5c5c";}
function nearest(points,target){return points.reduce((best,p)=>Math.abs(p[0]-target)<Math.abs(best[0]-target)?p:best,points[0]);}
function dailySeries(prices){const m=new Map();for(const p of prices){const d=new Date(p[0]),key=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());if(!m.has(key)||p[0]>m.get(key)[0])m.set(key,p);}return [...m.values()].sort((a,b)=>a[0]-b[0]);}

function sma(values,n){return values.length>=n?avg(values.slice(-n)):null;}
function ema(values,n){if(values.length<n)return null;let e=avg(values.slice(0,n)),k=2/(n+1);for(let i=n;i<values.length;i++)e=values[i]*k+e*(1-k);return e;}
function rsi(values,n=14){if(values.length<n+1)return null;let gains=0,losses=0;for(let i=values.length-n;i<values.length;i++){const d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d;}if(losses===0)return 100;return 100-(100/(1+(gains/n)/(losses/n)));}
function atr(candles,n=14){if(candles.length<n+1)return null;const trs=[];for(let i=1;i<candles.length;i++){const c=candles[i],prev=candles[i-1];trs.push(Math.max(c.high-c.low,Math.abs(c.high-prev.close),Math.abs(c.low-prev.close)));}return avg(trs.slice(-n));}
function maxDrawdown(values){let peak=values[0]||0,best=0;for(const v of values){if(v>peak)peak=v;if(peak)best=Math.min(best,(v/peak-1)*100);}return best;}
function std(values){if(!values.length)return 0;const m=avg(values);return Math.sqrt(avg(values.map(x=>(x-m)**2)));}
function returns(values){const r=[];for(let i=1;i<values.length;i++)if(values[i-1]>0)r.push((values[i]/values[i-1]-1)*100);return r;}

function drawChart(points,volumes){
 if(!points.length){els.chart.textContent="No historical data available.";return;}
 const W=1000,H=300,P=20,vals=points.map(x=>x[1]),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
 const line=points.map((p,i)=>{const x=P+i/(points.length-1||1)*(W-P*2),y=H-P-(p[1]-min)/range*(H-P*2);return(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1)}).join(" ");
 const area=line+" L "+(W-P)+" "+(H-P)+" L "+P+" "+(H-P)+" Z";
 const maxVol=Math.max(...volumes.map(x=>Number(x[1])||0),1);
 els.chart.innerHTML='<div class="chart-value-row"><span>Low '+money(min)+'</span><b>'+money(vals.at(-1))+'</b><span>High '+money(max)+'</span></div><div class="chart-interactive"><svg class="price-svg" viewBox="0 0 1000 300" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="rgba(53,224,139,.20)"/><stop offset="100%" stop-color="rgba(53,224,139,0)"/></linearGradient></defs><path d="'+area+'" fill="url(#chartFill)"/><path d="'+line+'" fill="none" stroke="#35e08b" stroke-width="3" vector-effect="non-scaling-stroke"/></svg><div class="chart-tooltip" id="chartTooltip"></div><div class="chart-hover-line" id="chartHoverLine"></div><div class="chart-hover-dot" id="chartHoverDot"></div></div><div class="chart-times"><span>'+new Date(points[0][0]).toLocaleDateString()+'</span><span>'+new Date(points.at(-1)[0]).toLocaleDateString()+'</span></div><div class="volume-title">Volume</div><div class="volume-bars">'+volumes.map((v,i)=>'<span style="height:'+Math.max(4,Number(v[1]||0)/maxVol*100)+'%"></span>').join("")+'</div>';
 const wrap=$("chartPlaceholder").querySelector(".chart-interactive"),tip=$("chartTooltip"),hl=$("chartHoverLine"),dot=$("chartHoverDot");
 wrap.addEventListener("mousemove",e=>{const r=wrap.getBoundingClientRect(),q=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),i=Math.round(q*(points.length-1)),p=points[i],v=volumes[Math.min(i,volumes.length-1)]?.[1]||0,y=(H-P-(p[1]-min)/range*(H-P*2))/H*100;tip.innerHTML="<b>"+money(p[1])+"</b><br><span>"+new Date(p[0]).toLocaleString()+"</span><br><span>Volume: "+compact(v)+"</span>";tip.style.left=Math.min(82,Math.max(2,q*100))+"%";tip.style.display="block";hl.style.left=q*100+"%";hl.style.display="block";dot.style.left=q*100+"%";dot.style.top=y+"%";dot.style.display="block";});
 wrap.addEventListener("mouseleave",()=>{tip.style.display=hl.style.display=dot.style.display="none";});
}

async function api(path){let last;for(const base of API_BASES){try{const r=await fetch(base+path,{cache:"no-store",headers:{accept:"application/json"}});if(r.ok)return r.json();last=new Error("API "+r.status)}catch(e){last=e}}throw last||new Error("API unavailable")}
async function history(days){return api("/api/coingecko/coins/"+encodeURIComponent(coinId)+"/market_chart?vs_currency=usd&days="+days+"&interval="+(days==="max"?"daily":""));}

function renderPeriods(prices){
 const now=prices.at(-1),targets=[{label:"Now",days:0},{label:"3 days ago",days:3},{label:"7 days ago",days:7},{label:"30 days ago",days:30}];
 els.periodGrid.innerHTML=targets.map(t=>{const p=t.days?nearest(prices,now[0]-t.days*86400000):now;const ch=t.days?(now[1]/p[1]-1)*100:null;return '<div class="crypto-period-card"><span>'+t.label+'</span><strong>'+money(p[1])+'</strong><small class="'+(ch==null?"":cls(ch))+'">'+(ch==null?"Live market price":pct(ch)+" from that period")+'</small></div>';}).join("");
 const days=dailySeries(prices),moves=[];for(let i=Math.max(1,days.length-8);i<days.length;i++)moves.push({d:new Date(days[i][0]),p:days[i][1],c:(days[i][1]/days[i-1][1]-1)*100});
 els.dailyMoves.innerHTML=moves.reverse().map(x=>'<div class="daily-move"><span>'+x.d.toLocaleDateString("en-US",{month:"short",day:"numeric"})+'</span><b>'+money(x.p)+'</b><strong class="'+cls(x.c)+'">'+pct(x.c)+'</strong></div>').join("");
 els.dailyUpdated.textContent="Updated "+new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
}

function analyze(data){
 const p=(data.prices||[]).map(x=>x[1]).filter(Number.isFinite),vol=(data.total_volumes||[]).map(x=>x[1]).filter(Number.isFinite);
 if(p.length<10)return;
 const last=p.at(-1), r=returns(p), ma20=sma(p,20),ma50=sma(p,50),rsi14=rsi(p),e12=ema(p,12),e26=ema(p,26),macd=e12!=null&&e26!=null?e12-e26:null;
 const sd=std(r),annualVol=sd*Math.sqrt(365)*100,dd=maxDrawdown(p),hi=Math.max(...p),lo=Math.min(...p);
 const support=Math.min(...p.slice(-10)),resistance=Math.max(...p.slice(-10)),atr14=atr(p.map((x,i)=>({high:x,low:x,close:x})),14);
 const bollMid=ma20,bollStd=p.length>=20?std(p.slice(-20)):null,bollUp=bollMid!=null?bollMid+2*bollStd:null,bollLow=bollMid!=null?bollMid-2*bollStd:null;
 const v7=avg(vol.slice(-7)),v30=avg(vol.slice(-30)),prev7=avg(vol.slice(-14,-7)),vchg=prev7?((v7/prev7)-1)*100:0,ratio=market?.market_cap?.usd?((market.total_volume?.usd||0)/market.market_cap.usd)*100:0;
 const p3=nearest(data.prices,last[0]-3*86400000)[1],p7=nearest(data.prices,last[0]-7*86400000)[1],p30=nearest(data.prices,last[0]-30*86400000)[1];
 const c3=(last/p3-1)*100,c7=(last/p7-1)*100,c30=(last/p30-1)*100,trend=ma20!=null&&ma50!=null?(last>ma20&&ma20>ma50?"Uptrend":last<ma20&&ma20<ma50?"Downtrend":"Mixed"):"--";
 const momentum=c7>2?"Positive":c7<-2?"Negative":"Neutral",risk=annualVol>100?"High":annualVol>50?"Medium":"Lower";
 set(els.rsi,rsi14==null?"--":rsi14.toFixed(1),rsi14>=70?"#ff5c5c":rsi14<=30?"var(--green)":"#f5f5f5");set(els.rsiState,rsi14>=70?"Overbought":rsi14<=30?"Oversold":"Neutral");
 set(els.ma20,ma20==null?"--":money(ma20),last>=ma20?"var(--green)":"#ff5c5c");set(els.ma20State,last>=ma20?"Price above MA20":"Price below MA20");
 set(els.ma50,ma50==null?"--":money(ma50),last>=ma50?"var(--green)":"#ff5c5c");set(els.ma50State,last>=ma50?"Price above MA50":"Price below MA50");
 set(els.macd,macd==null?"--":money(macd),macd>=0?"var(--green)":"#ff5c5c");set(els.macdState,macd>=0?"Positive":"Negative");
 set(els.atr,atr14==null?"--":money(atr14));set(els.boll,bollMid==null?"--":money(bollMid));set(els.bollState,last>bollUp?"Above upper band":last<bollLow?"Below lower band":"Inside bands");
 set(els.volatility,annualVol.toFixed(2)+"%",annualVol>50?"#ff5c5c":"#f5f5f5");set(els.drawdown,dd.toFixed(2)+"%","#ff5c5c");set(els.periodHigh,money(hi));set(els.periodLow,money(lo));set(els.support,money(support));set(els.resistance,money(resistance));
 const athDist=market?.ath?.usd?((last/market.ath.usd)-1)*100:null;set(els.athDistance,athDist==null?"--":pct(athDist),athDist>=0?"var(--green)":"#ff5c5c");
 set(els.analysisVolume,money(market?.total_volume?.usd));set(els.avgVol7,compact(v7));set(els.avgVol30,compact(v30));set(els.volChange,pct(vchg),colorFor(vchg));set(els.volRatio,ratio.toFixed(2)+"%");set(els.volActivity,vchg>25?"Increasing":vchg<-25?"Decreasing":"Stable");
 set(els.a3,pct(c3),colorFor(c3));set(els.a7,pct(c7),colorFor(c7));set(els.a30,pct(c30),colorFor(c30));set(els.trendText,trend);set(els.momentumText,momentum);
 set(els.trend,trend);set(els.momentum,momentum);set(els.volumeSignal,vchg>25?"High":vchg<-25?"Low":"Normal");set(els.risk,risk);
 els.summary.textContent="Current price is "+(last>=ma20?"above":"below")+" the 20-period average, the 7-day move is "+pct(c7)+", and recent volume is "+(vchg>=0?"higher":"lower")+" than the previous 7-day period. Volatility and drawdown describe historical movement, not future performance.";
}

async function loadChart(days){
 els.chart.textContent="Loading historical data...";
 try{const d=await history(days);latestHistory=d;drawChart(d.prices||[],d.total_volumes||[]);if(days==="30"){analyze(d);renderPeriods(d.prices||[]);}}catch(e){console.error(e);els.chart.textContent="Historical data unavailable.";}
}

async function loadCoin(){
 try{
  coin=await api("/api/coingecko/coins/"+encodeURIComponent(coinId)+"?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false");
  market=coin.market_data||{};
  els.name.textContent=coin.name||coinId;els.symbol.textContent=(coin.symbol||"").toUpperCase();
  if(coin.image?.large){els.icon.src=coin.image.large;els.icon.style.display="block";els.fallback.style.display="none";}
  else{els.fallback.textContent=(coin.symbol||"C").slice(0,3).toUpperCase();}
  set(els.price,money(market.current_price?.usd));const ch=Number(market.price_change_percentage_24h||0);set(els.change,pct(ch),colorFor(ch));
  set(els.marketCap,money(market.market_cap?.usd));set(els.volume,money(market.total_volume?.usd));set(els.high,money(market.high_24h?.usd));set(els.low,money(market.low_24h?.usd));set(els.supply,compact(market.circulating_supply));set(els.ath,money(market.ath?.usd));set(els.athDate,market.ath_date?.usd?new Date(market.ath_date.usd).toLocaleDateString():"--");set(els.updated,new Date().toLocaleTimeString());
  await loadChart("30");await loadExchanges((coin.symbol||"").toUpperCase());
 }catch(e){console.error(e);els.name.textContent="Data unavailable";els.chart.textContent="Could not load cryptocurrency data.";}
}

const pairMap={BTC:["BTCUSDT","BTC-USD","XXBTZUSD"],ETH:["ETHUSDT","ETH-USD","XETHZUSD"],SOL:["SOLUSDT","SOL-USD","SOLUSD"],BNB:["BNBUSDT","BNB-USD","BNBUSD"],XRP:["XRPUSDT","XRP-USD","XXRPZUSD"],DOGE:["DOGEUSDT","DOGE-USD","DOGEUSD"]};
const major=[["binance","Binance"],["coinbase","Coinbase"],["kraken","Kraken"],["bybit","Bybit"],["okx","OKX"],["kucoin","KuCoin"],["bitget","Bitget"],["gate","Gate.io"],["mexc","MEXC"],["cryptocom","Crypto.com"]];

async function exchangeQuote(provider,symbol){
 const r=await fetch("/api/exchanges?provider="+encodeURIComponent(provider)+"&symbol="+encodeURIComponent(symbol));if(!r.ok)throw new Error();return r.json();
}
async function loadExchanges(symbol){
 const pair=pairMap[symbol]||[symbol+"USDT",symbol+"-USD",symbol+"USD"];
 els.exchangeStatus.textContent="Loading exchange prices...";
 els.exchangeTable.innerHTML=major.map(x=>'<div class="exchange-analysis-row"><b>'+x[1]+'</b><span class="exchange-loading">Loading...</span><span>--</span></div>').join("");
 const rows=await Promise.all(major.map(async([provider,name],i)=>{try{const d=await exchangeQuote(provider,provider==="coinbase"?pair[1]:provider==="kraken"?pair[2]:pair[0]);let price=NaN,vol=NaN,ch=NaN;if(d?.source==="ccxt"){price=Number(d.lastPrice);vol=Number(d.quoteVolume);ch=Number(d.priceChangePercent)}else if(provider==="binance"||provider==="mexc"){price=Number(d.lastPrice);vol=Number(d.quoteVolume);ch=Number(d.priceChangePercent)}else if(provider==="bybit"){const x=d.result?.list?.[0];price=Number(x?.lastPrice);vol=Number(x?.turnover24h);ch=Number(x?.price24hPcnt)*100}else if(provider==="okx"){const x=d.data?.[0];price=Number(x?.last);vol=Number(x?.vol24h);ch=Number(x?.sodUtc8)?NaN:NaN}else if(provider==="kucoin"){price=Number(d.data?.last);vol=Number(d.data?.volValue);ch=Number(d.data?.changeRate)*100}else if(provider==="bitget"){const x=d.data?.[0];price=Number(x?.lastPr);vol=Number(x?.quoteVolume);ch=Number(x?.change24h)*100}else if(provider==="gate"){const x=Array.isArray(d)?d[0]:null;price=Number(x?.last);vol=Number(x?.quote_volume);ch=Number(x?.change_percentage)}else if(provider==="cryptocom"){const x=d.result?.data?.[0];price=Number(x?.kline?.c||x?.a);vol=Number(x?.v);ch=Number(x?.price_change_percent)}else if(provider==="coinbase"){price=Number(d.data?.price);vol=Number(d.data?.volume_24h);ch=NaN}else if(provider==="kraken"){const x=Object.values(d.result||{})[0];price=Number(x?.c?.[0]);vol=Number(x?.v?.[1]);ch=NaN}
 return {name,price,vol,ch,ok:Number.isFinite(price)};}catch{return{name,price:NaN,vol:NaN,ch:NaN,ok:false}}}));
 const good=rows.filter(x=>x.ok),prices=good.map(x=>x.price),min=prices.length?Math.min(...prices):NaN,max=prices.length?Math.max(...prices):NaN;
 els.exchangeTable.innerHTML=rows.map(x=>'<div class="exchange-analysis-row"><b>'+x.name+'</b><span>'+money(x.price)+'</span><span class="'+(x.ch>=0?"positive":"negative")+'">'+pct(x.ch)+'</span><span>'+compact(x.vol)+'</span></div>').join("");
 if(Number.isFinite(min)&&Number.isFinite(max))els.exchangeStatus.textContent=good.length+" exchanges • spread "+((max/min-1)*100).toFixed(3)+"%";
 else els.exchangeStatus.textContent=good.length+" exchanges returned live data";
}

document.querySelectorAll(".range").forEach(btn=>btn.addEventListener("click",async()=>{document.querySelectorAll(".range").forEach(x=>x.classList.remove("active"));btn.classList.add("active");await loadChart(btn.dataset.range);}));
if(els.favorite)els.favorite.addEventListener("click",async()=>{try{const current=JSON.parse(localStorage.getItem("gugeeFavorites")||"[]");const i=current.indexOf(coinId);if(i>=0){current.splice(i,1);els.favorite.textContent="☆ Add to Favorites";}else{current.push(coinId);els.favorite.textContent="★ In Favorites";}localStorage.setItem("gugeeFavorites",JSON.stringify(current));}catch{}});
loadCoin();
setInterval(()=>{loadCoin().catch(()=>{});},60000);
