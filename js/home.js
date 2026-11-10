// ─── INICIO, EQUIPO Y AJUSTES ─────────────────────────────────────────────────
(function(){
  const { esc, $ } = UI;

  // ── Inicio ───────────────────────────────────────────────────────────────────
  App.route('inicio', ()=>{
    const me = App.me(), t = UI.today();
    const pf = Game.perf(me.id), wk = Game.weekStart();
    const h = new Date().getHours(), hi = h<12?'Buen día':h<20?'Buenas tardes':'Buenas noches';
    const myTasks = Ops.openTasks().filter(x=>Ops.isMine(x, me.id) && x.due && x.due<=t).sort((a,b)=>a.due.localeCompare(b.due));
    const soon = Ops.openTasks().filter(x=>Ops.isMine(x, me.id) && (!x.due || x.due>t)).sort((a,b)=>(a.due||'9').localeCompare(b.due||'9')).slice(0,4);
    const myMeet = Store.all('ops','meetings').filter(m=>m.date?.slice(0,10)===t && (m.attendees||[]).includes(me.id));
    const myFollow = App.canGrowth() ? Store.all('growth','leads').filter(l=>l.ownerId===me.id && l.nextFollowUp && l.nextFollowUp<=t && Growth.OPEN.includes(l.stage)) : [];
    const myClients = Ops.activeClients().filter(c=>c.ownerId===me.id && Ops.daysSinceUpdate(c)>7);
    const focus = myTasks.length + myMeet.length + myFollow.length + myClients.length;
    const board = Game.leaderboard(wk);
    const alerts = [...Ops.alerts(), ...(App.canGrowth()?Growth.alerts():[])].filter(a=>a.level!=='info');
    const notes = App.myNotifications().filter(n=>!(n.readBy||[]).includes(me.id));
    // Próximamente: tareas abiertas que vencen en los próximos 14 días (de todo el equipo) y reuniones de la semana
    const hasta = UI.addDays(t, 14);
    const prox = [
      ...Ops.openTasks().filter(x=>x.due && x.due>t && x.due<=hasta).map(x=>({ d:x.due, html:Ops.taskRow(x) })),
      ...Store.all('ops','meetings').filter(m=>(m.date||'').slice(0,10)>t && (m.date||'').slice(0,10)<=UI.addDays(t,7)).map(m=>({ d:m.date.slice(0,10), html:`<div class="li click" onclick="Ops.viewMeeting('${m.id}')"><span>🤝</span><div class="grow"><div class="b small">${esc(m.title)}</div><div class="xs faint">${esc(Ops.clientName(m.clientId))}${UI.time(m.date)?' · '+UI.time(m.date):''}</div></div></div>` })),
    ].sort((a,b)=>a.d.localeCompare(b.d));
    const porDia = {}; prox.forEach(x=>{ (porDia[x.d] = porDia[x.d]||[]).push(x.html); });

    const html = `
      <div class="hero" style="margin-bottom:24px">
        <div class="grow" style="min-width:240px"><div class="small muted b">${UI.DAYS[new Date().getDay()]} ${new Date().getDate()} de ${UI.MONTHS[new Date().getMonth()].toLowerCase()}</div>
          <h2>${hi}, ${esc(me.name.split(' ')[0])} 👋</h2>
          <div class="muted" style="margin-top:4px">${focus ? `Tenés <b style="color:var(--text)">${focus} cosa${focus>1?'s':''}</b> para hoy.` : 'No tenés pendientes urgentes. ¡Buen momento para adelantar!'}</div>
          <div class="row wrap" style="margin-top:16px"><button class="btn p" onclick="App.quickAdd()">＋ Crear</button><button class="btn g" onclick="Ops.updateClient()">📡 Actualizar un cliente</button>${notes.length?`<button class="btn g" onclick="App.openNotifications()">🔔 ${notes.length} aviso${notes.length>1?'s':''}</button>`:''}</div></div>
        <div style="min-width:260px;flex:0 1 340px"><div class="xs faint b" style="letter-spacing:1px;margin-bottom:6px">CÓMO VENÍS ESTE MES</div><div class="row" style="margin-bottom:10px"><span class="lvl" style="background:${pf.color};font-size:13px;min-width:52px">${pf.pct!=null?pf.pct+'%':'—'}</span><div class="grow"><div class="b" style="color:${pf.color}">${esc(pf.label)}</div><div class="xs faint b">${pf.pct!=null?`${pf.resolved} de ${pf.assigned} tareas asignadas resueltas`:'Todavía no te vencieron tareas este mes'}${pf.overdue?` · ${pf.overdue} vencida${pf.overdue>1?'s':''}`:''}</div></div></div>
          <div class="xpbar"><div style="width:${pf.pct??0}%;background:${pf.color}"></div></div></div>
      </div>
      ${Ops.pendingMinutas().map(m=>`<div class="alert info" style="margin-bottom:18px"><div class="ai">📥</div><div class="grow"><div class="at">Hay ${m.kind==='status'?'un status listo':'una minuta lista'} para cargar: ${esc(m.title)} (${esc(m.client||'Interna')})</div><div class="ad">${m.tasks.length} tareas${m.kind==='status'?' ordenadas por área':' con responsable y fecha'}.</div></div><button class="btn sm p" onclick="Ops.importMinuta('${m.id}')">Revisar y cargar</button></div>`).join('')}
      <div class="grid g3">
        <div class="span2 col" style="gap:18px">
          <div class="card"><div class="card-h"><h3>🎯 Tu foco de hoy</h3><span class="grow"></span><a class="btn xs g" href="#/ops/tareas">Todas mis tareas</a></div>
            ${focus ? `<div class="list">
              ${myMeet.map(m=>`<div class="li click" onclick="Ops.viewMeeting('${m.id}')"><span>🤝</span><div class="grow"><div class="b small">${esc(m.title)}</div><div class="xs faint">${UI.time(m.date)} · ${esc(Ops.clientName(m.clientId))}</div></div></div>`).join('')}
              ${myTasks.map(x=>Ops.taskRow(x)).join('')}
              ${myFollow.map(l=>`<div class="li click" onclick="App.go('#/crecimiento/lead/${l.id}')"><span>📞</span><div class="grow"><div class="b small">Seguimiento: ${esc(l.company)}</div><div class="xs faint">${esc(l.nextAction||'')}</div></div><span class="tag ${l.nextFollowUp<t?'t-red':'t-yellow'}">${UI.fdate(l.nextFollowUp)}</span></div>`).join('')}
              ${myClients.map(c=>`<div class="li click" onclick="Ops.updateClient('${c.id}')"><span>📡</span><div class="grow"><div class="b small">Actualizar ${esc(c.name)}</div><div class="xs faint">${Ops.daysSinceUpdate(c)>=999?'Sin seguimiento todavía':Ops.daysSinceUpdate(c)+' días sin novedades'}</div></div></div>`).join('')}
            </div>` : '<div class="empty"><div class="big">🌤️</div>Nada urgente para hoy</div>'}
            ${soon.length?`<div class="sec-t" style="margin-top:18px">Lo que viene</div><div class="list">${soon.map(x=>Ops.taskRow(x)).join('')}</div>`:''}</div>
          <div class="card"><div class="card-h"><h3>🚨 Alertas del equipo</h3><span class="sub">${alerts.length}</span>${App.unitFilter?`<span class="tag t-yellow" title="Hay un filtro de unidad activo">solo ${esc(App.unit(App.unitFilter).label)}</span>`:''}<span class="grow"></span><a class="btn xs g" href="#/ops/alertas">Ver todas</a></div>
            ${alerts.length ? alerts.slice(0,5).map(Ops.alertRow).join('') : '<div class="empty small">Sin alertas. Todo al día 🎉</div>'}</div>
          <div class="card"><div class="card-h"><h3>📅 Próximamente</h3><span class="sub">próximos 14 días</span><span class="grow"></span><a class="btn xs g" href="#/ops/calendario">Calendario</a></div>
            ${prox.length ? Object.entries(porDia).map(([d,items])=>`<div class="xs faint b" style="margin:14px 0 4px">${d===UI.addDays(t,1)?'Mañana':UI.DAYS[UI.parse(d).getDay()]+' '+UI.parse(d).getDate()+'/'+(UI.parse(d).getMonth()+1)}</div><div class="list">${items.join('')}</div>`).join('') : '<div class="empty small">No hay nada que venza en los próximos 14 días</div>'}</div>
        </div>
        <div class="col" style="gap:18px">
          <div class="card"><div class="card-h"><h3>📊 Cómo viene el equipo</h3><span class="sub">este mes</span></div>
            ${board.map((r,i)=>`<div class="rank">${UI.avatar(r.m)}<div class="grow"><div class="b small">${esc(r.m.name)}</div><div class="xs faint"><span style="color:${r.p.color}">${esc(r.p.label)}</span>${r.p.pct!=null?` · ${r.p.resolved}/${r.p.assigned} resueltas`:''}${r.p.overdue?` · ${r.p.overdue} vencida${r.p.overdue>1?'s':''}`:''}</div></div><b style="color:${r.p.color}">${r.p.pct!=null?r.p.pct+'%':'—'}</b></div>`).join('')}</div>
          <div class="card small"><div class="card-h"><h3>📈 Cómo se mide</h3></div>
            <p class="xs muted" style="margin-bottom:10px">Tareas <b>resueltas</b> sobre tareas <b>asignadas</b> en el mes: cuentan las que te vencían hasta hoy y las que resolviste. Se reinicia cada mes.</p>
            ${Game.SCALE.map(([min,name,col])=>{ const cur = pf.label===name; return `<div class="row" style="padding:5px 8px;border-radius:8px;${cur?'background:var(--blue-d)':''}"><span class="health" style="background:${col};box-shadow:none"></span><span class="grow ${cur?'b':'muted'}">${name}</span><b class="${cur?'':'faint'}">${min?min+'% o más':'menos de 40%'}</b></div>`; }).join('')}</div>
        </div>
      </div>`;
    return { title:'Inicio', crumb:'Plataforma ANM', html };
  });

  // ── Equipo ───────────────────────────────────────────────────────────────────
  App.route('equipo', ()=>{
    const ms = App.members(), admin = App.isAdmin();
    const cards = ms.map(m=>{
      const pf = Game.perf(m.id);
      const tasks = Ops.openTasks().filter(t=>Ops.isMine(t, m.id)).length;
      const clients = Ops.activeClients().filter(c=>c.ownerId===m.id || (c.teamIds||[]).includes(m.id));
      return `<div class="card"><div class="row" style="margin-bottom:14px">${UI.avatar(m,'lg')}<div class="grow"><div class="b" style="font-size:15px">${esc(m.name)}</div>${m.title?`<div class="small muted">${esc(m.title)}</div>`:''}<div class="xs faint b">${App.owner()?.id===m.id?'👑 Dueño principal · ':''}${esc(App.ROLES[m.role]||m.role)}${m.joinedAt?'':' · <span style="color:var(--yellow)">todavía no entró</span>'}${m.email?'':' · <span style="color:var(--orange)">sin Gmail</span>'}</div></div><span class="lvl" title="${esc(pf.label)} este mes" style="background:${pf.color};font-size:13px;min-width:52px">${pf.pct!=null?pf.pct+'%':'—'}</span></div>
        <div class="row wrap" style="margin-bottom:12px">${App.unitTags(m.units)}</div>
        <div class="grid g3 small" style="gap:8px;margin-bottom:14px"><div><div class="b">✅ ${pf.resolved}/${pf.assigned}</div><div class="xs faint">resueltas (mes)</div></div><div><div class="b">${tasks}</div><div class="xs faint">pendientes</div></div><div><div class="b">${pf.overdue}</div><div class="xs faint">vencidas</div></div></div>
        <div class="xs muted" style="margin-bottom:14px">${clients.length?'Cuentas: '+clients.map(c=>esc(c.name)).join(', '):'Sin cuentas asignadas'}</div>
        ${App.canManage(m)||m.id===App.me().id?`<div class="row wrap"><button class="btn sm g" onclick="Team.edit('${m.id}', ${m.id===App.me().id})">✎ Editar</button></div>`:''}</div>`;
    }).join('');
    return { title:'Equipo', crumb:'Invitá a colaborar', html:`
      <div class="toolbar"><div class="small muted grow">Cada persona entra con su cuenta de Google. Solo pueden entrar los Gmails que autorizó el 👑 dueño principal, y él define el rol de cada uno: <b>Socio/a</b> (todo + Finanzas), <b>Equipo</b> (Operaciones y Ventas; puede editar y reasignar tareas) o <b>Invitado/a</b> (solo Operaciones, ideal freelancers).</div>
      ${admin?'<button class="btn p" onclick="Team.edit()">＋ Agregar persona</button>':''}</div>
      ${App.isOwner()?`<div class="card" style="margin-bottom:18px"><div class="card-h"><h3>🔐 Accesos: Gmails que pueden entrar</h3><span class="grow"></span><button class="btn sm p" onclick="Team.addAccess()">＋ Autorizar un Gmail</button></div>
        <div id="acc-list"><div class="small faint">Cargando…</div></div>
        <p class="xs faint" style="margin-top:10px">Solo vos ves y cambiás esta lista: la base de datos rechaza cualquier cambio que no venga de tu cuenta. Si sacás a alguien, deja de poder entrar al instante.</p></div>`:''}
      ${window.Asignar?Asignar.card():''}
      <div class="grid g-auto">${cards}</div>`, after:()=>{ if(App.isOwner()) Team.loadAccess(); } };
  });

  // ── Ajustes ──────────────────────────────────────────────────────────────────
  App.route('ajustes', ()=>{
    const me = App.me(), admin = App.isAdmin();
    return { title:'Ajustes', crumb:'', html:`<div class="grid g2">
      <div class="card"><div class="card-h"><h3>Mi perfil</h3></div>
        <div class="row" style="margin-bottom:16px">${UI.avatar(me,'lg')}<div><div class="b">${esc(me.name)}</div><div class="xs faint">${esc(App.ROLES[me.role])}</div></div></div>
        <div class="xs faint" style="margin:-8px 0 14px">Entrás con Google: ${esc(Auth.email)}</div>
        <div class="row wrap"><button class="btn g" onclick="Team.edit('${me.id}', true)">✎ Editar perfil</button><button class="btn d" onclick="App.logout()">Cerrar sesión</button></div></div>
      <div class="card"><div class="card-h"><h3>Unidades de negocio</h3>${admin?'<span class="grow"></span><button class="btn xs g" onclick="Team.editUnits()">Editar</button>':''}</div>
        <div class="row wrap">${App.unitTags(App.units().map(u=>u.id))}</div>
        <p class="xs faint" style="margin-top:12px">Sirven para filtrar Operaciones y Ventas (Social Media, Pauta, Branding, Web…).</p></div>
      <div class="card"><div class="card-h"><h3>Datos y respaldo</h3><span class="grow"></span><span class="sync" id="sync2">${esc(Store.status)}</span></div>
        <p class="small muted" style="margin-bottom:14px">Todo se guarda en la nube (Supabase) y se sincroniza entre el equipo cada ~20 segundos. También queda una copia en este navegador por si se corta internet.</p>
        <div class="row wrap"><button class="btn g" onclick="Store.syncNow().then(()=>UI.toast('Sincronizado','☁️'))">⟳ Sincronizar ahora</button><button class="btn g" onclick="App.repair()">🛠 Reparar (si algo se traba)</button><button class="btn g" onclick="UI.download('anm-plataforma-'+UI.today()+'.json', Store.exportAll())">⇣ Descargar respaldo</button>
        ${admin?'<label class="btn g" style="cursor:pointer">⇡ Restaurar respaldo<input type="file" accept=".json" style="display:none" onchange="Team.restore(this)"></label>':''}</div></div>
      <div class="card"><div class="card-h"><h3>📧 Recordatorios por mail</h3></div>
        <p class="small muted" style="margin-bottom:10px">Todos los días a las 8 h cada persona recibe su resumen (tareas vencidas, de hoy y próximas, reuniones y seguimientos) y cada hora los avisos nuevos (tareas asignadas, alertas). Salen desde el Gmail de un socio con Google Apps Script.</p>
        <div class="small" style="margin-bottom:10px">Tus mails: <b>${me.email?(me.emailReminders===false?'desactivados':'activados · '+esc(me.email)):'<span style="color:var(--orange)">falta cargar tu email</span>'}</b> <a href="#" onclick="Team.edit('${me.id}', true);return false">cambiar</a></div>
        ${admin?(()=>{ const sin = App.members().filter(x=>!x.email); return sin.length?`<div class="alert warn" style="margin:0"><div class="ai">⚠️</div><div class="ad">Sin email cargado (no reciben mails): ${sin.map(x=>esc(x.name)).join(', ')}</div></div>`:'<div class="small" style="color:var(--green)">✓ Todo el equipo tiene email cargado.</div>'; })():''}
        ${admin?`<p class="xs faint" style="margin-top:10px">Instalación: <a href="https://github.com/diogenes-ortiz/anm-plataforma/blob/main/apps-script/Recordatorios.gs" target="_blank">apps-script/Recordatorios.gs</a> (instrucciones arriba del archivo).</p>`:''}</div>
      <div class="card"><div class="card-h"><h3>🔒 Sobre la seguridad</h3></div>
        <p class="small muted">Cada persona entra con su cuenta de Google y solo si el dueño autorizó su Gmail. La base de datos rechaza cualquier lectura o escritura sin sesión, y Finanzas solo la pueden leer los socios, aunque alguien conozca la dirección de la base.</p>
        <p class="small muted" style="margin-top:8px">Si no usás la plataforma por 14 días, la sesión se cierra sola en ese navegador.</p></div>
    </div>` };
  });

  // ── Acciones de equipo ──────────────────────────────────────────────────────
  const Team = {
    edit(id, self){
      const m0 = id ? App.member(id) : { role:'equipo', color:UI.COLORS[App.members().length % UI.COLORS.length], units:[] };
      const m = { ...m0, emailReminders: m0.emailReminders!==false };
      const admin = App.isAdmin();
      UI.form({ title: id ? (self?'Mi perfil':'Editar '+m.name) : 'Agregar persona', values:m, fields:[
        { k:'name', label:'Nombre', req:true, half:true }, { k:'title', label:'Puesto', half:true, placeholder:'Ej: Social Media Manager' },
        { k:'email', label:'Gmail', type:'email', half:true, hint:App.isOwner()?'Para que pueda entrar, autorizalo en “Accesos”.':'' }, { k:'phone', label:'WhatsApp', half:true, placeholder:'54911…' },
        { k:'units', label:'Unidades en las que trabaja', type:'multi', options:App.unitOpts() },
        ...(admin ? [{ k:'cuentas', label:'Cuentas que trabaja', type:'multi', options:Ops.activeClients().map(c=>[c.id,c.name]), default:id ? Ops.activeClients().filter(c=>c.ownerId===id || (c.teamIds||[]).includes(id)).map(c=>c.id) : [], hint:'Podés asignarlas antes de que entre: cuando entre ya ve sus cuentas y tareas.' }] : []),
        { k:'color', label:'Color', type:'color', half:true },
        { k:'emailReminders', label:'Mails', type:'check', text:'Recibir recordatorios y avisos por mail', default:true, half:true },
      ],
      danger: id && App.canManage(m) && id!==App.me().id && App.owner()?.id!==id ? { label:'Quitar del equipo', fn:()=>setTimeout(()=>Team.removeMember(id), 60) } : null,
      onSubmit:v=>{
        if(v.email) v.email = v.email.trim().toLowerCase();
        const cuentas = v.cuentas; delete v.cuentas;
        const r = Store.upsert('team','members',{ ...m, ...v });
        // Cuentas asignadas: se suma/saca a la persona del equipo de cada cliente (antes de que entre, así ya ve todo)
        if(cuentas) Ops.activeClients().forEach(c=>{ const tiene = (c.teamIds||[]).includes(r.id), quiere = cuentas.includes(c.id);
          if(quiere && !tiene) Store.upsert('ops','clients',{ id:c.id, teamIds:[...(c.teamIds||[]), r.id] });
          if(!quiere && tiene && c.ownerId!==r.id) Store.upsert('ops','clients',{ id:c.id, teamIds:(c.teamIds||[]).filter(x=>x!==r.id) }); });
        if(!id){ Game.log('member_invited', `Sumó a ${v.name} al equipo`, { icon:'👋' }); UI.toast(`${v.name} ya está cargado: le podés asignar tareas`,'👤');
          if(App.isOwner() && v.email) setTimeout(()=>{ if(confirm(`¿Autorizás ya a ${v.email} para que entre a la plataforma?`)) Team.addAccess({ email:v.email, member_id:r.id }); }, 60); }
        App.render();
      } });
    },
    // Quitar a alguien: antes se reasignan sus tareas abiertas (BUG-14)
    removeMember(id){
      const m = App.member(id); if(!m) return;
      const abiertas = Ops.openTasks().filter(t=>t.assigneeId===id);
      UI.form({ title:`Quitar a ${m.name}`, submit:'Quitar del equipo', fields:[
        { k:'h', type:'html', html:`<p class="small muted">Su historial se conserva, pero ya no va a poder entrar.${abiertas.length?` Tiene <b>${abiertas.length} tarea${abiertas.length>1?'s':''} abierta${abiertas.length>1?'s':''}</b>: elegí a quién pasárselas.`:''}</p>` },
        ...(abiertas.length ? [{ k:'to', label:'Pasar sus tareas a', type:'select', options:[['','— Dejarlas sin responsable —'], ...App.members().filter(x=>x.id!==id).map(x=>[x.id,x.name])] }] : []),
      ], onSubmit:v=>{
        abiertas.forEach(t=>Store.upsert('ops','tasks',{ id:t.id, assigneeId:v.to||'' }));
        if(v.to && abiertas.length) App.notify(v.to, `Te pasaron ${abiertas.length} tarea(s) de ${m.name}`, '#/ops/tareas');
        Store.remove('team','members',id); if(App.isOwner() && m.email) Auth.removeAccess(m.email).catch(()=>{});
        UI.toast(`${m.name} ya no está en el equipo`,'👋'); App.render(); } });
    },
    // ── Accesos (solo el dueño) ──
    async loadAccess(){
      const el = document.getElementById('acc-list'); if(!el) return;
      try{
        const rows = await Auth.listAccess(), RL = { owner:'👑 Dueño', socio:'Socio/a', equipo:'Equipo', invitado:'Invitado/a' };
        el.innerHTML = rows.length ? `<div class="list">${rows.map(r=>{ const m = (r.member_id && App.member(r.member_id)) || App.members().find(x=>(x.email||'')===r.email);
          return `<div class="li"><div class="grow"><div class="b small">${esc(r.email)}</div><div class="xs faint">${m?esc(m.name):'todavía no entró'}</div></div>
            ${r.role==='owner' ? '<span class="tag">👑 Dueño</span>' : `<select class="inp sm" style="width:auto" onchange="Team.setAccessRole('${esc(r.email)}', this.value)">${['socio','equipo','invitado'].map(k=>`<option value="${k}" ${r.role===k?'selected':''}>${RL[k]}</option>`).join('')}</select>
            <button class="icon-btn" title="Quitar acceso" onclick="Team.removeAccess('${esc(r.email)}')">🗑</button>`}</div>`; }).join('')}</div>`
          : '<div class="small faint">Todavía no hay Gmails autorizados.</div>';
      }catch(e){ el.innerHTML = `<div class="small" style="color:var(--red)">${esc(e.message)}</div>`; }
    },
    addAccess(pre={}){
      const sin = App.members().filter(x=>!x.email || x.email===pre.email);
      UI.form({ title:'＋ Autorizar un Gmail', submit:'Autorizar', values:{ role:'equipo', ...pre }, fields:[
        { k:'email', label:'Gmail', type:'email', req:true, placeholder:'nombre@gmail.com' },
        { k:'role', label:'Rol', type:'select', options:[['equipo','Equipo (Operaciones y Ventas)'],['invitado','Invitado/a (solo Operaciones)'],['socio','Socio/a (todo + Finanzas)']] },
        { k:'member_id', label:'Perfil del equipo (opcional)', type:'select', options:[['','— Lo elige al entrar —'], ...App.members().filter(x=>!x.email || x.email===pre.email || x.id===pre.member_id).map(x=>[x.id,x.name])] },
      ], onSubmit:v=>{ (async()=>{
          try{ await Auth.saveAccess(v); if(v.member_id) Store.upsert('team','members',{ id:v.member_id, email:v.email.trim().toLowerCase() });
            UI.toast(`${v.email} ya puede entrar`,'🔐'); Team.loadAccess(); }
          catch(e){ UI.toast('No se pudo autorizar: '+e.message,'⚠️'); } })(); } });
    },
    async setAccessRole(email, role){
      try{ const rows = await Auth.listAccess(), r = rows.find(x=>x.email===email); await Auth.saveAccess({ ...r, role }); UI.toast('Rol actualizado','🔐'); }
      catch(e){ UI.toast('No se pudo cambiar: '+e.message,'⚠️'); }
      Team.loadAccess();
    },
    async removeAccess(email){
      if(!confirm(`¿Quitar el acceso de ${email}? Deja de poder entrar (su historial se conserva).`)) return;
      try{ await Auth.removeAccess(email); UI.toast('Acceso quitado','🔐'); }catch(e){ UI.toast(e.message,'⚠️'); }
      Team.loadAccess();
    },
    editUnits(){
      UI.form({ title:'Unidades de negocio', fields:[
        { k:'txt', label:'Una por línea — formato: nombre | color', type:'textarea', rows:8, default:App.units().map(u=>`${u.label} | ${u.color}`).join('\n'), hint:'Ej: Social Media | #1A73E8. Si renombrás una, se mantiene lo cargado.' },
      ], onSubmit:v=>{
        const old = App.units();
        const next = v.txt.split('\n').map(s=>s.trim()).filter(Boolean).map((line,i)=>{
          const [label, color] = line.split('|').map(s=>s.trim());
          const prev = old.find(u=>u.label===label) || old[i];
          return { id:prev?.id || label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'').slice(0,20) || Store.uid(), label, color:color||prev?.color||UI.COLORS[i%UI.COLORS.length] };
        });
        Store.setSetting('units', next); App.render();
      } });
    },
    restore(input){
      const f = input.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{ try{ Store.importAll(JSON.parse(r.result)); UI.toast('Respaldo restaurado (se fusionó con lo actual)','⇡'); App.render(); }catch(e){ UI.toast('Archivo inválido','⚠️'); } };
      r.readAsText(f);
    },
  };
  window.Team = Team;
})();
