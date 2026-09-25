// ─── APP: identidad, navegación, shell ────────────────────────────────────────
(function(){
  const { esc, $ } = UI;
  const ROLES = { admin:'Socio/a · dueño de la agencia (ve Finanzas)', equipo:'Equipo', invitado:'Invitado/a (solo Operaciones)' };
  const DEFAULT_UNITS = [
    { id:'social', label:'Social Media', color:'#1A73E8' },
    { id:'pauta', label:'Pauta', color:'#9b6fe8' },
    { id:'branding', label:'Branding', color:'#e8b84a' },
    { id:'web', label:'Web', color:'#2dca72' },
    { id:'contenido', label:'Producción de contenido', color:'#2dcab4' },
    { id:'otros', label:'Otros', color:'#7a7a8c' },
  ];

  const routes = {};
  let current = null;

  const App = {
    ROLES,
    route(name, fn){ routes[name] = fn; },
    members(){ return Store.all('team','members').sort((a,b)=>a.name.localeCompare(b.name)); },
    member(id){ return Store.get('team','members',id); },
    me(){ return this.member(localStorage.getItem('anm_me')); },
    isAdmin(){ return this.me()?.role==='admin'; },
    canGrowth(){ return this.me() && this.me().role!=='invitado'; },
    units(){ return Store.setting('units', DEFAULT_UNITS); },
    unit(id){ return this.units().find(u=>u.id===id) || { id, label:id, color:'#7a7a8c' }; },
    unitOpts(){ return this.units().map(u=>[u.id,u.label]); },
    memberOpts(empty='— Sin asignar —'){ return [['',empty], ...this.members().map(m=>[m.id,m.name])]; },
    // Solo los socios asignan trabajo a otras personas; el resto se asigna a sí mismo
    assignOpts(){ const me = this.me(); return this.isAdmin() ? this.memberOpts() : [[me.id, me.name]]; },
    unitTags(ids=[]){ return ids.map(id=>{ const u=this.unit(id); return `<span class="tag" style="background:${u.color}22;color:${u.color}">${esc(u.label)}</span>`; }).join(' '); },

    // Filtro global por unidad de negocio (se recuerda por navegador)
    get unitFilter(){ return localStorage.getItem('anm_unit')||''; },
    set unitFilter(v){ localStorage.setItem('anm_unit', v); },
    unitBar(){
      const f = this.unitFilter;
      return `<div class="chips"><button class="chip ${!f?'on':''}" onclick="App.setUnit('')">Todas</button>${this.units().map(u=>
        `<button class="chip ${f===u.id?'on':''}" onclick="App.setUnit('${u.id}')"><span class="dot" style="background:${u.color}"></span>${esc(u.label)}</button>`).join('')}</div>`;
    },
    setUnit(v){ this.unitFilter = v; this.render(); },
    matchUnit(units){ const f=this.unitFilter; return !f || (Array.isArray(units)?units:[units]).includes(f); },

    go(hash){ if(location.hash===hash) this.render(); else location.hash = hash; },

    notify(to, text, link){
      const me = this.me();
      Store.upsert('team','notifications',{ to, from:me?.id, text, link:link||'', at:new Date().toISOString(), readBy:[] });
    },
    myNotifications(){
      const me = this.me(); if(!me) return [];
      return Store.all('team','notifications').filter(n=>(n.to===me.id||n.to==='all') && n.from!==me.id).sort((a,b)=>b.at.localeCompare(a.at));
    },

    render(){
      const me = this.me();
      if(joinPending){ if(App.member(joinPending)?.passHash) joinPending = null; else { renderGate(joinPending, true); return; } }
      if(!me){ renderGate(); return; }
      if(!me.passHash){ renderGate(me.id, true); return; }   // perfiles viejos: ya entraron, solo crean contraseña
      document.body.classList.remove('gated');
      $('#app').style.display = '';
      $('#gate').style.display = 'none';
      const [name, ...rest] = (location.hash.replace(/^#\/?/,'')||'inicio').split('/');
      const fn = routes[name] || routes.inicio;
      if(name==='crecimiento' && !this.canGrowth()){ location.hash = '#/ops'; return; }
      current = name;
      renderNav(name);
      const page = $('#page');
      const out = fn(rest) || {};
      $('#title').textContent = out.title || '';
      $('#crumb').textContent = out.crumb || '';
      if(out.html!=null) page.innerHTML = out.html;
      out.after?.();
    },
  };

  // ── Navegación lateral ──────────────────────────────────────────────────────
  function renderNav(active){
    const me = App.me();
    const a = Ops.alerts().filter(x=>x.level!=='info').length;
    const g = App.canGrowth() ? Growth.alerts().length : 0;
    const unread = App.myNotifications().filter(n=>!(n.readBy||[]).includes(me.id)).length;
    const item = (href, ic, label, key, extra='') => `<a href="${href}" class="${active===key?'active':''}" onclick="App.closeSidebar()"><span class="ic">${ic}</span>${label}${extra}</a>`;
    $('#nav').innerHTML = `
      <div class="nav-s">General</div>
      ${item('#/inicio','◈','Inicio','inicio', unread?`<span class="cnt">${unread}</span>`:'')}
      <div class="nav-s">Agencia</div>
      ${item('#/ops','◎','Operaciones','ops', a?`<span class="cnt">${a}</span>`:'')}
      ${App.canGrowth()?item('#/crecimiento','↗','Crecimiento','crecimiento', g?`<span class="cnt">${g}</span>`:''):''}
      ${App.isAdmin()?`<a href="finanzas.html"><span class="ic">$</span>Finanzas<span class="lock">🔒</span></a>`:''}
      <div class="nav-s">Equipo</div>
      ${item('#/equipo','◑','Equipo e invitaciones','equipo')}
      ${item('#/ajustes','⚙','Ajustes','ajustes')}`;
    const lv = Game.level(Game.xpOf(me.id));
    $('#me').innerHTML = `${UI.avatar(me)}<div class="grow"><div class="b ellip">${esc(me.name)}</div>
      <div class="xs faint b">Nv ${lv.n} · ${esc(lv.name)} · 🔥${Game.streak(me.id)}</div>
      <div class="xpbar" style="height:5px;margin-top:5px"><div style="width:${lv.pct}%"></div></div></div>`;
  }
  App.closeSidebar = ()=>{ $('.sidebar').classList.remove('open'); $('.sb-over').classList.remove('open'); };
  App.openSidebar = ()=>{ $('.sidebar').classList.add('open'); $('.sb-over').classList.add('open'); };

  // ── Acceso: onboarding / invitación / elegir perfil ────────────────────────
  function newInvite(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
  App.newInvite = newInvite;
  App.inviteLink = m => location.href.split('#')[0].split('?')[0] + '?join=' + m.invite;

  // Contraseñas: se guarda solo un hash (SHA-256 con sal propia de cada perfil)
  async function hashPass(salt, pass){
    const txt = salt + '|' + pass;
    if(window.crypto?.subtle){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
    let h = 5381; for(const c of txt) h = (h*33) ^ c.charCodeAt(0); return 'djb'+(h>>>0).toString(16);
  }
  const newSalt = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  async function setPassword(id, pass){ const salt = newSalt(); Store.upsert('team','members',{ id, passSalt:salt, passHash:await hashPass(salt, pass) }); }
  App.setPassword = setPassword;
  const validPass = (a, b) => { if((a||'').length<6){ UI.toast('La contraseña tiene que tener al menos 6 caracteres','⚠️'); return false; } if(a!==b){ UI.toast('Las contraseñas no coinciden','⚠️'); return false; } return true; };

  const gateBox = inner => `<div class="mbox"><div class="row" style="margin-bottom:18px"><img src="logo.jpg" alt="" style="width:46px;height:46px;border-radius:12px"><div><div class="brand-t">ANM</div><div class="brand-s">Studio · Plataforma</div></div></div>${inner}</div>`;
  const enter = e => { if(e.key==='Enter') e.target.closest('.mbox').querySelector('.btn.p')?.click(); };

  function renderGate(pending, codeOk){
    $('#app').style.display = 'none';
    const g = $('#gate'); g.style.display = '';
    const members = App.members();
    // Primera vez: se crea el primer socio
    if(!members.length){
      g.innerHTML = gateBox(`<h2>¡Bienvenido/a! 👋</h2><p class="muted" style="margin-bottom:18px">Creá tu perfil de socio/a: vas a poder cargar al equipo, asignar tareas y ver Finanzas.</p>
        <div class="fld"><label>Nombre y apellido</label><input class="inp" id="g-name" placeholder="Ej: Diogenes Ortiz"></div>
        <div class="frow"><div class="fld"><label>Contraseña</label><input class="inp" id="g-p1" type="password" autocomplete="new-password"></div><div class="fld"><label>Repetila</label><input class="inp" id="g-p2" type="password" autocomplete="new-password"></div></div>
        ${Store.status==='error'?'<div class="alert warn"><div class="ai">⚠️</div><div class="ad">No hay conexión con la base de datos. Si tu equipo ya usa la plataforma, esperá a tener conexión antes de crear un perfil nuevo.</div></div>':''}
        <button class="btn p" style="width:100%;justify-content:center" onclick="App.createFirst()">Empezar</button>`);
      g.querySelectorAll('input').forEach(i=>i.onkeydown = enter);
      return;
    }
    // Perfil sin contraseña todavía: la crea con el código que le pasó un socio
    if(pending){
      const m = App.member(pending);
      g.innerHTML = gateBox(`<h2>Hola, ${esc(m.name.split(' ')[0])} 👋</h2><p class="muted" style="margin-bottom:18px">Es tu primera vez. Creá tu contraseña para entrar de ahora en más.</p>
        ${codeOk?'':`<div class="fld"><label>Código de invitación</label><input class="inp" id="g-code" placeholder="Te lo pasa un socio (ej: K3F9QZ)" style="text-transform:uppercase"></div>`}
        <div class="frow"><div class="fld"><label>Nueva contraseña</label><input class="inp" id="g-p1" type="password" autocomplete="new-password"></div><div class="fld"><label>Repetila</label><input class="inp" id="g-p2" type="password" autocomplete="new-password"></div></div>
        <button class="btn p" style="width:100%;justify-content:center" onclick="App.firstPassword('${m.id}', ${codeOk?'true':'false'})">Crear contraseña y entrar</button>
        <button class="btn g" style="width:100%;justify-content:center;margin-top:8px" onclick="App.cancelFirst()">← Volver</button>`);
      g.querySelectorAll('input').forEach(i=>i.onkeydown = enter);
      setTimeout(()=>g.querySelector('input')?.focus(), 30);
      return;
    }
    g.innerHTML = gateBox(`<h2>Ingresá</h2>
      <div class="fld"><label>Tu nombre</label><input class="inp" id="g-name" list="g-names" placeholder="Ej: Diogenes Ortiz" autocomplete="username"><datalist id="g-names">${members.map(m=>`<option value="${esc(m.name)}">`).join('')}</datalist></div>
      <div class="fld"><label>Contraseña</label><input class="inp" id="g-pass" type="password" autocomplete="current-password"></div>
      <button class="btn p" style="width:100%;justify-content:center" onclick="App.login()">Entrar</button>
      <p class="xs faint" style="margin-top:14px">¿Primera vez? Escribí tu nombre y tocá Entrar: te va a pedir el código que te pasó un socio para crear tu contraseña.</p>`);
    g.querySelectorAll('input').forEach(i=>i.onkeydown = enter);
    setTimeout(()=>$('#g-name')?.focus(), 30);
  }

  App.createFirst = async ()=>{
    const name = $('#g-name').value.trim(); if(!name) return UI.toast('Ingresá tu nombre','⚠️');
    if(!validPass($('#g-p1').value, $('#g-p2').value)) return;
    const m = Store.upsert('team','members',{ name, role:'admin', units:[], color:UI.COLORS[0], invite:newInvite(), joinedAt:new Date().toISOString() });
    await setPassword(m.id, $('#g-p1').value);
    localStorage.setItem('anm_me', m.id);
    Game.log('joined', `${name} creó la plataforma`, { icon:'🎉' });
    UI.confetti(); App.render();
  };
  App.login = async ()=>{
    const q = norm($('#g-name').value), pass = $('#g-pass').value;
    if(!q) return UI.toast('Escribí tu nombre','⚠️');
    const ms = App.members();
    const m = ms.find(x=>norm(x.name)===q) || (ms.filter(x=>norm(x.name).split(' ')[0]===q).length===1 ? ms.find(x=>norm(x.name).split(' ')[0]===q) : null);
    if(!m) return UI.toast('No encontré ese nombre. Pedile a un socio que te cargue en “Equipo”.','🔍');
    if(!m.passHash) return renderGate(m.id);
    if(await hashPass(m.passSalt, pass)!==m.passHash){ $('#g-pass').value=''; $('#g-pass').style.borderColor='var(--red)'; return UI.toast('Contraseña incorrecta','⛔'); }
    localStorage.setItem('anm_me', m.id);
    UI.toast(`Hola, ${m.name.split(' ')[0]}`,'👋'); App.render();
  };
  App.firstPassword = async (id, codeOk)=>{
    const m = App.member(id); if(!m) return App.render();
    if(!codeOk && $('#g-code').value.trim().toUpperCase()!==m.invite) return UI.toast('El código no coincide. Pedíselo a un socio.','⛔');
    if(!validPass($('#g-p1').value, $('#g-p2').value)) return;
    await setPassword(id, $('#g-p1').value);
    joinPending = null;
    localStorage.setItem('anm_me', id);
    if(!m.joinedAt){ Store.upsert('team','members',{ id, joinedAt:new Date().toISOString() }); Game.log('joined', `${m.name} se sumó al equipo`, { icon:'🎉' }); UI.confetti(); }
    App.render();
  };
  App.cancelFirst = ()=>{ joinPending = null; localStorage.removeItem('anm_me'); App.render(); };
  App.logout = ()=>{ if(confirm('¿Cerrar sesión en este navegador?')){ localStorage.removeItem('anm_me'); App.render(); } };
  App.changePassword = ()=>{
    const me = App.me();
    UI.form({ title:'🔑 Cambiar contraseña', submit:'Guardar', fields:[
      ...(me.passHash ? [{ k:'cur', label:'Contraseña actual', type:'password' }] : []),
      { k:'p1', label:'Nueva contraseña', type:'password', half:true }, { k:'p2', label:'Repetila', type:'password', half:true },
    ], onSubmit:v=>{ (async()=>{
        if(me.passHash && await hashPass(me.passSalt, v.cur)!==me.passHash) return UI.toast('La contraseña actual no es correcta','⛔');
        if(!validPass(v.p1, v.p2)) return;
        await setPassword(me.id, v.p1); UI.toast('Contraseña actualizada','🔑');
      })(); } });
  };

  // Link de invitación: lleva directo a crear la contraseña (o al login si ya la tiene)
  function handleJoin(){
    const code = new URLSearchParams(location.search).get('join');
    if(!code) return;
    const m = App.members().find(x=>x.invite===code.toUpperCase());
    history.replaceState(null,'',location.pathname+location.hash);
    if(!m) return UI.toast('El link de invitación no es válido o fue regenerado','⛔');
    if(m.passHash){ if(!App.me()) UI.toast(`${m.name.split(' ')[0]}, ya tenés contraseña: ingresá con tu nombre`,'🔑'); return; }
    localStorage.removeItem('anm_me');
    joinPending = m.id;
  }
  let joinPending = null;

  // ── Notificaciones ───────────────────────────────────────────────────────────
  App.openNotifications = ()=>{
    const me = App.me(), list = App.myNotifications().slice(0,40);
    UI.modal(`<h2>🔔 Avisos para vos<button class="icon-btn x" data-close>✕</button></h2>
      ${list.length ? `<div class="list">${list.map(n=>{ const from=App.member(n.from); const unread=!(n.readBy||[]).includes(me.id);
        return `<div class="li">${UI.avatar(from,'sm')}<div class="grow"><div class="${unread?'b':''} prewrap">${esc(n.text)}</div><div class="xs faint">${esc(from?.name||'')} · ${UI.ago(n.at)}${n.to==='all'?' · para todo el equipo':''}</div></div>
        ${n.link?`<a class="btn xs g" href="${esc(n.link)}" onclick="UI.close()">Ver</a>`:''}</div>`; }).join('')}</div>`
        : '<div class="empty"><div class="big">🔕</div>No tenés avisos</div>'}
      <div class="mfoot"><button class="btn g" data-close>Cerrar</button></div>`);
    list.forEach(n=>{ if(!(n.readBy||[]).includes(me.id)) Store.upsert('team','notifications',{ id:n.id, readBy:[...(n.readBy||[]), me.id] }); });
  };

  // Enviar un aviso manual (a una persona, por la app / WhatsApp / mail)
  App.sendAlert = (text, toId, link)=>{
    const opts = [['all','Todo el equipo'], ...App.members().map(m=>[m.id,m.name])];
    UI.form({ title:'📣 Mandar alerta', submit:'Enviar en la app',
      fields:[
        { k:'to', label:'Para', type:'select', options:opts, default:toId||'all' },
        { k:'text', label:'Mensaje', type:'textarea', req:true, default:text||'' },
      ],
      extra:`<div class="row wrap small muted" style="margin-bottom:6px">También podés: <button type="button" class="btn xs g" id="al-wa">WhatsApp</button><button type="button" class="btn xs g" id="al-mail">Email</button><button type="button" class="btn xs g" id="al-copy">Copiar</button></div>`,
      onSubmit:v=>{ App.notify(v.to, v.text, link); Game.log('alert_sent', 'Alerta enviada', { icon:'📣' }); },
    });
    const val = ()=>({ to:App.member($('#f_to').value), text:$('#f_text').value });
    $('#al-wa').onclick = ()=>{ const v=val(); window.open(UI.waLink(v.text, v.to?.phone), '_blank'); };
    $('#al-mail').onclick = ()=>{ const v=val(); location.href = UI.mailLink(v.to?.email, 'ANM · Alerta', v.text); };
    $('#al-copy').onclick = ()=>UI.copy(val().text);
  };

  // ── Alta rápida ──────────────────────────────────────────────────────────────
  App.quickAdd = ()=>{
    const opt = (ic, t, d, fn) => `<div class="li click" onclick="UI.close();${fn}"><span style="font-size:20px">${ic}</span><div class="grow"><div class="b">${t}</div><div class="xs faint">${d}</div></div></div>`;
    UI.modal(`<h2>＋ Crear<button class="icon-btn x" data-close>✕</button></h2><div class="list">
      ${opt('📡','Actualización de cliente','¿En qué estamos con un cliente?','Ops.updateClient()')}
      ${opt('✅','Tarea','Algo que hay que hacer, con responsable y fecha','Ops.editTask()')}
      ${opt('🗓️','Pieza de contenido','Post, reel, campaña o entrega en el calendario','Ops.editContent()')}
      ${opt('🤝','Reunión / minuta','Registrar una reunión y sus acuerdos','Ops.editMeeting()')}
      ${App.canGrowth()?opt('🎯','Contacto / prospecto','Alguien a contactar o que contactamos','Growth.editLead()'):''}
      ${opt('📣','Alerta al equipo','Avisar algo a alguien','App.sendAlert()')}
    </div>`);
  };

  // ── Tema ─────────────────────────────────────────────────────────────────────
  App.toggleTheme = ()=>{
    const t = document.documentElement.dataset.theme==='light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t; try{ localStorage.setItem('anm_theme', t); }catch(e){}
  };

  // ── Arranque ─────────────────────────────────────────────────────────────────
  async function boot(){
    try{ const t = localStorage.getItem('anm_theme'); if(t) document.documentElement.dataset.theme = t; }catch(e){}
    Store.on(ev=>{
      if(ev.type==='status'){
        const map = { local:'💾 Local', syncing:'⏳ Sincronizando', synced:'● En línea', error:'⚠️ Sin conexión' };
        const col = { synced:'var(--green)', error:'var(--red)', syncing:'var(--yellow)' };
        const el = $('#sync'); if(el){ el.textContent = map[ev.status]; el.style.color = col[ev.status]||''; }
      }
    });
    await Store.init();
    handleJoin();
    // Re-render cuando llegan cambios de otras personas (sin interrumpir si hay un modal abierto)
    let pending = false;
    Store.on(ev=>{ if(ev.type!=='change') return; if(pending) return; pending = true;
      requestAnimationFrame(()=>{ pending = false; if(!$('#modal').classList.contains('open') && !document.activeElement?.matches('input,textarea,select')) App.render(); }); });
    window.addEventListener('hashchange', ()=>{ UI.close(); App.render(); window.scrollTo(0,0); });
    App.render();
  }
  window.App = App;
  document.addEventListener('DOMContentLoaded', boot);
})();
