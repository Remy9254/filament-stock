// Corrections are committed atomically online, then copied back to IndexedDB.
const correctionNotice=document.createElement('p');
correctionNotice.className='sub';correctionNotice.setAttribute('role','status');
correctionNotice.textContent='Une erreur ? Annule une consommation ou remets une bobine en stock. Connexion Internet nécessaire.';
document.querySelector('#history').before(correctionNotice);
const correctionDialog=document.createElement('div');
correctionDialog.className='modal hidden';
correctionDialog.innerHTML=`<form class="dialog" role="dialog" aria-modal="true" aria-labelledby="correctionTitle">
 <h2 id="correctionTitle">Corriger le stock</h2><p id="correctionDescription" class="sub"></p>
 <label id="correctionWeightLabel">Poids restant réel (g)<input id="correctionWeight" type="number" min="0.1" step="any" required></label>
 <p id="correctionError" role="status" aria-live="polite"></p>
 <div class="footer"><button type="button" class="secondary" id="correctionClose">Annuler</button><button class="primary" id="correctionSubmit">Confirmer</button></div>
 </form>`;
document.body.append(correctionDialog);
let correctionChoice=null,correctionFocus=null;

lifecycleHistory=function(spools,movements){
 const byId=new Map(spools.map(s=>[s.id,s]));
 const events=movements.map(m=>({...m,status:m.cancelledAt?'Annulée':null,action:!m.cancelledAt&&m.grams<0&&byId.has(m.spoolId)?'cancel':null,target:m.id}));
 for(const s of spools){
  const label=[s.brand,s.material,s.colorName].filter(Boolean).join(' • ');
  if(s.finishedAt||s.remaining<=0)events.push({date:new Date(s.finishedAt||s.updated||s.created||0).toISOString(),label:'Bobine terminée • '+label,status:'Terminée',action:!s.deletedAt?'restore':null,target:s.id});
  if(s.deletedAt)events.push({date:new Date(s.deletedAt).toISOString(),label:'Bobine supprimée • '+label,status:'Supprimée',action:'restore',target:s.id});
  for(const c of s.corrections||[]){
   events.push({date:c.date,label:c.label+' • '+label,status:'Correction',note:(c.grams>0?'+':'')+c.grams+' g'});
   if(c.previousDeletedAt)events.push({date:c.previousDeletedAt,label:'Bobine supprimée • '+label,status:'Restaurée'});
   if(c.previousFinishedAt)events.push({date:c.previousFinishedAt,label:'Bobine terminée • '+label,status:'Corrigée'});
  }
 }
 // One lifecycle entry per original timestamp, including repeated corrections.
 const seen=new Set();
 return events.sort((a,b)=>b.date.localeCompare(a.date)).filter(e=>{const key=e.label+'|'+e.date;if(seen.has(key)&&!e.id)return false;seen.add(key);return true;}).map(m=>`<div class="row"><div></div><div><b>${escapeHTML(m.label)}</b><div class="sub">${new Date(m.date).toLocaleString('fr-FR')}${m.note?' • '+escapeHTML(m.note):''}${m.cancelledAt?' • Annulée le '+new Date(m.cancelledAt).toLocaleString('fr-FR'):''}</div></div><b>${escapeHTML(m.status||m.grams+' g')}</b><div class="actions">${m.action?`<button data-correction="${m.action}" data-target="${escapeHTML(m.target)}">${m.action==='cancel'?'Annuler la consommation':'Remettre en stock'}</button>`:''}</div></div>`).join('')||'<div class="sub">Aucun mouvement.</div>';
};

function closeCorrection(){if(correctionBusy)return;correctionDialog.classList.add('hidden');correctionFocus?.focus();}
document.querySelector('#correctionClose').onclick=closeCorrection;
correctionDialog.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();closeCorrection();}
 if(e.key==='Tab'){
  const items=[...correctionDialog.querySelectorAll('input,button')].filter(el=>!el.disabled&&el.getClientRects().length);
  const first=items[0],last=items.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }
});
document.querySelector('#history').addEventListener('click',async e=>{
 const button=e.target.closest('[data-correction]');if(!button||correctionBusy)return;
 const action=button.dataset.correction,target=button.dataset.target;
 const movements=await all('movements'),spools=await all('spools');
 const movement=movements.find(m=>m.id===target);
 const spool=spools.find(s=>s.id===(action==='cancel'?movement?.spoolId:target));if(!spool)return;
 correctionChoice={action,target,spoolId:spool.id};correctionFocus=button;
 document.querySelector('#correctionTitle').textContent=action==='cancel'?'Annuler cette consommation ?':'Remettre cette bobine en stock';
 document.querySelector('#correctionDescription').textContent=action==='cancel'?`${-movement.grams} g seront rendus à la bobine. La consommation restera dans l’historique avec la mention « Annulée ».${spool.deletedAt?' La bobine restera supprimée ; tu pourras ensuite la remettre en stock.':''}`:'Vérifie le poids restant. La bobine retrouvera une place libre sur l’étagère.';
 const input=document.querySelector('#correctionWeight');input.value=spool.remaining>0?spool.remaining:'';input.max=spool.initial;input.disabled=action==='cancel';
 document.querySelector('#correctionWeightLabel').classList.toggle('hidden',action==='cancel');
 document.querySelector('#correctionError').textContent='';
 correctionDialog.classList.remove('hidden');(action==='cancel'?document.querySelector('#correctionSubmit'):input).focus();
});

correctionDialog.querySelector('form').addEventListener('submit',async e=>{
 e.preventDefault();if(correctionBusy||!correctionChoice)return;
 const errorEl=document.querySelector('#correctionError');
 if(!navigator.onLine){errorEl.textContent='Connecte-toi à Internet pour corriger le stock.';return;}
 if(cloudBusy||accountBusy){errorEl.textContent='Synchronisation en cours. Réessaie dans quelques instants.';return;}
 if(!accountReady||recoveryActive||!getSession()){errorEl.textContent='Connecte ton compte dans Réglages pour corriger le stock.';return;}
 correctionBusy=true;correctionDialog.querySelectorAll('button').forEach(b=>b.disabled=true);errorEl.textContent='Synchronisation et correction…';
 try{
  const session=await refreshSession();if(!session)throw new Error('Connexion au compte nécessaire.');
  await mergeStore('spools','spools',spoolToCloud,spoolFromCloud,session.access_token);
  await mergeStore('movements','movements',movementToCloud,movementFromCloud,session.access_token);
  const spool=(await all('spools')).find(s=>s.id===correctionChoice.spoolId);if(!spool)throw new Error('Bobine introuvable.');
  const response=await fetch(CLOUD_URL+'/rest/v1/rpc/correct_stock',{method:'POST',headers:cloudHeaders(session.access_token),body:JSON.stringify({p_action:correctionChoice.action,p_target:correctionChoice.target,p_revision:spool.correctionRevision||0,p_remaining:spool.remaining,p_weight:correctionChoice.action==='restore'?Number(document.querySelector('#correctionWeight').value):null}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  if(!response.ok){const messages={STOCK_CHANGED:'Le stock a changé sur un autre appareil. Ferme cette fenêtre puis réessaie.',WEIGHT_EXCEEDS_INITIAL:'Cette annulation dépasserait le poids initial de la bobine. Vérifie son poids dans Modifier.',INVALID_WEIGHT:'Saisis un poids positif, inférieur ou égal au poids initial.',ALREADY_ACTIVE:'Cette bobine est déjà en stock.'};throw new Error(messages[result.message]||'Correction impossible. Actualise le stock puis réessaie.');}
  await saveCorrectionResult(result);
  correctionDialog.classList.add('hidden');correctionNotice.textContent='Correction enregistrée et synchronisée.';setCloudState('Synchronisé à l’instant','online');await render();
 }catch(error){errorEl.textContent=error.name==='TimeoutError'||error instanceof TypeError?'Connexion interrompue. Réessaie : une même consommation ne sera annulée qu’une fois.':error.message;}
 finally{correctionBusy=false;correctionDialog.querySelectorAll('button').forEach(b=>b.disabled=false);if(correctionDialog.classList.contains('hidden')){correctionNotice.tabIndex=-1;correctionNotice.focus();}}
});
function saveCorrectionResult(result){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['spools','movements'],'readwrite');tx.objectStore('spools').put(spoolFromCloud(result.spool));
 if(result.movement)tx.objectStore('movements').put(movementFromCloud(result.movement));
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
});}
if(typeof db!=='undefined'&&db)render();

