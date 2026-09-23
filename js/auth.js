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

function renderAuthNav(){
  const button=document.querySelector(".login-button");
  if(!button)return;
  const user=getCurrentUser();
  if(!user){
    button.textContent="Log in";
    button.href="login.html";
    return;
  }
  button.textContent=user.name||user.email.split("@")[0];
  button.href="javascript:void(0)";
  button.classList.add("user-button");
  button.addEventListener("click",logout);
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
  if(current){window.location.href="account.html";return;}
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const email=form.email.value.trim().toLowerCase();
    const password=form.password.value;
    if(!email||!password)return setAuthMessage("Enter your email and password.");
    try{
      const data=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});
      setCurrentUser(data.user);
      window.location.href="account.html";
    }catch(error){setAuthMessage(error.message);}
  });
}
async function initRegister(){
  const form=document.getElementById("registerForm");
  if(!form)return;
  const current=await refreshCurrentUser();
  if(current){window.location.href="account.html";return;}
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const name=form.name.value.trim();
    const email=form.email.value.trim().toLowerCase();
    const password=form.password.value;
    const confirm=form.confirmPassword.value;
    if(name.length<2)return setAuthMessage("Name must contain at least 2 characters.");
    if(!email)return setAuthMessage("Enter a valid email address.");
    if(password.length<8)return setAuthMessage("Password must be at least 8 characters.");
    if(password!==confirm)return setAuthMessage("Passwords do not match.");
    try{
      const data=await api("/api/auth/register",{method:"POST",body:JSON.stringify({name,email,password})});
      setCurrentUser(data.user);
      window.location.href="account.html";
    }catch(error){setAuthMessage(error.message);}
  });
}
document.addEventListener("DOMContentLoaded",async()=>{
  await refreshCurrentUser();
  renderAuthNav();
  initLogin();
  initRegister();
});
