function runScreener(){
 const body=document.getElementById("screenerBody"),count=document.getElementById("screenerCount");if(!body)return;
 const raw24=document.getElementById("screen24")?.value.trim()||"",raw30=document.getElementById("screen30")?.value.trim()||"",rawCap=document.getElementById("screenCap")?.value.trim()||"",rawRatio=document.getElementById("screenRatio")?.value.trim()||"";
 const min24=raw24===""?null:Number(raw24),min30=raw30===""?null:Number(raw30),minCap=rawCap===""?null:Number(rawCap),minRatio=rawRatio===""?null:Number(rawRatio);
 const direction=document.getElementById("screenDirection")?.value||"all",liq=document.getElementById("screenLiquidity")?.value||"all",vol=document.getElementById("screenVolatility")?.value||"all",sortBy=document.getElementById("screenSort")?.value||"cap";
 let list=coins.filter(c=>{
  const ch24=Number(c.price_change_percentage_24h),ch30=Number(c.price_change_percentage_30d_in_currency),ratio=Number(c.market_cap)>0?Number(c.total_volume)/Number(c.market_cap)*100:null;
  return (min24===null||Number.isFinite(min24)&&ch24>=min24)&&(min30===null||Number.isFinite(min30)&&ch30>=min30)&&(minCap===null||Number.isFinite(minCap)&&Number(c.market_cap)>=minCap*1e6)&&(minRatio===null||Number.isFinite(minRatio)&&ratio!=null&&ratio>=minRatio)&&
   (direction==="all"||(direction==="gainers"&&ch24>0)||(direction==="losers"&&ch24<0))&&
   (liq==="all"||(ratio!=null&&(liq==="high"?ratio>5:liq==="medium"?ratio>=1&&ratio<=5:ratio<1)));
 });
 if(vol!=="all")list=list.filter(c=>{const v=Math.abs(Number(c.price_change_percentage_30d_in_currency)||0);return vol==="high"?v>30:vol==="medium"?v>=10&&v<=30:v<10});
 list.sort((a,b)=>sortBy==="24h"?Number(b.price_change_percentage_24h||-Infinity)-Number(a.price_change_percentage_24h||-Infinity):sortBy==="30d"?Number(b.price_change_percentage_30d_in_currency||-Infinity)-Number(a.price_change_percentage_30d_in_currency||-Infinity):sortBy==="volume"?Number(b.total_volume||0)-Number(a.total_volume||0):Number(b.market_cap||0)-Number(a.market_cap||0));
 count.textContent=list.length+" assets";
 body.innerHTML=list.slice(0,50).map(c=>{const ratio=c.market_cap>0?c.total_volume/c.market_cap*100:null;return '<tr data-id="'+c.id+'"><td><b>'+c.symbol.toUpperCase()+'</b><small>'+c.name+'</small></td><td>'+money(c.current_price)+'</td><td class="'+(c.price_change_percentage_24h>=0?"positive":"negative")+'">'+(c.price_change_percentage_24h>=0?"+":"")+Number(c.price_change_percentage_24h||0).toFixed(2)+'%</td><td>'+ (Number.isFinite(c.price_change_percentage_30d_in_currency)?(c.price_change_percentage_30d_in_currency>=0?"+":"")+c.price_change_percentage_30d_in_currency.toFixed(2)+"%":"--") +'</td><td>'+compact(c.market_cap)+'</td><td>'+ (ratio==null?"--":ratio.toFixed(2)+"%") +'</td></tr>'}).join("")||'<tr><td colspan="6">No assets match these filters.</td></tr>';
 body.querySelectorAll("tr[data-id]").forEach(row=>row.addEventListener("click",()=>location.href="crypto.html?coin="+row.dataset.id));
}

document.getElementById("runScreener")?.addEventListener("click",runScreener);
async function loadRiskDashboard(){
 const box=document.getElementById("riskDashboard");if(!box)return;
 const ids=["bitcoin","ethereum","solana","binancecoin"],labels=["BTC","ETH","SOL","BNB"];
 try{
  const rows=await Promise.all(ids.map(async(id,i)=>{
   const r=await fetch("/api/coingecko/coins/"+id+"/market_chart?vs_currency=usd&days=30");
   if(!r.ok)throw new Error();const d=await r.json(),prices=(d.prices||[]).map(x=>x[1]).filter(Number.isFinite);
   if(prices.length<10)throw new Error();
   const ret=prices.slice(1).map((v,k)=>v/prices[k]-1),mean=ret.reduce((a,b)=>a+b,0)/ret.length;
   const variance=ret.reduce((a,b)=>a+(b-mean)**2,0)/ret.length;
   const vol=Math.sqrt(variance)*Math.sqrt(365)*100;
   let peak=prices[0],maxDd=0;prices.forEach(v=>{if(v>peak)peak=v;const dd=(v/peak-1)*100;if(dd<maxDd)maxDd=dd});
   const low=Math.min(...prices),high=Math.max(...prices),range=(high/low-1)*100;
   return {label:labels[i],vol,maxDd,range};
  }));
  box.innerHTML=rows.map(x=>'<div class="risk-card"><div class="risk-card-top"><b>'+x.label+'</b><span>'+ (x.vol>100?"High":x.vol>50?"Medium":"Lower") +' volatility</span></div><div class="risk-item"><span>30D volatility</span><b>'+x.vol.toFixed(2)+'%</b></div><div class="risk-item"><span>Max drawdown</span><b>'+x.maxDd.toFixed(2)+'%</b></div><div class="risk-item"><span>High / Low range</span><b>'+x.range.toFixed(2)+'%</b></div></div>').join('');
 }catch{box.innerHTML='<div class="exchange-overview-empty">Risk data unavailable.</div>'}
}
async function loadCorrelation(){
 const box=document.getElementById("correlationTable");if(!box)return;
 const ids=["bitcoin","ethereum","solana","binancecoin"],labels=["BTC","ETH","SOL","BNB"];
 try{
  const series=await Promise.all(ids.map(async id=>{
   const r=await fetch("/api/coingecko/coins/"+id+"/market_chart?vs_currency=usd&days=30");
   if(!r.ok)throw new Error();const d=await r.json();return (d.prices||[]).map(x=>x[1]);
  }));
  const n=Math.min(...series.map(x=>x.length));if(n<10)throw new Error();
  const returns=series.map(s=>{const x=s.slice(-n);return x.slice(1).map((v,i)=>Math.log(v/x[i]))});
  function corr(a,b){const ma=a.reduce((x,y)=>x+y,0)/a.length,mb=b.reduce((x,y)=>x+y,0)/b.length;let num=0,da=0,db=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;num+=x*y;da+=x*x;db+=y*y}return da&&db?num/Math.sqrt(da*db):0}
  box.innerHTML='<table class="correlation-table"><thead><tr><th></th>'+labels.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+labels.map((l,i)=>'<tr><th>'+l+'</th>'+labels.map((_,j)=>'<td class="'+(corr(returns[i],returns[j])>=0?"corr-positive":"corr-negative")+'">'+corr(returns[i],returns[j]).toFixed(2)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 }catch{box.innerHTML='<div class="exchange-overview-empty">Correlation data unavailable.</div>'}
}
async function loadBtcHistory(days=30,coin="bitcoin",label="BTC"){
 const svg=document.getElementById("btcHistoryChart"),tip=document.getElementById("btcHistoryTooltip"),metrics=document.getElementById("btcHistoryMetrics");
 if(!svg)return;
 try{
  const r=await fetch("/api/coingecko/coins/"+coin+"/market_chart?vs_currency=usd&days="+days);
  if(!r.ok)throw new Error();
  const d=await r.json(),pts=(d.prices||[]).filter(x=>Number.isFinite(x[1]));
  if(pts.length<2)throw new Error();
  const vals=pts.map(x=>x[1]),min=Math.min(...vals),max=Math.max(...vals),w=900,h=280,p=18;
  const path=pts.map((x,i)=>{const xx=p+i*(w-p*2)/(pts.length-1),yy=h-p-(x[1]-min)/(max-min||1)*(h-p*2);return (i?"L":"M")+xx.toFixed(1)+" "+yy.toFixed(1)}).join(" ");
  svg.innerHTML='<path d="'+path+'" fill="none" stroke="currentColor" stroke-width="2"/>';
  const start=vals[0],end=vals[vals.length-1],change=(end/start-1)*100,high=max,low=min;
  metrics.innerHTML='<span>Start <b>'+exchangeMoney(start)+'</b></span><span>Current <b>'+exchangeMoney(end)+'</b></span><span>Period change <b class="'+(change>=0?"positive":"negative")+'">'+(change>=0?"+":"")+change.toFixed(2)+'%</b></span><span>Period high <b>'+exchangeMoney(high)+'</b></span><span>Period low <b>'+exchangeMoney(low)+'</b></span>';
  svg.onmousemove=e=>{const rect=svg.getBoundingClientRect(),idx=Math.max(0,Math.min(pts.length-1,Math.round(((e.clientX-rect.left)/rect.width)*(pts.length-1))));const v=pts[idx];tip.style.display="block";tip.style.left=(e.clientX-rect.left)+"px";tip.style.top="10px";tip.textContent=new Date(v[0]).toLocaleDateString()+" · "+exchangeMoney(v[1])};
  svg.onmouseleave=()=>tip.style.display="none";
 }catch{svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="currentColor">Historical data unavailable</text>'}
}
document.querySelectorAll(".history-range").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".history-range").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const a=document.querySelector(".history-asset.active");loadBtcHistory(Number(btn.dataset.days),a?.dataset.coin||"bitcoin",a?.dataset.label||"BTC")})); document.querySelectorAll(".history-asset").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".history-asset").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.getElementById("historyTitle").textContent=btn.dataset.label+" historical trend";const r=document.querySelector(".history-range.active");loadBtcHistory(Number(r?.dataset.days||30),btn.dataset.coin,btn.dataset.label)}));
const API="/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=";
const GLOBAL_API="/api/coingecko/global";
const GLOBAL_CHART_API="/api/coingecko/global/market_cap_chart?vs_currency=usd&days=";
const globalCap=document.getElementById("globalCap"),globalVolume=document.getElementById("globalVolume"),btcDominance=document.getElementById("btcDominance"),activeCoins=document.getElementById("activeCoins"),marketBreadth=document.getElementById("marketBreadth"),topGainers=document.getElementById("topGainers"),topLosers=document.getElementById("topLosers"),marketHeatmap=document.getElementById("marketHeatmap"),globalMarketChart=document.getElementById("globalMarketChart"),globalChartTooltip=document.getElementById("globalChartTooltip");
let globalChartData=[];
const marketSignals=document.getElementById("marketSignals"),analysisEngine=document.getElementById("analysisEngine"),body=document.getElementById("marketTableBody"),liquidity=document.getElementById("liquiditySelect"),search=document.getElementById("marketSearch"),sort=document.getElementById("sortSelect"),category=document.getElementById("categorySelect"),changePeriod=document.getElementById("changePeriod"),changeDirection=document.getElementById("changeDirection"),more=document.getElementById("loadMore"),status=document.getElementById("marketStatus"),favoritesOnly=document.getElementById("favoritesOnly");
const exchangeOverview=document.getElementById("exchangeOverview"),exchangeUpdated=document.getElementById("exchangeUpdated"),exchangeAssetRows=document.getElementById("exchangeAssetRows"),spreadGrid=document.getElementById("spreadGrid");
const exchangeAssets=[
 {id:"BTC",label:"BTC / USD",binance:"BTCUSDT",coinbase:"BTC-USD",kraken:"XBTUSD",bybit:"BTCUSDT"},
 {id:"ETH",label:"ETH / USD",binance:"ETHUSDT",coinbase:"ETH-USD",kraken:"ETHUSD",bybit:"ETHUSDT"},
 {id:"SOL",label:"SOL / USD",binance:"SOLUSDT",coinbase:"SOL-USD",kraken:"SOLUSD",bybit:"SOLUSDT"},
 {id:"BNB",label:"BNB / USD",binance:"BNBUSDT",coinbase:null,kraken:null,bybit:"BNBUSDT"}
];
async function fetchExchangePrice(exchange,symbol){
 try{
  let url,price=null;
  if(exchange==="Binance")url="/api/exchanges?provider=binance&symbol="+symbol;
  if(exchange==="Coinbase")url="/api/exchanges?provider=coinbase&symbol="+symbol+"/ticker";
  if(exchange==="Kraken")url="/api/exchanges?provider=kraken&symbol="+symbol;
  if(exchange==="Bybit")url="/api/exchanges?provider=bybit&symbol="+symbol;
  if(!url)return null;
  const r=await fetch(url);if(!r.ok)throw new Error();const d=await r.json();
  if(exchange==="Binance")price=Number(d.price);
  if(exchange==="Coinbase")price=Number(d.price);
  if(exchange==="Kraken"){const x=d.result?.[Object.keys(d.result||{})[0]];price=Number(x?.c?.[0])}
  if(exchange==="Bybit")price=Number(d.result?.list?.[0]?.lastPrice);
  return Number.isFinite(price)?price:null;
 }catch{return null}
}
async function loadExchangeAssets(){
 if(!exchangeAssetRows)return;
 const rows=await Promise.all(exchangeAssets.map(async a=>{
  const values=await Promise.all([
   fetchExchangePrice("Binance",a.binance),
   fetchExchangePrice("Coinbase",a.coinbase),
   fetchExchangePrice("Kraken",a.kraken),
   fetchExchangePrice("Bybit",a.bybit)
  ]);
  return {a,values};
 }));
 exchangeAssetRows.innerHTML=rows.map(({a,values})=>{
  const valid=values.filter(Number.isFinite),avg=valid.length?valid.reduce((x,y)=>x+y,0)/valid.length:null;
  return '<div class="exchange-asset-row"><b>'+a.label+'</b>'+values.map(v=>'<span>'+exchangeMoney(v)+'</span>').join('')+'</div>';
 }).join('');
}
const exchangeSources=[
 {name:"Binance",provider:"binance",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/binance"},
 {name:"Coinbase",provider:"coinbase",symbol:"BTC-USD/ticker",logo:"https://cdn.simpleicons.org/coinbase"},
 {name:"Kraken",provider:"kraken",symbol:"XBTUSD",logo:"https://cdn.simpleicons.org/kraken"},
 {name:"Bybit",provider:"bybit",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bybit"},
 {name:"OKX",provider:"okx",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/okx"},
 {name:"KuCoin",provider:"kucoin",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/kucoin"},
 {name:"Bitget",provider:"bitget",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bitget"},
 {name:"Gate.io",provider:"gate",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/gate"},
 {name:"MEXC",provider:"mexc",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/mexc"},
 {name:"Crypto.com",provider:"cryptocom",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/crypto-dot-com"}
];
function exchangeApiUrl(e){return "/api/exchanges?provider="+encodeURIComponent(e.provider)+"&symbol="+encodeURIComponent(e.symbol)}
function exchangeMoney(v){return Number.isFinite(v)?v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}):"--"}
async function loadSpreadMonitor(){
 if(!spreadGrid)return;
 const rows=await Promise.all(exchangeAssets.map(async a=>{
  const values=await Promise.all([
   fetchExchangePrice("Binance",a.binance),
   fetchExchangePrice("Coinbase",a.coinbase),
   fetchExchangePrice("Kraken",a.kraken),
   fetchExchangePrice("Bybit",a.bybit)
  ]);
  const valid=values.map((v,i)=>Number.isFinite(v)?{name:["Binance","Coinbase","Kraken","Bybit"][i],price:v}:null).filter(Boolean);
  if(valid.length<2)return {label:a.label,low:null,high:null,spread:null};
  const low=valid.reduce((x,y)=>y.price<x.price?y:x);
  const high=valid.reduce((x,y)=>y.price>x.price?y:x);
  return {label:a.label,low,high,spread:(high.price/low.price-1)*100};
 }));
 spreadGrid.innerHTML=rows.map(x=>x.spread==null
  ? '<div class="spread-card"><b>'+x.label+'</b><span>Not enough exchange data</span></div>'
  : '<div class="spread-card"><div class="spread-card-top"><b>'+x.label+'</b><strong>+'+x.spread.toFixed(3)+'%</strong></div><div class="spread-card-line"><span>Lowest</span><b>'+x.low.name+' · '+exchangeMoney(x.low.price)+'</b></div><div class="spread-card-line"><span>Highest</span><b>'+x.high.name+' · '+exchangeMoney(x.high.price)+'</b></div></div>'
 ).join('');
}
async function loadExchangeOverview(){
 const results=await Promise.all(exchangeSources.map(async e=>{
  try{
   const r=await fetch(exchangeApiUrl(e));if(!r.ok)throw new Error();
   const d=await r.json();let price=null,volume=null,change=null;
   if(e.provider==="binance"){price=Number(d.lastPrice);volume=Number(d.quoteVolume);change=Number(d.priceChangePercent)}
   if(e.provider==="coinbase"){price=Number(d.price);volume=Number(d.volume_24h)*price}
   if(e.provider==="kraken"){const x=d.result?.XXBTZUSD||Object.values(d.result||{})[0];price=Number(x?.c?.[0]);volume=Number(x?.v?.[1])*price}
   if(e.provider==="bybit"){const x=d.result?.list?.[0];price=Number(x?.lastPrice);volume=Number(x?.turnover24h);change=Number(x?.price24hPcnt)*100}
   if(e.provider==="okx"){const x=d.data?.[0];price=Number(x?.last);volume=Number(x?.volCcy24h);change=Number(x?.open24h)?(price/Number(x.open24h)-1)*100:null}
   if(e.provider==="kucoin"){price=Number(d.data?.last);volume=Number(d.data?.volValue);change=Number(d.data?.changeRate)*100}
   if(e.provider==="bitget"){const x=d.data?.[0];price=Number(x?.lastPr);volume=Number(x?.quoteVolume);change=Number(x?.change24h)*100}
   if(e.provider==="gate"){const x=Array.isArray(d)?d[0]:d;price=Number(x?.last);volume=Number(x?.quote_volume);change=Number(x?.change_percentage)}
   if(e.provider==="mexc"){price=Number(d.lastPrice);volume=Number(d.quoteVolume);change=Number(d.priceChangePercent)}
   if(e.provider==="cryptocom"){const x=d.result?.data?.[0];price=Number(x?.k);volume=Number(x?.v);change=Number(x?.c)}
   return {...e,price,volume,change};
  }catch{return {...e,price:null,volume:null,change:null}}
 }));
 const valid=results.filter(x=>Number.isFinite(x.price));
 if(!exchangeOverview)return;
 if(!valid.length){exchangeOverview.innerHTML='<div class="exchange-overview-empty">Exchange data unavailable.</div>';return}
 const min=Math.min(...valid.map(x=>x.price));
 exchangeOverview.innerHTML=results.map(x=>{
  const spread=Number.isFinite(x.price)&&min>0?((x.price/min-1)*100):null;
  const cls=x.change==null?"neutral":x.change>=0?"positive":"negative";
  const ch=x.change==null?"--":(x.change>=0?"+":"")+x.change.toFixed(2)+"%";
  return '<a class="exchange-live-card exchange-analysis-link" href="exchange.html?exchange='+x.provider+'"><div class="exchange-live-top"><div class="exchange-brand"><img src="'+x.logo+'" alt="'+x.name+' logo" loading="lazy"><b>'+x.name+'</b></div><span>BTC / USD</span></div><strong>'+exchangeMoney(x.price)+'</strong><div class="exchange-live-metrics"><span>24H</span><b class="'+cls+'">'+ch+'</b><span>Volume</span><b>'+exchangeMoney(x.volume)+'</b></div><div class="exchange-spread">'+(spread==null?"Unavailable":"+"+spread.toFixed(3)+"% vs lowest price")+'</div></div>'
 }).join("");
 exchangeUpdated.textContent="Updated "+new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
}
const WATCHLIST_KEY="gugee_watchlist"; let coins=[],visible=50,currentPage=1,loadingMore=false,hasMore=true;
const getFavorites=()=>JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"[]");
const saveFavorites=v=>localStorage.setItem(WATCHLIST_KEY,JSON.stringify(v));
const money=v=>v==null?"--":v>=1?v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}):v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumSignificantDigits:5});
const compact=v=>v==null?"--":new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(v);
function signalLabel(change,volatility){
 const trend=change>2?"Strong positive":change>0?"Positive":change<-2?"Strong negative":change<0?"Negative":"Flat";
 const risk=volatility==null?"Unknown":volatility>8?"High":volatility>4?"Medium":"Low";
 return {trend,risk};
}
function renderAnalysisEngine(){
 if(!analysisEngine||!coins.length)return;
 const ids=["bitcoin","ethereum","solana","binancecoin"];
 const labels={bitcoin:"BTC",ethereum:"ETH",solana:"SOL",binancecoin:"BNB"};
 analysisEngine.innerHTML=ids.map(id=>{
  const c=coins.find(x=>x.id===id);
  if(!c)return "";
  const ch24=Number(c.price_change_percentage_24h);
  const ch7=Number(c.price_change_percentage_7d_in_currency);
  const ch30=Number(c.price_change_percentage_30d_in_currency);
  const ratio=Number(c.market_cap)>0?Number(c.total_volume)/Number(c.market_cap)*100:null;
  const score=(Number.isFinite(ch24)?(ch24>0?1:-1):0)+(Number.isFinite(ch7)?(ch7>0?1:-1):0)+(Number.isFinite(ch30)?(ch30>0?1:-1):0)+(ratio!=null?(ratio>5?1:ratio<1?-1:0):0);
  const signal=score>=3?"Positive":score<=-2?"Negative":"Mixed";
  const cls=signal==="Positive"?"positive":signal==="Negative"?"negative":"neutral";
  return '<div class="analysis-engine-card"><div class="analysis-engine-top"><b>'+labels[id]+'</b><span class="'+cls+'">'+signal+'</span></div><div class="analysis-score">Factor score <strong>'+score+'/4</strong></div><div class="analysis-factors"><span>24H <b>'+ (Number.isFinite(ch24)?(ch24>=0?"+":"")+ch24.toFixed(2)+"%":"--") +'</b></span><span>7D <b>'+ (Number.isFinite(ch7)?(ch7>=0?"+":"")+ch7.toFixed(2)+"%":"--") +'</b></span><span>30D <b>'+ (Number.isFinite(ch30)?(ch30>=0?"+":"")+ch30.toFixed(2)+"%":"--") +'</b></span><span>Liquidity <b>'+ (ratio==null?"--":ratio.toFixed(2)+"%") +'</b></span></div></div>';
 }).join("");
}
function renderMarketSignals(){
 if(!marketSignals||!coins.length)return;
 const ids=["bitcoin","ethereum","solana","binancecoin"];
 const labels={bitcoin:"BTC",ethereum:"ETH",solana:"SOL",binancecoin:"BNB"};
 marketSignals.innerHTML=ids.map(id=>{
  const c=coins.find(x=>x.id===id);
  if(!c)return "";
  const ch=Number(c.price_change_percentage_24h);
  const volume=Number(c.total_volume),cap=Number(c.market_cap);
  const ratio=cap>0?volume/cap*100:null;
  const s=signalLabel(ch,ratio);
  const trendClass=ch>0?"positive":ch<0?"negative":"neutral";
  return '<div class="signal-card"><div class="signal-card-top"><b>'+labels[id]+'</b><span class="'+trendClass+'">'+(Number.isFinite(ch)?(ch>=0?"+":"")+ch.toFixed(2)+"%":"--")+'</span></div><div class="signal-item"><span>Trend</span><b>'+s.trend+'</b></div><div class="signal-item"><span>Momentum</span><b>'+((ch>1)?"Positive":(ch<-1)?"Negative":"Neutral")+'</b></div><div class="signal-item"><span>Volume / Cap</span><b>'+ (ratio==null?"--":ratio.toFixed(2)+"%")+'</b></div><div class="signal-item"><span>Risk proxy</span><b>'+s.risk+'</b></div></div>';
 }).join("");
}
function render(){
 const q=search.value.trim().toLowerCase();
 let list=coins.filter(c=>(c.name+" "+c.symbol).toLowerCase().includes(q));
const categoryIds={
defi:["uniswap","aave","maker","chainlink","lido-staked-ether","the-graph","compound-governance-token","sushiswap","curve-dao-token","pancakeswap-token"],
layer1:["bitcoin","ethereum","solana","binancecoin","cardano","avalanche-2","polkadot","near","cosmos","aptos","sui","tron","algorand","fantom","hedera-hashgraph","internet-computer"],
meme:["dogecoin","shiba-inu","pepe","bonk","floki","dogwifcoin","mog-coin","brett","book-of-meme","popcat"],
stablecoin:["tether","usd-coin","dai","first-digital-usd","ethena-usde","true-usd","frax"],
ai:["render-token","bittensor","fetch-ai","singularitynet","ocean-protocol","the-graph","arkham","worldcoin-wld","near","injective-protocol"]
};
if(category.value!=="all"){
 const ids=categoryIds[category.value]||[];
 list=list.filter(c=>ids.includes(c.id));
}
const periodField={24h:"price_change_percentage_24h",7d:"price_change_percentage_7d_in_currency",30d:"price_change_percentage_30d_in_currency"}[changePeriod.value];
if(periodField){
 list=list.filter(c=>Number.isFinite(c[periodField]));
 if(changeDirection.value==="gainers")list=list.filter(c=>c[periodField]>0);
 if(changeDirection.value==="losers")list=list.filter(c=>c[periodField]<0);
}
 if(favoritesOnly.checked){const favs=getFavorites();list=list.filter(c=>favs.includes(c.id));}
 if(liquidity.value!=="all"){list=list.filter(c=>{const ratio=Number.isFinite(c.total_volume)&&Number.isFinite(c.market_cap)&&c.market_cap>0?(c.total_volume/c.market_cap*100):null;if(ratio==null)return false;return liquidity.value==="high"?ratio>5:liquidity.value==="medium"?ratio>=1&&ratio<=5:ratio<1;});}
 const s=sort.value;
 list.sort((a,b)=>s==="price_desc"?b.current_price-a.current_price:s==="change_desc"?(b.price_change_percentage_24h||-Infinity)-(a.price_change_percentage_24h||-Infinity):s==="change_asc"?(a.price_change_percentage_24h||Infinity)-(b.price_change_percentage_24h||Infinity):s==="change7_desc"?(b.price_change_percentage_7d_in_currency||-Infinity)-(a.price_change_percentage_7d_in_currency||-Infinity):s==="change7_asc"?(a.price_change_percentage_7d_in_currency||Infinity)-(b.price_change_percentage_7d_in_currency||Infinity):s==="change30_desc"?(b.price_change_percentage_30d_in_currency||-Infinity)-(a.price_change_percentage_30d_in_currency||-Infinity):s==="change30_asc"?(a.price_change_percentage_30d_in_currency||Infinity)-(b.price_change_percentage_30d_in_currency||Infinity):s==="volume_desc"?b.total_volume-a.total_volume:s==="rank_asc"?a.market_cap_rank-b.market_cap_rank:b.market_cap-a.market_cap);
 list=list.slice(0,visible);
 if(!list.length){body.innerHTML='<tr><td colspan="11" class="market-loading">No cryptocurrencies match the selected filters.</td></tr>';return}
 body.innerHTML=list.map(c=>{const ch=c.price_change_percentage_24h,ch7=c.price_change_percentage_7d_in_currency,ch30=c.price_change_percentage_30d_in_currency,fav=getFavorites().includes(c.id);return '<tr class="market-row" data-id="'+c.id+'"><td class="rank">'+c.market_cap_rank+'</td><td><div class="asset"><img src="'+c.image+'" alt=""><div><b>'+c.name+'</b><span>'+c.symbol.toUpperCase()+'</span></div></div></td><td><button class="market-favorite '+(fav?"active":"")+'" data-fav="'+c.id+'">'+(fav?"★":"☆")+'</button></td><td class="sparkline-cell"><canvas class="sparkline" data-values=' + "' + JSON.stringify(c.sparkline_in_7d?.price||[]) + '" + '></canvas></td><td><b>'+money(c.current_price)+'</b></td><td class="'+(ch>=0?"positive":"negative")+'">'+(ch==null?"--":(ch>=0?"+":"")+ch.toFixed(2)+"%")+'</td><td class="'+(ch7>=0?"positive":"negative")+'">'+(ch7==null?"--":(ch7>=0?"+":"")+ch7.toFixed(2)+"%")+'</td><td class="'+(ch30>=0?"positive":"negative")+'">'+(ch30==null?"--":(ch30>=0?"+":"")+ch30.toFixed(2)+"%")+'</td><td>'+money(c.market_cap)+'</td><td>'+compact(c.total_volume)+'</td><td><span class="liquidity-ratio">'+(Number.isFinite(c.total_volume)&&Number.isFinite(c.market_cap)&&c.market_cap>0?(c.total_volume/c.market_cap*100).toFixed(2)+"%":"--")+'</span></td></tr>'}).join("");
 document.querySelectorAll(".market-row").forEach(r=>r.onclick=e=>{if(e.target.closest(".market-favorite"))return;location.href="crypto.html?coin="+encodeURIComponent(r.dataset.id)});drawSparklines();
 document.querySelectorAll(".market-favorite").forEach(btn=>btn.onclick=e=>{e.stopPropagation();const id=btn.dataset.fav,f=getFavorites(),i=f.indexOf(id);if(i>=0)f.splice(i,1);else f.push(id);saveFavorites(f);render()});
 more.style.display=hasMore&&!search.value.trim()&&!favoritesOnly.checked&&changePeriod.value==="all"&&changeDirection.value==="all"?"":"none";
}
function drawSparklines(){document.querySelectorAll(".sparkline").forEach(canvas=>{const v=JSON.parse(canvas.dataset.values||"[]"),ctx=canvas.getContext("2d");canvas.width=110;canvas.height=34;if(v.length<2)return;const min=Math.min(...v),max=Math.max(...v),range=max-min||1;ctx.beginPath();v.forEach((p,i)=>{const x=i/(v.length-1)*110,y=30-(p-min)/range*26;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=v[v.length-1]>=v[0]?"#22c55e":"#ef4444";ctx.lineWidth=1.5;ctx.stroke()})}
function drawGlobalChart(){
 if(!globalMarketChart)return;
 const wrap=globalMarketChart.parentElement,w=Math.max(320,wrap.clientWidth),h=260,dpr=window.devicePixelRatio||1;
 globalMarketChart.width=w*dpr;globalMarketChart.height=h*dpr;globalMarketChart.style.width=w+"px";globalMarketChart.style.height=h+"px";
 const ctx=globalMarketChart.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 if(globalChartData.length<2){ctx.fillStyle="#66666d";ctx.font="11px Arial";ctx.fillText("Historical market data unavailable.",20,30);return}
 const vals=globalChartData.map(p=>p[1]),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1,left=10,right=w-10,top=16,bottom=h-24;
 const x=i=>left+i/(vals.length-1)*(right-left),y=v=>bottom-(v-min)/range*(bottom-top);
 ctx.beginPath();globalChartData.forEach((p,i)=>i?ctx.lineTo(x(i),y(p[1])):ctx.moveTo(x(i),y(p[1])));
 ctx.strokeStyle="#22c55e";ctx.lineWidth=2;ctx.stroke();
 ctx.lineTo(right,bottom);ctx.lineTo(left,bottom);ctx.closePath();ctx.fillStyle="rgba(34,197,94,.06)";ctx.fill();
 ctx.fillStyle="#55555c";ctx.font="9px Arial";ctx.fillText(globalMoney(max),left,10);ctx.fillText(globalMoney(min),left,bottom+15);
 globalMarketChart.onmousemove=e=>{
   const rect=globalMarketChart.getBoundingClientRect(),idx=Math.max(0,Math.min(vals.length-1,Math.round((e.clientX-rect.left)/(rect.width)*(vals.length-1)))),p=globalChartData[idx];
   const d=new Date(p[0]);globalChartTooltip.style.display="block";globalChartTooltip.textContent=d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+" · "+globalMoney(p[1]);globalChartTooltip.style.left=Math.min(w-180,Math.max(8,(idx/(vals.length-1))*w-80))+"px";globalChartTooltip.style.top="8px";
 };
 globalMarketChart.onmouseleave=()=>globalChartTooltip.style.display="none";
}
async function loadGlobalChart(days=1){
 try{const r=await fetch(GLOBAL_CHART_API+days);if(!r.ok)throw new Error();const d=await r.json();globalChartData=d.market_cap||[];drawGlobalChart()}
 catch(e){globalChartData=[];drawGlobalChart()}
}
function globalMoney(v){return v==null?"--":v.toLocaleString("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2})}
function renderHeatmap(){
 const valid=coins.filter(c=>Number.isFinite(c.market_cap)&&Number.isFinite(c.price_change_percentage_24h));
 if(!valid.length){marketHeatmap.innerHTML='<div class="heatmap-empty">Market data unavailable.</div>';return}
 const top=valid.slice().sort((a,b)=>b.market_cap-a.market_cap).slice(0,60);
 const maxCap=Math.max(...top.map(c=>c.market_cap));
 marketHeatmap.innerHTML=top.map(c=>{
   const change=c.price_change_percentage_24h;
   const intensity=Math.min(1,Math.abs(change)/8);
   const hue=change>=0?'142':'0';
   const alpha=(0.10+intensity*0.35).toFixed(2);
   const size=Math.max(82,Math.min(190,62+Math.sqrt(c.market_cap/maxCap)*130));
   return '<button class="heatmap-tile" data-coin="'+c.id+'" style="--heat-hue:'+hue+';--heat-alpha:'+alpha+';--heat-size:'+size+'px"><img src="'+c.image+'" alt=""><strong>'+c.symbol.toUpperCase()+'</strong><span class="'+(change>=0?'positive':'negative')+'">'+(change>=0?'+':'')+change.toFixed(2)+'%</span></button>'
 }).join('');
 marketHeatmap.querySelectorAll('.heatmap-tile').forEach(tile=>tile.onclick=()=>location.href='crypto.html?coin='+encodeURIComponent(tile.dataset.coin));
}
function updateBreadth(){const valid=coins.filter(c=>Number.isFinite(c.price_change_percentage_24h));const up=valid.filter(c=>c.price_change_percentage_24h>0).length;const down=valid.filter(c=>c.price_change_percentage_24h<0).length;marketBreadth.textContent=valid.length?((up/valid.length)*100).toFixed(1)+"% up · "+((down/valid.length)*100).toFixed(1)+"% down":"--"}
function highlights(){const valid=coins.filter(c=>Number.isFinite(c.price_change_percentage_24h));const gain=valid.slice().sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h).slice(0,5);const lose=valid.slice().sort((a,b)=>a.price_change_percentage_24h-b.price_change_percentage_24h).slice(0,5);const item=c=>"<div class=\"highlight-row highlight-link\" data-coin=\""+c.id+"\"><span>"+c.name+"</span><b class=\""+(c.price_change_percentage_24h>=0?"positive":"negative")+"\">"+(c.price_change_percentage_24h>=0?"+":"")+c.price_change_percentage_24h.toFixed(2)+"%</b></div>";topGainers.innerHTML=gain.map(item).join("");topLosers.innerHTML=lose.map(item).join("");document.querySelectorAll(".highlight-link").forEach(row=>row.onclick=()=>location.href="crypto.html?coin="+encodeURIComponent(row.dataset.coin))}
async function loadGlobal(){try{const r=await fetch(GLOBAL_API);if(!r.ok)throw new Error();const d=await r.json();globalCap.textContent=globalMoney(d.data.total_market_cap.usd);globalVolume.textContent=globalMoney(d.data.total_volume.usd);btcDominance.textContent=d.data.market_cap_percentage.btc.toFixed(2)+"%";activeCoins.textContent=d.data.active_cryptocurrencies.toLocaleString()}catch(e){}}
async function load(page=1){try{const r=await fetch(API+page+"&sparkline=true&sparkline_duration=7d&price_change_percentage=24h%2C7d%2C30d");if(!r.ok)throw new Error("API failed");const data=await r.json();if(page===1){coins=data;currentPage=1;hasMore=data.length===100}else{const ids=new Set(coins.map(c=>c.id));coins.push(...data.filter(c=>!ids.has(c.id)));currentPage=page;hasMore=data.length===100}status.textContent="Live CoinGecko data · "+coins.length+" coins";render();renderMarketSignals();renderAnalysisEngine();runScreener();renderHeatmap();highlights();updateBreadth();if(page===1)loadGlobal()}catch(e){if(page===1)body.innerHTML='<tr><td colspan="8" class="market-loading">Market data could not be loaded. Try again.</td></tr>';status.textContent="Data unavailable"}}
search.addEventListener("input",()=>{visible=50;render()});favoritesOnly.addEventListener("change",()=>{visible=50;render()});liquidity.addEventListener("change",()=>{visible=50;render()});category.addEventListener("change",()=>{visible=50;render()});changePeriod.addEventListener("change",()=>{visible=50;render()});changeDirection.addEventListener("change",()=>{visible=50;render()});sort.addEventListener("change",render);more.addEventListener("click",async()=>{if(loadingMore||!hasMore)return;loadingMore=true;more.textContent="Loading...";await load(currentPage+1);loadingMore=false;more.textContent="Load more"});document.querySelectorAll(".global-range").forEach(btn=>btn.addEventListener("click",()=>{
 document.querySelectorAll(".global-range").forEach(b=>b.classList.remove("active"));
 btn.classList.add("active");loadGlobalChart(Number(btn.dataset.days));
}));
window.addEventListener("resize",drawGlobalChart);
load();loadGlobal();loadGlobalChart(1);loadExchangeOverview();loadExchangeAssets();loadSpreadMonitor();loadBtcHistory(30,"bitcoin","BTC");loadCorrelation();loadRiskDashboard();setInterval(load,60000);setInterval(loadGlobal,60000);setInterval(loadExchangeOverview,60000);setInterval(loadExchangeAssets,60000);setInterval(loadSpreadMonitor,60000);setInterval(loadCorrelation,300000);setInterval(loadRiskDashboard,300000);