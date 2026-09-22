const AUTH_USER_KEY="gugee_current_user";
const AUTH_ACCOUNTS_KEY="gugee_accounts";

async function hashPassword(password){
  const data=new TextEncoder().encode(password);
  const hash=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function getAccounts(){return JSON.parse(localStorage.getItem(AUTH_ACCOUNTS_KEY)||"[]")}
function getCurrentUser(){return JSON.parse(localStorage.getItem(AUTH_USER_KEY)||"null")}
function setCurrentUser(user){localStorage.setItem(AUTH_USER_KEY,JSON.stringify(user))}
function logout(){localStorage.removeItem(AUTH_USER_KEY);window.location.href="login.html"}
function emailKey(email){return String(email||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,"_")}
window.gugeeAuth={getCurrentUser,emailKey,logout};

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
  if(getCurrentUser())window.location.href="./";
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const email=form.email.value.trim().toLowerCase();
    const password=form.password.value;
    if(!email||!password)return setAuthMessage("Enter your email and password.");
    const account=getAccounts().find(a=>a.email===email);
    if(!account)return setAuthMessage("No account found with this email.");
    const passwordHash=await hashPassword(password);
    if(passwordHash!==account.passwordHash)return setAuthMessage("Incorrect email or password.");
    setCurrentUser({name:account.name,email:account.email});
    window.location.href="./";
  });
}

async function initRegister(){
  const form=document.getElementById("registerForm");
  if(!form)return;
  if(getCurrentUser())window.location.href="./";
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
    const accounts=getAccounts();
    if(accounts.some(a=>a.email===email))return setAuthMessage("An account with this email already exists.");
    const account={name,email,passwordHash:await hashPassword(password),createdAt:new Date().toISOString()};
    accounts.push(account);
    localStorage.setItem(AUTH_ACCOUNTS_KEY,JSON.stringify(accounts));
    setCurrentUser({name,email});
    window.location.href="./";
  });
}

document.addEventListener("DOMContentLoaded",()=>{
  renderAuthNav();
  initLogin();
  initRegister();
});
