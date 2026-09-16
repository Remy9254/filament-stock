// Filament Stock V2 - synchronisation Supabase (offline-first)
const CLOUD_URL='https://sykkkgzvyysagpucelik.supabase.co';
const CLOUD_KEY='sb_publishable_JCyGxQxzOA2yWp-ZKbPaMw_XDDh8b0q';
const SESSION_KEY='filament-stock-cloud-session';
let cloudBusy=false, accountBusy=false, accountReady=false, recoveryActive=false;
let refreshPending=null;

function cloudHeaders(token,extra={}){return {'apikey':CLOUD_KEY,'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...extra}}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function saveSession(s){
 if(!s){localStorage.removeItem(SESSION_KEY);return;}
 const copy={...s,expires_at:Date.now()+(s.expires_in||3600)*1000};
 localStorage.setItem(SESSION_KEY,JSON.stringify(copy));
}
function setCloudState(text,kind=''){let el=document.querySelector('#syncState');if(el){el.textContent='● '+text;el.className='sync '+kind}let x=document.querySelector('#cloudStatus');if(x)x.textContent=text}

// Official Supabase Auth HTTP API. Never log request bodies or persist passwords.
async function authRequest(path,body,{method='POST',token}={}){
 if(!navigator.onLine)throw Object.assign(new Error('Connexion Internet nécessaire.'),{code:'offline'});
 let response;
 try{response=await fetch(CLOUD_URL+path,{method,headers:token?cloudHeaders(token):{'apikey':CLOUD_KEY,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(20000)});}
 catch{throw Object.assign(new Error('Connexion impossible. Vérifie Internet puis réessaie.'),{code:'network'});}
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error('La demande a échoué.'),{code:data.code||data.error_code||data.error,status:response.status});
 return data;
}
async function refreshSession(){
 if(refreshPending)return refreshPending;
 const refresh=async()=>{
  const session=getSession();
  if(!session)return null;
  if(Date.now()<session.expires_at-60000)return session;
  if(!session.refresh_token)return null;
  try{
   const next=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});
   if(getSession()?.refresh_token!==session.refresh_token)return getSession();
   saveSession(next);return getSession();
  }catch(error){
   // Transient network failures must not sign out an offline device.
   if(['refresh_token_not_found','refresh_token_already_used','session_not_found','user_not_found','invalid_grant'].includes(error.code)){
    if(getSession()?.refresh_token===session.refresh_token){saveSession(null);renderCloudPanel();}
   }
   return null;
  }
 };
 refreshPending=(navigator.locks?navigator.locks.request(SESSION_KEY+'-refresh',refresh):refresh()).finally(()=>{refreshPending=null});
 return refreshPending;
}
async function signIn(email,password){
 const session=await authRequest('/auth/v1/token?grant_type=password',{email,password});
 if(!session.access_token||!session.user?.id)throw new Error('Réponse de connexion invalide.');
 const previous=getSession();
 if(previous?.user?.id&&previous.user.id!==session.user.id)throw Object.assign(new Error('Compte différent de celui déjà connecté.'),{code:'account_mismatch'});
 saveSession(session);renderCloudPanel();
}
async function signOut(){
 const session=getSession();
 saveSession(null);
 // Local scope preserves sessions on the user's other devices.
 if(session?.access_token)authRequest('/auth/v1/logout?scope=local',undefined,{token:session.access_token}).catch(()=>{});
 setCloudState(navigator.onLine?'En ligne • cloud non connecté':'Hors connexion','offline');
 renderCloudPanel();
}

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
async function syncCloud(force=false){if(cloudBusy||accountBusy||!accountReady||recoveryActive||!navigator.onLine)return;let s=await refreshSession();if(!s){setCloudState('En ligne • cloud non connecté','');return}cloudBusy=true;setCloudState('Synchronisation…','');try{await mergeStore('spools','spools',spoolToCloud,spoolFromCloud,s.access_token);await mergeStore('movements','movements',movementToCloud,movementFromCloud,s.access_token);setCloudState('Synchronisé à l’instant','online');if(typeof render==='function')await render()}catch(e){console.error(e);setCloudState('Cloud indisponible • données locales','offline')}finally{cloudBusy=false}}

window.addEventListener('online',()=>setTimeout(()=>syncCloud(),500));
window.addEventListener('offline',()=>setCloudState('Hors connexion • données locales','offline'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCloud()});
setInterval(()=>syncCloud(),15000);
