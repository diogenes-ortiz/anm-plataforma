// ─── INICIO, EQUIPO Y AJUSTES ─────────────────────────────────────────────────
(function(){
  const { esc, $ } = UI;

  // ── Inicio ───────────────────────────────────────────────────────────────────
  App.route('inicio', ()=>{
    const me = App.me(), t = UI.today();
    const xp = Game.xpOf(me.id), lv = Game.level(xp), wk = Game.weekStart(), wxp = Game.xpOf(me.id, wk), st = Game.streak(me.id);
    const h = new Date().getHours(), hi = h<12?'Buen día':h<20?'Buenas tardes':'Buenas noches';
    const myTasks = Ops.openTasks().filter(x=>x.assigneeId===me.id && x.due && x.due<=t).sort((a,b)=>a.due.localeCompare(b.due));
    const soon = Ops.openTasks().filter(x=>x.assigneeId===me.id && (!x.due || x.due>t)).sort((a,b)=>(a.due||'9').localeCompare(b.due||'9')).slice(0,4);
    const myMeet = Store.all('ops','meetings').filter(m=>m.date?.slice(0,10)===t && (m.attendees||[]).includes(me.id));
    const myFollow = App.canGrowth() ? Store.all('growth','leads').filter(l=>l.ownerId===me.id && l.nextFollowUp && l.nextFollowUp<=t && Growth.OPEN.includes(l.stage)) : [];
    const myClients = Ops.activeClients().filter(c=>c.ownerId===me.id && Ops.daysSinceUpdate(c)>7);
    const focus = myTasks.length + myMeet.length + myFollow.length + myClients.length;
    const ms = Game.missions(), done = ms.filter(m=>m.p>=1).length;
    const board = Game.leaderboard(wk);
    const alerts = [...Ops.alerts(), ...(App.canGrowth()?Growth.alerts():[])].filter(a=>a.level!=='info');
    const notes = App.myNotifications().filter(n=>!(n.readBy||[]).includes(me.id));
    const feed = Store.all('team','activity').sort((a,b)=>b.at.localeCompare(a.at)).slice(0,14);

    const html = `
      <div class="hero" style="margin-bottom:24px">
        <div class="grow" style="min-width:240px"><div class="small muted b">${UI.DAYS[new Date().getDay()]} ${new Date().getDate()} de ${UI.MONTHS[new Date().getMonth()].toLowerCase()}</div>
          <h2>${hi}, ${esc(me.name.split(' ')[0])} 👋</h2>
          <div class="muted" style="margin-top:4px">${focus ? `Tenés <b style="color:var(--text)">${focus} cosa${focus>1?'s':''}</b> para hoy.` : 'No tenés pendientes urgentes. ¡Buen momento para adelantar!'}</div>
          <div class="row wrap" style="margin-top:16px"><button class="btn p" onclick="App.quickAdd()">＋ Crear</button><button class="btn g" onclick="Ops.updateClient()">📡 Actualizar un cliente</button>${notes.length?`<button class="btn g" onclick="App.openNotifications()">🔔 ${notes.length} aviso${notes.length>1?'s':''}</button>`:''}</div></div>
        <div style="min-width:260px;flex:0 1 340px"><div class="row" style="margin-bottom:10px"><span class="lvl">${lv.n}</span><div class="grow"><div class="b">${esc(lv.name)}</div><div class="xs faint b">${xp} XP${lv.next?` · faltan ${lv.toNext} para nivel ${lv.n+1}`:''}</div></div></div>
          <div class="xpbar"><div style="width:${lv.pct}%"></div></div>
          <div class="row" style="margin-top:14px;gap:22px"><div><div class="b" style="font-size:20px">🔥 ${st}</div><div class="xs faint b">DÍAS DE RACHA</div></div><div><div class="b" style="font-size:20px">+${wxp}</div><div class="xs faint b">XP ESTA SEMANA</div></div><div><div class="b" style="font-size:20px">${done}/${ms.length}</div><div class="xs faint b">MISIONES</div></div></div></div>
      </div>
      <div class="grid g3">
        <div class="span2 col" style="gap:18px">
          <div class="card"><div class="card-h"><h3>🎯 Tu foco de hoy</h3><span class="grow"></span><a class="btn xs g" href="#/ops/tareas">Todas mis tareas</a></div>
            ${focus ? `<div class="list">
              ${myMeet.map(m=>`<div class="li click" onclick="Ops.editMeeting('${m.id}')"><span>🤝</span><div class="grow"><div class="b small">${esc(m.title)}</div><div class="xs faint">${UI.time(m.date)} · ${esc(Ops.clientName(m.clientId))}</div></div></div>`).join('')}
              ${myTasks.map(x=>Ops.taskRow(x)).join('')}
              ${myFollow.map(l=>`<div class="li click" onclick="App.go('#/crecimiento/lead/${l.id}')"><span>📞</span><div class="grow"><div class="b small">Seguimiento: ${esc(l.company)}</div><div class="xs faint">${esc(l.nextAction||'')}</div></div><span class="tag ${l.nextFollowUp<t?'t-red':'t-yellow'}">${UI.fdate(l.nextFollowUp)}</span></div>`).join('')}
              ${myClients.map(c=>`<div class="li click" onclick="Ops.updateClient('${c.id}')"><span>📡</span><div class="grow"><div class="b small">Actualizar ${esc(c.name)}</div><div class="xs faint">${Ops.daysSinceUpdate(c)>=999?'Sin seguimiento todavía':Ops.daysSinceUpdate(c)+' días sin novedades'}</div></div><span class="tag t-yellow">+${Game.XP.client_update} XP</span></div>`).join('')}
            </div>` : '<div class="empty"><div class="big">🌤️</div>Nada urgente para hoy</div>'}
            ${soon.length?`<div class="sec-t" style="margin-top:18px">Lo que viene</div><div class="list">${soon.map(x=>Ops.taskRow(x)).join('')}</div>`:''}</div>
          <div class="card"><div class="card-h"><h3>🚨 Alertas del equipo</h3><span class="sub">${alerts.length}</span><span class="grow"></span><a class="btn xs g" href="#/ops/alertas">Ver todas</a></div>
            ${alerts.length ? alerts.slice(0,5).map(Ops.alertRow).join('') : '<div class="empty small">Sin alertas. Todo al día 🎉</div>'}</div>
          <div class="card"><div class="card-h"><h3>⚡ Actividad del equipo</h3></div>
            ${feed.length?`<div class="list">${feed.map(a=>`<div class="li">${UI.avatar(App.member(a.by),'sm')}<div class="grow small"><b>${esc(App.member(a.by)?.name||'')}</b> <span class="muted">${esc(a.text)}</span></div>${a.xp?`<span class="xs b" style="color:var(--yellow)">+${a.xp}</span>`:''}<span class="xs faint" style="min-width:70px;text-align:right">${UI.ago(a.at)}</span></div>`).join('')}</div>`:'<div class="empty small">Todavía no hay actividad</div>'}</div>
        </div>
        <div class="col" style="gap:18px">
          <div class="card"><div class="card-h"><h3>🏁 Misiones de la semana</h3><span class="sub">${done}/${ms.length}</span></div>
            ${ms.map(m=>`<div class="mission ${m.p>=1?'done':''}"><div class="mi">${m.p>=1?'✅':m.e}</div><div class="grow"><div class="b small mt">${esc(m.t)}</div><div class="xs faint">${esc(m.d)}</div>${m.p<1?`<div class="bar" style="margin-top:6px;height:5px"><div style="width:${Math.round(m.p*100)}%"></div></div>`:''}</div></div>`).join('')}</div>
          <div class="card"><div class="card-h"><h3>🏆 Ranking semanal</h3></div>
            ${board.map((r,i)=>`<div class="rank"><span class="pos">${['🥇','🥈','🥉'][i]||i+1}</span>${UI.avatar(r.m)}<div class="grow"><div class="b small">${esc(r.m.name)}</div><div class="xs faint">Nv ${Game.level(Game.xpOf(r.m.id)).n} · 🔥${Game.streak(r.m.id)}</div></div><b>${r.xp} XP</b></div>`).join('')}</div>
          <div class="card"><div class="card-h"><h3>🎖️ Tus insignias</h3><span class="sub">${Game.BADGES.filter(b=>b.ok(me.id)).length}/${Game.BADGES.length}</span></div>
            <div class="badge-g">${Game.BADGES.map(b=>`<div class="bdg ${b.ok(me.id)?'':'locked'}" title="${esc(b.d)}"><div class="e">${b.e}</div><div class="n">${esc(b.n)}</div></div>`).join('')}</div></div>
          <div class="card small"><div class="card-h"><h3>¿Cómo se gana XP?</h3></div>
            ${[['Completar una tarea (a tiempo +5)',Game.XP.task_done],['Actualizar un cliente',Game.XP.client_update],['Cargar una minuta',Game.XP.minuta],['Aprobar un calendario',Game.XP.calendar_approved],['Registrar un contacto comercial',Game.XP.interaction],['Avanzar una oportunidad',Game.XP.lead_advance],['Ganar un cliente',Game.XP.lead_won]].map(([l,x])=>`<div class="row" style="padding:5px 0"><span class="grow muted">${l}</span><b style="color:var(--yellow)">+${x}</b></div>`).join('')}</div>
        </div>
      </div>`;
    return { title:'Inicio', crumb:'Plataforma ANM', html };
  });

  // ── Equipo ───────────────────────────────────────────────────────────────────
  App.route('equipo', ()=>{
    const ms = App.members(), admin = App.isAdmin();
    const cards = ms.map(m=>{
      const lv = Game.level(Game.xpOf(m.id));
      const tasks = Ops.openTasks().filter(t=>t.assigneeId===m.id).length;
      const clients = Ops.activeClients().filter(c=>c.ownerId===m.id || (c.teamIds||[]).includes(m.id));
      return `<div class="card"><div class="row" style="margin-bottom:14px">${UI.avatar(m,'lg')}<div class="grow"><div class="b" style="font-size:15px">${esc(m.name)}</div><div class="xs faint b">${esc(App.ROLES[m.role]||m.role)}${m.joinedAt?'':' · <span style="color:var(--yellow)">invitación pendiente</span>'}</div></div><span class="lvl" title="${esc(lv.name)}">${lv.n}</span></div>
        <div class="row wrap" style="margin-bottom:12px">${App.unitTags(m.units)}</div>
        <div class="grid g3 small" style="gap:8px;margin-bottom:14px"><div><div class="b">${lv.xp}</div><div class="xs faint">XP</div></div><div><div class="b">${tasks}</div><div class="xs faint">tareas</div></div><div><div class="b">🔥 ${Game.streak(m.id)}</div><div class="xs faint">racha</div></div></div>
        <div class="xs muted" style="margin-bottom:14px">${clients.length?'Cuentas: '+clients.map(c=>esc(c.name)).join(', '):'Sin cuentas asignadas'}</div>
        ${admin?`<div class="row wrap"><button class="btn sm p" onclick="Team.share('${m.id}')">🔗 Link de acceso</button><button class="btn sm g" onclick="Team.edit('${m.id}')">✎ Editar</button></div>`:''}</div>`;
    }).join('');
    return { title:'Equipo', crumb:'Invitá a colaborar', html:`
      <div class="toolbar"><div class="small muted grow">Cada persona entra con su link personal. Los roles definen qué ve cada uno: <b>Socio/a</b> (dueños: todo + Finanzas, invitan y asignan tareas a cualquiera), <b>Equipo</b> (Operaciones + Crecimiento; se asigna tareas a sí mismo), <b>Invitado/a</b> (solo Operaciones, ideal freelancers). Finanzas no aparece para quien no es socio.</div>
      ${admin?'<button class="btn p" onclick="Team.edit()">＋ Invitar persona</button>':''}</div>
      <div class="grid g-auto">${cards}</div>` };
  });

  // ── Ajustes ──────────────────────────────────────────────────────────────────
  App.route('ajustes', ()=>{
    const me = App.me(), admin = App.isAdmin();
    return { title:'Ajustes', crumb:'', html:`<div class="grid g2">
      <div class="card"><div class="card-h"><h3>Mi perfil</h3></div>
        <div class="row" style="margin-bottom:16px">${UI.avatar(me,'lg')}<div><div class="b">${esc(me.name)}</div><div class="xs faint">${esc(App.ROLES[me.role])}</div></div></div>
        <div class="row wrap"><button class="btn g" onclick="Team.edit('${me.id}', true)">✎ Editar perfil</button><button class="btn g" onclick="App.toggleTheme()">◐ Modo claro / oscuro</button><button class="btn d" onclick="App.logout()">Cerrar sesión</button></div></div>
      <div class="card"><div class="card-h"><h3>Unidades de negocio</h3>${admin?'<span class="grow"></span><button class="btn xs g" onclick="Team.editUnits()">Editar</button>':''}</div>
        <div class="row wrap">${App.unitTags(App.units().map(u=>u.id))}</div>
        <p class="xs faint" style="margin-top:12px">Sirven para filtrar Operaciones y Crecimiento (Social Media, Pauta, Branding, Web…).</p></div>
      <div class="card"><div class="card-h"><h3>Datos y respaldo</h3><span class="grow"></span><span class="sync" id="sync2">${esc(Store.status)}</span></div>
        <p class="small muted" style="margin-bottom:14px">Todo se guarda en la nube (Supabase) y se sincroniza entre el equipo cada ~20 segundos. También queda una copia en este navegador por si se corta internet.</p>
        <div class="row wrap"><button class="btn g" onclick="Store.syncNow().then(()=>UI.toast('Sincronizado','☁️'))">⟳ Sincronizar ahora</button><button class="btn g" onclick="UI.download('anm-plataforma-'+UI.today()+'.json', Store.exportAll())">⇣ Descargar respaldo</button>
        ${admin?'<label class="btn g" style="cursor:pointer">⇡ Restaurar respaldo<input type="file" accept=".json" style="display:none" onchange="Team.restore(this)"></label>':''}</div></div>
      <div class="card"><div class="card-h"><h3>🔒 Sobre la seguridad</h3></div>
        <p class="small muted">Finanzas pide contraseña y solo aparece para los socios. Los links de invitación identifican a cada persona para asignar tareas y XP.</p>
        <p class="small muted" style="margin-top:8px">Importante: hoy la base de datos usa una clave pública, así que la protección es “de uso” (evita miradas casuales), no bancaria. Para blindarlo el próximo paso es activar el login con email de Supabase y reglas de acceso por rol.</p></div>
    </div>` };
  });

  // ── Acciones de equipo ──────────────────────────────────────────────────────
  const Team = {
    edit(id, self){
      const m = id ? App.member(id) : { role:'equipo', color:UI.COLORS[App.members().length % UI.COLORS.length], units:[] };
      const admin = App.isAdmin();
      const adminsLeft = App.members().filter(x=>x.role==='admin' && x.id!==id).length;
      UI.form({ title: id ? (self?'Mi perfil':'Editar '+m.name) : 'Invitar persona', values:m, fields:[
        { k:'name', label:'Nombre', req:true },
        { k:'email', label:'Email', type:'email', half:true }, { k:'phone', label:'WhatsApp', half:true, placeholder:'54911…' },
        ...(admin && !self ? [{ k:'role', label:'Rol', type:'select', options:Object.entries(App.ROLES) }] : []),
        { k:'units', label:'Unidades en las que trabaja', type:'multi', options:App.unitOpts() },
        { k:'color', label:'Color', type:'color', half:true },
      ],
      danger: id && admin && id!==App.me().id ? { label:'Quitar del equipo', confirm:`¿Quitar a ${m.name}? Su historial se conserva, pero ya no podrá entrar.`, fn:()=>{ Store.remove('team','members',id); App.render(); } } : null,
      onSubmit:v=>{
        if(id && m.role==='admin' && v.role && v.role!=='admin' && !adminsLeft){ UI.toast('Tiene que quedar al menos un socio','⚠️'); return false; }
        const r = Store.upsert('team','members',{ ...m, ...v, invite:m.invite||App.newInvite() });
        if(!id){ Game.log('member_invited', `Invitó a ${v.name}`, { icon:'👋' }); setTimeout(()=>Team.share(r.id), 50); }
        App.render();
      } });
    },
    share(id){
      const m = App.member(id), link = App.inviteLink(m);
      const msg = `¡Hola ${m.name.split(' ')[0]}! Te sumo a la plataforma de ANM 🚀\nEntrá desde acá (es tu acceso personal, no lo compartas):\n${link}`;
      UI.modal(`<h2>🔗 Acceso de ${esc(m.name)}<button class="icon-btn x" data-close>✕</button></h2>
        <div class="fld"><label>Link personal</label><input class="inp" readonly value="${esc(link)}" onclick="this.select()"></div>
        <div class="fld"><label>Código</label><div class="b" style="font-size:22px;letter-spacing:4px">${esc(m.invite)}</div></div>
        <div class="row wrap"><button class="btn p" onclick='UI.copy(${esc(JSON.stringify(link))})'>Copiar link</button>
          <a class="btn g" target="_blank" href="${esc(UI.waLink(msg, m.phone))}">Enviar por WhatsApp</a>
          <a class="btn g" href="${esc(UI.mailLink(m.email, 'Tu acceso a la plataforma ANM', msg))}">Enviar por email</a></div>
        <div class="mfoot"><button class="btn d sm" onclick="Team.regen('${id}')" style="margin-right:auto">Regenerar código</button><button class="btn g" data-close>Listo</button></div>`);
    },
    regen(id){
      if(!confirm('El link anterior deja de funcionar para entrar desde un dispositivo nuevo. ¿Seguimos?')) return;
      Store.upsert('team','members',{ id, invite:App.newInvite() }); Team.share(id);
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
