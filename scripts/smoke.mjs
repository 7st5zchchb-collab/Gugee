// Run with: GUGEE_BASE_URL=https://gugee.onrender.com npm run smoke
const base=(process.env.GUGEE_BASE_URL||"https://gugee.onrender.com").replace(/\/$/,"");
const checks=[
  {path:"/",status:200,validate:async r=>(await r.text()).includes("Gugee"),description:"Homepage"},
  {path:"/health",status:200,validate:async r=>(await r.json()).ok===true,description:"Node server"},
  {path:"/api/auth/me",status:401,description:"Protected account"},
  {path:"/api/wallet",status:401,description:"Protected wallet"},
  {path:"/api/referrals",status:401,description:"Protected referrals"},
  {path:"/api/coingecko/top1000",status:200,validate:async r=>{const data=await r.json();return Array.isArray(data.coins)&&data.coins.length>=900},description:"Live crypto directory"}
];
let failures=0;
for(const check of checks){
  try{
    const response=await fetch(base+check.path,{signal:AbortSignal.timeout(20000)});
    const valid=response.status===check.status&&(!check.validate||await check.validate(response));
    console.log((valid?"PASS":"FAIL")+" "+check.description+" "+check.path+" (HTTP "+response.status+")");
    if(!valid)failures++;
  }catch(error){failures++;console.log("FAIL "+check.description+" "+check.path+" ("+error.message+")")}
}
process.exitCode=failures?1:0;
