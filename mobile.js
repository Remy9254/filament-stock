/* UI adaptation; all stock writes continue through the existing app functions. */
(() => {
  const phone = matchMedia('(max-width:600px)');
  const icons = {
    dashboard:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    spools:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    add:'<path d="M12 5v14M5 12h14"/>',
    shelf:'<path d="M3 3v18M21 3v18M3 11h18M3 20h18M7 5v6M12 5v6M17 5v6M8 14v6M16 14v6"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
  };
  const bar = document.createElement('div');
  bar.className = 'mobile-nav';
  bar.setAttribute('role','navigation');
  bar.setAttribute('aria-label','Navigation principale mobile');
  bar.innerHTML = [['dashboard','Accueil'],['spools','Bobines'],['add','Ajouter'],['shelf','Étagère'],['settings','Réglages']].map(([id,label]) => `<button type="button" data-mobile-view="${id}" class="${id==='add'?'mobile-add':''}" aria-label="${id==='add'?'Ajouter une bobine':label}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg><span>${label}</span></button>`).join('');
  document.body.append(bar);
  function updateNav() {
    const active = document.querySelector('aside nav button.active')?.dataset.view;
    bar.querySelectorAll('button').forEach(b => {
      const selected = b.dataset.mobileView === active;
      b.classList.toggle('active',selected);
      if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }
  function navigate(view) {
    document.querySelector(`aside nav [data-view="${view}"]`).click();
    window.scrollTo(0,0);
    const heading = document.querySelector(`#${view}View h1`);
    heading.tabIndex=-1;heading.focus({preventScroll:true});
    updateNav();
  }
  bar.addEventListener('click',e => {
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.mobileView==='add')openForm();else navigate(button.dataset.mobileView);
  });
  new MutationObserver(updateNav).observe(document.querySelector('aside nav'),{subtree:true,attributes:true,attributeFilter:['class']});
  updateNav();
  const history=document.createElement('button');
  history.type='button';history.className='mobile-only mobile-history secondary';
  history.innerHTML='Historique des consommations <span aria-hidden="true">↗</span>';
  history.onclick=()=>navigate('history');document.querySelector('#stats').after(history);
  const back=document.createElement('button');back.type='button';back.className='mobile-only secondary';back.textContent='‹ Accueil';
  back.style.marginBottom='16px';back.onclick=()=>navigate('dashboard');document.querySelector('#historyView').prepend(back);
  const labels={search:'Rechercher une bobine',matFilter:'Filtrer par matière',brandFilter:'Filtrer par marque',stockFilter:'Filtrer par stock restant',shelfSearch:'Rechercher dans l’étagère',shelfMat:'Matière dans l’étagère',shelfBrand:'Marque dans l’étagère',shelfStock:'Stock restant dans l’étagère'};
  Object.entries(labels).forEach(([id,label])=>document.getElementById(id).setAttribute('aria-label',label));
  // Two taps move or swap a spool, leaving vertical scrolling available on phones.
  const racks=document.getElementById('racks');
  const desktopHelp=document.querySelector('#shelfView .top .sub');
  desktopHelp.classList.add('desktop-shelf-help');
  const phoneHelp=document.createElement('div');phoneHelp.className='mobile-only sub';phoneHelp.textContent='Tes bobines, une place pour chaque couleur.';desktopHelp.after(phoneHelp);
  const tools=document.createElement('div');tools.className='mobile-only shelf-mobile-tools';
  tools.innerHTML='<button type="button" class="secondary" aria-pressed="false">Déplacer une bobine</button><p class="sub" role="status">Touche une bobine pour la modifier.</p>';
  racks.before(tools);
  const moveButton=tools.querySelector('button'),hint=tools.querySelector('p');
  let moving=false,source=null,busy=false;
  function resetMove(){moving=false;source=null;racks.classList.remove('moving-spool');moveButton.textContent='Déplacer une bobine';moveButton.setAttribute('aria-pressed','false');hint.textContent='Touche une bobine pour la modifier.';decorateSlots();}
  function decorateSlots(){racks.querySelectorAll('.slot').forEach(slot=>{
    slot.dataset.mobileSlot=String(Number(slot.dataset.slot)+1);
    slot.classList.toggle('move-source',!!source&&slot.querySelector('.spool')?.dataset.id===source);
    if(phone.matches){slot.tabIndex=0;slot.setAttribute('role','button');slot.setAttribute('aria-label',`Emplacement ${Number(slot.dataset.slot)+1} : ${slot.querySelector('.spool')?.textContent||'vide'}`);}else{slot.removeAttribute('tabindex');slot.removeAttribute('role');slot.removeAttribute('aria-label');}
  });}
  moveButton.onclick=()=>{if(busy)return;if(moving){resetMove();return;}moving=true;moveButton.textContent='Annuler le déplacement';moveButton.setAttribute('aria-pressed','true');racks.classList.add('moving-spool');hint.textContent='1. Choisis la bobine à déplacer.';};
  racks.addEventListener('pointerdown',e=>{if(phone.matches)e.stopPropagation();},true);
  racks.addEventListener('dragstart',e=>{if(phone.matches)e.preventDefault();},true);
  racks.addEventListener('click',async e=>{
    if(!phone.matches||!moving)return;
    e.stopPropagation();const slot=e.target.closest('.slot');if(!slot||busy)return;
    if(!source){source=slot.querySelector('.spool')?.dataset.id;if(source){hint.textContent='2. Touche la destination. Une case occupée échange les deux bobines.';decorateSlots();}return;}
    busy=true;try{await moveTo(source,Number(slot.dataset.slot));resetMove();hint.textContent='Bobine déplacée.';}catch{hint.textContent='Déplacement impossible. Réessaie.';}finally{busy=false;}
  },true);
  racks.addEventListener('keydown',e=>{if(!phone.matches||!['Enter',' '].includes(e.key))return;const slot=e.target.closest('.slot');if(!slot)return;e.preventDefault();if(moving)slot.click();else slot.querySelector('.spool')?.click();});
  new MutationObserver(decorateSlots).observe(racks,{childList:true});
  phone.addEventListener('change',resetMove);decorateSlots();
  // Focus stays inside an open dialog and returns to the control that opened it.
  document.querySelectorAll('.modal').forEach(modal=>{
    const dialog=modal.querySelector('.dialog'),heading=dialog.querySelector('h2');
    if(!heading.id)heading.id=modal.id+'Title';
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',heading.id);
    let previous;
    new MutationObserver(()=>{
      if(!modal.classList.contains('hidden')){previous=document.activeElement;dialog.scrollTop=0;heading.tabIndex=-1;heading.focus({preventScroll:true});}
      else if(previous?.isConnected)previous.focus({preventScroll:true});
    }).observe(modal,{attributes:true,attributeFilter:['class']});
    modal.addEventListener('keydown',e=>{
      if(e.key==='Escape'){modal.classList.add('hidden');return;}
      if(e.key!=='Tab')return;
      const fields=[...dialog.querySelectorAll('button,input:not([type=hidden]),select')],first=fields[0],last=fields.at(-1);
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===heading)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
  });
})();
