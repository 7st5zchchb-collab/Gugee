const crypto=require("crypto");

function initCommunity(app,pool,auth){
  const optionalAuth=async(req,res,next)=>{
    try{
      const header=String(req.headers.cookie||"");
      const raw=header.split(";").map(x=>x.trim()).find(x=>x.startsWith("gugee_token="));
      if(raw){
        const jwt=require("jsonwebtoken");
        const token=decodeURIComponent(raw.slice("gugee_token=".length));
        const payload=jwt.verify(token,process.env.JWT_SECRET);
        const row=(await pool.query("SELECT id,name,email,created_at,is_admin FROM users WHERE id=$1",[payload.sub])).rows[0];
        if(row)req.user=row;
      }
    }catch(e){}
    next();
  };
  const codeFor=userId=>"GUG-"+crypto.createHash("sha256").update("gugee-referral:"+userId).digest("hex").slice(0,8).toUpperCase();
  const rewardReferralIfQualified=async(client,userId)=>{const r=(await client.query("SELECT * FROM referrals WHERE referred_id=$1 AND status='registered' FOR UPDATE",[userId])).rows[0];if(!r)return;const reward=1;await client.query("UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2",[reward,r.referrer_id]);await client.query("INSERT INTO referral_rewards(referral_id,user_id,amount_usdt,reason) VALUES($1,$2,$3,$4)",[r.id,r.referrer_id,reward,"Qualified referral: paid tournament entry"]);await client.query("UPDATE referrals SET status='rewarded',reward_usdt=$1,qualified_at=NOW() WHERE id=$2",[reward,r.id]);};

  return pool.query(`
    CREATE TABLE IF NOT EXISTS referral_codes(
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS referrals(
      id BIGSERIAL PRIMARY KEY,
      referrer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','qualified','rewarded')),
      reward_usdt NUMERIC(30,10) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      qualified_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS referral_rewards(
      id BIGSERIAL PRIMARY KEY,
      referral_id BIGINT REFERENCES referrals(id) ON DELETE SET NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_usdt NUMERIC(30,10) NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tournaments(
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      entry_fee_usdt NUMERIC(30,10) NOT NULL DEFAULT 0 CHECK(entry_fee_usdt>=0),
      prize_pool_usdt NUMERIC(30,10) NOT NULL DEFAULT 0 CHECK(prize_pool_usdt>=0),
      max_players INTEGER NOT NULL DEFAULT 10000 CHECK(max_players>0),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming','live','finished','cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tournament_snapshots(
      id BIGSERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      equity_usdt NUMERIC(30,10) NOT NULL DEFAULT 0,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tournament_snapshots_lookup ON tournament_snapshots(tournament_id,user_id,captured_at DESC);
    CREATE TABLE IF NOT EXISTS tournament_entries(
      id BIGSERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_fee_usdt NUMERIC(30,10) NOT NULL DEFAULT 0,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      score NUMERIC(30,12) NOT NULL DEFAULT 0,
      rank INTEGER,
      UNIQUE(tournament_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS giveaways(
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      prize_usdt NUMERIC(30,10) NOT NULL DEFAULT 0 CHECK(prize_usdt>=0),
      max_entries INTEGER NOT NULL DEFAULT 10000 CHECK(max_entries>0),
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming','live','finished','cancelled')),
      winner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS giveaway_entries(
      id BIGSERIAL PRIMARY KEY,
      giveaway_id BIGINT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(giveaway_id,user_id)
    );
  `).then(async()=>{
    const count=(await pool.query("SELECT COUNT(*)::int AS n FROM tournaments")).rows[0].n;
    if(!count){
      await pool.query(`INSERT INTO tournaments(name,description,entry_fee_usdt,prize_pool_usdt,max_players,starts_at,ends_at,status) VALUES
      ('Starter Arena','Practice your trading strategy in a beginner-friendly competition.',5,100,100,NOW(),NOW()+INTERVAL '7 days','live'),
      ('Pro Circuit','A larger skill-based trading leaderboard for experienced participants.',25,500,250,NOW()+INTERVAL '1 day',NOW()+INTERVAL '14 days','upcoming'),
      ('Elite Championship','High-stakes competition with a larger published prize pool.',100,2500,100,NOW()+INTERVAL '3 days',NOW()+INTERVAL '17 days','upcoming')`);
    }
    const g=(await pool.query("SELECT COUNT(*)::int AS n FROM giveaways")).rows[0].n;
    if(!g)await pool.query(`INSERT INTO giveaways(name,description,prize_usdt,max_entries,starts_at,ends_at,status) VALUES
      ('Gugee Launch Giveaway','Free community giveaway for verified Gugee members.',5,5000,NOW(),NOW()+INTERVAL '7 days','live'),
      ('Weekly 25 USDT Draw','A weekly community reward event.',25,10000,NOW()+INTERVAL '1 day',NOW()+INTERVAL '8 days','upcoming')`);
  }).catch(e=>console.error("Community DB init:",e.message));

  app.get("/api/tournaments",async(req,res)=>{
    try{
      await pool.query("UPDATE tournaments SET status=CASE WHEN status='upcoming' AND starts_at<=NOW() THEN 'live' ELSE status END");
      const {rows}=await pool.query(`SELECT t.*,COUNT(e.id)::int AS entry_count FROM tournaments t LEFT JOIN tournament_entries e ON e.tournament_id=t.id WHERE t.status IN ('upcoming','live') GROUP BY t.id ORDER BY t.starts_at`);
      res.json({tournaments:rows});
    }catch(e){console.error(e);res.status(500).json({error:"Could not load tournaments"});}
  });

  app.post("/api/tournaments/:id/join",auth,async(req,res)=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const t=(await client.query("SELECT * FROM tournaments WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
      if(!t||!["upcoming","live"].includes(t.status))return rollback(client,res,400,"Tournament is not open.");
      if(new Date(t.ends_at)<=new Date())return rollback(client,res,400,"Tournament has ended.");
      const n=Number((await client.query("SELECT COUNT(*)::int AS n FROM tournament_entries WHERE tournament_id=$1",[t.id])).rows[0].n);
      if(n>=t.max_players)return rollback(client,res,400,"Tournament is full.");
      const exists=await client.query("SELECT 1 FROM tournament_entries WHERE tournament_id=$1 AND user_id=$2",[t.id,req.user.id]);
      if(exists.rowCount)return rollback(client,res,409,"You already joined this tournament.");
      const fee=Number(t.entry_fee_usdt);\n      if(!Number.isFinite(fee)||fee<0)return rollback(client,res,400,"Invalid tournament entry fee.");
      await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[req.user.id]);
      const wallet=await client.query("UPDATE wallets SET usdt=usdt-$1,updated_at=NOW() WHERE user_id=$2 AND usdt>=$1 RETURNING usdt",[fee,req.user.id]);
      if(!wallet.rowCount)return rollback(client,res,400,"Insufficient USDT balance for the entry fee.");
      await client.query("INSERT INTO tournament_entries(tournament_id,user_id,entry_fee_usdt) VALUES($1,$2,$3)",[t.id,req.user.id,fee]);
      if(fee>0)await client.query("UPDATE tournaments SET prize_pool_usdt=prize_pool_usdt+$1 WHERE id=$2",[fee,t.id]);if(fee>=5)await rewardReferralIfQualified(client,req.user.id);
      await client.query("COMMIT");
      res.json({ok:true,message:"Tournament entry confirmed.",usdt:Number(wallet.rows[0].usdt)});
    }catch(e){await client.query("ROLLBACK");if(e.code==="23505")return res.status(409).json({error:"You already joined this tournament."});console.error(e);res.status(500).json({error:"Could not join tournament"});}
    finally{client.release();}
  });

  app.get("/api/tournaments/:id/leaderboard",async(req,res)=>{
    try{
      const {rows}=await pool.query(`SELECT e.user_id,u.name,e.score,e.rank,e.joined_at
        FROM tournament_entries e JOIN users u ON u.id=e.user_id
        WHERE e.tournament_id=$1
        ORDER BY e.score DESC,e.joined_at ASC
        LIMIT 100`,[req.params.id]);
      res.json({leaderboard:rows.map((r,i)=>({...r,rank:r.rank||i+1,score:Number(r.score)}))});
    }catch(e){console.error(e);res.status(500).json({error:"Could not load leaderboard"});}
  });

  app.post("/api/tournaments/:id/sync-score",auth,async(req,res)=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const t=(await client.query("SELECT * FROM tournaments WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
      if(!t||!["live","upcoming"].includes(t.status))return rollback(client,res,400,"Tournament is not active.");
      const entry=(await client.query("SELECT * FROM tournament_entries WHERE tournament_id=$1 AND user_id=$2",[t.id,req.user.id])).rows[0];
      if(!entry)return rollback(client,res,403,"Join the tournament first.");
      await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[req.user.id]);
      const wallet=(await client.query("SELECT usdt FROM wallets WHERE user_id=$1",[req.user.id])).rows[0];
      const equity=Number(wallet.usdt||0);
      const first=(await client.query("SELECT equity_usdt FROM tournament_snapshots WHERE tournament_id=$1 AND user_id=$2 ORDER BY captured_at ASC LIMIT 1",[t.id,req.user.id])).rows[0];
      const baseline=first?Number(first.equity_usdt):equity;
      const score=baseline>0?((equity-baseline)/baseline)*100:0;
      await client.query("INSERT INTO tournament_snapshots(tournament_id,user_id,equity_usdt) VALUES($1,$2,$3)",[t.id,req.user.id,equity]);
      await client.query("UPDATE tournament_entries SET score=$1 WHERE id=$2",[score,entry.id]);
      await client.query("COMMIT");
      res.json({ok:true,equity_usdt:equity,score:Number(score.toFixed(6))});
    }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not sync tournament score"});}
    finally{client.release();}
  });

  app.get("/api/tournaments/:id/live-leaderboard",async(req,res)=>{
    try{
      const {rows}=await pool.query(`SELECT e.user_id,u.name,e.score,e.joined_at
        FROM tournament_entries e JOIN users u ON u.id=e.user_id
        WHERE e.tournament_id=$1 ORDER BY e.score DESC,e.joined_at ASC LIMIT 100`,[req.params.id]);
      res.json({leaderboard:rows.map((r,i)=>({...r,rank:i+1,score:Number(r.score)}))});
    }catch(e){res.status(500).json({error:"Could not load live leaderboard"});}
  });

  app.get("/api/tournaments/my",auth,async(req,res)=>{
    try{
      const {rows}=await pool.query("SELECT t.name,t.entry_fee_usdt,t.starts_at,t.ends_at,t.status,e.score,e.rank,e.joined_at FROM tournament_entries e JOIN tournaments t ON t.id=e.tournament_id WHERE e.user_id=$1 ORDER BY e.joined_at DESC",[req.user.id]);
      res.json({entries:rows});
    }catch(e){console.error(e);res.status(500).json({error:"Could not load tournament entries"});}
  });

  app.get("/api/giveaways",optionalAuth,async(req,res)=>{
    try{
      const uid=req.user?req.user.id:null;
      const {rows}=await pool.query(`SELECT g.*,COUNT(e.id)::int AS entry_count,CASE WHEN $1::bigint IS NULL THEN false ELSE EXISTS(SELECT 1 FROM giveaway_entries x WHERE x.giveaway_id=g.id AND x.user_id=$1) END AS joined FROM giveaways g LEFT JOIN giveaway_entries e ON e.giveaway_id=g.id WHERE g.status IN ('upcoming','live') GROUP BY g.id ORDER BY g.starts_at`,[uid]);
      res.json({giveaways:rows});
    }catch(e){console.error(e);res.status(500).json({error:"Could not load giveaways"});}
  });

  app.post("/api/giveaways/:id/enter",auth,async(req,res)=>{
    try{
      const g=(await pool.query("SELECT * FROM giveaways WHERE id=$1",[req.params.id])).rows[0];
      if(!g||!["upcoming","live"].includes(g.status))return res.status(400).json({error:"Giveaway is not open."});
      if(new Date(g.ends_at)<=new Date())return res.status(400).json({error:"Giveaway has ended."});
      const n=Number((await pool.query("SELECT COUNT(*)::int AS n FROM giveaway_entries WHERE giveaway_id=$1",[g.id])).rows[0].n);
      if(n>=g.max_entries)return res.status(400).json({error:"Giveaway is full."});
      await pool.query("INSERT INTO giveaway_entries(giveaway_id,user_id) VALUES($1,$2)",[g.id,req.user.id]);
      res.json({ok:true,message:"Giveaway entry confirmed."});
    }catch(e){if(e.code==="23505")return res.status(409).json({error:"You already entered this giveaway."});console.error(e);res.status(500).json({error:"Could not enter giveaway"});}
  });

  app.get("/api/referrals",auth,async(req,res)=>{
    try{
      const code=codeFor(req.user.id);
      await pool.query("INSERT INTO referral_codes(user_id,code) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING",[req.user.id,code]);
      const {rows}=await pool.query(`SELECT r.id,u.name,r.status,r.reward_usdt,r.created_at FROM referrals r JOIN users u ON u.id=r.referred_id WHERE r.referrer_id=$1 ORDER BY r.created_at DESC`,[req.user.id]);
      const stats=(await pool.query("SELECT COUNT(*)::int AS invited,COUNT(*) FILTER(WHERE status IN ('qualified','rewarded'))::int AS qualified,COALESCE(SUM(reward_usdt),0) AS rewards_usdt FROM referrals WHERE referrer_id=$1",[req.user.id])).rows[0];
      const base=(process.env.FRONTEND_URL||"").replace(/\/$/,"");
      res.json({referral:{code,link:base+"/register.html?ref="+encodeURIComponent(code)},stats:{...stats,rewards_usdt:Number(stats.rewards_usdt)},referrals:rows});
    }catch(e){console.error(e);res.status(500).json({error:"Could not load referrals"});}
  });

  app.post("/api/referrals/claim",auth,async(req,res)=>{
    const code=String(req.body.code||"").trim().toUpperCase();
    if(!/^GUG-[A-F0-9]{8}$/.test(code))return res.status(400).json({error:"Invalid referral code."});
    const owner=(await pool.query("SELECT user_id FROM referral_codes WHERE code=$1",[code])).rows[0];
    if(!owner)return res.status(404).json({error:"Referral code not found."});
    if(Number(owner.user_id)===Number(req.user.id))return res.status(400).json({error:"You cannot refer yourself."});
    try{
      await pool.query("INSERT INTO referrals(referrer_id,referred_id,code) VALUES($1,$2,$3)",[owner.user_id,req.user.id,code]);
      res.json({ok:true,message:"Referral linked to your account."});
    }catch(e){if(e.code==="23505")return res.status(409).json({error:"This account already has a referral."});console.error(e);res.status(500).json({error:"Could not claim referral"});}
  });

  app.post("/api/admin/tournaments/:id/finish",adminAuth(pool),async(req,res)=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const t=(await client.query("SELECT * FROM tournaments WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
      if(!t)return rollback(client,res,404,"Tournament not found.");
      if(t.status==="finished")return rollback(client,res,400,"Tournament is already finished.");
      const entries=(await client.query("SELECT id FROM tournament_entries WHERE tournament_id=$1 ORDER BY score DESC,joined_at ASC",[t.id])).rows;
      for(let i=0;i<entries.length;i++)await client.query("UPDATE tournament_entries SET rank=$1 WHERE id=$2",[i+1,entries[i].id]);
      const payouts=[0.5,0.3,0.2];for(let i=0;i<Math.min(3,entries.length);i++){const amount=Number(t.prize_pool_usdt)*payouts[i];if(amount<=0)continue;const uid=(await client.query("SELECT user_id FROM tournament_entries WHERE id=$1",[entries[i].id])).rows[0].user_id;await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[uid]);await client.query("UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2",[amount,uid]);}await client.query("UPDATE tournaments SET status='finished' WHERE id=$1",[t.id]);
      await client.query("COMMIT");
      res.json({ok:true,ranked:entries.length});
    }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not finish tournament"});}
    finally{client.release();}
  });

  app.post("/api/admin/giveaways/:id/draw",adminAuth(pool),async(req,res)=>{
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const g=(await client.query("SELECT * FROM giveaways WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
      if(!g)return rollback(client,res,404,"Giveaway not found.");
      if(g.winner_user_id)return rollback(client,res,400,"A winner has already been selected.");
      const entries=(await client.query("SELECT user_id FROM giveaway_entries WHERE giveaway_id=$1 ORDER BY id",[g.id])).rows;
      if(!entries.length)return rollback(client,res,400,"No giveaway entries yet.");
      const winner=entries[crypto.randomInt(entries.length)].user_id;
      await client.query("UPDATE giveaways SET winner_user_id=$1,status='finished' WHERE id=$2",[winner,g.id]);\n      await client.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[winner]);await client.query("UPDATE wallets SET usdt=usdt+$1,updated_at=NOW() WHERE user_id=$2",[Number(g.prize_usdt),winner]);
      await client.query("COMMIT");
      const user=(await pool.query("SELECT name,email FROM users WHERE id=$1",[winner])).rows[0];
      res.json({ok:true,winner:user});
    }catch(e){await client.query("ROLLBACK");console.error(e);res.status(500).json({error:"Could not draw giveaway winner"});}
    finally{client.release();}
  });

  app.get("/api/admin/community/overview",adminAuth(pool),async(req,res)=>{
    try{
      const tournaments=(await pool.query("SELECT t.*,COUNT(e.id)::int AS entry_count FROM tournaments t LEFT JOIN tournament_entries e ON e.tournament_id=t.id GROUP BY t.id ORDER BY t.created_at DESC")).rows;
      const giveaways=(await pool.query("SELECT g.*,COUNT(e.id)::int AS entry_count,u.name AS winner_name FROM giveaways g LEFT JOIN giveaway_entries e ON e.giveaway_id=g.id LEFT JOIN users u ON u.id=g.winner_user_id GROUP BY g.id,u.name ORDER BY g.created_at DESC")).rows;
      const referrals=(await pool.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='qualified')::int AS qualified,COALESCE(SUM(reward_usdt),0) AS rewards FROM referrals")).rows[0];
      res.json({tournaments,giveaways,referrals:{...referrals,rewards:Number(referrals.rewards)}});
    }catch(e){console.error(e);res.status(500).json({error:"Could not load admin data"});}
  });

  app.post("/api/admin/tournaments",adminAuth(pool),async(req,res)=>{
    try{
      const name=String(req.body.name||"").trim(),description=String(req.body.description||"").trim();
      const entry=Math.max(0,Number(req.body.entryFeeUsdt||0)),prize=Math.max(0,Number(req.body.prizePoolUsdt||0)),max=Math.max(1,parseInt(req.body.maxPlayers||1000,10));
      const starts=new Date(req.body.startsAt),ends=new Date(req.body.endsAt);
      if(!name||!Number.isFinite(entry)||!Number.isFinite(prize)||isNaN(starts)||isNaN(ends)||ends<=starts)return res.status(400).json({error:"Invalid tournament data."});
      const {rows}=await pool.query("INSERT INTO tournaments(name,description,entry_fee_usdt,prize_pool_usdt,max_players,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[name,description,entry,prize,max,starts,ends,starts<=new Date()?"live":"upcoming"]);
      res.status(201).json({tournament:rows[0]});
    }catch(e){console.error(e);res.status(500).json({error:"Could not create tournament"});}
  });

  app.patch("/api/admin/tournaments/:id",adminAuth(pool),async(req,res)=>{
    try{
      const fields=[],values=[]; let i=1;
      for(const [key,col] of [["name","name"],["description","description"],["entryFeeUsdt","entry_fee_usdt"],["prizePoolUsdt","prize_pool_usdt"],["maxPlayers","max_players"],["startsAt","starts_at"],["endsAt","ends_at"],["status","status"]]){
        if(req.body[key]!==undefined){fields.push(col+"=$"+i++);values.push(req.body[key]);}
      }
      if(!fields.length)return res.status(400).json({error:"No changes supplied."});
      values.push(req.params.id);
      const {rows}=await pool.query("UPDATE tournaments SET "+fields.join(",")+" WHERE id=$"+i+" RETURNING *",values);
      if(!rows[0])return res.status(404).json({error:"Tournament not found."});
      res.json({tournament:rows[0]});
    }catch(e){console.error(e);res.status(400).json({error:"Could not update tournament"});}
  });

  app.post("/api/admin/giveaways",adminAuth(pool),async(req,res)=>{
    try{
      const name=String(req.body.name||"").trim(),description=String(req.body.description||"").trim();
      const prize=Math.max(0,Number(req.body.prizeUsdt||0)),max=Math.max(1,parseInt(req.body.maxEntries||1000,10));
      const starts=new Date(req.body.startsAt),ends=new Date(req.body.endsAt);
      if(!name||!Number.isFinite(prize)||isNaN(starts)||isNaN(ends)||ends<=starts)return res.status(400).json({error:"Invalid giveaway data."});
      const {rows}=await pool.query("INSERT INTO giveaways(name,description,prize_usdt,max_entries,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[name,description,prize,max,starts,ends,starts<=new Date()?"live":"upcoming"]);
      res.status(201).json({giveaway:rows[0]});
    }catch(e){console.error(e);res.status(500).json({error:"Could not create giveaway"});}
  });

  app.patch("/api/admin/giveaways/:id",adminAuth(pool),async(req,res)=>{
    try{
      const fields=[],values=[]; let i=1;
      for(const [key,col] of [["name","name"],["description","description"],["prizeUsdt","prize_usdt"],["maxEntries","max_entries"],["startsAt","starts_at"],["endsAt","ends_at"],["status","status"]]){
        if(req.body[key]!==undefined){fields.push(col+"=$"+i++);values.push(req.body[key]);}
      }
      if(req.body.winnerUserId!==undefined){fields.push("winner_user_id=$"+i++);values.push(req.body.winnerUserId||null);}
      if(!fields.length)return res.status(400).json({error:"No changes supplied."});
      values.push(req.params.id);
      const {rows}=await pool.query("UPDATE giveaways SET "+fields.join(",")+" WHERE id=$"+i+" RETURNING *",values);
      if(!rows[0])return res.status(404).json({error:"Giveaway not found."});
      res.json({giveaway:rows[0]});
    }catch(e){console.error(e);res.status(400).json({error:"Could not update giveaway"});}
  });

}

function adminAuth(pool){
  return async(req,res,next)=>{
    if(!req.user)return res.status(401).json({error:"Authentication required."});
    try{
      const row=(await pool.query("SELECT is_admin FROM users WHERE id=$1",[req.user.id])).rows[0];
      if(!row?.is_admin)return res.status(403).json({error:"Admin access required."});
      next();
    }catch(e){console.error(e);res.status(500).json({error:"Could not verify admin access."});}
  };
}

module.exports={initCommunity};
