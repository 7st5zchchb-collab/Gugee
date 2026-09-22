const express=require("express");
const path=require("path");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const {Pool}=require("pg");

const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET;
const DATABASE_URL=process.env.DATABASE_URL;

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
const COINGECKO_CACHE_MS=30000;

app.use("/api/exchanges",async(req,res)=>{
  try{
    const provider=String(req.query.provider||"").toLowerCase();
    const symbol=String(req.query.symbol||"").toUpperCase().replace(/\/(TICKER|SPOT)$/,"");
    const allowedProviders=["binance","coinbase","kraken","bybit"];
    if(!allowedProviders.includes(provider))return res.status(400).json({error:"Unsupported exchange"});
    if(!/^[A-Z0-9._-]{2,30}$/.test(symbol))return res.status(400).json({error:"Invalid symbol"});

    const cacheKey=provider+":"+symbol;
    const cached=marketCache.get("exchange:"+cacheKey);
    const now=Date.now();
    if(cached&&now-cached.time<10000){
      res.set("X-Gugee-Cache","HIT");
      return res.json(cached.data);
    }

    const endpoints={
      binance:"https://api.binance.com/api/v3/ticker/24hr?symbol="+encodeURIComponent(symbol),
      coinbase:"https://api.exchange.coinbase.com/products/"+encodeURIComponent(symbol)+"/ticker",
      kraken:"https://api.kraken.com/0/public/Ticker?pair="+encodeURIComponent(symbol),
      bybit:"https://api.bybit.com/v5/market/tickers?category=spot&symbol="+encodeURIComponent(symbol)
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

function parseCookies(header=""){
  return Object.fromEntries(header.split(";").map(v=>v.trim().split("=")).filter(v=>v.length===2).map(([k,...rest])=>[k,decodeURIComponent(rest.join("="))]));
}
function signUser(user){return jwt.sign({sub:String(user.id),email:user.email},JWT_SECRET,{expiresIn:"7d"});}
function setAuthCookie(res,token){
  res.setHeader("Set-Cookie",`gugee_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV==="production"?"; Secure":""}`);
}
function clearAuthCookie(res){
  res.setHeader("Set-Cookie",`gugee_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==="production"?"; Secure":""}`);
}
async function auth(req,res,next){
  try{
    const token=parseCookies(req.headers.cookie||"").gugee_token;
    if(!token)return res.status(401).json({error:"Authentication required"});
    const payload=jwt.verify(token,JWT_SECRET);
    const {rows}=await pool.query("SELECT id,name,email,created_at FROM users WHERE id=$1",[payload.sub]);
    if(!rows[0])return res.status(401).json({error:"User not found"});
    req.user=rows[0]; next();
  }catch(e){return res.status(401).json({error:"Invalid or expired session"});}
}

async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS watchlist(
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coin_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,coin_id)
    );
  `);
}

app.get("/api/health",async(req,res)=>{
  try{await pool.query("SELECT 1");res.json({ok:true,service:"gugee-api"});}
  catch(e){res.status(503).json({ok:false,error:"Database unavailable"});}
});

app.post("/api/auth/register",async(req,res)=>{\n  if(!rateLimit("register:"+clientKey(req),5,15*60*1000))return res.status(429).json({error:"Too many registration attempts. Try again later."});
  try{
    const name=String(req.body.name||"").trim();\n    if(name.length>80)return res.status(400).json({error:"Name is too long."});
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(name.length<2)return res.status(400).json({error:"Name must contain at least 2 characters."});
    if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});
    if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});
    const passwordHash=await bcrypt.hash(password,12);
    const {rows}=await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,created_at",[name,email,passwordHash]);
    setAuthCookie(res,signUser(rows[0]));
    res.status(201).json({user:rows[0]});
  }catch(e){
    if(e.code==="23505")return res.status(409).json({error:"An account with this email already exists."});
    console.error(e);res.status(500).json({error:"Could not create account"});
  }
});

app.post("/api/auth/login",async(req,res)=>{\n  if(!rateLimit("login:"+clientKey(req),10,15*60*1000))return res.status(429).json({error:"Too many login attempts. Try again later."});
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
  }catch(e){console.error(e);res.status(500).json({error:"Could not log in"});}
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
  }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not save watchlist"});}
  finally{client.release();}
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
