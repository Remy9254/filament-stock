// Filament Stock V2 - synchronisation Supabase (offline-first)
const CLOUD_URL='https://sykkkgzvyysagpucelik.supabase.co';
const CLOUD_KEY='sb_publishable_JCyGxQxzOA2yWp-ZKbPaMw_XDDh8b0q';
const SESSION_KEY='filament-stock-cloud-session';
let cloudBusy=false;

function cloudHeaders(token,extra={}){return {'apikey':CLOUD_KEY,'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...extra}}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function saveSession(s){if(!s)return localStorage.removeItem(SESSION_KEY);s.expires_at=Date.now()+(s.expires_in||3600)*1000;localStorage.setItem(SESSION_KEY,JSON.stringify(s))}
async function refreshSession(){let s=getSession();if(!s)return null;if(Date.now()<s.expires_at-60000)return s;if(!s.refresh_token){saveSession(null);return null}try{let r=await fetch(`${CLOUD_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'apikey':CLOUD_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});if(!r.ok)throw 0;s=await r.json();saveSession(s);return s}catch{saveSession(null);return null}}
function setCloudState(text,kind=''){let el=document.querySelector('#syncState');if(el){el.textContent='● '+text;el.className='sync '+kind}let x=document.querySelector('#cloudStatus');if(x)x.textContent=text}

async function authRequest(path,body){let r=await fetch(CLOUD_URL+path,{method:'POST',headers:{'apikey':CLOUD_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});let d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.msg||d.message||d.error_description||'Erreur de connexion');return d}
async function signIn(email,password){let d=await authRequest('/auth/v1/token?grant_type=password',{email,password});saveSession(d);await syncCloud(true);renderCloudPanel()}
async function signUp(email,password){let d=await authRequest('/auth/v1/signup',{email,password});if(d.access_token){saveSession(d);await syncCloud(true);renderCloudPanel();return 'Compte créé et connecté.'}return 'Compte créé. Ouvre le mail envoyé par Supabase pour confirmer ton adresse, puis connecte-toi ici.'}
async function signOut(){let s=getSession();if(s?.access_token)fetch(CLOUD_URL+'/auth/v1/logout',{method:'POST',headers:cloudHeaders(s.access_token)}).catch(()=>{});saveSession(null);setCloudState(navigator.onLine?'En ligne • cloud non connecté':'Hors connexion','offline');renderCloudPanel()}

function dbAll(store){return new Promise((res,rej)=>{let r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function dbPut(store,obj){return new Promise((res,rej)=>{let r=db.transaction(store,'readwrite').objectStore(store).put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function spoolToCloud(s){return {id:s.id,brand:s.brand||'',material:s.material||'',variant:s.variant||'',color_name:s.colorName||'',color:s.color||'#808080',initial_weight:+s.initial||1000,remaining_weight:+s.remaining||0,price:+s.price||0,opened:s.opened!==false,shelf_slot:s.slot??null,created_at:new Date(s.created||Date.now()).toISOString()}}
function spoolFromCloud(s){return {id:s.id,brand:s.brand,material:s.material,variant:s.variant||'',colorName:s.color_name||'',color:s.color||'#808080',initial:+s.initial_weight,remaining:+s.remaining_weight,price:+s.price,opened:s.opened,slot:s.shelf_slot,created:Date.parse(s.created_at),updated:Date.parse(s.updated_at)}}
function movementToCloud(m){return {id:m.id,spool_id:m.spoolId||null,spool_label:m.label||'',grams:+m.grams||-0.001,cost:+m.cost||0,note:m.note||'',created_at:m.date||new Date().toISOString()}}
function movementFromCloud(m){return {id:m.id,spoolId:m.spool_id,label:m.spool_label||'',grams:+m.grams,cost:+m.cost,note:m.note||'',date:m.created_at,updated:Date.parse(m.updated_at)}}
async function restGet(table,token){let r=await fetch(`${CLOUD_URL}/rest/v1/${table}?select=*`,{headers:cloudHeaders(token)});if(!r.ok)throw new Error('Lecture cloud impossible');return r.json()}
async function restUpsert(table,obj,token){let r=await fetch(`${CLOUD_URL}/rest/v1/${table}?on_conflict=id`,{method:'POST',headers:cloudHeaders(token,{'Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(obj)});if(!r.ok){let t=await r.text();throw new Error(t||'Écriture cloud impossible')}}

async function mergeStore(store,table,toCloud,fromCloud,token){let local=await dbAll(store),remote=await restGet(table,token),lm=new Map(local.map(x=>[x.id,x])),rm=new Map(remote.map(x=>[x.id,x]));
 for(let l of local){let r=rm.get(l.id);if(!r){await restUpsert(table,toCloud(l),token);continue}let lt=+(l.updated||l.created||0),rt=Date.parse(r.updated_at);if(lt>rt+1000){await restUpsert(table,toCloud(l),token)}else if(rt>lt){await dbPut(store,fromCloud(r))}}
 for(let r of remote)if(!lm.has(r.id))await dbPut(store,fromCloud(r));
}
async function syncCloud(force=false){if(cloudBusy||!navigator.onLine)return;let s=await refreshSession();if(!s){setCloudState('En ligne • cloud non connecté','');return}cloudBusy=true;setCloudState('Synchronisation…','');try{await mergeStore('spools','spools',spoolToCloud,spoolFromCloud,s.access_token);await mergeStore('movements','movements',movementToCloud,movementFromCloud,s.access_token);setCloudState('Synchronisé à l’instant','online');if(typeof render==='function')await render()}catch(e){console.error(e);setCloudState('Cloud indisponible • données locales','offline')}finally{cloudBusy=false}}

function renderCloudPanel(){let host=document.querySelector('#settingsView .stat');if(!host)return;let old=document.querySelector('#cloudPanel');if(old)old.remove();let s=getSession();let box=document.createElement('div');box.id='cloudPanel';box.style.cssText='margin-top:20px;padding-top:18px;border-top:1px solid var(--line)';if(s){let email=s.user?.email||'Compte connecté';box.innerHTML=`<b style="font-size:18px">Synchronisation Supabase</b><p class="sub"><span id="cloudStatus">Connecté</span><br>${email}</p><button class="primary" id="syncNow">Synchroniser maintenant</button> <button class="secondary" id="cloudLogout">Se déconnecter</button>`;host.appendChild(box);document.querySelector('#syncNow').onclick=()=>syncCloud(true);document.querySelector('#cloudLogout').onclick=signOut}else{box.innerHTML=`<b style="font-size:18px">Synchronisation Supabase</b><p class="sub">Utilise le même compte sur ton PC, ton iPhone et ton iPad. Tes données restent disponibles hors connexion.</p><div class="grid2"><label>E-mail<input id="cloudEmail" type="email" autocomplete="email"></label><label>Mot de passe<input id="cloudPassword" type="password" autocomplete="current-password" minlength="6"></label></div><div style="margin-top:10px"><button class="primary" id="cloudLogin">Se connecter</button> <button class="secondary" id="cloudSignup">Créer le compte</button></div><p class="sub" id="cloudMessage"></p>`;host.appendChild(box);let vals=()=>[document.querySelector('#cloudEmail').value.trim(),document.querySelector('#cloudPassword').value];document.querySelector('#cloudLogin').onclick=async()=>{let [e,p]=vals();try{await signIn(e,p)}catch(x){document.querySelector('#cloudMessage').textContent=x.message}};document.querySelector('#cloudSignup').onclick=async()=>{let [e,p]=vals();try{document.querySelector('#cloudMessage').textContent=await signUp(e,p)}catch(x){document.querySelector('#cloudMessage').textContent=x.message}}}
}

window.addEventListener('online',()=>setTimeout(()=>syncCloud(),500));
window.addEventListener('offline',()=>setCloudState('Hors connexion • données locales','offline'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCloud()});
setInterval(()=>syncCloud(),15000);
setTimeout(()=>{renderCloudPanel();syncCloud()},800);
