// Account UI uses existing styles and official Supabase Auth HTTP endpoints.
// Reopening registration requires BOTH this flag and the server-side setting.
const ALLOW_SIGNUP=false;
const RECOVERY_REDIRECT='https://remy9254.github.io/filament-stock/';
const RECOVERY_KEY='filament-stock-password-recovery';
const PASSWORD_MIN_LENGTH=8;
let accountScreen='account', accountNotice='', recoverySession=null;

function accountError(error){
 const messages={
  invalid_credentials:'E-mail ou mot de passe incorrect.',
  current_password_mismatch:'Le mot de passe actuel est incorrect.',
  current_password_required:'Saisis ton mot de passe actuel.',
  same_password:'Choisis un mot de passe différent du précédent.',
  weak_password:'Ce mot de passe ne respecte pas les exigences de Supabase. Choisis un mot de passe plus long et varié.',
  over_email_send_rate_limit:'Trop de demandes d’e-mail. Patiente avant de réessayer.',
  over_request_rate_limit:'Trop de tentatives. Patiente avant de réessayer.',
  email_address_invalid:'Vérifie l’adresse e-mail.',
  email_address_not_authorized:'Supabase ne peut pas envoyer à cette adresse avec la configuration e-mail actuelle.',
  signup_disabled:'La création de nouveaux comptes est désactivée.',
  email_not_confirmed:'Confirme ton adresse e-mail avant de te connecter.',
  reauthentication_needed:'Reconnecte-toi, puis réessaie de changer ton mot de passe.',
  account_mismatch:'Ce lien concerne un autre compte. Termine la récupération dans un autre navigateur.',
  bad_jwt:'La session a expiré. Reconnecte-toi ou demande un nouveau lien.',
  session_not_found:'La session a expiré. Reconnecte-toi ou demande un nouveau lien.',
  otp_expired:'Ce lien est expiré ou a déjà été utilisé. Demande un nouveau lien.'
 };
 return messages[error.code]||(error.status===429?messages.over_request_rate_limit:error.status===401?messages.bad_jwt:error.status?'La demande a échoué. Réessaie dans quelques instants.':error.message);
}
function recoveryStore(session){
 recoverySession=session;
 try{if(session)sessionStorage.setItem(RECOVERY_KEY,JSON.stringify(session));else sessionStorage.removeItem(RECOVERY_KEY);}catch{/* In-memory recovery still works without sessionStorage. */}
}
function accountView(){
 document.querySelector('aside [data-view="settings"]').click();
 const heading=document.querySelector('#cloudPanel h2');
 if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});}
}
function field(id,label,{type='password',autocomplete='new-password',minlength}={}){
 return `<label>${label}<input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" ${minlength?`minlength="${minlength}"`:''} required></label>`;
}
function passwordFields(current=false){
 return (current?field('currentPassword','Mot de passe actuel',{autocomplete:'current-password'}):'')+
  field('newPassword','Nouveau mot de passe',{minlength:PASSWORD_MIN_LENGTH})+
  field('confirmPassword','Confirmer le nouveau mot de passe',{minlength:PASSWORD_MIN_LENGTH})+
  `<p class="sub">Au moins ${PASSWORD_MIN_LENGTH} caractères. Utilise un mot de passe unique.</p>`;
}
function validatePasswords(form){
 const password=form.querySelector('#newPassword').value;
 if(password.length<PASSWORD_MIN_LENGTH)throw new Error(`Utilise au moins ${PASSWORD_MIN_LENGTH} caractères.`);
 if(password!==form.querySelector('#confirmPassword').value)throw new Error('Les deux nouveaux mots de passe ne correspondent pas.');
 if(form.querySelector('#currentPassword')?.value===password)throw new Error('Choisis un mot de passe différent du précédent.');
 return password;
}
async function runAccountAction(form,action){
 if(accountBusy)return;
 const message=document.querySelector('#cloudMessage');message.textContent='Traitement en cours…';
 accountBusy=true;document.querySelectorAll('#cloudPanel button').forEach(b=>b.disabled=true);
 try{await action();}catch(error){message.textContent=accountError(error);}
 finally{
  form?.querySelectorAll('input[type=password]').forEach(input=>input.value='');
  accountBusy=false;document.querySelectorAll('#cloudPanel button').forEach(b=>b.disabled=false);
 }
}
async function updatePassword(session,password,currentPassword){
 const user=await authRequest('/auth/v1/user',{password,...(currentPassword?{current_password:currentPassword}:{})},{method:'PUT',token:session.access_token});
 if(user.id!==session.user.id)throw new Error('Réponse du compte inattendue. Reconnecte-toi.');
 return user;
}
async function changePassword(form){
 const password=validatePasswords(form),currentPassword=form.querySelector('#currentPassword').value;
 const previous=getSession();
 if(!previous?.user?.email)throw new Error('Reconnecte-toi avant de changer ton mot de passe.');
 // Reauthenticate even if optional server current-password enforcement is off.
 const fresh=await authRequest('/auth/v1/token?grant_type=password',{email:previous.user.email,password:currentPassword});
 if(fresh.user?.id!==previous.user.id)throw Object.assign(new Error(),{code:'account_mismatch'});
 if(getSession()?.user?.id!==previous.user.id)throw new Error('La session a changé. Reconnecte-toi.');
 saveSession(fresh);
 const user=await updatePassword(fresh,password,currentPassword);
 if(getSession()?.user?.id===user.id){localStorage.setItem(SESSION_KEY,JSON.stringify({...getSession(),user}));}
 accountNotice='Mot de passe modifié. Si un autre appareil demande une reconnexion, utilise le nouveau mot de passe : tes bobines restent conservées.';
 accountScreen='account';renderCloudPanel();
}
async function requestRecovery(email){
 await authRequest('/auth/v1/recover?redirect_to='+encodeURIComponent(RECOVERY_REDIRECT),{email});
 document.querySelector('#cloudMessage').textContent='Si un compte correspond à cette adresse, un e-mail de récupération a été envoyé. Vérifie aussi les courriers indésirables.';
}
async function validateRecoverySession(){
 if(!recoverySession?.access_token)throw Object.assign(new Error(),{code:'otp_expired'});
 let session=recoverySession;
 if(Date.now()>=session.expires_at-60000){
  const renewed=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});
  session={...renewed,expires_at:Date.now()+(renewed.expires_in||3600)*1000};recoveryStore(session);
 }
 const user=await authRequest('/auth/v1/user',undefined,{method:'GET',token:session.access_token});
 if(!user.id)throw Object.assign(new Error(),{code:'otp_expired'});
 if(getSession()?.user?.id&&getSession().user.id!==user.id)throw Object.assign(new Error(),{code:'account_mismatch'});
 recoveryStore({...session,user});return recoverySession;
}
async function resetPassword(form){
 const password=validatePasswords(form),session=await validateRecoverySession();
 await updatePassword(session,password);
 // Recovery never uploads local stock or replaces the normal session.
 if(getSession()?.user?.id===session.user.id)saveSession(null);
 recoveryStore(null);recoveryActive=false;accountScreen='login';
 accountNotice='Nouveau mot de passe enregistré. Connecte-toi avec ce mot de passe pour reprendre la synchronisation. Tes données locales sont conservées.';
 renderCloudPanel();
}
function renderCloudPanel(){
 const host=document.querySelector('#settingsView .stat');if(!host)return;
 document.querySelector('#cloudPanel')?.remove();
 const box=document.createElement('div');box.id='cloudPanel';box.style.cssText='margin-top:20px;padding-top:18px;border-top:1px solid var(--line)';
 const session=getSession();let body='';
 if(accountScreen==='recovery-check'){
  body='<p class="sub">Vérification du lien de récupération…</p>';
 }else if(accountScreen==='recovery'){
  body=`<h3>Choisir un nouveau mot de passe</h3><form id="resetPasswordForm">${passwordFields()}<button class="primary" type="submit">Enregistrer le nouveau mot de passe</button></form><button type="button" class="secondary" id="cancelAccount">Annuler</button>`;
 }else if(accountScreen==='recovery-error'){
  body='<h3>Récupération du mot de passe</h3><button type="button" class="primary" id="retryRecovery">Réessayer la vérification</button><button type="button" class="secondary" id="forgotPassword">Demander un nouveau lien</button><button type="button" class="secondary" id="cancelAccount">Retour au compte</button>';
 }else if(accountScreen==='forgot'){
  body=`<h3>Mot de passe oublié ?</h3><p class="sub">Reçois un lien par e-mail pour choisir un nouveau mot de passe.</p><form id="forgotPasswordForm">${field('recoveryEmail','E-mail',{type:'email',autocomplete:'email'})}<button class="primary" type="submit">Envoyer le lien de récupération</button></form><button type="button" class="secondary" id="cancelAccount">Retour au compte</button>`;
 }else if(session&&accountScreen!=='login'){
  body='<p class="sub"><span id="accountEmail"></span><br><span id="cloudStatus">Connecté</span></p><button type="button" class="primary" id="syncNow">Synchroniser maintenant</button> <button type="button" class="secondary" id="cloudLogout">Se déconnecter</button>';
  body+=accountScreen==='change'?`<h3>Changer mon mot de passe</h3><form id="changePasswordForm">${passwordFields(true)}<button class="primary" type="submit">Enregistrer le mot de passe</button></form><button type="button" class="secondary" id="cancelAccount">Annuler</button>`:'<button type="button" class="secondary" id="changePassword">Changer mon mot de passe</button>';
 }else{
  body=`<p class="sub">Utilise ton compte existant pour synchroniser tes appareils. Tes données restent disponibles hors connexion.</p><form id="loginForm"><div class="grid2">${field('cloudEmail','E-mail',{type:'email',autocomplete:'username'})}${field('cloudPassword','Mot de passe',{autocomplete:'current-password'})}</div><button class="primary" id="cloudLogin" type="submit">Se connecter</button>${ALLOW_SIGNUP?' <button class="secondary" id="cloudSignup" type="button">Créer un compte</button>':''}</form><button class="secondary" id="forgotPassword" type="button">Mot de passe oublié ?</button>`;
 }
 box.innerHTML='<h2 style="font-size:18px;margin:0">Compte</h2>'+body+'<p class="sub" id="cloudMessage" role="status" aria-live="polite"></p>';host.appendChild(box);
 box.querySelector('#cloudMessage').textContent=accountNotice;
 const email=box.querySelector('#accountEmail');if(email)email.textContent=session.user?.email||'Compte connecté';
 const on=(id,handler)=>{const button=box.querySelector('#'+id);if(button)button.onclick=handler;};
 on('syncNow',()=>syncCloud(true));
 on('cloudLogout',()=>{accountScreen='account';accountNotice='';signOut();});
 on('changePassword',()=>{accountScreen='change';accountNotice='';renderCloudPanel();document.querySelector('#currentPassword').focus();});
 on('forgotPassword',()=>{recoveryStore(null);accountScreen='forgot';accountNotice='';renderCloudPanel();});
 on('cancelAccount',()=>{recoveryStore(null);recoveryActive=false;accountScreen='account';accountNotice='';renderCloudPanel();});
 on('retryRecovery',()=>runAccountAction(null,checkRecovery));
 const bind=(id,action)=>{const form=box.querySelector('#'+id);if(form)form.onsubmit=e=>{e.preventDefault();runAccountAction(form,()=>action(form));};};
 bind('loginForm',async form=>{await signIn(form.querySelector('#cloudEmail').value.trim(),form.querySelector('#cloudPassword').value);accountScreen='account';accountNotice='Connexion réussie.';renderCloudPanel();setTimeout(()=>syncCloud(true),0);});
 bind('forgotPasswordForm',form=>requestRecovery(form.querySelector('#recoveryEmail').value.trim()));
 bind('changePasswordForm',changePassword);bind('resetPasswordForm',resetPassword);
 on('cloudSignup',()=>{if(!ALLOW_SIGNUP)return;const form=box.querySelector('#loginForm');if(!form.reportValidity())return;runAccountAction(form,async()=>{await authRequest('/auth/v1/signup',{email:form.querySelector('#cloudEmail').value.trim(),password:form.querySelector('#cloudPassword').value});document.querySelector('#cloudMessage').textContent='Consulte ton e-mail de confirmation, puis connecte-toi.';});});
}
async function checkRecovery(){
 try{await validateRecoverySession();accountScreen='recovery';accountNotice='';}
 catch(error){accountScreen='recovery-error';accountNotice=accountError(error);}
 renderCloudPanel();
}
async function initializeAccount(){
 const hash=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
 const keys=['access_token','refresh_token','error','error_code','error_description','code','token_hash','type'];
 if(keys.some(key=>hash.has(key)||query.has(key))){
  // Scrub secrets from the address/history before any network request.
  const clean=new URL(location.href);clean.hash='';keys.forEach(key=>clean.searchParams.delete(key));
  history.replaceState(null,'',clean.pathname+clean.search);
  recoveryActive=true;accountScreen='recovery-check';recoveryStore(null);
  if(hash.get('type')==='recovery'&&hash.get('access_token')&&hash.get('refresh_token')){
   recoveryStore({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()+Math.min(Math.max(Number(hash.get('expires_in'))||3600,1),3600)*1000});
  }else{accountScreen='recovery-error';accountNotice='Lien invalide, expiré ou déjà utilisé. Demande un nouveau lien de récupération.';}
 }else{
  try{recoverySession=JSON.parse(sessionStorage.getItem(RECOVERY_KEY)||'null');}catch{recoverySession=null;}
  if(recoverySession){recoveryActive=true;accountScreen='recovery-check';}
 }
 renderCloudPanel();
 if(recoveryActive&&recoverySession)await checkRecovery();
 accountReady=true;
 // IndexedDB stays owned by app.js, with its existing schema and data.
 const start=()=>{if(typeof db==='undefined'||!db){setTimeout(start,100);return;}if(recoveryActive)accountView();else syncCloud();};start();
}
initializeAccount();
