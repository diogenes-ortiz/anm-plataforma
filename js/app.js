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
    me(){ return gateState==='ok' || gateState==='checking' ? this.member(localStorage.getItem('anm_me')) : null; },
    isAdmin(){ return this.me()?.role==='admin'; },
    // Dueño principal: quien creó la plataforma. Es el único que crea o modifica socios.
    owner(){ const ms = this.members(); return ms.find(m=>m.owner) || ms.filter(m=>m.role==='admin').sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''))[0]; },
    isOwner(){ const me = this.me(); return !!me && this.owner()?.id===me.id; },
    // ¿Puedo gestionar (editar rol, resetear, quitar) a esta persona?
    canManage(m){ return this.isAdmin() && (m.role!=='admin' || this.isOwner()); },
    canGrowth(){ return this.me() && this.me().role!=='invitado'; },
    units(){ return Store.setting('units', DEFAULT_UNITS); },
    unit(id){ return this.units().find(u=>u.id===id) || { id, label:id, color:'#7a7a8c' }; },
    unitOpts(){ return this.units().map(u=>[u.id,u.label]); },
    memberOpts(empty='— Sin asignar —'){ return [['',empty], ...this.members().map(m=>[m.id,m.name])]; },
    // Socios y equipo asignan trabajo a cualquiera; el invitado solo a sí mismo
    assignOpts(){ const me = this.me(); return me?.role!=='invitado' ? this.memberOpts() : [['', '— Sin asignar —'], [me.id, me.name]]; },
    unitTags(ids=[]){ return ids.map(id=>{ const u=this.unit(id), c=UI.safeColor(u.color); return `<span class="tag" style="background:${c}22;color:${c}">${esc(u.label)}</span>`; }).join(' '); },

    // Filtro global por unidad de negocio (se recuerda por navegador)
    get unitFilter(){ return localStorage.getItem('anm_unit')||''; },
    set unitFilter(v){ localStorage.setItem('anm_unit', v); },
    unitBar(){
      const f = this.unitFilter;
      return `<div class="chips"><button class="chip ${!f?'on':''}" onclick="App.setUnit('')">Todas</button>${this.units().map(u=>
        `<button class="chip ${f===u.id?'on':''}" onclick="App.setUnit('${u.id}')"><span class="dot" style="background:${UI.safeColor(u.color)}"></span>${esc(u.label)}</button>`).join('')}</div>`;
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
      return Store.all('team','notifications').filter(n=>(n.to===me.id||n.to==='all') && n.from!==me.id && !(n.hiddenBy||[]).includes(me.id)).sort((a,b)=>b.at.localeCompare(a.at));
    },

    render(){
      // Lo que se guarde mientras se dibuja no vuelve a disparar otro dibujo (evita bucles que traban los clics)
      rendering = true;
      try { this._render(); } finally { rendering = false; }
    },
    _render(){
      const me = this.me();
      if(gateState!=='ok'){ renderGate(); return; }
      if(!me){ renderGate(); return; }
      document.body.classList.remove('gated');
      $('#app').style.display = '';
      $('#gate').style.display = 'none';
      const [name, ...rest] = (location.hash.replace(/^#\/?/,'')||'inicio').split('/');
      const fn = routes[name] || routes.inicio;
      if(name==='crecimiento' && !this.canGrowth()){ location.hash = '#/ops'; return; }
      current = name;
      try{ renderNav(name); }catch(e){ console.error(e); showCrash(e.message); }
      const page = $('#page');
      let out;
      try{ out = fn(rest) || {}; }
      catch(e){ console.error(e); showCrash(e.message); out = { title:'Ups', html:`<div class="card empty"><div class="big">⚠️</div>Esta sección tuvo un error: <code>${UI.esc(e.message)}</code><br><br><button class="btn p" onclick="location.reload()">Recargar</button> <button class="btn g" onclick="App.repair()">Reparar</button> <a class="btn g" href="#/inicio">Ir a Inicio</a></div>` }; }
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
    const pf = Game.perf(me.id);
    $('#me').innerHTML = `${UI.avatar(me)}<div class="grow"><div class="b ellip">${esc(me.name)}</div>
      <div class="xs faint b"><span style="color:${pf.color}">${esc(pf.label)}</span>${pf.pct!=null?` · ${pf.resolved}/${pf.assigned} resueltas`:''}</div>
      <div class="xpbar" style="height:5px;margin-top:5px"><div style="width:${pf.pct??0}%;background:${pf.color}"></div></div></div>`;
  }
  App.closeSidebar = ()=>{ $('.sidebar').classList.remove('open'); $('.sb-over').classList.remove('open'); };
  App.openSidebar = ()=>{ $('.sidebar').classList.add('open'); $('.sb-over').classList.add('open'); };

  // ── Acceso: entrar con Google ───────────────────────────────────────────────
  // La lista de Gmails autorizados vive en la base (anm_access) y solo el dueño la modifica.
  // Cada mail autorizado se vincula con su perfil del equipo (por email o por member_id).
  const ROLE_OF = { owner:'admin', socio:'admin', equipo:'equipo', invitado:'invitado' };
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  const gateBox = inner => `<div class="mbox"><div class="row" style="margin-bottom:18px"><img src="logo.jpg" alt="" style="width:46px;height:46px;border-radius:12px"><div><div class="brand-t">ANM</div><div class="brand-s">Studio · Plataforma</div></div></div>${inner}</div>`;
  const G_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  let gateState = 'checking';   // checking | login | denied | ok

  function renderGate(){
    $('#app').style.display = 'none';
    const g = $('#gate'); g.style.display = '';
    if(gateState==='checking'){ g.innerHTML = gateBox('<h2>Conectando…</h2><p class="muted">Verificando tu acceso.</p>'); return; }
    if(gateState==='pick'){
      const libres = App.members().filter(x=>!x.email);
      g.innerHTML = gateBox(`<h2>¡Hola! 👋</h2><p class="muted" style="margin-bottom:14px">Es la primera vez que entrás con <b>${esc(Auth.email)}</b>. ¿Cuál de estos perfiles del equipo sos?</p>
        <div class="list" style="margin-bottom:12px">${libres.map(x=>`<div class="li click" style="cursor:pointer" onclick="App.pickProfile('${x.id}')">${UI.avatar(x,'sm')}<div class="grow b">${esc(x.name)}</div><span>›</span></div>`).join('')}</div>
        <button class="btn g" style="width:100%;justify-content:center" onclick="App.pickProfile('')">No estoy en la lista: crear mi perfil</button>`);
      return;
    }
    if(gateState==='denied'){
      g.innerHTML = gateBox(`<h2>Sin acceso ⛔</h2><p class="muted" style="margin-bottom:16px">La cuenta <b>${esc(Auth.email)}</b> no está autorizada para entrar a la plataforma de ANM.</p>
        <p class="small" style="margin-bottom:18px">Pedile al dueño de la agencia que agregue este mail en <b>Equipo → Accesos</b> y volvé a intentar.</p>
        <button class="btn p" style="width:100%;justify-content:center" onclick="location.reload()">Ya me autorizaron, reintentar</button>
        <button class="btn g" style="width:100%;justify-content:center;margin-top:8px" onclick="App.logout(true)">Entrar con otra cuenta</button>`);
      return;
    }
    g.innerHTML = gateBox(`<h2>Ingresá</h2><p class="muted" style="margin-bottom:18px">Entrá con tu cuenta de Google. Solo pueden entrar los mails que autorizó el dueño de la agencia.</p>
      ${Auth.lastError?`<div class="alert warn" style="margin-bottom:14px"><div class="ai">⚠️</div><div class="ad">${esc(Auth.lastError)}</div></div>`:''}
      <button class="btn g" style="width:100%;justify-content:center;gap:10px;padding:12px" onclick="Auth.login()">${G_ICON} Entrar con Google</button>`);
  }

  // Busca (o crea) el perfil del equipo de la persona que entró y lo deja como "yo"
  function bindMember(acc){
    const email = Auth.email, ms = App.members();
    let m = (acc.member_id && App.member(acc.member_id)) || ms.find(x=>(x.email||'').toLowerCase()===email);
    const role = ROLE_OF[acc.role] || 'equipo';
    if(!m){
      const gname = Auth.session?.name || email.split('@')[0];
      m = ms.find(x=>!x.email && norm(x.name)===norm(gname));   // perfil cargado antes sin mail
      if(!m && !pickedNew && ms.some(x=>!x.email)){ gateState = 'pick'; return false; }   // que elija cuál de los perfiles es
      m = m ? Store.upsert('team','members',{ id:m.id, email }) :
        Store.upsert('team','members',{ name:gname, email, role, owner:acc.role==='owner', units:[], color:UI.COLORS[ms.length % UI.COLORS.length], emailReminders:true, joinedAt:new Date().toISOString() });
      if(!m.joinedAt) Store.upsert('team','members',{ id:m.id, joinedAt:new Date().toISOString() });
      Game.log('joined', `${m.name} entró a la plataforma`, { icon:'🎉' });
    }
    // El rol que manda es el de la base (lo define el dueño)
    if(m.role!==role || !!m.owner!==(acc.role==='owner')) m = Store.upsert('team','members',{ id:m.id, role, owner:acc.role==='owner' });
    localStorage.setItem('anm_me', m.id);
    // Limpieza de datos sensibles que quedaron del ingreso con contraseña
    Store.stripFields('team','members',['passHash','passSalt','invite']);
    if(Store.setting('aiToken','') || Store.setting('aiUrl','')){ Store.setSetting('aiToken',''); Store.setSetting('aiUrl',''); }
    return true;
  }
  let pickedNew = false, lastAcc = null;
  App.pickProfile = id=>{
    if(id) Store.upsert('team','members',{ id, email:Auth.email }); else pickedNew = true;
    if(bindMember(lastAcc)) gateState = 'ok'; App.render();
  };

  App.logout = async (sinPreguntar)=>{
    if(!sinPreguntar && !confirm('¿Cerrar sesión en este navegador?')) return;
    localStorage.removeItem('anm_me'); await Auth.logout(); location.reload();
  };

  // ── Notificaciones ───────────────────────────────────────────────────────────
  App.openNotifications = ()=>{
    const me = App.me(), list = App.myNotifications().slice(0,60), unreadAny = list.some(n=>!(n.readBy||[]).includes(me.id));
    UI.modal(`<h2>🔔 Avisos para vos<button class="icon-btn x" data-close>✕</button></h2>
      ${list.length ? `<div class="row" style="gap:8px;margin:-6px 0 10px"><label class="check small"><input type="checkbox" id="nt-all" onchange="document.querySelectorAll('.nt-sel').forEach(c=>c.checked=this.checked)"> Seleccionar todos</label><span class="grow"></span>
          <button class="btn xs d" onclick="App.deleteNotif([...document.querySelectorAll('.nt-sel:checked')].map(c=>c.value))">🗑 Borrar seleccionados</button></div>
        <div class="list">${list.map(n=>{ const from=App.member(n.from); const unread=!(n.readBy||[]).includes(me.id);
        return `<div class="li"><input type="checkbox" class="nt-sel" value="${n.id}" style="width:17px;height:17px">${UI.avatar(from,'sm')}<div class="grow"><div class="${unread?'b':''} prewrap">${unread?'<span style="color:var(--blue)">● </span>':''}${esc(n.text)}</div><div class="xs faint">${esc(from?.name||'')} · ${UI.ago(n.at)}${n.to==='all'?' · para todo el equipo':''}</div></div>
        ${n.link?`<a class="btn xs g" href="${esc(UI.safeUrl(n.link))}" onclick="App.readNotif('${n.id}');UI.close()">Ver</a>`:''}${unread?`<button class="btn xs g" title="Marcar como leído" onclick="App.readNotif('${n.id}');App.openNotifications()">✓</button>`:''}<button class="icon-btn" title="Borrar" onclick="App.deleteNotif(['${n.id}'])">🗑</button></div>`; }).join('')}</div>`
        : '<div class="empty"><div class="big">🔕</div>No tenés avisos</div>'}
      <div class="mfoot">${unreadAny?'<button class="btn g" onclick="App.readNotif();App.openNotifications()">Marcar todo como leído</button>':''}${list.length?'<button class="btn d" style="margin-right:auto" onclick="App.deleteNotif(\'all\')">Borrar todos</button>':''}<button class="btn g" data-close>Cerrar</button></div>`);
  };
  // Cada aviso se marca leído al verlo o con ✓
  App.readNotif = id=>{ const me = App.me();
    App.myNotifications().filter(n=>(!id || n.id===id) && !(n.readBy||[]).includes(me.id)).forEach(n=>Store.upsert('team','notifications',{ id:n.id, readBy:[...(n.readBy||[]), me.id] })); };
  // Borrar avisos (de a uno, seleccionados o todos). Solo se borran para vos: si era para todo el equipo, los demás lo siguen viendo
  App.deleteNotif = ids=>{ const me = App.me(), list = App.myNotifications(), sel = ids==='all' ? list : list.filter(n=>ids.includes(n.id));
    if(!sel.length) return UI.toast('No seleccionaste ningún aviso','👆');
    if(sel.length>1 && !confirm(`¿Borrar ${sel.length} avisos?`)) return;
    sel.forEach(n=>{ if(n.to===me.id) Store.remove('team','notifications',n.id); else Store.upsert('team','notifications',{ id:n.id, hiddenBy:[...(n.hiddenBy||[]), me.id] }); });
    UI.toast(sel.length>1 ? `${sel.length} avisos borrados` : 'Aviso borrado','🗑'); App.openNotifications(); App.render(); };

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


  // ── Si algo falla, mostrarlo en pantalla (en vez de quedar trabado) ───────────
  function showCrash(msg){
    Store.logError?.(msg);
    if(document.getElementById('crash')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="crash" class="toast" style="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:990;max-width:min(680px,94vw);flex-wrap:wrap;border-color:var(--red)">
      ⚠️ <span style="flex:1;min-width:200px">Algo falló: <code>${UI.esc(String(msg).slice(0,180))}</code></span>
      <button class="btn xs p" onclick="location.reload()">Recargar</button><button class="btn xs g" onclick="App.repair()">Reparar</button><button class="btn xs g" onclick="this.parentElement.remove()">✕</button></div>`);
  }
  window.addEventListener('error', e=>showCrash(e.message||e.error));
  window.addEventListener('unhandledrejection', e=>showCrash(e.reason?.message||e.reason));
  // Reparar: borra solo la copia local del navegador (los datos siguen en la base) y recarga
  App.repair = ()=>{
    if(!confirm('Esto borra la copia guardada en este navegador y vuelve a bajar todo de la base de datos. No se pierde nada de lo que ya se sincronizó. ¿Seguimos?')) return;
    try{ ['ops','growth','team'].forEach(d=>localStorage.removeItem((window.ANM_CONFIG.LS_PREFIX||'')+'anm_doc_'+d)); const e = sessionStorage.getItem('anm_entorno'); sessionStorage.clear(); if(e) sessionStorage.setItem('anm_entorno', e); }catch(e){}
    location.href = location.pathname + '#/inicio';
    location.reload();
  };
  if(/[?&]reparar=1/.test(location.search)){ try{ ['ops','growth','team'].forEach(d=>localStorage.removeItem((window.ANM_CONFIG.LS_PREFIX||'')+'anm_doc_'+d)); }catch(e){} history.replaceState(null,'',location.pathname); }

  // ── Versión: si se publicó algo nuevo, recargar (una vez) o avisar ────────────
  let userActed = false, rendering = false;
  ['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev, ()=>{ userActed = true; }, { once:true, capture:true }));
  async function checkVersion(onLoad){
    try{
      const r = await fetch('version.json?t='+Date.now(), { cache:'no-store' }); if(!r.ok) return;
      const { v } = await r.json(); if(!v || !window.ANM_VERSION || v===window.ANM_VERSION) return;
      if(onLoad && !userActed && sessionStorage.getItem('anm_reloaded')!==v){ sessionStorage.setItem('anm_reloaded', v); location.reload(); return; }
      if(!document.getElementById('upd-banner')) document.body.insertAdjacentHTML('beforeend', `<div id="upd-banner" class="toast" style="position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:950">✨ Hay una versión nueva de la plataforma <button class="btn xs p" onclick="location.reload()">Actualizar</button></div>`);
    }catch(e){}
  }

  // ── Arranque ─────────────────────────────────────────────────────────────────
  async function boot(){
    try{ localStorage.removeItem('anm_theme'); delete document.documentElement.dataset.theme; }catch(e){}   // tema claro único
    Store.on(ev=>{
      if(ev.type==='status'){
        const map = { local:'💾 Local', syncing:'⏳ Sincronizando', synced:'● En línea', error:'⚠️ Sin conexión' };
        const col = { synced:'var(--green)', error:'var(--red)', syncing:'var(--yellow)' };
        const el = $('#sync'); if(el){ el.textContent = map[ev.status]; el.style.color = col[ev.status]||''; }
      }
    });
    checkVersion(true); setInterval(()=>checkVersion(false), 5*60*1000);
    // Navegación y re-render listos ANTES de sincronizar (así los clics funcionan desde el primer segundo)
    window.addEventListener('hashchange', ()=>{ UI.close(); App.render(); window.scrollTo(0,0); });
    let pending = false;
    Store.on(ev=>{ if(ev.type!=='change' || rendering) return; if(pending) return; pending = true;
      requestAnimationFrame(()=>{ pending = false; if(!$('#modal').classList.contains('open') && !document.activeElement?.matches('input,textarea,select')) App.render(); }); });
    // 1) ¿Hay sesión de Google? 2) ¿El mail está autorizado? 3) Recién ahí se leen los datos
    if(!Auth.loggedIn()){ gateState = 'login'; App.render(); return; }
    App.render();
    const acc = await Auth.check();
    if(!Auth.loggedIn()){ gateState = 'login'; App.render(); return; }
    if(!acc){ gateState = 'denied'; App.render(); return; }
    lastAcc = acc;
    Store.setDocs(acc.role==='invitado' ? ['ops','team'] : ['ops','growth','team']);
    Store.loadLocal();
    const ready = Store.init();
    const known = (acc.member_id && App.member(acc.member_id)) || App.members().some(x=>(x.email||'').toLowerCase()===Auth.email);
    if(known && bindMember(acc)){ gateState = 'ok'; App.render(); }
    await ready;
    if(gateState!=='ok' && bindMember(acc)) gateState = 'ok';
    App.render();
  }
  window.App = App;
  document.addEventListener('DOMContentLoaded', boot);
})();
