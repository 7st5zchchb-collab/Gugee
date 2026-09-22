const API="https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=";
const GLOBAL_API="https://api.coingecko.com/api/v3/global";
const globalCap=document.getElementById("globalCap"),globalVolume=document.getElementById("globalVolume"),btcDominance=document.getElementById("btcDominance"),activeCoins=document.getElementById("activeCoins"),marketBreadth=document.getElementById("marketBreadth"),topGainers=document.getElementById("topGainers"),topLosers=document.getElementById("topLosers"),marketHeatmap=document.getElementById("marketHeatmap"),globalMarketChart=document.getElementById("globalMarketChart"),globalChartTooltip=document.getElementById("globalChartTooltip");
let globalChartData=[];
const body=document.getElementById("marketTableBody"),liquidity=document.getElementById("liquiditySelect"),search=document.getElementById("marketSearch"),sort=document.getElementById("sortSelect"),category=document.getElementById("categorySelect"),changePeriod=document.getElementById("changePeriod"),changeDirection=document.getElementById("changeDirection"),more=document.getElementById("loadMore"),status=document.getElementById("marketStatus"),favoritesOnly=document.getElementById("favoritesOnly");
const WATCHLIST_KEY="gugee_watchlist"; let coins=[],visible=50,currentPage=1,loadingMore=false,hasMore=true;
const getFavorites=()=>JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"[]");
const saveFavorites=v=>localStorage.setItem(WATCHLIST_KEY,JSON.stringify(v));
const money=v=>v==null?"--":v>=1?v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}):v.toLocaleString("en-US",{style:"currency",currency:"USD",maximumSignificantDigits:5});
const compact=v=>v==null?"--":new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(v);
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
 if(!list.length){body.innerHTML='<tr><td colspan="8" class="market-loading">No cryptocurrencies match the selected filters.</td></tr>';return}
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
async function load(page=1){try{const r=await fetch(API+page+"&sparkline=true&sparkline_duration=7d&price_change_percentage=24h%2C7d%2C30d");if(!r.ok)throw new Error("API failed");const data=await r.json();if(page===1){coins=data;currentPage=1;hasMore=data.length===100}else{const ids=new Set(coins.map(c=>c.id));coins.push(...data.filter(c=>!ids.has(c.id)));currentPage=page;hasMore=data.length===100}status.textContent="Live CoinGecko data · "+coins.length+" coins";render();renderHeatmap();highlights();updateBreadth();if(page===1)loadGlobal()}catch(e){if(page===1)body.innerHTML='<tr><td colspan="8" class="market-loading">Market data could not be loaded. Try again.</td></tr>';status.textContent="Data unavailable"}}
search.addEventListener("input",()=>{visible=50;render()});favoritesOnly.addEventListener("change",()=>{visible=50;render()});liquidity.addEventListener("change",()=>{visible=50;render()});category.addEventListener("change",()=>{visible=50;render()});changePeriod.addEventListener("change",()=>{visible=50;render()});changeDirection.addEventListener("change",()=>{visible=50;render()});sort.addEventListener("change",render);more.addEventListener("click",async()=>{if(loadingMore||!hasMore)return;loadingMore=true;more.textContent="Loading...";await load(currentPage+1);loadingMore=false;more.textContent="Load more"});document.querySelectorAll(".global-range").forEach(btn=>btn.addEventListener("click",()=>{
 document.querySelectorAll(".global-range").forEach(b=>b.classList.remove("active"));
 btn.classList.add("active");loadGlobalChart(Number(btn.dataset.days));
}));
window.addEventListener("resize",drawGlobalChart);
load();loadGlobal();loadGlobalChart(1);setInterval(load,60000);setInterval(loadGlobal,60000);