const grid=document.getElementById("cryptoDirectoryGrid");
const input=document.getElementById("cryptoDirectorySearch");
const count=document.getElementById("cryptoDirectoryCount");
const more=document.getElementById("cryptoLoadMore");

const API="/api/coingecko/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=";
let page=0,allCoins=[],loading=false;

const fallbackCoins=[
{id:"bitcoin",name:"Bitcoin",symbol:"btc",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/1/large/bitcoin.png"},
{id:"ethereum",name:"Ethereum",symbol:"eth",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/279/large/ethereum.png"},
{id:"tether",name:"Tether",symbol:"usdt",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/325/large/Tether.png"},
{id:"binancecoin",name:"BNB",symbol:"bnb",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png"},
{id:"solana",name:"Solana",symbol:"sol",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/4128/large/solana.png"},
{id:"ripple",name:"XRP",symbol:"xrp",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png"},
{id:"usd-coin",name:"USDC",symbol:"usdc",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/6319/large/usdc.png"},
{id:"dogecoin",name:"Dogecoin",symbol:"doge",current_price:0,price_change_percentage_24h:0,image:"https://assets.coingecko.com/coins/images/5/large/dogecoin.png"}
];

function logoFor(c){
  return c.image||("https://assets.coincap.io/assets/icons/"+encodeURIComponent(String(c.symbol||"").toLowerCase())+"@2x.png");
}

function render(){
  const q=input.value.trim().toLowerCase();
  const filtered=allCoins.filter(c=>!q||String(c.name||"").toLowerCase().includes(q)||String(c.symbol||"").toLowerCase().includes(q)||String(c.id||"").toLowerCase().includes(q));
  count.textContent=filtered.length+" cryptocurrencies loaded";
  grid.innerHTML=filtered.length?filtered.map(c=>{
    const ch=Number(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h);
    const price=Number(c.current_price);
    return '<a class="crypto-directory-card" href="crypto.html?coin='+encodeURIComponent(c.id)+'">'+
      '<img src="'+logoFor(c)+'" alt="'+String(c.name||"Crypto")+' logo" loading="lazy" onerror="this.onerror=null;this.src=\'https://assets.coincap.io/assets/icons/'+encodeURIComponent(String(c.symbol||"").toLowerCase())+'@2x.png\';">'+
      '<span class="crypto-directory-info"><b>'+String(c.name||"Unknown")+'</b><small>'+String(c.symbol||"").toUpperCase()+'</small></span>'+
      '<strong>'+(Number.isFinite(price)&&price>0?"$"+price.toLocaleString("en-US",{maximumFractionDigits:price>=1?2:8}):"--")+'</strong>'+
      '<span class="'+(ch>=0?"positive":"negative")+'">'+(Number.isFinite(ch)&&price>0?(ch>=0?"+":"")+ch.toFixed(2)+"%":"Live")+'</span>'+
      '</a>';
  }).join(""):'<div class="exchange-directory-empty">No cryptocurrency found.</div>';
}

function showFallback(){
  if(!allCoins.length){
    allCoins=fallbackCoins.slice();
    render();
  }
}

async function load(){
  if(loading)return;
  loading=true;
  more.disabled=true;
  more.textContent="Loading...";
  const nextPage=page+1;
  try{
    const r=await fetch(API+nextPage+"&sparkline=false&price_change_percentage=24h,7d,30d",{cache:"no-store"});
    const body=await r.text();
    if(!r.ok)throw new Error(body||("HTTP "+r.status));
    const rows=JSON.parse(body);
    if(!Array.isArray(rows)||!rows.length)throw new Error("Invalid cryptocurrency response");
    page=nextPage;
    allCoins=allCoins.concat(rows);
    render();
    more.disabled=rows.length<100;
    more.textContent=rows.length<100?"No more":"Load more";
  }catch(error){
    console.error("Crypto directory error:",error);
    showFallback();
    more.disabled=false;
    more.textContent="Try again";
  }finally{
    loading=false;
  }
}

input.addEventListener("input",render);
more.addEventListener("click",load);
showFallback();
load();
