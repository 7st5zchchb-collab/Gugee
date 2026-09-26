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
const STRIPE_SECRET_KEY=process.env.STRIPE_SECRET_KEY||"";
const STRIPE_WEBHOOK_SECRET=process.env.STRIPE_WEBHOOK_SECRET||"";

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

function safeEqualHex(a,b){
  try{
    const aa=Buffer.from(String(a||""),"hex"),bb=Buffer.from(String(b||""),"hex");
    return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb);
  }catch{return false;}
}
function verifyStripeSignature(rawBody,header){
  if(!STRIPE_WEBHOOK_SECRET)throw new Error("Stripe webhook secret is not configured");
  const parts=String(header||"").split(",").map(x=>x.split("="));
  const timestamp=parts.find(x=>x[0]==="t")?.[1];
  const signatures=parts.filter(x=>x[0]==="v1").map(x=>x[1]);
  if(!timestamp||!signatures.length)throw new Error("Missing Stripe signature");
  if(Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300)throw new Error("Expired Stripe signature");
  const expected=crypto.createHmac("sha256",STRIPE_WEBHOOK_SECRET).update(timestamp+"."+rawBody.toString("utf8")).digest("hex");
  if(!signatures.some(sig=>safeEqualHex(sig,expected)))throw new Error("Invalid Stripe signature");
}
async function creditStripeDeposit(session,eventId){
  if(!session||session.payment_status!=="paid")return;
  const userId=Number(session.metadata?.gugee_user_id);
  const grossCents=Number(session.amount_total);
  const feeCents=Number(session.metadata?.gugee_fee_cents||100);
  const creditCents=grossCents-feeCents;
  if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(grossCents)||grossCents<2000||creditCents<=0)throw new Error("Invalid Stripe deposit metadata");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",[eventId,"checkout.session.completed"]);
    if(!inserted.rows[0]){await client.query("ROLLBACK");return;}
    await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[userId]);
    await client.query("UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2",[creditCents/100,userId]);
    await client.query("INSERT INTO wallet_transactions(user_id,type,usdt_amount,fee_usdt) VALUES($1,'deposit',$2,$3)",[userId,creditCents/100,feeCents/100]);
    await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,$2,$3,'deposit')",[userId,"Deposit completed",(creditCents/100).toFixed(2)+" USDT was credited to your Gugee wallet."]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
async function stripeGet(pathname){
  const r=await fetch("https://api.stripe.com/v1/"+pathname,{headers:{Authorization:"Bearer "+STRIPE_SECRET_KEY}});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Stripe request failed");return data;
}
async function saveCardSetup(session,eventId,eventType){
  if(!session||session.status!=="complete")return;
  const userId=Number(session.metadata?.gugee_user_id);
  if(session.metadata?.gugee_kind!=="card_setup"||!Number.isSafeInteger(userId))throw new Error("Invalid card setup metadata");
  const setup=await stripeGet("setup_intents/"+encodeURIComponent(session.setup_intent));
  const pmId=String(setup.payment_method||"");if(!pmId)throw new Error("Missing payment method");
  const pm=await stripeGet("payment_methods/"+encodeURIComponent(pmId)),card=pm.card;
  if(!card?.last4)throw new Error("Card details unavailable");
  const customer=String(session.customer||setup.customer||pm.customer||"");
  if(!customer)throw new Error("Stripe customer unavailable");
  const client=await pool.connect();try{
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",[eventId,eventType]);
    if(!inserted.rows[0]){await client.query("ROLLBACK");return;}
    await client.query("UPDATE saved_payment_methods SET is_default=FALSE WHERE user_id=$1",[userId]);
    await client.query("INSERT INTO saved_payment_methods(user_id,stripe_customer_id,stripe_payment_method_id,brand,last4,exp_month,exp_year,is_default) VALUES($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT(stripe_payment_method_id) DO UPDATE SET brand=EXCLUDED.brand,last4=EXCLUDED.last4,exp_month=EXCLUDED.exp_month,exp_year=EXCLUDED.exp_year,is_default=TRUE",[userId,customer,pmId,String(card.brand||"card"),String(card.last4),Number(card.exp_month)||null,Number(card.exp_year)||null]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
async function fulfillCardCryptoOrder(session,eventId,eventType){
  if(!session||session.payment_status!=="paid")return;
  const userId=Number(session.metadata?.gugee_user_id),orderId=Number(session.metadata?.gugee_order_id);
  if(session.metadata?.gugee_kind!=="card_crypto"||!Number.isSafeInteger(userId)||!Number.isSafeInteger(orderId))throw new Error("Invalid card crypto metadata");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",[eventId,eventType]);
    if(!inserted.rows[0]){await client.query("ROLLBACK");return;}
    const orderQ=await client.query("SELECT * FROM card_crypto_orders WHERE id=$1 AND user_id=$2 FOR UPDATE",[orderId,userId]),order=orderQ.rows[0];
    if(!order||order.status==="paid"){await client.query("ROLLBACK");return;}
    await client.query("COMMIT");
    const coin=await getPurchaseCoin(order.coin_id);
    const cryptoUsd=Number(order.crypto_usd),quantity=cryptoUsd/coin.price;
    if(!Number.isFinite(quantity)||quantity<=0)throw new Error("Invalid crypto quantity");
    await client.query("BEGIN");
    await client.query("INSERT INTO wallet_assets(user_id,coin_id,symbol,quantity,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(user_id,coin_id) DO UPDATE SET quantity=wallet_assets.quantity+EXCLUDED.quantity,symbol=EXCLUDED.symbol,updated_at=NOW()",[userId,coin.id,coin.symbol,quantity]);
    await client.query("UPDATE card_crypto_orders SET status='paid',symbol=$1,price_usd=$2,quantity=$3,completed_at=NOW() WHERE id=$4",[coin.symbol,coin.price,quantity,orderId]);
    await client.query("INSERT INTO wallet_transactions(user_id,type,coin_id,symbol,quantity,price_usdt,usdt_amount,fee_usdt) VALUES($1,'buy',$2,$3,$4,$5,$6,$7)",[userId,coin.id,coin.symbol,quantity,coin.price,cryptoUsd,Number(order.fee_usd)]);
    await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Card crypto purchase completed',$2,'buy')",[userId,"Your "+coin.symbol+" purchase was credited after Stripe confirmed the card payment."]);
    await client.query("COMMIT");
  }catch(e){try{await client.query("ROLLBACK")}catch{}throw e;}finally{client.release();}
}
async function activateStripeSubscription(session,eventId,eventType){
  if(!session||session.payment_status!=="paid")return;
  const userId=Number(session.metadata?.gugee_user_id),plan=String(session.metadata?.gugee_plan||"").toLowerCase();
  if(session.metadata?.gugee_kind!=="subscription"||!Number.isSafeInteger(userId)||!["plus","pro"].includes(plan))throw new Error("Invalid subscription metadata");
  const price=plan==="plus"?4.99:9.99;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",[eventId,eventType]);
    if(!inserted.rows[0]){await client.query("ROLLBACK");return;}
    await client.query("INSERT INTO subscriptions(user_id,plan,price_usdt,status,started_at,expires_at,stripe_subscription_id,stripe_customer_id) VALUES($1,$2,$3,'active',NOW(),NOW()+INTERVAL '31 days',$4,$5) ON CONFLICT(user_id) DO UPDATE SET plan=EXCLUDED.plan,price_usdt=EXCLUDED.price_usdt,status='active',started_at=NOW(),expires_at=EXCLUDED.expires_at,stripe_subscription_id=EXCLUDED.stripe_subscription_id,stripe_customer_id=EXCLUDED.stripe_customer_id",[userId,plan,price,session.subscription||null,session.customer||null]);
    await client.query("INSERT INTO wallet_transactions(user_id,type,usdt_amount,fee_usdt) VALUES($1,'subscription',$2,0)",[userId,price]);
    await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Subscription activated',$2,'subscription')",[userId,plan.toUpperCase()+" is now active."]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
async function syncStripeSubscription(subscription,eventId,eventType){
  const stripeId=String(subscription?.id||"");if(!stripeId)return;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",[eventId,eventType]);
    if(!inserted.rows[0]){await client.query("ROLLBACK");return;}
    const q=await client.query("SELECT user_id,plan FROM subscriptions WHERE stripe_subscription_id=$1 FOR UPDATE",[stripeId]),current=q.rows[0];
    if(!current){await client.query("ROLLBACK");return;}
    const active=["active","trialing"].includes(String(subscription.status));
    if(active){
      const end=Number(subscription.current_period_end);
      await client.query("UPDATE subscriptions SET status='active',expires_at=CASE WHEN $1::bigint>0 THEN to_timestamp($1) ELSE expires_at END WHERE user_id=$2",[end,current.user_id]);
    }else{
      await client.query("UPDATE subscriptions SET plan='free',price_usdt=0,status='active',expires_at=NULL,stripe_subscription_id=NULL WHERE user_id=$1",[current.user_id]);
      await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Plan changed to Free',$2,'subscription')",[current.user_id,"Your paid subscription is no longer active. Your Gugee account is now on the Free plan."]);
    }
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
async function handleStripeInvoice(invoice,eventId,eventType){
  const stripeId=String(invoice?.subscription||"");if(!stripeId)return;
  const client=await pool.connect();try{
    await client.query("BEGIN");
    const inserted=await client.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id",[eventId,eventType]);
    if(!inserted.rows[0]){await client.query("ROLLBACK");return;}
    const q=await client.query("SELECT user_id,plan,price_usdt FROM subscriptions WHERE stripe_subscription_id=$1 FOR UPDATE",[stripeId]),s=q.rows[0];
    if(!s){await client.query("ROLLBACK");return;}
    if(eventType==="invoice.paid"){
      await client.query("UPDATE subscriptions SET status='active',expires_at=NOW()+INTERVAL '31 days' WHERE user_id=$1",[s.user_id]);
      await client.query("INSERT INTO wallet_transactions(user_id,type,usdt_amount,fee_usdt) VALUES($1,'subscription',$2,0)",[s.user_id,Number(s.price_usdt||0)]);
      await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Subscription renewed',$2,'subscription')",[s.user_id,s.plan.toUpperCase()+" renewed successfully."]);
    }else{
      await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Subscription payment failed',$2,'subscription')",[s.user_id,"Stripe could not renew your "+s.plan.toUpperCase()+" subscription. Update your payment method to avoid losing paid-plan access."]);
    }
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
app.post("/api/stripe/webhook",express.raw({type:"application/json",limit:"256kb"}),async(req,res)=>{
  try{
    verifyStripeSignature(req.body,req.headers["stripe-signature"]);
    const event=JSON.parse(req.body.toString("utf8"));
    if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){
      const session=event.data?.object;
      if(session?.metadata?.gugee_kind==="subscription")await activateStripeSubscription(session,event.id,event.type);
      else if(session?.metadata?.gugee_kind==="card_setup")await saveCardSetup(session,event.id,event.type);
      else if(session?.metadata?.gugee_kind==="card_crypto")await fulfillCardCryptoOrder(session,event.id,event.type);
      else await creditStripeDeposit(session,event.id);
    }
    if(event.type==="customer.subscription.updated"||event.type==="customer.subscription.deleted")await syncStripeSubscription(event.data?.object,event.id,event.type);
    if(event.type==="invoice.paid"||event.type==="invoice.payment_failed")await handleStripeInvoice(event.data?.object,event.id,event.type);
    if(event.type==="checkout.session.async_payment_failed"||event.type==="checkout.session.expired"){
      const session=event.data?.object;
      await pool.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING",[event.id,event.type]);
      if(session?.metadata?.gugee_kind==="card_crypto"){
        const status=event.type==="checkout.session.expired"?"expired":"failed";
        await pool.query("UPDATE card_crypto_orders SET status=$1 WHERE id=$2 AND user_id=$3 AND status='pending'",[status,Number(session.metadata?.gugee_order_id),Number(session.metadata?.gugee_user_id)]);
      }
    }
    res.json({received:true});
  }catch(e){
    console.error("Stripe webhook error:",e.message);
    res.status(400).json({error:"Invalid webhook"});
  }
});

app.use(express.json({limit:"20kb"}));

app.disable("x-powered-by");
app.use((req,res,next)=>{
  const origin=String(req.headers.origin||"");
  const allowed=new Set(["https://gugee.onrender.com","https://gugees.onrender.com"]);
  if(FRONTEND_URL)allowed.add(FRONTEND_URL);
  if(origin&&allowed.has(origin)){
    res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Access-Control-Allow-Credentials","true");
    res.setHeader("Vary","Origin");
    res.setHeader("Access-Control-Allow-Headers","Content-Type");
    res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS");
  }
  if(req.method==="OPTIONS")return res.sendStatus(204);
  next();
});
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

function normalizeMarketCoin(coin){
  const c=coin||{};
  return {
    id:String(c.id||""),name:String(c.name||""),symbol:String(c.symbol||"").toLowerCase(),image:c.image||null,
    current_price:Number.isFinite(Number(c.current_price))?Number(c.current_price):null,
    market_cap:Number.isFinite(Number(c.market_cap))?Number(c.market_cap):null,
    market_cap_rank:Number.isFinite(Number(c.market_cap_rank))?Number(c.market_cap_rank):null,
    total_volume:Number.isFinite(Number(c.total_volume))?Number(c.total_volume):null,
    price_change_percentage_24h:Number.isFinite(Number(c.price_change_percentage_24h))?Number(c.price_change_percentage_24h):null,
    price_change_percentage_7d_in_currency:Number.isFinite(Number(c.price_change_percentage_7d_in_currency))?Number(c.price_change_percentage_7d_in_currency):null,
    price_change_percentage_30d_in_currency:Number.isFinite(Number(c.price_change_percentage_30d_in_currency))?Number(c.price_change_percentage_30d_in_currency):null,
    high_24h:Number.isFinite(Number(c.high_24h))?Number(c.high_24h):null,
    low_24h:Number.isFinite(Number(c.low_24h))?Number(c.low_24h):null
  };
}

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
        if(Array.isArray(rows))return rows.map(normalizeMarketCoin);
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
  return payload.data.map(coin=>normalizeMarketCoin({
    id:coin.id,name:coin.name,symbol:coin.symbol,
    image:"https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(coin.symbol||"").toLowerCase())+"@2x.png",
    current_price:Number(coin.priceUsd),
    market_cap:Number(coin.marketCapUsd),
    total_volume:Number(coin.volumeUsd24Hr),
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
    pages.flat().map(normalizeMarketCoin).forEach(coin=>{if(coin.id)map.set(coin.id,coin);});
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
async function fearGreedProxy(req,res){
  try{
    const r=await fetch("https://api.alternative.me/fng/?limit=1",{headers:{accept:"application/json","user-agent":"Gugee/1.0"}});
    const body=await r.text();
    res.status(r.status).type("application/json").send(body);
  }catch(e){res.status(502).json({error:"Fear & Greed service unavailable"});}
}

app.get("/api/market/fear-greed",fearGreedProxy);
app.get("/api/coingecko/top1000",top1000Coins);
app.use("/api/coingecko",coingeckoProxy);

app.use("/api/exchanges",async(req,res,next)=>{
  if(req.path==="/candles") return next();
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

function makeReferralCode(username){
  const base=String(username||"user").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,12)||"user";
  return base+"_"+crypto.randomBytes(4).toString("hex");
}

function depositFee(amount){return Math.max(1,Math.ceil(Number(amount)/20));}
function withdrawFee(amount){return Math.max(1,Math.ceil(Number(amount)/20));}
const PLAN_LIMITS={
  free:{favorites:5,dailyWithdrawal:500,tradeFee:0.10,cardCryptoFee:1.50},
  plus:{favorites:25,dailyWithdrawal:5000,tradeFee:0.05,cardCryptoFee:1.00},
  pro:{favorites:100,dailyWithdrawal:25000,tradeFee:0,cardCryptoFee:0.50}
};
async function getActivePlan(userId){
  const {rows}=await pool.query("SELECT plan,status,expires_at FROM subscriptions WHERE user_id=$1",[userId]);
  const s=rows[0];
  if(!s||s.status!=="active"||(s.expires_at&&new Date(s.expires_at)<=new Date()))return "free";
  return ["free","plus","pro"].includes(s.plan)?s.plan:"free";
}
async function getPlanLimits(userId){const plan=await getActivePlan(userId);return {plan,...PLAN_LIMITS[plan]};}


function validMoney(value,max=1000000000){
  const n=Number(value);
  return Number.isFinite(n)&&n>0&&n<=max;
}

function setAuthCookie(res,token){
  res.setHeader("Set-Cookie",`gugee_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Max-Age=604800${process.env.NODE_ENV==="production" ? "; Secure" : ""}`);
}

function clearAuthCookie(res){
  res.setHeader("Set-Cookie",`gugee_token=; Path=/; HttpOnly; SameSite=None; Max-Age=0${process.env.NODE_ENV==="production" ? "; Secure" : ""}`);
}

async function auth(req,res,next){
  try{
    const token=parseCookies(req.headers.cookie||"").gugee_token;
    if(!token)return res.status(401).json({error:"Authentication required"});
    const payload=jwt.verify(token,JWT_SECRET);
    const {rows}=await pool.query("SELECT id,name,username,email,avatar_data,created_at,is_admin FROM users WHERE id=$1",[payload.sub]);
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
      username TEXT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      verification_token_hash TEXT,
      verification_expires_at TIMESTAMPTZ,
      reset_token_hash TEXT,
      reset_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wallets(
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      usdt NUMERIC(30,10) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS wallet_assets(
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coin_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity NUMERIC(40,18) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,coin_id)
    );
    CREATE TABLE IF NOT EXISTS watchlist(
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coin_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,coin_id)
    );
    CREATE TABLE IF NOT EXISTS exchange_connections(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exchange_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      api_key_encrypted TEXT NOT NULL,
      api_secret_encrypted TEXT NOT NULL,
      passphrase_encrypted TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id,exchange_id)
    );
    CREATE TABLE IF NOT EXISTS subscriptions(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL CHECK(plan IN ('free','plus','pro')),
      price_usdt NUMERIC(30,10) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      UNIQUE(user_id)
    );
    CREATE TABLE IF NOT EXISTS notifications(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS wallet_transactions(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('buy','sell','deposit','withdraw','usdt_adjustment','tournament_entry','tournament_prize','giveaway_prize','referral_reward','task_reward','subscription')),
      coin_id TEXT,
      symbol TEXT,
      quantity NUMERIC(40,18),
      price_usdt NUMERIC(30,12),
      usdt_amount NUMERIC(30,10) NOT NULL,
      fee_usdt NUMERIC(30,10) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS task_claims(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL,
      reward_usdt NUMERIC(30,10) NOT NULL DEFAULT 0,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id,task_id)
    );
    CREATE TABLE IF NOT EXISTS referrals(
      id BIGSERIAL PRIMARY KEY,
      referrer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS stripe_events(
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS saved_payment_methods(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT NOT NULL,
      stripe_payment_method_id TEXT NOT NULL UNIQUE,
      brand TEXT NOT NULL DEFAULT 'card',
      last4 TEXT NOT NULL,
      exp_month INTEGER,
      exp_year INTEGER,
      is_default BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS card_crypto_orders(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_session_id TEXT UNIQUE,
      coin_id TEXT NOT NULL,
      symbol TEXT,
      crypto_usd NUMERIC(30,10) NOT NULL,
      fee_usd NUMERIC(30,10) NOT NULL DEFAULT 1.50,
      price_usd NUMERIC(30,12),
      quantity NUMERIC(40,18),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS withdrawal_requests(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_usdt NUMERIC(30,10) NOT NULL,
      fee_usdt NUMERIC(30,10) NOT NULL,
      net_usdt NUMERIC(30,10) NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('visa','mastercard','paypal')),
      destination TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','paid','rejected','cancelled')),
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      review_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users(LOWER(username)) WHERE username IS NOT NULL");
  await pool.query("ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check");
  await pool.query("ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK(type IN ('buy','sell','deposit','withdraw','usdt_adjustment','tournament_entry','tournament_prize','giveaway_prize','referral_reward','task_reward','subscription'))");
  await pool.query("ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS fee_usdt NUMERIC(30,10) NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON users(referral_code) WHERE referral_code IS NOT NULL");
  await pool.query("ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS destination TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS review_note TEXT");
  await pool.query("ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check");
  await pool.query("ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check CHECK(plan IN ('free','plus','pro'))");
  await pool.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT");
  await pool.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("UPDATE users SET is_admin=TRUE WHERE LOWER(email)='gurgensirunyan111@gmail.com'");
  const statements=[
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ"
  ];
  for(const sql of statements)await pool.query(sql);
}

app.get("/api/subscriptions",auth,async(req,res)=>{try{const {rows}=await pool.query("SELECT * FROM subscriptions WHERE user_id=$1",[req.user.id]);res.json({subscription:rows[0]||{plan:"free",status:"active",price_usdt:0}})}catch(e){res.status(500).json({error:"Could not load subscription"})}});
app.post("/api/subscriptions/create-checkout-session",auth,async(req,res)=>{
  if(!STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe is not configured."});
  const plan=String(req.body.plan||"").toLowerCase();
  const plans={plus:{cents:499,name:"Gugee Plus"},pro:{cents:999,name:"Gugee Pro"}};
  if(!plans[plan])return res.status(400).json({error:"Select Plus or Pro."});
  try{
    const origin=FRONTEND_URL||(`${req.protocol}://${req.get("host")}`);
    const body=new URLSearchParams();
    body.set("mode","subscription");
    body.set("success_url",origin+"/account.html?subscription=success");
    body.set("cancel_url",origin+"/account.html?subscription=cancelled");
    body.set("customer_email",req.user.email);
    body.set("line_items[0][price_data][currency]","usd");
    body.set("line_items[0][price_data][product_data][name]",plans[plan].name);
    body.set("line_items[0][price_data][unit_amount]",String(plans[plan].cents));
    body.set("line_items[0][price_data][recurring][interval]","month");
    body.set("line_items[0][quantity]","1");
    body.set("metadata[gugee_kind]","subscription");
    body.set("metadata[gugee_user_id]",String(req.user.id));
    body.set("metadata[gugee_plan]",plan);
    const stripeResponse=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+STRIPE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},body});
    const session=await stripeResponse.json();
    if(!stripeResponse.ok||!session.url)throw new Error(session?.error?.message||"Could not create subscription checkout");
    res.json({url:session.url,plan,price:plans[plan].cents/100});
  }catch(e){console.error("Subscription checkout error:",e.message);res.status(502).json({error:"Could not start subscription checkout."});}
});

app.post("/api/subscriptions/free",auth,async(req,res)=>{
  try{
    const {rows}=await pool.query("SELECT plan,stripe_subscription_id FROM subscriptions WHERE user_id=$1",[req.user.id]),sub=rows[0];
    if(!sub||sub.plan==="free"){await pool.query("INSERT INTO subscriptions(user_id,plan,price_usdt,status,expires_at) VALUES($1,'free',0,'active',NULL) ON CONFLICT(user_id) DO UPDATE SET plan='free',price_usdt=0,status='active',expires_at=NULL",[req.user.id]);return res.json({ok:true,plan:"free"});}
    return res.status(409).json({error:"Cancel your paid plan first. It will switch to Free after the paid billing period ends."});
  }catch(e){res.status(500).json({error:"Could not activate Free plan"});}
});

app.post("/api/subscriptions/cancel",auth,async(req,res)=>{
  try{
    const {rows}=await pool.query("SELECT plan,stripe_subscription_id FROM subscriptions WHERE user_id=$1",[req.user.id]),sub=rows[0];
    if(!sub||sub.plan==="free")return res.json({ok:true,plan:"free"});
    if(!STRIPE_SECRET_KEY||!sub.stripe_subscription_id)return res.status(409).json({error:"This subscription is not linked to Stripe."});
    const body=new URLSearchParams();body.set("cancel_at_period_end","true");
    const sr=await fetch("https://api.stripe.com/v1/subscriptions/"+encodeURIComponent(sub.stripe_subscription_id),{method:"POST",headers:{Authorization:"Bearer "+STRIPE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},body});
    const stripeSub=await sr.json();if(!sr.ok)throw new Error(stripeSub?.error?.message||"Stripe cancellation failed");
    const end=Number(stripeSub.current_period_end);
    await pool.query("UPDATE subscriptions SET expires_at=CASE WHEN $1::bigint>0 THEN to_timestamp($1) ELSE expires_at END WHERE user_id=$2",[end,req.user.id]);
    res.json({ok:true,cancelAtPeriodEnd:true,expiresAt:end?new Date(end*1000).toISOString():null});
  }catch(e){console.error("Subscription cancel:",e.message);res.status(502).json({error:"Could not schedule subscription cancellation"})}
});
app.get("/api/notifications",auth,async(req,res)=>{try{const {rows}=await pool.query("SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.id]);res.json({notifications:rows})}catch(e){res.status(500).json({error:"Could not load notifications"})}});
app.post("/api/notifications/:id/read",auth,async(req,res)=>{try{await pool.query("UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2",[req.params.id,req.user.id]);res.json({ok:true})}catch(e){res.status(500).json({error:"Could not update notification"})}});
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
    const username=String(req.body.username||"").trim().toLowerCase();
    const name=username;
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(!/^[a-z0-9_][a-z0-9_.-]{2,19}$/.test(username))return res.status(400).json({error:"Username must be 3-20 characters and use letters, numbers, _, ., or -."});
    if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return res.status(400).json({error:"Enter a valid email address."});
    if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});

    const passwordHash=await bcrypt.hash(password,12);
    const verificationToken=createToken();
    const verificationHash=hashToken(verificationToken);
    const referralCode=String(req.body.ref||"").trim().toLowerCase();
    let referredBy=null;
    if(referralCode){
      const ref=await pool.query("SELECT id FROM users WHERE LOWER(referral_code)=LOWER($1)",[referralCode]);
      if(ref.rows[0])referredBy=ref.rows[0].id;
    }
    let newReferralCode=makeReferralCode(username);
    for(let i=0;i<5;i++){
      const exists=await pool.query("SELECT 1 FROM users WHERE referral_code=$1",[newReferralCode]);
      if(!exists.rows[0])break;
      newReferralCode=makeReferralCode(username);
    }
    const {rows}=await pool.query(
      "INSERT INTO users(name,username,email,password_hash,verification_token_hash,verification_expires_at,referral_code,referred_by) VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '24 hours',$6,$7) RETURNING id,name,username,email,email_verified,referral_code,created_at",
      [name,username,email,passwordHash,verificationHash,newReferralCode,referredBy]
    );

    const verifyUrl=FRONTEND_URL+"/verify-email.html?token="+verificationToken+"&email="+encodeURIComponent(email);
    const verificationSent=await sendAccountEmail(
      email,
      "Verify your Gugee account",
      '<h2>Welcome to Gugee</h2><p>Verify your email to activate your account.</p><p><a href="'+verifyUrl+'">Verify email</a></p>'
    );

    await pool.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[rows[0].id]);
    setAuthCookie(res,signUser(rows[0]));
    res.status(201).json({user:rows[0],verificationSent});
  }catch(e){
    if(e.code==="23505")return res.status(409).json({error:String(e.constraint||"").includes("username")?"That @username is already taken.":"An account with this email already exists."});
    console.error(e);
    res.status(500).json({error:"Could not create account"});
  }
});

app.post("/api/auth/login",async(req,res)=>{
  if(!rateLimit("login:"+clientKey(req),10,15*60*1000))return res.status(429).json({error:"Too many login attempts. Try again later."});
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    const {rows}=await pool.query("SELECT id,name,username,email,password_hash,created_at FROM users WHERE email=$1",[email]);
    if(!rows[0])return res.status(401).json({error:"Incorrect email or password."});
    const valid=await bcrypt.compare(password,rows[0].password_hash);
    if(!valid)return res.status(401).json({error:"Incorrect email or password."});
    const user={id:rows[0].id,name:rows[0].name,username:rows[0].username,email:rows[0].email,created_at:rows[0].created_at};
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

app.get("/api/auth/me",auth,async(req,res)=>{
  try{
    const {rows}=await pool.query("SELECT id,name,username,email,avatar_data,created_at,is_admin,referral_code FROM users WHERE id=$1",[req.user.id]);
    res.json({user:rows[0]});
  }catch(e){res.status(500).json({error:"Could not load account"});}
});

app.post("/api/account/avatar",auth,async(req,res)=>{
  try{
    const avatar=String(req.body.avatar||"");
    if(avatar&&!/^data:image\/(png|jpeg|webp);base64,/i.test(avatar))return res.status(400).json({error:"Use a PNG, JPEG or WebP image."});
    if(avatar.length>700000)return res.status(413).json({error:"Avatar is too large. Maximum size is about 500 KB."});
    await pool.query("UPDATE users SET avatar_data=$1 WHERE id=$2",[avatar||null,req.user.id]);
    res.json({ok:true,avatar:avatar||null});
  }catch(e){res.status(500).json({error:"Could not update avatar"});}
});

app.post("/api/account/change-password",auth,async(req,res)=>{
  if(!rateLimit("password:"+clientKey(req),5,15*60*1000))return res.status(429).json({error:"Too many password attempts. Try again later."});
  try{
    const currentPassword=String(req.body.currentPassword||""),newPassword=String(req.body.newPassword||"");
    if(newPassword.length<8)return res.status(400).json({error:"New password must be at least 8 characters."});
    const {rows}=await pool.query("SELECT password_hash FROM users WHERE id=$1",[req.user.id]);
    if(!rows[0]||!await bcrypt.compare(currentPassword,rows[0].password_hash))return res.status(401).json({error:"Current password is incorrect."});
    const hash=await bcrypt.hash(newPassword,12);
    await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[hash,req.user.id]);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:"Could not change password"});}
});

app.post("/api/auth/logout",(req,res)=>{
  clearAuthCookie(res);
  res.json({ok:true});
});

app.get("/api/wallet/transactions",auth,async(req,res)=>{
  try{
    const {rows}=await pool.query("SELECT id,type,coin_id,symbol,quantity,price_usdt,usdt_amount,fee_usdt,created_at FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]);
    res.json({transactions:rows.map(t=>({...t,quantity:t.quantity===null?null:Number(t.quantity),price_usdt:t.price_usdt===null?null:Number(t.price_usdt),usdt_amount:Number(t.usdt_amount),fee_usdt:Number(t.fee_usdt||0)}))});
  }catch(e){console.error(e);res.status(500).json({error:"Could not load transaction history"});}
});

app.get("/api/account/limits",auth,async(req,res)=>{try{const limits=await getPlanLimits(req.user.id);res.json(limits)}catch(e){res.status(500).json({error:"Could not load account limits"})}});

const TASK_DEFS=[
  {id:"deposit_100",title:"Deposit 100 USDT",description:"Reach 100 USDT in confirmed lifetime deposits.",target:100,reward:0.50,minRevenue:5},
  {id:"deposit_500",title:"Deposit 500 USDT",description:"Reach 500 USDT in confirmed lifetime deposits.",target:500,reward:1.50,minRevenue:15},
  {id:"ten_crypto_buys",title:"Complete 10 crypto buys",description:"Complete 10 successful crypto purchases.",target:10,reward:0.75,minRevenue:7.5},
  {id:"trade_volume_1000",title:"Trade 1,000 USDT",description:"Reach 1,000 USDT in completed buy and sell volume.",target:1000,reward:2.00,minRevenue:20},
  {id:"trade_volume_5000",title:"Trade 5,000 USDT",description:"Reach 5,000 USDT in completed buy and sell volume.",target:5000,reward:5.00,minRevenue:50},
  {id:"invite_three",title:"Invite 3 qualified users",description:"3 people must join through your referral link and qualify.",target:3,reward:1.00,minRevenue:10},
  {id:"five_referrals",title:"Invite 5 qualified users",description:"5 qualified referrals unlock the separate 10 USDT referral milestone.",target:5,reward:0,minRevenue:0}
];
async function userPlatformRevenue(userId,client=pool){
  const tx=(await client.query("SELECT COALESCE(SUM(fee_usdt),0) AS fees FROM wallet_transactions WHERE user_id=$1",[userId])).rows[0];
  const sub=(await client.query("SELECT COALESCE(SUM(usdt_amount),0) AS subscriptions FROM wallet_transactions WHERE user_id=$1 AND type='subscription' AND usdt_amount>0",[userId])).rows[0];
  const earned=Number(tx.fees||0)+Number(sub.subscriptions||0);
  const paid=(await client.query("SELECT COALESCE(SUM(reward_usdt),0) AS rewards FROM task_claims WHERE user_id=$1",[userId])).rows[0];
  return Math.max(0,earned-Number(paid.rewards||0));
}
async function taskProgress(userId){
  const u=(await pool.query("SELECT email_verified,avatar_data FROM users WHERE id=$1",[userId])).rows[0]||{};
  const tx=(await pool.query("SELECT COUNT(*) FILTER(WHERE type='deposit')::int AS deposits,COALESCE(SUM(usdt_amount+fee_usdt) FILTER(WHERE type='deposit'),0) AS deposit_volume,COUNT(*) FILTER(WHERE type='buy')::int AS buys,COALESCE(SUM(ABS(usdt_amount)) FILTER(WHERE type IN ('buy','sell')),0) AS trade_volume FROM wallet_transactions WHERE user_id=$1",[userId])).rows[0];
  let refs=0;try{refs=Number((await pool.query("SELECT COUNT(*)::int AS n FROM community_referrals WHERE referrer_id=$1 AND status IN ('qualified','rewarded')",[userId])).rows[0].n||0)}catch{}
  return {deposit_100:Number(tx.deposit_volume||0),deposit_500:Number(tx.deposit_volume||0),ten_crypto_buys:Number(tx.buys||0),trade_volume_1000:Number(tx.trade_volume||0),trade_volume_5000:Number(tx.trade_volume||0),invite_three:refs,five_referrals:refs};
}
app.get("/api/tasks",auth,async(req,res)=>{
  try{
    const progress=await taskProgress(req.user.id);
    const {rows}=await pool.query("SELECT task_id,reward_usdt,claimed_at FROM task_claims WHERE user_id=$1",[req.user.id]);
    const claimed=new Map(rows.map(x=>[x.task_id,x]));
    const platformRevenue=await userPlatformRevenue(req.user.id);
    res.json({rewardBudget:platformRevenue,tasks:TASK_DEFS.map(t=>({...t,progress:Math.min(t.target,Number(progress[t.id]||0)),completed:Number(progress[t.id]||0)>=t.target,revenueReady:platformRevenue>=Number(t.minRevenue||0)&&platformRevenue>=Number(t.reward||0),claimed:claimed.has(t.id),claimed_at:claimed.get(t.id)?.claimed_at||null}))});
  }catch(e){console.error(e);res.status(500).json({error:"Could not load tasks"});}
});
app.post("/api/tasks/:id/claim",auth,async(req,res)=>{
  const def=TASK_DEFS.find(t=>t.id===req.params.id);
  if(!def)return res.status(404).json({error:"Task not found."});
  if(def.reward<=0)return res.status(400).json({error:"This task reward is credited by its own milestone system."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[req.user.id]);
    const progress=await taskProgress(req.user.id);
    if(Number(progress[def.id]||0)<def.target){await client.query("ROLLBACK");return res.status(400).json({error:"Complete the task before claiming the reward."});}
    const platformRevenue=await userPlatformRevenue(req.user.id,client);
    if(platformRevenue<Number(def.minRevenue||0)||platformRevenue<Number(def.reward||0)){await client.query("ROLLBACK");return res.status(400).json({error:"Reward unlock requires more eligible Gugee fee/subscription revenue."});}
    const claim=await client.query("INSERT INTO task_claims(user_id,task_id,reward_usdt) VALUES($1,$2,$3) ON CONFLICT(user_id,task_id) DO NOTHING RETURNING id",[req.user.id,def.id,def.reward]);
    if(!claim.rows[0]){await client.query("ROLLBACK");return res.status(409).json({error:"Reward already claimed."});}
    await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[req.user.id]);
    await client.query("UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2",[def.reward,req.user.id]);
    await client.query("INSERT INTO wallet_transactions(user_id,type,usdt_amount) VALUES($1,'task_reward',$2)",[req.user.id,def.reward]);
    await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Task reward claimed',$2,'task')",[req.user.id,def.title+" · +"+def.reward.toFixed(2)+" USDT"]);
    await client.query("COMMIT");res.json({ok:true,reward:def.reward});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not claim task reward"});}finally{client.release();}
});

app.get("/api/wallet",auth,async(req,res)=>{
  try{
    await pool.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const wallet=(await pool.query("SELECT usdt,created_at,updated_at FROM wallets WHERE user_id=$1",[req.user.id])).rows[0];
    const assets=(await pool.query("SELECT coin_id,symbol,quantity,updated_at FROM wallet_assets WHERE user_id=$1 AND quantity<>0 ORDER BY updated_at DESC",[req.user.id])).rows;
    res.json({wallet:{usdt:Number(wallet.usdt),created_at:wallet.created_at,updated_at:wallet.updated_at},assets:assets.map(a=>({...a,quantity:Number(a.quantity)}))});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not load wallet"});
  }
});

app.post("/api/wallet/usdt",auth,async(req,res)=>{
  if(!req.user.is_admin)return res.status(403).json({error:"Wallet balance adjustments are restricted."});
  const amount=Number(req.body.amount);
  if(!Number.isFinite(amount)||amount===0)return res.status(400).json({error:"Amount must be a non-zero number."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const result=await client.query(
      "UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2 AND usdt+$1>=0 RETURNING usdt",
      [amount,req.user.id]
    );
    if(!result.rows[0]){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"Insufficient USDT balance."});
    }
    await client.query("INSERT INTO wallet_transactions(user_id,type,usdt_amount) VALUES($1,'usdt_adjustment',$2)",[req.user.id,amount]);
    await client.query("COMMIT");
    res.json({usdt:Number(result.rows[0].usdt)});
  }catch(e){
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Could not update USDT balance"});
  }finally{client.release();}
});

async function getPurchaseCoin(coinId){
  const id=String(coinId||"").trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9._-]{1,80}$/.test(id))throw new Error("Invalid coin id");
  try{
    const coins=await getTop1000Coins();
    const coin=coins.find(c=>String(c.id).toLowerCase()===id);
    if(coin&&Number.isFinite(Number(coin.current_price))&&Number(coin.current_price)>0){
      return {id:coin.id,symbol:String(coin.symbol||"").toUpperCase(),price:Number(coin.current_price)};
    }
  }catch{}
  const target=COINGECKO_BASE+"/simple/price?ids="+encodeURIComponent(id)+"&vs_currencies=usd";
  const response=await fetch(target,{headers:{accept:"application/json","user-agent":"Gugee/1.0"}});
  if(!response.ok)throw new Error("Live price unavailable");
  const data=await response.json();
  const price=Number(data?.[id]?.usd);
  if(!Number.isFinite(price)||price<=0)throw new Error("Coin not found");
  return {id,symbol:id.toUpperCase(),price};
}

app.post("/api/stripe/create-checkout-session",auth,async(req,res)=>{
  if(!STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe is not configured."});
  const amount=Number(req.body.amount);
  if(!Number.isFinite(amount)||amount<20||amount>100000)return res.status(400).json({error:"Deposit must be between $20 and $100,000."});
  const grossCents=Math.round(amount*100);
  const feeCents=Math.round(depositFee(amount)*100);
  if(grossCents<=feeCents)return res.status(400).json({error:"Deposit amount is too small."});
  try{
    const origin=FRONTEND_URL||(`${req.protocol}://${req.get("host")}`);
    const body=new URLSearchParams();
    body.set("mode","payment");
    body.set("success_url",origin+"/account.html?deposit=success&session_id={CHECKOUT_SESSION_ID}");
    body.set("cancel_url",origin+"/account.html?deposit=cancelled");
    body.set("customer_email",req.user.email);
    body.set("line_items[0][price_data][currency]","usd");
    body.set("line_items[0][price_data][product_data][name]","Gugee wallet deposit");
    body.set("line_items[0][price_data][unit_amount]",String(grossCents));
    body.set("line_items[0][quantity]","1");
    body.set("metadata[gugee_kind]","deposit");
    body.set("metadata[gugee_user_id]",String(req.user.id));
    body.set("metadata[gugee_fee_cents]",String(feeCents));
    body.set("metadata[gugee_gross_cents]",String(grossCents));
    const stripeResponse=await fetch("https://api.stripe.com/v1/checkout/sessions",{
      method:"POST",
      headers:{Authorization:"Bearer "+STRIPE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":"gugee-deposit-"+req.user.id+"-"+grossCents+"-"+Date.now()},
      body
    });
    const session=await stripeResponse.json();
    if(!stripeResponse.ok||!session.url)throw new Error(session?.error?.message||"Could not create Stripe Checkout session");
    res.json({url:session.url,sessionId:session.id,fee:feeCents/100,estimatedCredit:(grossCents-feeCents)/100});
  }catch(e){
    console.error("Stripe checkout error:",e.message);
    res.status(502).json({error:"Could not start secure checkout."});
  }
});

app.get("/api/wallet/price",auth,async(req,res)=>{
  try{
    const coin=await getPurchaseCoin(req.query.coin);
    res.json(coin);
  }catch(e){
    res.status(400).json({error:e.message||"Could not load coin price"});
  }
});

app.get("/api/payment-methods",auth,async(req,res)=>{try{const {rows}=await pool.query("SELECT id,brand,last4,exp_month,exp_year,is_default,created_at FROM saved_payment_methods WHERE user_id=$1 ORDER BY is_default DESC,created_at DESC",[req.user.id]);res.json({cards:rows})}catch(e){res.status(500).json({error:"Could not load payment methods"})}});
app.delete("/api/payment-methods/:id",auth,async(req,res)=>{try{const {rows}=await pool.query("DELETE FROM saved_payment_methods WHERE id=$1 AND user_id=$2 RETURNING stripe_payment_method_id",[req.params.id,req.user.id]);if(!rows[0])return res.status(404).json({error:"Card not found"});res.json({ok:true})}catch(e){res.status(500).json({error:"Could not remove card"})}});
app.post("/api/stripe/setup-card",auth,async(req,res)=>{
  if(!STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe is not configured."});
  try{
    const origin=FRONTEND_URL||(`${req.protocol}://${req.get("host")}`),body=new URLSearchParams();
    body.set("mode","setup");body.set("customer_creation","always");body.set("success_url",origin+"/account.html?card=added");body.set("cancel_url",origin+"/account.html?card=cancelled");body.set("customer_email",req.user.email);
    body.set("metadata[gugee_kind]","card_setup");body.set("metadata[gugee_user_id]",String(req.user.id));
    const sr=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+STRIPE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},body}),session=await sr.json();
    if(!sr.ok||!session.url)throw new Error(session?.error?.message||"Could not create card setup");
    res.json({url:session.url});
  }catch(e){console.error("Card setup:",e.message);res.status(502).json({error:"Could not start secure card setup."});}
});

app.get("/api/card-crypto/orders",auth,async(req,res)=>{
  try{
    const {rows}=await pool.query("SELECT id,coin_id,symbol,crypto_usd,fee_usd,price_usd,quantity,status,created_at,completed_at FROM card_crypto_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.id]);
    res.json({orders:rows.map(o=>({...o,crypto_usd:Number(o.crypto_usd),fee_usd:Number(o.fee_usd),price_usd:o.price_usd===null?null:Number(o.price_usd),quantity:o.quantity===null?null:Number(o.quantity)}))});
  }catch(e){res.status(500).json({error:"Could not load card purchase history"});}
});

app.post("/api/stripe/card-crypto-checkout",auth,async(req,res)=>{
  if(!STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe is not configured."});
  const coinId=String(req.body.coinId||"").trim().toLowerCase(),cryptoUsd=Number(req.body.usdAmount);
  if(!Number.isFinite(cryptoUsd)||cryptoUsd<5||cryptoUsd>100000)return res.status(400).json({error:"Card crypto purchase must be between $5 and $100,000."});
  let coin;try{coin=await getPurchaseCoin(coinId)}catch(e){return res.status(400).json({error:e.message||"Coin unavailable"});}
  const limits=await getPlanLimits(req.user.id),fee=limits.cardCryptoFee,total=cryptoUsd+fee,totalCents=Math.round(total*100);
  try{
    const order=(await pool.query("INSERT INTO card_crypto_orders(user_id,coin_id,symbol,crypto_usd,fee_usd,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id",[req.user.id,coin.id,coin.symbol,cryptoUsd,fee])).rows[0];
    const origin=FRONTEND_URL||(`${req.protocol}://${req.get("host")}`),body=new URLSearchParams();
    const savedCard=(await pool.query("SELECT stripe_customer_id FROM saved_payment_methods WHERE user_id=$1 AND is_default=TRUE ORDER BY created_at DESC LIMIT 1",[req.user.id])).rows[0];
    body.set("mode","payment");body.set("success_url",origin+"/account.html?cardcrypto=success");body.set("cancel_url",origin+"/account.html?cardcrypto=cancelled");
    if(savedCard?.stripe_customer_id)body.set("customer",savedCard.stripe_customer_id);else body.set("customer_email",req.user.email);
    body.set("payment_intent_data[setup_future_usage]","off_session");
    body.set("line_items[0][price_data][currency]","usd");body.set("line_items[0][price_data][product_data][name]","Gugee "+coin.symbol+" card purchase");body.set("line_items[0][price_data][unit_amount]",String(totalCents));body.set("line_items[0][quantity]","1");
    body.set("metadata[gugee_kind]","card_crypto");body.set("metadata[gugee_user_id]",String(req.user.id));body.set("metadata[gugee_order_id]",String(order.id));
    const sr=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:"Bearer "+STRIPE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},body}),session=await sr.json();
    if(!sr.ok||!session.url)throw new Error(session?.error?.message||"Could not create checkout");
    await pool.query("UPDATE card_crypto_orders SET stripe_session_id=$1 WHERE id=$2",[session.id,order.id]);
    res.json({url:session.url,orderId:order.id,fee,total,coin:coin.symbol});
  }catch(e){console.error("Card crypto checkout:",e.message);res.status(502).json({error:"Could not start card crypto checkout."});}
});

app.post("/api/wallet/buy",auth,async(req,res)=>{
  const coinId=String(req.body.coinId||"").trim().toLowerCase();
  const usdtAmount=Number(req.body.usdtAmount);
  if(!Number.isFinite(usdtAmount)||usdtAmount<=0)return res.status(400).json({error:"USDT amount must be greater than 0."});
  if(usdtAmount>1000000000)return res.status(400).json({error:"USDT amount is too large."});
  let coin;
  try{coin=await getPurchaseCoin(coinId);}catch(e){return res.status(400).json({error:e.message||"Could not load coin price"});}
  const limits=await getPlanLimits(req.user.id),fee=limits.tradeFee;
  const totalDebit=usdtAmount+fee;
  const quantity=usdtAmount/coin.price;
  if(!Number.isFinite(quantity)||quantity<=0)return res.status(400).json({error:"Could not calculate crypto quantity."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const wallet=await client.query(
      "UPDATE wallets SET usdt=usdt-$1,updated_at=NOW() WHERE user_id=$2 AND usdt>=$1 RETURNING usdt",
      [totalDebit,req.user.id]
    );
    if(!wallet.rows[0]){
      await client.query("ROLLBACK");
      return res.status(400).json({error:"Insufficient USDT balance."});
    }
    await client.query(
      "INSERT INTO wallet_assets(user_id,coin_id,symbol,quantity,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(user_id,coin_id) DO UPDATE SET quantity=wallet_assets.quantity+EXCLUDED.quantity,symbol=EXCLUDED.symbol,updated_at=NOW()",
      [req.user.id,coin.id,coin.symbol,quantity]
    );
    const tx=await client.query(
      "INSERT INTO wallet_transactions(user_id,type,coin_id,symbol,quantity,price_usdt,usdt_amount,fee_usdt) VALUES($1,'buy',$2,$3,$4,$5,$6,$7) RETURNING id,created_at",
      [req.user.id,coin.id,coin.symbol,quantity,coin.price,usdtAmount,fee]
    );
    await client.query("COMMIT");
    res.json({ok:true,purchase:{coinId:coin.id,symbol:coin.symbol,quantity,price:coin.price,usdtAmount,fee,totalDebit},usdt:Number(wallet.rows[0].usdt),transactionId:tx.rows[0].id,createdAt:tx.rows[0].created_at});
  }catch(e){
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({error:"Could not complete crypto purchase"});
  }finally{client.release();}
});

// Wallet deposits are created through /api/stripe/create-checkout-session and credited only by verified Stripe webhooks.

app.post("/api/wallet/withdraw",auth,async(req,res)=>{
  const amount=Number(req.body.amount);
  const limits=await getPlanLimits(req.user.id);
  const today=await pool.query("SELECT COALESCE(SUM(amount_usdt),0) AS total FROM withdrawal_requests WHERE user_id=$1 AND created_at>=date_trunc('day',NOW()) AND status NOT IN ('rejected','cancelled')",[req.user.id]);
  const usedToday=Number(today.rows[0]?.total||0);
  if(Number.isFinite(amount)&&usedToday+amount>limits.dailyWithdrawal)return res.status(403).json({error:limits.plan.toUpperCase()+" daily withdrawal limit is "+limits.dailyWithdrawal+" USDT.",plan:limits.plan,limit:limits.dailyWithdrawal,usedToday});
  const method=String(req.body.method||"").toLowerCase();
  const destination=String(req.body.destination||"").trim();
  if(!Number.isFinite(amount)||amount<20||amount>100000)return res.status(400).json({error:"Withdrawal must be between 20 and 100,000 USDT."});
  if(!["visa","mastercard","paypal"].includes(method))return res.status(400).json({error:"Select a payout method."});
  if(destination.length<4||destination.length>160)return res.status(400).json({error:"Enter valid payout details."});
  const fee=withdrawFee(amount),net=amount-fee;
  if(net<=0)return res.status(400).json({error:"Withdrawal amount is too small after fees."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const held=await client.query("UPDATE wallets SET usdt=usdt-$1,updated_at=NOW() WHERE user_id=$2 AND usdt>=$1 RETURNING usdt",[amount,req.user.id]);
    if(!held.rows[0]){await client.query("ROLLBACK");return res.status(400).json({error:"Insufficient USDT balance."});}
    const row=await client.query("INSERT INTO withdrawal_requests(user_id,amount_usdt,fee_usdt,net_usdt,method,destination,status) VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING id,status,created_at",[req.user.id,amount,fee,net,method,destination]);
    await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Withdrawal pending',$2,'withdrawal')",[req.user.id,"Your withdrawal is under review. Review target: within 12 hours."]);
    await client.query("COMMIT");
    res.status(201).json({ok:true,withdrawal:{...row.rows[0],amount,fee,net,method},usdt:Number(held.rows[0].usdt)});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not create withdrawal request"});}finally{client.release();}
});

app.get("/api/admin/withdrawals",auth,async(req,res)=>{
  if(!req.user.is_admin)return res.status(403).json({error:"Admin access required"});
  try{
    const {rows}=await pool.query("SELECT w.id,w.user_id,u.username,u.email,w.amount_usdt,w.fee_usdt,w.net_usdt,w.method,w.destination,w.status,w.created_at,w.reviewed_at,w.review_note FROM withdrawal_requests w JOIN users u ON u.id=w.user_id ORDER BY CASE WHEN w.status='pending' THEN 0 ELSE 1 END,w.created_at ASC LIMIT 200");
    res.json({withdrawals:rows});
  }catch(e){res.status(500).json({error:"Could not load withdrawals"});}
});

app.post("/api/admin/withdrawals/:id/review",auth,async(req,res)=>{
  if(!req.user.is_admin)return res.status(403).json({error:"Admin access required"});
  const action=String(req.body.action||"").toLowerCase(),note=String(req.body.note||"").trim().slice(0,500);
  if(!["approve","reject"].includes(action))return res.status(400).json({error:"Action must be approve or reject."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const q=await client.query("SELECT * FROM withdrawal_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
    const w=q.rows[0];
    if(!w){await client.query("ROLLBACK");return res.status(404).json({error:"Withdrawal not found"});}
    if(w.status!=="pending"){await client.query("ROLLBACK");return res.status(409).json({error:"Withdrawal was already reviewed."});}
    if(action==="reject"){
      await client.query("UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2",[w.amount_usdt,w.user_id]);
      await client.query("UPDATE withdrawal_requests SET status='rejected',reviewed_at=NOW(),reviewed_by=$1,review_note=$2 WHERE id=$3",[req.user.id,note,w.id]);
      await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Withdrawal rejected',$2,'withdrawal')",[w.user_id,"Your held balance was returned to your wallet."]);
    }else{
      await client.query("UPDATE withdrawal_requests SET status='processing',reviewed_at=NOW(),reviewed_by=$1,review_note=$2 WHERE id=$3",[req.user.id,note,w.id]);
      await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Withdrawal approved',$2,'withdrawal')",[w.user_id,"Your withdrawal was approved and is awaiting payout confirmation."]);
    }
    await client.query("COMMIT");
    res.json({ok:true,status:action==="approve"?"processing":"rejected"});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not review withdrawal"});}finally{client.release();}
});

app.post("/api/admin/withdrawals/:id/paid",auth,async(req,res)=>{
  if(!req.user.is_admin)return res.status(403).json({error:"Admin access required"});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const q=await client.query("SELECT * FROM withdrawal_requests WHERE id=$1 FOR UPDATE",[req.params.id]),w=q.rows[0];
    if(!w){await client.query("ROLLBACK");return res.status(404).json({error:"Withdrawal not found"});}
    if(w.status!=="processing"){await client.query("ROLLBACK");return res.status(409).json({error:"Withdrawal must be approved before marking paid."});}
    await client.query("UPDATE withdrawal_requests SET status='paid',reviewed_at=NOW(),reviewed_by=$1 WHERE id=$2",[req.user.id,w.id]);
    await client.query("INSERT INTO wallet_transactions(user_id,type,usdt_amount,fee_usdt) VALUES($1,'withdraw',$2,$3)",[w.user_id,-Number(w.net_usdt),w.fee_usdt]);
    await client.query("INSERT INTO notifications(user_id,title,message,type) VALUES($1,'Withdrawal paid',$2,'withdrawal')",[w.user_id,"Your withdrawal has been marked paid."]);
    await client.query("COMMIT");res.json({ok:true,status:"paid"});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not mark withdrawal paid"});}finally{client.release();}
});

app.get("/api/wallet/withdrawals",auth,async(req,res)=>{
  try{
    const {rows}=await pool.query("SELECT id,amount_usdt,fee_usdt,net_usdt,method,status,created_at FROM withdrawal_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.id]);
    res.json({withdrawals:rows.map(x=>({...x,amount_usdt:Number(x.amount_usdt),fee_usdt:Number(x.fee_usdt),net_usdt:Number(x.net_usdt)}))});
  }catch(e){res.status(500).json({error:"Could not load withdrawals"});}
});

app.post("/api/wallet/sell",auth,async(req,res)=>{
  const coinId=String(req.body.coinId||"").trim().toLowerCase();
  const quantity=Number(req.body.quantity);
  if(!coinId||!Number.isFinite(quantity)||quantity<=0)return res.status(400).json({error:"Invalid coin or quantity."});
  let coin;
  try{coin=await getPurchaseCoin(coinId);}catch(e){return res.status(400).json({error:e.message||"Could not load coin price"});}
  const gross=quantity*coin.price;
  const limits=await getPlanLimits(req.user.id),fee=limits.tradeFee;
  if(!Number.isFinite(gross)||gross<=fee)return res.status(400).json({error:"Sale value must be greater than the "+fee.toFixed(2)+" USDT trading fee."});
  const net=gross-fee;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const asset=await client.query("SELECT quantity FROM wallet_assets WHERE user_id=$1 AND coin_id=$2 FOR UPDATE",[req.user.id,coin.id]);
    const owned=Number(asset.rows[0]?.quantity||0);
    if(owned+1e-18<quantity){await client.query("ROLLBACK");return res.status(400).json({error:"Insufficient crypto balance."});}
    await client.query("UPDATE wallet_assets SET quantity=quantity-$1,updated_at=NOW() WHERE user_id=$2 AND coin_id=$3",[quantity,req.user.id,coin.id]);
    await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const wallet=await client.query("UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2 RETURNING usdt",[net,req.user.id]);
    const row=wallet.rows[0];
    const tx=await client.query("INSERT INTO wallet_transactions(user_id,type,coin_id,symbol,quantity,price_usdt,usdt_amount,fee_usdt) VALUES($1,'sell',$2,$3,$4,$5,$6,$7) RETURNING id,created_at",[req.user.id,coin.id,coin.symbol,quantity,coin.price,net,fee]);
    await client.query("COMMIT");
    res.json({ok:true,sale:{coinId:coin.id,symbol:coin.symbol,quantity,price:coin.price,gross,fee,net},usdt:Number(row.usdt),transactionId:tx.rows[0].id,createdAt:tx.rows[0].created_at});
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not complete crypto sale"});}
  finally{client.release();}
});

app.get("/api/wallet/assets",auth,async(req,res)=>{
  try{
    const {rows}=await pool.query("SELECT coin_id,symbol,quantity,updated_at FROM wallet_assets WHERE user_id=$1 AND quantity<>0 ORDER BY updated_at DESC",[req.user.id]);
    res.json({assets:rows.map(a=>({...a,quantity:Number(a.quantity)}))});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"Could not load crypto assets"});
  }
});

app.get("/api/exchanges/supported",auth,(req,res)=>{
  res.json({exchanges:SUPPORTED_TRADING_EXCHANGES});
});

app.get("/api/exchange/connections",auth,async(req,res)=>{
  const {rows}=await pool.query("SELECT id,exchange_id,label,created_at,updated_at FROM exchange_connections WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);
  res.json({connections:rows});
});

app.post("/api/exchange/connect",auth,async(req,res)=>{
  if(!rateLimit("exchange-connect:"+req.user.id,10,15*60*1000))return res.status(429).json({error:"Too many connection attempts. Try again later."});
  const exchangeId=String(req.body.exchangeId||"").toLowerCase().trim();
  const apiKey=String(req.body.apiKey||"").trim();
  const apiSecret=String(req.body.apiSecret||"").trim();
  const passphrase=String(req.body.passphrase||"").trim();
  const label=String(req.body.label||"").trim().slice(0,80);
  if(!SUPPORTED_TRADING_EXCHANGES.includes(exchangeId))return res.status(400).json({error:"Unsupported exchange."});
  if(!apiKey||!apiSecret)return res.status(400).json({error:"API key and secret are required."});
  let exchange;
  try{
    exchange=createExchange(exchangeId,apiKey,apiSecret,passphrase);
    await exchange.checkRequiredCredentials();
    const balance=await exchange.fetchBalance();
    const quote=balance?.USDT||balance?.USD||{};
    const available=Number(quote.free??0);
    const total=Number(quote.total??0);
    await pool.query(
      "INSERT INTO exchange_connections(user_id,exchange_id,label,api_key_encrypted,api_secret_encrypted,passphrase_encrypted,updated_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(user_id,exchange_id) DO UPDATE SET label=EXCLUDED.label,api_key_encrypted=EXCLUDED.api_key_encrypted,api_secret_encrypted=EXCLUDED.api_secret_encrypted,passphrase_encrypted=EXCLUDED.passphrase_encrypted,updated_at=NOW()",
      [req.user.id,exchangeId,label,encryptSecret(apiKey),encryptSecret(apiSecret),passphrase?encryptSecret(passphrase):null]
    );
    res.json({ok:true,connection:{exchangeId,label},balance:{usdtFree:Number.isFinite(available)?available:0,usdtTotal:Number.isFinite(total)?total:0}});
  }catch(e){
    console.error("Exchange connection failed:",e.message);
    res.status(400).json({error:"Could not verify exchange credentials. Check the API key, secret, permissions, and exchange settings."});
  }
});

app.delete("/api/exchange/connections/:exchangeId",auth,async(req,res)=>{
  const exchangeId=String(req.params.exchangeId||"").toLowerCase();
  await pool.query("DELETE FROM exchange_connections WHERE user_id=$1 AND exchange_id=$2",[req.user.id,exchangeId]);
  res.json({ok:true});
});

app.get("/api/exchange/balance/:exchangeId",auth,async(req,res)=>{
  try{
    const row=await getExchangeConnection(req.user.id,req.params.exchangeId);
    if(!row)return res.status(404).json({error:"Exchange is not connected."});
    const exchange=createExchange(row.exchange_id,decryptSecret(row.api_key_encrypted),decryptSecret(row.api_secret_encrypted),row.passphrase_encrypted?decryptSecret(row.passphrase_encrypted):"");
    const balance=await exchange.fetchBalance();
    const result=Object.entries(balance.total||{}).filter(([,v])=>Number(v)>0).map(([asset,total])=>({asset,total:Number(total),free:Number(balance.free?.[asset]||0),used:Number(balance.used?.[asset]||0)}));
    res.json({exchange:row.exchange_id,balances:result});
  }catch(e){
    console.error("Exchange balance failed:",e.message);
    res.status(400).json({error:"Could not load exchange balance."});
  }
});

app.get("/api/exchange/orders/:exchangeId",auth,async(req,res)=>{
  try{
    const row=await getExchangeConnection(req.user.id,req.params.exchangeId);
    if(!row)return res.status(404).json({error:"Exchange is not connected."});
    const exchange=createExchange(row.exchange_id,decryptSecret(row.api_key_encrypted),decryptSecret(row.api_secret_encrypted),row.passphrase_encrypted?decryptSecret(row.passphrase_encrypted):"");
    const symbol=req.query.symbol?String(req.query.symbol).toUpperCase():undefined;
    const orders=await exchange.fetchOpenOrders(symbol);
    res.json({orders:orders.map(o=>({id:o.id,status:o.status,type:o.type,side:o.side,symbol:o.symbol,amount:Number(o.amount||0),filled:Number(o.filled||0),remaining:Number(o.remaining||0),price:o.price==null?null:Number(o.price),average:o.average==null?null:Number(o.average),timestamp:o.timestamp}))});
  }catch(e){
    console.error("Exchange orders failed:",e.message);
    res.status(400).json({error:"Could not load exchange orders."});
  }
});

app.get("/api/watchlist",auth,async(req,res)=>{
  const {rows}=await pool.query("SELECT coin_id FROM watchlist WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);
  res.json({watchlist:rows.map(r=>r.coin_id)});
});

app.put("/api/watchlist",auth,async(req,res)=>{
  const ids=Array.isArray(req.body.watchlist)?req.body.watchlist:[];
  const limits=await getPlanLimits(req.user.id);
  const unique=[...new Set(ids.map(v=>String(v).trim()).filter(Boolean))];
  if(unique.length>limits.favorites)return res.status(403).json({error:limits.plan.toUpperCase()+" plan allows up to "+limits.favorites+" favorites.",plan:limits.plan,limit:limits.favorites});
  const clean=unique.slice(0,limits.favorites);
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

function encryptionKey(){
  return crypto.createHash("sha256").update(JWT_SECRET+"|gugee-exchange-keys").digest();
}
function encryptSecret(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
  return iv.toString("base64")+"."+cipher.getAuthTag().toString("base64")+"."+encrypted.toString("base64");
}
function decryptSecret(value){
  const [iv64,tag64,data64]=String(value||"").split(".");
  if(!iv64||!tag64||!data64)throw new Error("Invalid encrypted credential");
  const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv64,"base64"));
  decipher.setAuthTag(Buffer.from(tag64,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(data64,"base64")),decipher.final()]).toString("utf8");
}
const SUPPORTED_TRADING_EXCHANGES=["binance","bybit","okx","kraken","kucoin","coinbase","bitget","gateio","mexc"];
function createExchange(id,apiKey,secret,passphrase){
  const normalized=String(id||"").toLowerCase();
  if(!SUPPORTED_TRADING_EXCHANGES.includes(normalized))throw new Error("Unsupported exchange");
  const Exchange=require("ccxt")[normalized];
  if(!Exchange)throw new Error("Exchange adapter unavailable");
  const config={apiKey,secret,enableRateLimit:true};
  if(passphrase)config.password=passphrase;
  return new Exchange(config);
}
async function getExchangeConnection(userId,id){
  const {rows}=await pool.query("SELECT * FROM exchange_connections WHERE user_id=$1 AND exchange_id=$2",[userId,String(id).toLowerCase()]);
  if(!rows[0])return null;
  return rows[0];
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}

app.get("/health",(req,res)=>res.json({ok:true,service:"Gugee",time:new Date().toISOString()}));
app.use((req,res,next)=>{
  if(/\.(?:html?|js|css|json|webp|png|jpg|jpeg|svg|ico)$/i.test(req.path)) res.set("Cache-Control","no-store, max-age=0");
  next();
});
function mountPublicFiles(){
const publicPages=new Set(["index.html","markets.html","cryptos.html","crypto.html","others.html","analysis.html","exchanges.html","exchange.html","account.html","register.html","login.html","verify-email.html","forgot-password.html","reset-password.html","referrals.html","tournaments.html","giveaways.html","community-admin.html"]);
app.use((req,res,next)=>{
  if(req.path.startsWith("/api/"))return res.status(404).json({error:"API route not found"});
  if(req.path==="/")return res.sendFile(path.join(__dirname,"index.html"));
  if(publicPages.has(req.path.slice(1)))return res.sendFile(path.join(__dirname,req.path.slice(1)));
  if(/^\/(?:css|js|images)\/[a-zA-Z0-9_./-]+$/.test(req.path)&&!req.path.includes("..")){
    return express.static(__dirname,{index:false,dotfiles:"deny"})(req,res,next);
  }
  return res.status(404).send("Not Found");
});

}

initDb().then(async()=>{
  const {initCommunity}=require("./community-routes");
  await initCommunity(app,pool,auth);
  mountPublicFiles();
  app.listen(PORT,()=>console.log(`Gugee server listening on port ${PORT}`));
}).catch(error=>{
  console.error("Database initialization failed:",error);
  process.exit(1);
});
