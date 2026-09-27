// Run with: GUGEE_BASE_URL=https://gugee.onrender.com npm run smoke
const base=(process.env.GUGEE_BASE_URL||"https://gugee.onrender.com").replace(/\/$/,"");
const apiBase=(process.env.GUGEE_API_BASE_URL||"https://gugees.onrender.com").replace(/\/$/,"");
const checks=[
  {path:"/",status:200,validate:async r=>(await r.text()).includes("Gugee"),description:"Homepage"},
  {path:"/health",status:200,validate:async r=>(await r.json()).ok===true,description:"Node server"},
  {path:"/api/auth/me",status:401,description:"Protected account"},
  {path:"/api/wallet",status:401,description:"Protected wallet"},
  {path:"/api/referrals",status:401,description:"Protected referrals"},
  {path:"/api/tournaments",status:200,validate:async r=>Array.isArray((await r.json()).tournaments),description:"Tournament directory"},
  {path:"/api/giveaways",status:200,validate:async r=>Array.isArray((await r.json()).giveaways),description:"Giveaway directory"},
  {path:"/api/coingecko/top1000",status:200,validate:async r=>{const data=await r.json();return Array.isArray(data.coins)&&data.coins.length>=900},description:"Live crypto directory"}
];
let failures=0;
for(const check of checks){
  try{
    const response=await fetch((check.path==="/"?base:apiBase)+check.path,{signal:AbortSignal.timeout(20000)});
    const valid=response.status===check.status&&(!check.validate||await check.validate(response));
    console.log((valid?"PASS":"FAIL")+" "+check.description+" "+check.path+" (HTTP "+response.status+")");
    if(!valid)failures++;
  }catch(error){failures++;console.log("FAIL "+check.description+" "+check.path+" ("+error.message+")")}
}
try{
  const features=await fetch(apiBase+"/api/features",{signal:AbortSignal.timeout(20000)});
  const available=features.ok&&(await features.json()).transactionsEnabled===false;
  const blocked=await fetch(apiBase+"/api/stripe/create-checkout-session",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(20000)});
  const valid=available&&blocked.status===503;
  console.log((valid?"PASS":"FAIL")+" Monetary actions paused (HTTP "+blocked.status+")");
  if(!valid)failures++;
}catch(error){failures++;console.log("FAIL Monetary actions paused ("+error.message+")")}
try{
  const r=await fetch(apiBase+"/api/auth/logout",{method:"POST",headers:{Origin:"https://untrusted.example"},signal:AbortSignal.timeout(20000)});
  const valid=r.status===403;console.log((valid?"PASS":"FAIL")+" Cross-origin mutation blocked (HTTP "+r.status+")");
  if(!valid)failures++;
}catch(error){failures++;console.log("FAIL Cross-origin mutation blocked ("+error.message+")")}
process.exitCode=failures?1:0;
