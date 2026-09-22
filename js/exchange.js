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
{name:"Crypto.com",provider:"cryptocom",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/crypto-dot-com"},{name:"Gemini",provider:"gemini",symbol:"BTCUSD",logo:"https://cdn.simpleicons.org/gemini"},
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
{name:"P2PB2B",provider:"p2pb2b",symbol:"BTCUSDT",logo:"https://cdn.simpleicons.org/p2pb2b",
{name:"Upbit",provider:"upbit",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/upbit"},
{name:"Bitflyer",provider:"bitflyer",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitflyer"},
{name:"Bithumb",provider:"bithumb",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bithumb"},
{name:"Coinone",provider:"coinone",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/coinone"},
{name:"Korbit",provider:"korbit",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/korbit"},
{name:"BitMEX",provider:"bitmex",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitmex"},
{name:"Deribit",provider:"deribit",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/deribit"},
{name:"WOO X",provider:"woo",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/woo"},
{name:"HashKey",provider:"hashkey",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/hashkey"},
{name:"Bitkub",provider:"bitkub",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitkub"},
{name:"Indodax",provider:"indodax",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/indodax"},
{name:"Mercado Bitcoin",provider:"mercado",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/mercado"},
{name:"Foxbit",provider:"foxbit",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/foxbit"},
{name:"Bitso",provider:"bitso",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitso"},
{name:"Ripio",provider:"ripio",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/ripio"},
{name:"Rain",provider:"rain",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/rain"},
{name:"Coincheck",provider:"coincheck",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/coincheck"},
{name:"Zaif",provider:"zaif",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/zaif"},
{name:"Bitbank",provider:"bitbank",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitbank"},
{name:"OKCoin",provider:"okcoin",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/okcoin"},
{name:"BloFin",provider:"blofin",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/blofin"},
{name:"BTSE",provider:"btse",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/btse"},
{name:"Bitunix",provider:"bitunix",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitunix"},
{name:"dYdX",provider:"dydx",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/dydx"},
{name:"Coinmetro",provider:"coinmetro",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/coinmetro"},
{name:"CoinZoom",provider:"coinzoom",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/coinzoom"},
{name:"Bit2Me",provider:"bit2me",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bit2me"},
{name:"LATOKEN",provider:"latoken",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/latoken"},
{name:"Tokocrypto",provider:"tokocrypto",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/tokocrypto"},
{name:"CoinSpot",provider:"coinspot",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/coinspot"},
{name:"Independent Reserve",provider:"independentreserve",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/independentreserve"},
{name:"CEX.IO",provider:"cex",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/cex"},
{name:"Currency.com",provider:"currencycom",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/currencycom"},
{name:"TimeX",provider:"timex",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/timex"},
{name:"NovaDAX",provider:"novadax",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/novadax"},
{name:"Bitexen",provider:"bitexen",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitexen"},
{name:"Icrypex",provider:"icrypex",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/icrypex"},
{name:"Paribu",provider:"paribu",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/paribu"},
{name:"BTCTurk",provider:"btcturk",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/btcturk"},
{name:"Bitci",provider:"bitci",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitci"},
{name:"Pionex",provider:"pionex",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/pionex"},
{name:"BitTrade",provider:"bittrade",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bittrade"},
{name:"Uphold",provider:"uphold",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/uphold"},
{name:"BigONE",provider:"bigone",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bigone"},
{name:"Bitvavo",provider:"bitvavo",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/bitvavo"},
{name:"EXMO",provider:"exmo",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/exmo"},
{name:"BTC Markets",provider:"btcmarkets",symbol:"BTC/USDT",logo:"https://cdn.simpleicons.org/btcmarkets"}}
];
const $=id=>document.getElementById(id);
const money=v=>Number.isFinite(v)?v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:v<1?6:2}):"--";
const compact=v=>Number.isFinite(v)?v.toLocaleString("en-US",{notation:"compact",maximumFractionDigits:2}):"--";
const pct=v=>Number.isFinite(v)?(v>=0?"+":"")+v.toFixed(2)+"%":"--";
const state={current:exchanges[0],ticker:null,candles:[]};

function rawTicker(d){return d.data?.[0]||d.data||d.result?.[0]||d.result||d} 
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
 if(e.provider==="cryptocom"){const x=d.result?.data?.[0];price=+x?.k;volume=+x?.v;change=+x?.c}if(e.provider==="gemini"){price=+d.close;volume=+(d.volume?.USD||0)}
 if(e.provider==="bitstamp"){price=+d.last;volume=+d.volume}
 if(e.provider==="bitfinex"){price=+d[6];volume=+d[7];change=+d[5]*100}
 if(e.provider==="htx"){const x=d.tick;price=+x?.close;volume=+x?.amount}
 if(e.provider==="poloniex"){const x=Array.isArray(d)?d[0]:d;price=+x?.close;volume=+x?.amount;change=+x?.percentChange*100}
 if(e.provider==="bitmart"){const x=d.data?.tickers?.[0]||d.data?.[0];price=+x?.last_price;volume=+x?.quote_volume;change=+x?.fluctuation}
 if(e.provider==="lbank"){const x=rawTicker(d);price=+x?.latest;volume=+x?.turnover;change=+x?.change}
 if(e.provider==="bingx"){const x=d.data?.[0];price=+x?.lastPrice;volume=+x?.quoteVolume;change=+x?.priceChangePercent}
 if(e.provider==="phemex"){const x=d.result?.tick||d.result?.data?.[0];price=+x?.closeEp/1e8||+x?.close;volume=+x?.volumeEv/1e8||+x?.volume}
 if(e.provider==="whitebit"){const x=Array.isArray(d)?d[0]:d;price=+x?.last_price;volume=+x?.base_volume;change=+x?.change}
 if(e.provider==="coinex"){const x=d.data?.[0]||d.data;price=+x?.last;volume=+x?.value;change=x?.open?(price/+x.open-1)*100:null}
 if(e.provider==="xt"){const x=d.result?.[0]||d.data?.[0]||d;price=+x?.p||+x?.price;volume=+x?.q||+x?.volume}
 if(e.provider==="deepcoin"){const x=d.data?.[0]||d.data;price=+x?.last;volume=+x?.vol;change=+x?.changeRate}
 if(e.provider==="ascendex"){const x=d.data;price=+x?.close;volume=+x?.volume;change=+x?.change
 }
 if(e.provider==="bitrue"){const x=d;price=+x?.lastPrice;volume=+x?.quoteVolume;change=+x?.priceChangePercent}
 if(e.provider==="coinw"){const x=d.data||d;price=+x?.last;volume=+x?.vol;change=+x?.change}
 if(e.provider==="digifinex"){const x=d.ticker?.[0]||d.data?.[0];price=+x?.last;volume=+x?.vol;change=+x?.change*100}
 if(e.provider==="toobit"){const x=Array.isArray(d)?d[0]:d;price=+x?.lastPrice;volume=+x?.quoteVolume;change=+x?.priceChangePercent}
 if(e.provider==="weex"){const x=d.data?.[0]||d.data;price=+x?.last;volume=+x?.quoteVolume;change=+x?.change24h}
 if(e.provider==="p2pb2b"){const x=d.result||d.data||d;price=+x?.last;volume=+x?.volume;change=+x?.change}
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
 $("comparisonBody").innerHTML=rows.map(x=>{const sp=Number.isFinite(x.price)&&low?((x.price/low-1)*100):null;return '<tr><td><div class="comparison-exchange"><img src="'+x.logo+'"><b>'+x.name+'</b></div></td><td>'+money(x.price)+'</td><td class="'+(x.change>=0?"positive":"negative")+'">'+pct(x.change)+'</td><td>'+money(x.volume)+'</td><td>'+(sp==null?"--":sp.toFixed(3)+"%")+'</td><td><a href="exchange.html?exchange='+x.provider+'" class="mini-analysis">Open analysis</a></td></tr>'}).join("");
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
