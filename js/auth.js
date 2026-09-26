const AUTH_USER_KEY="gugee_current_user";

function getCurrentUser(){return JSON.parse(localStorage.getItem(AUTH_USER_KEY)||"null")}
function setCurrentUser(user){if(user)localStorage.setItem(AUTH_USER_KEY,JSON.stringify(user));else localStorage.removeItem(AUTH_USER_KEY)}
async function api(path,options={}){
  const response=await fetch(path,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Request failed");
  return data;
}
async function refreshCurrentUser(){
  try{
    const data=await api("/api/auth/me");
    setCurrentUser(data.user);
    return data.user;
  }catch{
    setCurrentUser(null);
    return null;
  }
}
async function logout(){
  try{await api("/api/auth/logout",{method:"POST"});}catch{}
  setCurrentUser(null);
  window.location.href="login.html";
}
window.gugeeAuth={getCurrentUser,setCurrentUser,refreshCurrentUser,logout,api};

function initGlobalNavigation(){
  const header=document.querySelector(".site-header");
  if(!header)return;

  let nav=header.querySelector(".nav");
  if(!nav){
    nav=document.createElement("nav");
    nav.className="nav";
    nav.id="siteNav";
    const login=header.querySelector(".login-button");
    header.insertBefore(nav,login||null);
  }

  nav.innerHTML='<a data-nav="markets" href="markets.html">Markets</a><a data-nav="crypto" href="cryptos.html">Crypto</a><a data-nav="analysis" href="analysis.html">Analysis</a><a data-nav="exchanges" href="exchanges.html">Exchanges</a><details class="nav-menu"><summary>Community</summary><div class="nav-menu-panel"><a href="tournaments.html">Tournaments</a><a href="giveaways.html">Giveaways</a><a href="referrals.html">Referrals</a></div></details>';
  const current=(window.location.pathname.split("/").pop()||"index.html").toLowerCase();
  nav.querySelectorAll("[data-nav]").forEach(link=>{
    const key=link.dataset.nav;
    const active=(key==="crypto" && (current==="cryptos.html"||current==="crypto.html")) || (key!=="crypto" && current===key+".html");
    link.classList.toggle("active",active);
  });

  let toggle=header.querySelector(".mobile-nav-toggle");
  if(!toggle){
    toggle=document.createElement("button");
    toggle.className="mobile-nav-toggle";
    toggle.id="mobileNavToggle";
    toggle.type="button";
    toggle.setAttribute("aria-label","Open navigation");
    toggle.setAttribute("aria-expanded","false");
    toggle.innerHTML="<span></span><span></span><span></span>";
    header.insertBefore(toggle,nav);
  }

  if(!toggle.dataset.bound){
    toggle.dataset.bound="1";
    toggle.onclick=()=>{
      const open=nav.classList.toggle("mobile-open");
      toggle.classList.toggle("active",open);
      toggle.setAttribute("aria-expanded",String(open));
    };
  }

  nav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{
    nav.classList.remove("mobile-open");
    toggle.classList.remove("active");
    toggle.setAttribute("aria-expanded","false");
  }));
}
function renderAuthNav(){
  const button=document.querySelector(".login-button");
  if(!button)return;
  const user=getCurrentUser();
  if(!user){
    button.textContent="Log in";
    button.href="login.html";
    return;
  }
  const displayName=user.username||"user";
  const avatarLetter=(displayName.trim()[0]||"U").toUpperCase();
  button.innerHTML='<span class="user-avatar">'+avatarLetter+'</span><span class="user-handle">@'+displayName.replace(/\s+/g,"").replace(/[^a-zA-Z0-9_.-]/g,"")+"</span>";
  button.href="account.html";
  button.classList.add("user-button");
  button.onclick=null;
}
function setAuthMessage(message,type="error"){
  const el=document.getElementById("authMessage");
  if(!el)return;
  el.textContent=message;
  el.className="auth-message "+type;
}
async function initLogin(){
  const form=document.getElementById("loginForm");
  if(!form)return;
  const current=await refreshCurrentUser();
  if(current){window.location.href="index.html";return;}
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const submit=form.querySelector(".auth-submit"),label=submit?.querySelector("span");if(submit){submit.disabled=true;if(label)label.textContent="Signing in…"}
    const email=form.email.value.trim().toLowerCase();
    const password=form.password.value;
    if(!email||!password){if(submit){submit.disabled=false;if(label)label.textContent="Log in"}return setAuthMessage("Enter your email and password.");}
    try{
      const data=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
      setCurrentUser(data.user);
      window.location.href="index.html";
    }catch(error){setAuthMessage(error.message);if(submit){submit.disabled=false;if(label)label.textContent="Log in"}}
  });
}
async function initRegister(){
  const form=document.getElementById("registerForm");
  if(!form)return;
  const current=await refreshCurrentUser();
  if(current){window.location.href="account.html";return;}
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const submit=form.querySelector(".auth-submit"),label=submit?.querySelector("span");
    const username=form.username.value.trim().toLowerCase();
    const email=form.email.value.trim().toLowerCase();
    const password=form.password.value;
    const confirm=form.confirmPassword.value;
    if(!/^[a-z0-9_][a-z0-9_.-]{2,19}$/.test(username))return setAuthMessage("Username must be 3-20 characters.");
    if(!email)return setAuthMessage("Enter a valid email address.");
    if(password.length<8)return setAuthMessage("Password must be at least 8 characters.");
    if(password!==confirm)return setAuthMessage("Passwords do not match.");
    if(submit){submit.disabled=true;if(label)label.textContent="Creating account…"}
    try{
      const data=await api("/api/auth/register",{method:"POST",body:JSON.stringify({username,email,password})});
      setCurrentUser(data.user);
      const referralCode=new URLSearchParams(window.location.search).get("ref");
      if(referralCode){try{await api("/api/referrals/claim",{method:"POST",body:JSON.stringify({code:referralCode})});}catch{}}
      window.location.href="index.html";
    }catch(error){setAuthMessage(error.message);if(submit){submit.disabled=false;if(label)label.textContent="Create account"}}
  });
}
function initNotificationsBell(){
  const header=document.querySelector(".site-header");
  if(!header||document.getElementById("notificationBell"))return;
  const wrap=document.createElement("div"); wrap.className="notification-bell-wrap";
  wrap.innerHTML='<button id="notificationBell" class="notification-bell" type="button" aria-label="Notifications" aria-expanded="false">🔔<span id="notificationCount" class="notification-count" hidden>0</span></button><div id="notificationDropdown" class="notification-dropdown" hidden><div class="notification-dropdown-head"><strong>Notifications</strong><button id="markNotificationsRead" type="button">Mark all read</button></div><div id="notificationItems" class="notification-items"><span class="notification-empty">Loading...</span></div></div>';
  const login=header.querySelector(".login-button"); header.insertBefore(wrap,login||null);
  const bell=wrap.querySelector("#notificationBell"), dropdown=wrap.querySelector("#notificationDropdown");
  bell.onclick=async()=>{const open=dropdown.hidden;dropdown.hidden=!open;bell.setAttribute("aria-expanded",String(open));if(open)await loadNotificationsBell()};
  wrap.querySelector("#markNotificationsRead").onclick=async()=>{const ids=[...wrap.querySelectorAll("[data-notification-id]")].map(x=>x.dataset.notificationId);await Promise.all(ids.map(id=>api("/api/notifications/"+id+"/read",{method:"POST"}).catch(()=>{})));await loadNotificationsBell()};
  document.addEventListener("click",e=>{if(!wrap.contains(e.target)){dropdown.hidden=true;bell.setAttribute("aria-expanded","false")}});
  loadNotificationsBell();
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
async function loadNotificationsBell(){
  const box=document.getElementById("notificationItems"),count=document.getElementById("notificationCount");
  if(!box||!count)return;
  try{
    const data=await api("/api/notifications"),notes=data.notifications||[],unread=notes.filter(n=>!n.read_at);
    count.textContent=unread.length>99?"99+":String(unread.length);count.hidden=!unread.length;
    box.innerHTML=notes.slice(0,8).map(n=>'<button class="notification-item '+(n.read_at?'':'unread')+'" data-notification-id="'+escapeHtml(n.id)+'" type="button"><b>'+escapeHtml(n.title)+'</b><span>'+escapeHtml(n.message)+'</span><small>'+escapeHtml(new Date(n.created_at).toLocaleString())+'</small></button>').join("")||'<span class="notification-empty">No notifications yet.</span>';
    box.querySelectorAll(".notification-item").forEach(item=>item.onclick=async()=>{await api("/api/notifications/"+encodeURIComponent(item.dataset.notificationId)+"/read",{method:"POST"}).catch(()=>{});await loadNotificationsBell()});
  }catch(e){box.innerHTML='<span class="notification-empty">Notifications unavailable.</span>'}
}
function initPasswordToggles(){
  document.querySelectorAll("[data-password-toggle]").forEach(button=>{
    button.onclick=()=>{
      const input=document.getElementById(button.dataset.passwordToggle);if(!input)return;
      const showing=input.type==="text";input.type=showing?"password":"text";button.textContent=showing?"Show":"Hide";
    };
  });
}
document.addEventListener("DOMContentLoaded",async()=>{
  await refreshCurrentUser();initGlobalNavigation();renderAuthNav();initPasswordToggles();initLogin();initRegister();if(getCurrentUser())initNotificationsBell();
});
