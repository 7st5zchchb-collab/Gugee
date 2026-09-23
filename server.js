const express=require("express");
const path=require("path");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const {Pool}=require("pg");
const crypto=require("crypto");
const fs=require("fs");
const {Resend}=require("resend");

const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET;
const DATABASE_URL=process.env.DATABASE_URL;
const RESEND_API_KEY=process.env.RESEND_API_KEY;
const EMAIL_FROM=process.env.EMAIL_FROM||"Gugee <noreply@gugee.com>";
const FRONTEND_URL=(process.env.FRONTEND_URL||"").replace(/\/$/,"");

if(!JWT_SECRET||!DATABASE_URL){
  console.error("Missing JWT_SECRET or DATABASE_URL environment variables.");
  process.exit(1);
}

const rateBuckets=new Map();

function rateLimit(key,max,windowMs){
  const now=Date.now();
  const bucket=rateBuckets.get(key);
  if(!bucket||now-bucket.start>=windowMs){
    rateBuckets.set(key,{start:now,count:1});
    return true;
  }
  bucket.count++;
  return bucket.count<=max;
}

function clientKey(req){
  return String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown").split(",")[0].trim();
}

setInterval(()=>{
  const now=Date.now();
  for(const [key,bucket] of rateBuckets)if(now-bucket.start>15*60*1000)rateBuckets.delete(key);
},5*60*1000);

const pool=new Pool({
  connectionString:DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:undefined
});

app.use(express.json({limit:"20kb"}));

app.disable("x-powered-by");
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(),microphone=(),geolocation=()");
  next();
});

const marketCache=new Map();

const COINGECKO_BASE="https://api.coingecko.com/api/v3";
let top1000Cache={data:null,expires:0};

async function fetchCoinGeckoPage(page){
  const url=COINGECKO_BASE+"/coins/markets?"+new URLSearchParams({
    vs_currency:"usd",
    order:"market_cap_desc",
    per_page:"250",
    page:String(page),
    sparkline:"false",
    price_change_percentage:"24h,7d,30d"
  }).toString();
  let lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetch(url,{headers:{accept:"application/json","user-agent":"Gugee/1.0"}});
      const body=await r.text();
      if(r.ok){
        const rows=JSON.parse(body);
        if(Array.isArray(rows))return rows;
      }
      lastError=new Error(body||("HTTP "+r.status));
      if(r.status===429||r.status>=500) await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));
      else break;
    }catch(error){
      lastError=error;
      await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
    }
  }
  throw lastError||new Error("CoinGecko request failed");
}

async function fetchCoinCapTop1000(){
  const url="https://api.coincap.io/v2/assets?limit=1000";
  const r=await fetch(url,{headers:{accept:"application/json","user-agent":"Gugee/1.0"}});
  const body=await r.text();
  if(!r.ok) throw new Error(body||("CoinCap HTTP "+r.status));
  const payload=JSON.parse(body);
  if(!payload||!Array.isArray(payload.data)||payload.data.length<900) throw new Error("CoinCap returned too few cryptocurrencies");
  return payload.data.map(coin=>({
    id:coin.id,
    name:coin.name,
    symbol:coin.symbol,
    image:"https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(coin.symbol||"").toLowerCase())+"@2x.png",
    current_price:Number(coin.priceUsd),
    price_change_percentage_24h:Number(coin.changePercent24Hr),
    market_cap_rank:Number(coin.rank)||null
  }));
}

async function getTop1000Coins(){
  if(top1000Cache.data&&Date.now()<top1000Cache.expires)return top1000Cache.data;
  let coins=null;
  try{
    const pages=await Promise.all([1,2,3,4].map(page=>fetchCoinGeckoPage(page)));
    const map=new Map();
    pages.flat().forEach(coin=>map.set(coin.id,coin));
    coins=Array.from(map.values()).slice(0,1000);
    if(coins.length<900)throw new Error("CoinGecko returned too few cryptocurrencies");
  }catch(coinGeckoError){
    console.warn("CoinGecko top 1000 failed, using CoinCap fallback:",coinGeckoError.message);
    coins=await fetchCoinCapTop1000();
  }
  top1000Cache={data:coins,expires:Date.now()+5*60*1000};
  return coins;
}

async function top1000Coins(req,res){
  try{
    const coins=await getTop1000Coins();
    res.json({count:coins.length,coins,cached:Date.now()<top1000Cache.expires});
  }catch(error){
    console.error("Top 1000 crypto error:",error);
    if(top1000Cache.data)return res.json({count:top1000Cache.data.length,coins:top1000Cache.data,cached:true,stale:true});
    res.status(502).json({error:"Unable to load the 1000 cryptocurrencies right now"});
  }
}


async function coingeckoProxy(req,res,next){
  const p=req.path;
  let target=null;
  if(p==="/global") target=COINGECKO_BASE+"/global";
  else if(p==="/global/market_cap_chart") target=COINGECKO_BASE+"/global/market_cap_chart?"+new URLSearchParams(req.query).toString();
  else if(p==="/search") target=COINGECKO_BASE+"/search?"+new URLSearchParams(req.query).toString();
  else if(p==="/search/trending") target=COINGECKO_BASE+"/search/trending";
  else if(p==="/simple/price") target=COINGECKO_BASE+"/simple/price?"+new URLSearchParams(req.query).toString();
  else if(p==="/coins/categories") target=COINGECKO_BASE+"/coins/categories?"+new URLSearchParams(req.query).toString();
  else if(p==="/coins/markets") target=COINGECKO_BASE+"/coins/markets?"+new URLSearchParams(req.query).toString();
  else if(p.startsWith("/coins/") && p.endsWith("/market_chart")){
    const id=p.split("/")[2];
    target=COINGECKO_BASE+"/coins/"+encodeURIComponent(id)+"/market_chart?"+new URLSearchParams(req.query).toString();
  } else if(/^\/coins\/[^/]+$/.test(p)){
    const id=p.split("/")[2];
    target=COINGECKO_BASE+"/coins/"+encodeURIComponent(id)+"?"+new URLSearchParams(req.query).toString();
  } else return next();
  try{
    const r=await fetch(target,{headers:{accept:"application/json","user-agent":"Gugee/1.0"}});
    const body=await r.text();
    res.status(r.status).type("application/json").send(body);
  }catch(e){
    res.status(502).json({error:"CoinGecko request failed"});
  }
}
app.get("/api/coingecko/top1000",top1000Coins);
app.use("/api/coingecko",coingeckoProxy);

app.use("/api/exchanges",async(req,res)=>{
  try{
    const provider=String(req.query.provider||"").toLowerCase();
    const symbol=String(req.query.symbol||"").toUpperCase().replace(/\/(TICKER|SPOT)$/,"");
    const allowedProviders=["binance","coinbase","kraken","bybit","okx","kucoin","bitget","gate","mexc","cryptocom","gemini","bitstamp","bitfinex","htx","poloniex","bitmart","lbank","bingx","phemex","whitebit","coinex","xt","deepcoin","ascendex","bitrue","coinw","digifinex","toobit","weex","p2pb2b","upbit","bitflyer","bithumb","coinone","korbit","bitmex","deribit","woo","hashkey","bitkub","indodax","mercado","foxbit","bitso","ripio","rain","coincheck","zaif","bitbank","okcoin","blofin","btse","bitunix","dydx","coinmetro","coinzoom","bit2me","latoken","tokocrypto","coinspot","independentreserve","cex","currencycom","timex","novadax","bitexen","icrypex","paribu","btcturk","bitci","pionex","bittrade","uphold","bigone","bitvavo","exmo","btcmarkets"];
    if(!allowedProviders.includes(provider))return res.status(400).json({error:"Unsupported exchange"});
    if(!/^[A-Z0-9._\/-]{2,30}$/.test(symbol))return res.status(400).json({error:"Invalid symbol"});

    const cacheKey=provider+":"+symbol;
    const cached=marketCache.get("exchange:"+cacheKey);
    const now=Date.now();
    if(cached&&now-cached.time<10000){
      res.set("X-Gugee-Cache","HIT");
      return res.json(cached.data);
    }


    const ccxtProviders=["upbit","bitflyer","bithumb","coinone","korbit","bitmex","deribit","woo","hashkey","bitkub","indodax","mercado","foxbit","bitso","ripio","rain","coincheck","zaif","bitbank","okcoin","blofin","btse","bitunix","dydx","coinmetro","coinzoom","bit2me","latoken","tokocrypto","coinspot","independentreserve","cex","currencycom","timex","novadax","bitexen","icrypex","paribu","btcturk","bitci","pionex","poloniexus","uphold","bigone","bitrueus","exmo","coinfield"];
    if(ccxtProviders.includes(provider)){
      const ccxt=require("ccxt");
      const Exchange=ccxt[provider];
      if(!Exchange)return res.status(400).json({error:"Exchange adapter unavailable"});
      const ex=new Exchange({enableRateLimit:true});
      const unified=symbol.includes("-")?symbol.replace("-", "/"):symbol.replace("_","/").replace(/([A-Z0-9]+)(USDT|USD)$/,"$1/$2");
      const ticker=await ex.fetchTicker(unified);
      const data={lastPrice:String(ticker.last??ticker.close??0),quoteVolume:String(ticker.quoteVolume??0),priceChangePercent:String(ticker.percentage??0),symbol:unified,source:"ccxt"};
      marketCache.set("exchange:"+cacheKey,{time:now,data});
      return res.json(data);
    }
    const endpoints={
      binance:"https://api.binance.com/api/v3/ticker/24hr?symbol="+encodeURIComponent(symbol),
      coinbase:"https://api.exchange.coinbase.com/products/"+encodeURIComponent(symbol)+"/ticker",
      kraken:"https://api.kraken.com/0/public/Ticker?pair="+encodeURIComponent(symbol),
      bybit:"https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(symbol),
      okx:"https://www.okx.com/api/v5/market/ticker?instId="+encodeURIComponent(symbol.replace("USDT","-USDT")),
      kucoin:"https://api.kucoin.com/api/v1/market/stats?symbol="+encodeURIComponent(symbol.replace("USDT","-USDT")),
      bitget:"https://api.bitget.com/api/v2/spot/market/tickers?symbol="+encodeURIComponent(symbol),
      gate:"https://api.gateio.ws/api/v4/spot/tickers?currency_pair="+encodeURIComponent(symbol.replace("USDT","_USDT")),
      mexc:"https://api.mexc.com/api/v3/ticker/24hr?symbol="+encodeURIComponent(symbol),
      cryptocom:"https://api.crypto.com/exchange/v1/public/get-ticker?instrument_name="+encodeURIComponent(symbol.replace("USDT","_USDT")),      gemini:"https://api.gemini.com/v2/ticker/"+encodeURIComponent(symbol.replace("USDT","USD")),      bitstamp:"https://www.bitstamp.net/api/v2/ticker/"+encodeURIComponent(symbol.replace("USDT","usd")),      bitfinex:"https://api-pub.bitfinex.com/v2/ticker/t"+encodeURIComponent(symbol.replace("USDT","USD")),      htx:"https://api.huobi.pro/market/detail/merged?symbol="+encodeURIComponent(symbol.toLowerCase()),      poloniex:"https://api.poloniex.com/markets/"+encodeURIComponent(symbol.replace("USDT","_USDT")+"/ticker"),      bitmart:"https://api-cloud.bitmart.com/spot/v1/ticker?symbol="+encodeURIComponent(symbol.replace("USDT","_USDT")),      lbank:"https://api.lbkex.com/v2/ticker/24hr.do?symbol="+encodeURIComponent(symbol.replace("USDT","_USDT").toLowerCase()),      bingx:"https://open-api.bingx.com/openApi/spot/v1/ticker/24hr?symbol="+encodeURIComponent(symbol.replace("USDT","-USDT")),      phemex:"https://api.phemex.com/md/spot/ticker/24hr?symbol="+encodeURIComponent(symbol.replace("USDT","USDT")),      whitebit:"https://whitebit.com/api/v4/public/ticker?market="+encodeURIComponent(symbol.replace("USDT","_USDT")),      coinex:"https://api.coinex.com/v2/spot/ticker?market="+encodeURIComponent(symbol.replace("USDT","USDT")),      xt:"https://sapi.xt.com/v4/public/ticker/price?symbol="+encodeURIComponent(symbol.toLowerCase()),      deepcoin:"https://api.deepcoin.com/v1/spot/ticker?instType=SPOT&instId="+encodeURIComponent(symbol.replace("USDT","-USDT")),      ascendex:"https://ascendex.com/api/pro/v1/ticker?symbol="+encodeURIComponent(symbol.replace("USDT","/USDT")),      bitrue:"https://openapi.bitrue.com/api/v1/ticker/24hr?symbol="+encodeURIComponent(symbol),      coinw:"https://api.coinw.com/appApi.html?action=market&symbol="+encodeURIComponent(symbol.replace("USDT","_USDT")),      digifinex:"https://openapi.digifinex.com/v3/ticker?symbol="+encodeURIComponent(symbol.replace("USDT","_USDT")),      toobit:"https://api.toobit.com/api/v1/ticker/24hr?symbol="+encodeURIComponent(symbol),      weex:"https://api-spot.weex.com/api/v2/spot/market/ticker?symbol="+encodeURIComponent(symbol),      p2pb2b:"https://api.p2pb2b.com/api/v2/ticker/"+encodeURIComponent(symbol.replace("USDT","_USDT"))
    };
    const response=await fetch(endpoints[provider],{headers:{accept:"application/json","user-agent":"Gugee/1.0"}});
    const body=await response.text();
    if(!response.ok)return res.status(response.status).type("application/json").send(body);

    let data;
    try{data=JSON.parse(body);}catch{return res.status(502).json({error:"Invalid exchange response"});}
    marketCache.set("exchange:"+cacheKey,{time:now,data});
    res.set("X-Gugee-Cache","MISS");
    res.json(data);
  }catch(e){
    console.error("Exchange proxy error:",e.message);
    res.status(502).json({error:"Exchange data temporarily unavailable"});
  }
});

app.get("/api/exchanges/candles",async(req,res)=>{
  try{
    const provider=String(req.query.provider||"").toLowerCase();
    const symbol=String(req.query.symbol||"BTCUSDT").toUpperCase();
    const allowed=["binance","coinbase","kraken","bybit","okx","kucoin","bitget","gate","mexc","cryptocom","gemini","bitstamp","bitfinex","htx","poloniex","bitmart","lbank","bingx","phemex","whitebit","coinex","xt","deepcoin","ascendex","bitrue","coinw","digifinex","toobit","weex","p2pb2b"];
    if(!allowed.includes(provider))return res.status(400).json({error:"Unsupported exchange"});
    const ccxtProviders=["upbit","bitflyer","bithumb","coinone","korbit","bitmex","deribit","woo","hashkey","bitkub","indodax","mercado","foxbit","bitso","ripio","rain","coincheck","zaif","bitbank","okcoin","blofin","btse","bitunix","dydx","coinmetro","coinzoom","bit2me","latoken","tokocrypto","coinspot","independentreserve","cex","currencycom","timex","novadax","bitexen","icrypex","paribu","btcturk","bitci","pionex","poloniexus","uphold","bigone","bitrueus","exmo","coinfield"];
    if(ccxtProviders.includes(provider)){
      const ccxt=require("ccxt"); const Exchange=ccxt[provider];
      if(!Exchange)return res.status(400).json({error:"Exchange adapter unavailable"});
      const ex=new Exchange({enableRateLimit:true});
      const unified=symbol.includes("-")?symbol.replace("-","/"):symbol.replace("_","/").replace(/([A-Z0-9]+)(USDT|USD)$/,"$1/$2");
      const rows=await ex.fetchOHLCV(unified,"1d",undefined,31);
      return res.json(rows.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5]||0)})));
    }
    const configs={
      binance:"https://api.binance.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1d&limit=31",
      coinbase:"https://api.exchange.coinbase.com/products/"+encodeURIComponent(symbol)+"/candles?granularity=86400",
      kraken:"https://api.kraken.com/0/public/OHLC?pair="+encodeURIComponent(symbol)+"&interval=1440",
      bybit:"https://api.bybit.com/v5/market/kline?category=spot&symbol="+encodeURIComponent(symbol)+"&interval=D&limit=31",
      okx:"https://www.okx.com/api/v5/market/candles?instId="+encodeURIComponent(symbol.replace("USDT","-USDT"))+"&bar=1D&limit=31",
      kucoin:"https://api.kucoin.com/api/v1/market/candles?type=1day&symbol="+encodeURIComponent(symbol.replace("USDT","-USDT")),
      bitget:"https://api.bitget.com/api/v2/spot/market/candles?symbol="+encodeURIComponent(symbol)+"&granularity=1D&limit=31",
      gate:"https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair="+encodeURIComponent(symbol.replace("USDT","_USDT"))+"&interval=1d&limit=31",
      mexc:"https://api.mexc.com/api/v3/klines?symbol="+encodeURIComponent(symbol)+"&interval=1d&limit=31",
      cryptocom:"https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name="+encodeURIComponent(symbol.replace("USDT","_USDT"))+"&timeframe=1D&count=31",      gemini:"https://api.gemini.com/v2/candles/"+encodeURIComponent(symbol.replace("USDT","USD"))+"/1day?limit=31",      bitstamp:"https://www.bitstamp.net/api/v2/ohlc/"+encodeURIComponent(symbol.replace("USDT","").toLowerCase()+"usd")+"/?step=86400&limit=31",      bitfinex:"https://api-pub.bitfinex.com/v2/candles/trade:1D:t"+encodeURIComponent(symbol.replace("USDT","USD"))+"/hist?limit=31",      htx:"https://api.huobi.pro/market/history/kline?symbol="+encodeURIComponent(symbol.toLowerCase())+"&period=1day&size=31",      poloniex:"https://api.poloniex.com/markets/"+encodeURIComponent(symbol.replace("USDT","_USDT"))+"/candles?interval=1d&limit=31",      bitmart:"https://api-cloud.bitmart.com/spot/v1/symbols/kline?symbol="+encodeURIComponent(symbol.replace("USDT","_USDT"))+"&step=86400&limit=31",      lbank:"https://api.lbkex.com/v2/kline.do?symbol="+encodeURIComponent(symbol.replace("USDT","_USDT").toLowerCase())+"&type=day&size=31",      bingx:"https://open-api.bingx.com/openApi/spot/v1/market/kline?symbol="+encodeURIComponent(symbol.replace("USDT","-USDT"))+"&interval=1d&limit=31",      phemex:"https://api.phemex.com/md/kline?symbol="+encodeURIComponent(symbol.replace("USDT","USDT"))+"&resolution=86400&limit=31",      whitebit:"https://whitebit.com/api/v4/public/kline?market="+encodeURIComponent(symbol.replace("USDT","_USDT"))+"&interval=1d&limit=31",      coinex:"https://api.coinex.com/v2/spot/kline?market="+encodeURIComponent(symbol.replace("USDT","USDT"))+"&period=1day&limit=31",      xt:"https://sapi.xt.com/v4/public/kline?symbol="+encodeURIComponent(symbol.toLowerCase())+"&interval=1d&limit=31",      deepcoin:"https://api.deepcoin.com/v1/spot/candles?instType=SPOT&instId="+encodeURIComponent(symbol.replace("USDT","-USDT"))+"&bar=1D&limit=31",      ascendex:"https://ascendex.com/api/pro/v1/barhist?symbol="+encodeURIComponent(symbol.replace("USDT","/USDT"))+"&interval=1&n=31",      bitrue:"https://openapi.bitrue.com/api/v1/klines?symbol="+encodeURIComponent(symbol)+"&interval=1d&limit=31",      coinw:"https://api.coinw.com/appApi.html?action=kline&symbol="+encodeURIComponent(symbol.replace("USDT","_USDT"))+"&type=1day",      digifinex:"https://openapi.digifinex.com/v3/kline?symbol="+encodeURIComponent(symbol.replace("USDT","_USDT"))+"&period=1D&limit=31",      toobit:"https://api.toobit.com/api/v1/klines?symbol="+encodeURIComponent(symbol)+"&interval=1d&limit=31",      weex:"https://api-spot.weex.com/api/v2/spot/market/candles?symbol="+encodeURIComponent(symbol)+"&interval=1d&limit=31",      p2pb2b:"https://api.p2pb2b.com/api/v2/kline?market="+encodeURIComponent(symbol.replace("USDT","_USDT"))+"&interval=1d&limit=31"
    };
    const response=await fetch(configs[provider],{headers:{accept:"application/json","user-agent":"Gugee/1.0"}});
    const body=await response.text();
    if(!response.ok)return res.status(response.status).type("application/json").send(body);
    let raw;try{raw=JSON.parse(body)}catch{return res.status(502).json({error:"Invalid exchange response"})}
    let rows=[];
    if(provider==="binance"||provider==="mexc")rows=raw.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])}));
    if(provider==="coinbase")rows=raw.map(x=>({time:Number(x[0])*1000,open:Number(x[3]),high:Number(x[2]),low:Number(x[1]),close:Number(x[4]),volume:Number(x[5])}));
    if(provider==="kraken"){const x=raw.result?.XXBTZUSD||Object.values(raw.result||{})[0];rows=(x||[]).map(v=>({time:Number(v[0])*1000,open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[6])}))}
    if(provider==="bybit"){rows=(raw.result?.list||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[6])}))}
    if(provider==="okx"){rows=(raw.data||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="kucoin"){rows=(raw.data||[]).map(v=>({time:Number(v[0])*1000,open:Number(v[1]),high:Number(v[3]),low:Number(v[4]),close:Number(v[2]),volume:Number(v[5])}))}
    if(provider==="bitget"){rows=(raw.data||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="gate"){rows=(raw||[]).map(v=>({time:Number(v[0])*1000,open:Number(v[5]),high:Number(v[3]),low:Number(v[4]),close:Number(v[2]),volume:Number(v[1])}))}
    if(provider==="cryptocom"){rows=(raw.result?.data||[]).map(v=>({time:Number(v.t),open:Number(v.o),high:Number(v.h),low:Number(v.l),close:Number(v.c),volume:Number(v.v)}))}if(provider==="gemini"){rows=(raw.changes||[]).map((v,i)=>({time:Date.now()-(raw.changes.length-i)*3600000,open:Number(v),high:Number(v),low:Number(v),close:Number(v),volume:0})).slice(-31)}
    if(provider==="bitstamp"){rows=(raw.data?.ohlc||raw.ohlc||[]).map(v=>({time:Number(v.timestamp)*1000,open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.volume)}))}
    if(provider==="bitfinex"){rows=(raw||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),close:Number(v[2]),high:Number(v[3]),low:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="htx"){rows=(raw.data||[]).map(v=>({time:Number(v.id)*1000,open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.amount)}))}
    if(provider==="poloniex"){rows=(raw||[]).map(v=>({time:new Date(v.startTime||v.start).getTime(),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.quantity||v.volume)}))}
    if(provider==="bitmart"){rows=(raw.data||[]).map(v=>({time:Number(v[0])*1000,open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="lbank"){const x=raw.data?.[0]?.data||raw.data||[];rows=x.map(v=>({time:Number(v[0])*1000,open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="bingx"){rows=(raw.data||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="phemex"){const x=raw.data?.rows||raw.result?.data||[];rows=x.map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="whitebit"){rows=(raw||[]).map(v=>({time:Number(v[0])*1000,open:Number(v[1]),close:Number(v[2]),high:Number(v[3]),low:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="coinex"){rows=(raw.data||[]).map(v=>({time:Number(v.created_at||v.time),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:Number(v.value||v.volume)}))}
    if(provider==="xt"){rows=(raw.result||raw.data||[]).map(v=>({time:Number(v.t||v.timestamp),open:Number(v.o||v.open),high:Number(v.h||v.high),low:Number(v.l||v.low),close:Number(v.c||v.close),volume:Number(v.v||v.volume)}))}
    if(provider==="deepcoin"){rows=(raw.data||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="ascendex"){rows=(raw.data?.data||raw.data||[]).map(v=>({time:Number(v.ts||v.timestamp),open:Number(v.o||v.open),high:Number(v.h||v.high),low:Number(v.l||v.low),close:Number(v.c||v.close),volume:Number(v.v||v.volume)}))}
    if(provider==="bitrue"){rows=(raw||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="coinw"){const x=raw.data||raw||[];rows=x.map(v=>({time:Number(v[0]||v.time),open:Number(v[1]||v.open),high:Number(v[2]||v.high),low:Number(v[3]||v.low),close:Number(v[4]||v.close),volume:Number(v[5]||v.volume)}))}
    if(provider==="digifinex"){rows=(raw.data||[]).map(v=>({time:Number(v[0])*1000,open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="toobit"){rows=(raw||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="weex"){rows=(raw.data||[]).map(v=>({time:Number(v[0]),open:Number(v[1]),high:Number(v[2]),low:Number(v[3]),close:Number(v[4]),volume:Number(v[5])}))}
    if(provider==="p2pb2b"){rows=(raw.result||raw.data||[]).map(v=>({time:Number(v.timestamp||v[0]),open:Number(v.open||v[1]),high:Number(v.high||v[2]),low:Number(v.low||v[3]),close:Number(v.close||v[4]),volume:Number(v.volume||v[5])}))}
    rows=rows.filter(x=>Number.isFinite(x.time)&&Number.isFinite(x.close)).sort((a,b)=>a.time-b.time).slice(-31);
    res.json({provider,symbol,rows});
  }catch(e){
    console.error("Exchange candles error:",e.message);
    res.status(502).json({error:"Exchange candle data temporarily unavailable"});
  }
});

function hashToken(token){return crypto.createHash("sha256").update(token).digest("hex");}
function createToken(){return crypto.randomBytes(32).toString("hex");}

async function sendAccountEmail(to,subject,html){
  if(!RESEND_API_KEY){
    console.warn("RESEND_API_KEY is not configured; account email was not sent.");
    return false;
  }
  try{
    const resend=new Resend(RESEND_API_KEY);
    const {error}=await resend.emails.send({from:EMAIL_FROM,to,subject,html});
    if(error){
      console.error("Email error:",error);
      return false;
    }
    return true;
  }catch(error){
    console.error("Email send exception:",error);
    return false;
  }
}

function parseCookies(header=""){
  return Object.fromEntries(header.split(";").map(v=>v.trim().split("=")).filter(v=>v.length===2).map(([k,...rest])=>[k,decodeURIComponent(rest.join("="))]));
}

function signUser(user){return jwt.sign({sub:String(user.id),email:user.email},JWT_SECRET,{expiresIn:"7d"});}

function setAuthCookie(res,token){
  res.setHeader("Set-Cookie",`gugee_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV==="production" ? "; Secure" : ""}`);
}

function clearAuthCookie(res){
  res.setHeader("Set-Cookie",`gugee_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==="production" ? "; Secure" : ""}`);
}

async function auth(req,res,next){
  try{
    const token=parseCookies(req.headers.cookie||"").gugee_token;
    if(!token)return res.status(401).json({error:"Authentication required"});
    const payload=jwt.verify(token,JWT_SECRET);
    const {rows}=await pool.query("SELECT id,name,email,created_at FROM users WHERE id=$1",[payload.sub]);
    if(!rows[0])return res.status(401).json({error:"User not found"});
    req.user=rows[0];
    next();
  }catch(e){
    return res.status(401).json({error:"Invalid or expired session"});
  }
}

async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      verification_token_hash TEXT,
      verification_expires_at TIMESTAMPTZ,
      reset_token_hash TEXT,
      reset_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS watchlist(
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coin_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,coin_id)
    );
  `);
  const statements=[
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ"
  ];
  for(const sql of statements)await pool.query(sql);
}

app.get("/api/health",async(req,res)=>{
  try{
    await pool.query("SELECT 1");
    res.json({ok:true,service:"gugee-api",emailConfigured:Boolean(RESEND_API_KEY)});
  }catch(e){
    res.status(503).json({ok:false,error:"Database unavailable"});
  }
});

app.post("/api/auth/register",async(req,res)=>{
  if(!rateLimit("register:"+clientKey(req),5,15*60*1000))return res.status(429).json({error:"Too many registration attempts. Try again later."});
  try{
    const name=String(req.body.name||"").trim();
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(name.length<2)return res.status(400).json({error:"Name must contain at least 2 characters."});
    if(name.length>80)return res.status(400).json({error:"Name is too long."});
    if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return res.status(400).json({error:"Enter a valid email address."});
    if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});

    const passwordHash=await bcrypt.hash(password,12);
    const verificationToken=createToken();
    const verificationHash=hashToken(verificationToken);
    const {rows}=await pool.query(
      "INSERT INTO users(name,email,password_hash,verification_token_hash,verification_expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '24 hours') RETURNING id,name,email,email_verified,created_at",
      [name,email,passwordHash,verificationHash]
    );

    const verifyUrl=FRONTEND_URL+"/verify-email.html?token="+verificationToken+"&email="+encodeURIComponent(email);
    const verificationSent=await sendAccountEmail(
      email,
      "Verify your Gugee account",
      '<h2>Welcome to Gugee</h2><p>Verify your email to activate your account.</p><p><a href="'+verifyUrl+'">Verify email</a></p>'
    );

    setAuthCookie(res,signUser(rows[0]));
    res.status(201).json({user:rows[0],verificationSent});
  }catch(e){
    if(e.code==="23505")return res.status(409).json({error:"An account with this email already exists."});
    console.error(e);
    res.status(500).json({error:"Could not create account"});
  }
});

app.post("/api/auth/login",async(req,res)=>{
  if(!rateLimit("login:"+clientKey(req),10,15*60*1000))return res.status(429).json({error:"Too many login attempts. Try again later."});
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    const {rows}=await pool.query("SELECT id,name,email,password_hash,created_at FROM users WHERE email=$1",[email]);
    if(!rows[0])return res.status(401).json({error:"Incorrect email or password."});
    const valid=await bcrypt.compare(password,rows[0].password_hash);
    if(!valid)return res.status(401).json({error:"Incorrect email or password."});
    const user={id:rows[0].id,name:rows[0].name,email:rows[0].email,created_at:rows[0].created_at};
    setAuthCookie(res,signUser(user));
    res.json({user});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not log in"});
  }
});

app.get("/api/auth/verify-email",async(req,res)=>{
  try{
    const token=String(req.query.token||"");
    const email=String(req.query.email||"").trim().toLowerCase();
    if(!token||!email)return res.status(400).json({error:"Verification link is invalid."});
    const {rows}=await pool.query(
      "SELECT id,email FROM users WHERE email=$1 AND verification_token_hash=$2 AND verification_expires_at>NOW()",
      [email,hashToken(token)]
    );
    if(!rows[0])return res.status(400).json({error:"Verification link is invalid or expired."});
    await pool.query(
      "UPDATE users SET email_verified=TRUE,verification_token_hash=NULL,verification_expires_at=NULL WHERE id=$1",
      [rows[0].id]
    );
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not verify email"});
  }
});

app.post("/api/auth/forgot-password",async(req,res)=>{
  if(!rateLimit("forgot:"+clientKey(req),5,15*60*1000))return res.status(429).json({error:"Too many requests. Try again later."});
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const {rows}=await pool.query("SELECT id,email FROM users WHERE email=$1",[email]);
    if(rows[0]){
      const token=createToken();
      await pool.query(
        "UPDATE users SET reset_token_hash=$1,reset_expires_at=NOW()+INTERVAL '1 hour' WHERE id=$2",
        [hashToken(token),rows[0].id]
      );
      const resetUrl=FRONTEND_URL+"/reset-password.html?token="+token+"&email="+encodeURIComponent(email);
      await sendAccountEmail(
        email,
        "Reset your Gugee password",
        '<h2>Password reset</h2><p>This link expires in 1 hour.</p><p><a href="'+resetUrl+'">Reset password</a></p>'
      );
    }
    res.json({ok:true,message:"If an account exists for that email, a reset link has been sent."});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not process request"});
  }
});

app.post("/api/auth/reset-password",async(req,res)=>{
  if(!rateLimit("reset:"+clientKey(req),10,15*60*1000))return res.status(429).json({error:"Too many requests. Try again later."});
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const token=String(req.body.token||"");
    const password=String(req.body.password||"");
    if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});
    const {rows}=await pool.query(
      "SELECT id FROM users WHERE email=$1 AND reset_token_hash=$2 AND reset_expires_at>NOW()",
      [email,hashToken(token)]
    );
    if(!rows[0])return res.status(400).json({error:"Reset link is invalid or expired."});
    const passwordHash=await bcrypt.hash(password,12);
    await pool.query(
      "UPDATE users SET password_hash=$1,reset_token_hash=NULL,reset_expires_at=NULL WHERE id=$2",
      [passwordHash,rows[0].id]
    );
    clearAuthCookie(res);
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not reset password"});
  }
});

app.get("/api/auth/me",auth,(req,res)=>res.json({user:req.user}));

app.post("/api/auth/logout",(req,res)=>{
  clearAuthCookie(res);
  res.json({ok:true});
});

app.get("/api/watchlist",auth,async(req,res)=>{
  const {rows}=await pool.query("SELECT coin_id FROM watchlist WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);
  res.json({watchlist:rows.map(r=>r.coin_id)});
});

app.put("/api/watchlist",auth,async(req,res)=>{
  const ids=Array.isArray(req.body.watchlist)?req.body.watchlist:[];
  const clean=[...new Set(ids.map(v=>String(v).trim()).filter(Boolean))].slice(0,100);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("DELETE FROM watchlist WHERE user_id=$1",[req.user.id]);
    for(const id of clean)await client.query("INSERT INTO watchlist(user_id,coin_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.user.id,id]);
    await client.query("COMMIT");
    res.json({watchlist:clean});
  }catch(e){
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Could not save watchlist"});
  }finally{
    client.release();
  }
});

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

function renderOtherCryptoCards(coins){
  return coins.map(c=>{
    const id=escapeHtml(c.id);
    const name=escapeHtml(c.name||"Unknown");
    const symbol=escapeHtml(String(c.symbol||"").toUpperCase());
    const image=escapeHtml(c.image||("https://assets.coincap.io/assets/icons/"+String(c.symbol||"").toLowerCase()+"@2x.png"));
    const price=Number(c.current_price);
    const change=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);
    const priceText=Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--";
    const changeText=Number.isFinite(change)?(change>=0?"+":"")+change.toFixed(2)+"%":"Live";
    const cls=change>=0?"positive":"negative";
    return '<div class="crypto-directory-card">'+
      '<button class="crypto-favorite-button" data-favorite="'+id+'" title="Add to favorites">☆</button>'+
      '<a class="crypto-directory-main" href="crypto.html?coin='+encodeURIComponent(c.id)+'">'+
      '<img src="'+image+'" alt="'+name+' logo" loading="lazy">'+
      '<span class="crypto-directory-info"><b>'+name+'</b><small>'+symbol+'</small></span>'+
      '<strong>'+priceText+'</strong>'+
      '<span class="'+cls+'">'+changeText+'</span>'+
      '</a></div>';
  }).join("");
}

app.get("/others.html",async(req,res)=>{
  try{
    const file=fs.readFileSync(path.join(__dirname,"others.html"),"utf8");
    const coins=await getTop1000Coins();
    const cards=renderOtherCryptoCards(coins.slice(0,1000));
    const html=file.replace(
      '<div id="othersGrid" class="crypto-directory-grid"></div>',
      '<div id="othersGrid" class="crypto-directory-grid">'+cards+'</div>'
    );
    res.type("html").send(html);
  }catch(error){
    console.error("Server-rendered others page failed:",error);
    res.sendFile(path.join(__dirname,"others.html"));
  }
});

app.use(express.static(path.join(__dirname,".")));
app.use((req,res)=>{
  if(req.path.startsWith("/api/"))return res.status(404).json({error:"API route not found"});
  res.sendFile(path.join(__dirname,"index.html"));
});

initDb().then(()=>{
  app.listen(PORT,()=>console.log(`Gugee server listening on port ${PORT}`));
}).catch(error=>{
  console.error("Database initialization failed:",error);
  process.exit(1);
});
