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
      if(!me){ renderGate(); return; }
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

  function renderGate(){
    $('#app').style.display = 'none';
    const g = $('#gate'); g.style.display = '';
    const members = App.members();
    if(!members.length){
      g.innerHTML = `<div class="mbox"><div class="row" style="margin-bottom:18px"><img src="logo.jpg" alt="" style="width:46px;height:46px;border-radius:12px"><div><div class="brand-t">ANM</div><div class="brand-s">Studio · Plataforma</div></div></div>
        <h2>¡Bienvenido/a! 👋</h2><p class="muted" style="margin-bottom:18px">Creá tu perfil. Vas a entrar como socio/a: podés invitar al equipo, asignar tareas y ver Finanzas.</p>
        <div class="fld"><label>Tu nombre</label><input class="inp" id="g-name" placeholder="Ej: Dio"></div>
        <div class="fld"><label>Email</label><input class="inp" id="g-email" type="email" placeholder="opcional"></div>
        ${Store.status==='error'?'<div class="alert warn"><div class="ai">⚠️</div><div class="ad">No hay conexión con la base de datos. Si tu equipo ya usa la plataforma, esperá a tener conexión antes de crear un perfil nuevo.</div></div>':''}
        <button class="btn p" style="width:100%;justify-content:center" onclick="App.createFirst()">Empezar</button></div>`;
      return;
    }
    g.innerHTML = `<div class="mbox"><h2>¿Quién sos?</h2>
      <p class="muted small" style="margin-bottom:16px">Elegí tu perfil e ingresá tu código de invitación (está en el link que te pasaron).</p>
      <div class="fld"><label>Perfil</label><select class="inp" id="g-member">${members.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
      <div class="fld"><label>Código de invitación</label><input class="inp" id="g-code" placeholder="Ej: K3F9QZ" style="text-transform:uppercase"></div>
      <button class="btn p" style="width:100%;justify-content:center" onclick="App.claim()">Entrar</button>
      <p class="xs faint" style="margin-top:14px">¿No tenés código? Pedile a un socio el link desde “Equipo e invitaciones”.</p></div>`;
  }

  App.createFirst = ()=>{
    const name = $('#g-name').value.trim(); if(!name) return UI.toast('Ingresá tu nombre','⚠️');
    const m = Store.upsert('team','members',{ name, email:$('#g-email').value.trim(), role:'admin', units:[], color:UI.COLORS[0], invite:newInvite(), joinedAt:new Date().toISOString() });
    localStorage.setItem('anm_me', m.id);
    Game.log('joined', `${name} creó la plataforma`, { icon:'🎉' });
    UI.confetti(); App.render();
  };
  App.claim = ()=>{
    const m = App.member($('#g-member').value), code = $('#g-code').value.trim().toUpperCase();
    if(!m || m.invite!==code) return UI.toast('El código no coincide','⛔');
    localStorage.setItem('anm_me', m.id); App.render();
  };
  App.logout = ()=>{ if(confirm('¿Cerrar sesión en este navegador?')){ localStorage.removeItem('anm_me'); App.render(); } };

  function handleJoin(){
    const code = new URLSearchParams(location.search).get('join');
    if(!code) return;
    const m = App.members().find(x=>x.invite===code.toUpperCase());
    history.replaceState(null,'',location.pathname+location.hash);
    if(!m) return UI.toast('El link de invitación no es válido o fue regenerado','⛔');
    const first = !m.joinedAt;
    localStorage.setItem('anm_me', m.id);
    if(first){ Store.upsert('team','members',{ id:m.id, joinedAt:new Date().toISOString() }); Game.log('joined', `${m.name} se sumó al equipo`, { icon:'🎉' }); UI.confetti(); }
    else UI.toast(`Hola de nuevo, ${m.name}`,'👋');
  }

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
