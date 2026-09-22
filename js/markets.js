const API="https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h";
const body=document.getElementById("marketTableBody"),search=document.getElementById("marketSearch"),sort=document.getElementById("sortSelect"),more=document.getElementById("loadMore"),status=document.getElementById("marketStatus");
const WATCHLIST_KEY="gugee_watchlist"; let coins=[],visible=50;
const getFavorites=()=>JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"[]");
const saveFavorites=v=>localStorage.setItem(WATCHLIST_KEY,JSON.stringify(v));
const money=v=>v==null?"--":v>=1?v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}):v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumSignificantDigits:5});
const compact=v=>v==null?"--":new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(v);
function render(){
 const q=search.value.trim().toLowerCase();
 let list=coins.filter(c=>(c.name+" "+c.symbol).toLowerCase().includes(q));
 const s=sort.value;
 list.sort((a,b)=>s==="price_desc"?b.current_price-a.current_price:s==="change_desc"?(b.price_change_percentage_24h||-Infinity)-(a.price_change_percentage_24h||-Infinity):s==="change_asc"?(a.price_change_percentage_24h||Infinity)-(b.price_change_percentage_24h||Infinity):s==="volume_desc"?b.total_volume-a.total_volume:s==="rank_asc"?a.market_cap_rank-b.market_cap_rank:b.market_cap-a.market_cap);
 list=list.slice(0,visible);
 if(!list.length){body.innerHTML='<tr><td colspan="7" class="market-loading">No cryptocurrencies found.</td></tr>';return}
 body.innerHTML=list.map(c=>{const ch=c.price_change_percentage_24h,fav=getFavorites().includes(c.id);return '<tr class="market-row" data-id="'+c.id+'"><td class="rank">'+c.market_cap_rank+'</td><td><div class="asset"><img src="'+c.image+'" alt=""><div><b>'+c.name+'</b><span>'+c.symbol.toUpperCase()+'</span></div></div></td><td><button class="market-favorite '+(fav?"active":"")+'" data-fav="'+c.id+'">'+(fav?"★":"☆")+'</button></td><td><b>'+money(c.current_price)+'</b></td><td class="'+(ch>=0?"positive":"negative")+'">'+(ch>=0?"+":"")+(ch==null?"--":ch.toFixed(2)+"%")+'</td><td>'+money(c.market_cap)+'</td><td>'+compact(c.total_volume)+'</td></tr>'}).join("");
 document.querySelectorAll(".market-row").forEach(r=>r.onclick=e=>{if(e.target.closest(".market-favorite"))return;location.href="crypto.html?coin="+encodeURIComponent(r.dataset.id)});
 document.querySelectorAll(".market-favorite").forEach(btn=>btn.onclick=e=>{e.stopPropagation();const id=btn.dataset.fav,f=getFavorites(),i=f.indexOf(id);if(i>=0)f.splice(i,1);else f.push(id);saveFavorites(f);render()});
 more.style.display=list.length>=visible&&visible<coins.length?"":"none";
}
async function load(){try{const r=await fetch(API);if(!r.ok)throw new Error("API failed");coins=await r.json();status.textContent="Live CoinGecko data";render()}catch(e){body.innerHTML='<tr><td colspan="7" class="market-loading">Market data could not be loaded. Try again.</td></tr>';status.textContent="Data unavailable"}}
search.addEventListener("input",()=>{visible=50;render()});sort.addEventListener("change",render);more.addEventListener("click",()=>{visible+=50;render()});load();setInterval(load,60000);