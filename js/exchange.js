const exchanges=[
{name:"Binance",provider:"binance",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/binance"},
{name:"Coinbase",provider:"coinbase",symbol:"BTC-USD/ticker",candle:"BTC-USD",logo:"https://cdn.simpleicons.org/coinbase"},
{name:"Kraken",provider:"kraken",symbol:"XBTUSD",logo:"https://cdn.simpleicons.org/kraken"},
{name:"Bybit",provider:"bybit",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bybit"},
{name:"OKX",provider:"okx",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/okx"},
{name:"KuCoin",provider:"kucoin",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/kucoin"},
{name:"Bitget",provider:"bitget",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/bitget"},
{name:"Gate.io",provider:"gate",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/gate"},
{name:"MEXC",provider:"mexc",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/mexc"},
{name:"Crypto.com",provider:"cryptocom",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/crypto-dot-com"}
];
const $=id=>document.getElementById(id);
const money=v=>Number.isFinite(v)?v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:v<1?6:2}):"--";
const compact=v=>Number.isFinite(v)?v.toLocaleString("en-US",{notation:"compact",maximumFractionDigits:2}):"--";
const pct=v=>Number.isFinite(v)?(v>=0?"+":"")+v.toFixed(2)+"%":"--";
const state={current:exchanges[0],ticker:null,candles:[]};

function tickerValues(e,d){
 let price=null,volume=null,change=null;
 if(e.provider==="binance"){price=+d.lastPrice;volume=+d.quoteVolume;change=+d.priceChangePercent}
 if(e.provider==="coinbase"){price=+d.price;volume=+d.volume_24h*price}
 if(e.provider==="kraken"){const x=d.result?.XXBTZUSD||Object.values(d.result||{})[0];price=+x?.c?.[0];volume=+x?.v?.[1]*price}
 if(e.provider==="bybit"){const x=d.result?.list?.[0];price=+x?.lastPrice;volume=+x?.turnover24h;change=+x?.price24hPcnt*100}
 if(e.provider==="okx"){const x=d.data?.[0];price=+x?.last;volume=+x?.volCcy24h;change=+x?.open24h?(price/+x.open24h-1)*100:null}
 if(e.provider==="kucoin"){price=+d.data?.last;volume=+d.data?.volValue;change=+d.data?.changeRate*100}
 if(e.provider==="bitget"){const x=d.data?.[0];price=+x?.lastPr;volume=+x?.quoteVolume;change=+x?.change24h*100}
 if(e.provider==="gate"){const x=Array.isArray(d)?d[0]:d;price=+x?.last;volume=+x?.quote_volume;change=+x?.change_percentage}
 if(e.provider==="mexc"){price=+d.lastPrice;volume=+d.quoteVolume;change=+d.priceChangePercent}
 if(e.provider==="cryptocom"){const x=d.result?.data?.[0];price=+x?.k;volume=+x?.v;change=+x?.c}
 return {price,volume,change};
}
async function getTicker(e){
 const r=await fetch("/api/exchanges?provider="+encodeURIComponent(e.provider)+"&symbol="+encodeURIComponent(e.symbol));
 if(!r.ok)throw new Error();
 return tickerValues(e,await r.json());
}
async function getCandles(e){
 const symbol=e.candle||e.symbol;
 const r=await fetch("/api/exchanges/candles?provider="+encodeURIComponent(e.provider)+"&symbol="+encodeURIComponent(symbol));
 if(!r.ok)throw new Error();
 const d=await r.json();return d.rows||[];
}
function metric(label,value,cls=""){return '<div class="analysis-metric"><span>'+label+'</span><b class="'+cls+'">'+value+'</b></div>'}
function renderSummary(t){
 $("exchangeSummary").innerHTML='<div class="live-stat"><span>LIVE PRICE</span><strong>'+money(t.price)+'</strong></div><div class="live-stat"><span>24H CHANGE</span><strong class="'+(t.change>=0?"positive":"negative")+'">'+pct(t.change)+'</strong></div><div class="live-stat"><span>24H VOLUME</span><strong>'+money(t.volume)+'</strong></div><div class="live-stat"><span>MARKET</span><strong>BTC / USD</strong></div>';
}
function drawChart(rows){
 const svg=$("exchangeChart"); if(!rows.length){svg.innerHTML='<text x="500" y="170" text-anchor="middle" fill="#666">Historical data unavailable</text>';return}
 const W=1000,H=340,p=28,vals=rows.map(x=>x.close),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
 const points=rows.map((x,i)=>((p+i*(W-2*p)/(rows.length-1))+" "+(H-p-(x.close-min)/range*(H-2*p))).trim()).join(",");
 svg.innerHTML='<polyline points="'+points+'" fill="none" stroke="#35e08b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="'+p+'" y1="'+(H-p)+'" x2="'+(W-p)+'" y2="'+(H-p)+'" stroke="#24252a"/>';
 $("chartAxis").innerHTML=rows.filter((_,i)=>i%5===0).map(x=>'<span>'+new Date(x.time).toLocaleDateString("en-US",{month:"short",day:"numeric"})+'</span>').join("");
 $("chartUpdated").textContent="30 daily candles";
}
function analyze(rows,t){
 const closes=rows.map(x=>x.close),last=closes.at(-1)||t.price,first=closes[0],week=closes[Math.max(0,closes.length-8)],month=first;
 const ret7=first&&week?(last/week-1)*100:null,ret30=first?(last/month-1)*100:null;
 const daily=closes.slice(1).map((v,i)=>closes[i]?Math.log(v/closes[i]):0);
 const mean=daily.reduce((a,b)=>a+b,0)/(daily.length||1);
 const vol=Math.sqrt(daily.reduce((a,b)=>a+(b-mean)**2,0)/(daily.length||1))*Math.sqrt(365)*100;
 let peak=closes[0]||last,dd=0;closes.forEach(v=>{peak=Math.max(peak,v);dd=Math.min(dd,(v/peak-1)*100)});
 const high=Math.max(...rows.map(x=>x.high),last),low=Math.min(...rows.map(x=>x.low),last);
 const avgVol=rows.reduce((a,b)=>a+(Number(b.volume)||0),0)/(rows.length||1);
 $("performanceMetrics").innerHTML=metric("Current price",money(last))+metric("7D change",pct(ret7),ret7>=0?"positive":"negative")+metric("30D change",pct(ret30),ret30>=0?"positive":"negative")+metric("30D high",money(high))+metric("30D low",money(low));
 $("liquidityMetrics").innerHTML=metric("24H volume",money(t.volume))+metric("30D avg volume",money(avgVol))+metric("Volume / price",compact(t.volume/Math.max(last,1)))+metric("Activity","Public ticker");
 $("riskMetrics").innerHTML=metric("Daily volatility",vol.toFixed(2)+"%")+metric("Max drawdown",dd.toFixed(2)+"%",dd<-10?"negative":"")+metric("30D range",pct((high/low-1)*100))+metric("Risk view",vol>80?"High":vol>45?"Medium":"Lower");
 $("spreadMetrics").innerHTML='<div class="spread-row"><span>Selected</span><b>'+money(t.price)+'</b></div><div class="spread-row"><span>Lowest</span><b id="spreadLow">--</b></div><div class="spread-row"><span>Highest</span><b id="spreadHigh">--</b></div><div class="spread-row"><span>Market spread</span><b id="spreadPct">--</b></div>';
}
async function loadComparison(){
 const rows=await Promise.all(exchanges.map(async e=>{try{return {...e,...await getTicker(e)}}catch{return {...e,price:null,volume:null,change:null}}}));
 const valid=rows.filter(x=>Number.isFinite(x.price)),low=Math.min(...valid.map(x=>x.price)),high=Math.max(...valid.map(x=>x.price));
 $("comparisonBody").innerHTML=rows.map(x=>{const sp=Number.isFinite(x.price)&&low?((x.price/low-1)*100):null;return '<tr><td><div class="comparison-exchange"><img src="'+x.logo+'"><b>'+x.name+'</b></div></td><td>'+money(x.price)+'</td><td class="'+(x.change>=0?"positive":"negative")+'">'+pct(x.change)+'</td><td>'+money(x.volume)+'</td><td>'+(sp==null?"--":sp.toFixed(3)+"%")+'</td><td><a href="exchange.html?exchange="+x.provider class="mini-analysis">Open analysis</a></td></tr>'}).join("");
 $("comparisonUpdated").textContent="Updated "+new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
 if(state.ticker){$("spreadLow").textContent=money(low);$("spreadHigh").textContent=money(high);$("spreadPct").textContent=low?((high/low-1)*100).toFixed(3)+"%":"--"}
}
async function loadSelected(){
 const e=state.current;$("exchangeTitle").textContent=e.name;$("exchangeSubtitle").textContent="BTC market analysis • live exchange data";
 try{state.ticker=await getTicker(e);renderSummary(state.ticker)}catch{$("exchangeSummary").innerHTML='<div class="analysis-loading">Live ticker unavailable.</div>'}
 try{state.candles=await getCandles(e);drawChart(state.candles);analyze(state.candles,state.ticker||{})}catch{$("chartUpdated").textContent="Historical data unavailable";analyze([],state.ticker||{})}
 await loadComparison();
}
function init(){
 $("exchangeSelector").innerHTML=exchanges.map(e=>'<option value="'+e.provider+'">'+e.name+'</option>').join("");
 const q=new URLSearchParams(location.search).get("exchange");const found=exchanges.find(e=>e.provider===q);if(found){state.current=found;$("exchangeSelector").value=found.provider}
 $("exchangeSelector").addEventListener("change",e=>{state.current=exchanges.find(x=>x.provider===e.target.value)||exchanges[0];loadSelected()});
 loadSelected();setInterval(loadSelected,60000);
}
init();
