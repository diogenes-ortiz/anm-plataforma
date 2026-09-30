// ─── OPERACIONES ──────────────────────────────────────────────────────────────
// Seguimiento por cliente, tareas, calendario de contenidos, reuniones/minutas y alertas.
(function(){
  const { esc, $ } = UI;
  const S = (col)=>Store.all('ops',col);

  const HEALTH = { ok:['En curso','🟢'], atencion:['Atención','🟡'], riesgo:['En riesgo','🔴'] };
  const TASK_ST = [['todo','Por hacer'],['doing','En curso'],['review','En revisión / cliente'],['done','Hecho']];
  const PRIO = [['media','Media'],['alta','Alta 🔥'],['baja','Baja']];
  const CAL_ST = [['planificar','Sin empezar'],['borrador','Creándose'],['enviado','Enviado para corregir'],['correcciones','Con correcciones'],['aprobado','Aprobado ✓'],['en_curso','En publicación'],['cerrado','Cerrado']];
  const REP_ST = [['pendiente','Sin empezar'],['armando','Creándose'],['enviado','Enviado para revisar'],['corregir','Con correcciones'],['presentado','Presentado ✓']];
  const REP_OK = ['presentado'];
  const REP_UNITS = ['social','pauta','contenido'];
  const CAL_OK = ['aprobado','en_curso','cerrado'];
  const FORMATS = [['post','Post'],['carrusel','Carrusel'],['reel','Reel / video'],['story','Story'],['campana','Campaña de pauta'],['entrega','Entrega (branding/web)'],['otro','Otro']];
  const CONTENT_ST = [['idea','Idea'],['produccion','En producción'],['revision','En revisión'],['aprobado','Aprobado'],['publicado','Publicado']];
  const CONTENT_COL = { idea:'var(--text3)', produccion:'var(--yellow)', revision:'var(--orange)', aprobado:'var(--blue)', publicado:'var(--green)' };
  const MEET_TYPES = [['seguimiento','Seguimiento con cliente'],['kickoff','Kickoff / arranque'],['presentacion','Presentación / entrega'],['interna','Interna del equipo'],['comercial','Comercial / prospecto'],['otra','Otra']];
  const CAL_UNITS = ['social','contenido'];

  // ── Consultas ────────────────────────────────────────────────────────────────
  const client = id => Store.get('ops','clients',id);
  const clientName = id => client(id)?.name || (id ? '—' : 'Interna');
  const activeClients = () => S('clients').filter(c=>c.active!==false).sort((a,b)=>a.name.localeCompare(b.name));
  const lastUpdate = c => S('updates').filter(u=>u.clientId===c.id).sort((a,b)=>b.at.localeCompare(a.at))[0];
  const daysSinceUpdate = c => { const u = lastUpdate(c); return u ? UI.diffDays(u.at.slice(0,10)) : 999; };
  const openTasks = () => S('tasks').filter(t=>t.status!=='done');
  const overdueTasks = () => openTasks().filter(t=>t.due && t.due<UI.today());
  const needsCal = c => (c.units||[]).some(u=>CAL_UNITS.includes(u));
  const calRec = (cid, month) => Store.get('ops','calendars', cid+'_'+month);
  const repRec = (cid, month) => Store.get('ops','reports', cid+'_'+month);
  const needsRep = c => (c.units||[]).some(u=>REP_UNITS.includes(u));
  const prevYm = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return UI.ym(d); };
  // Fechas clave de cada cliente: el día del mes en que se entrega el calendario (del mes siguiente) y el reporte (del mes anterior)
  const dayIn = (ym, day) => { const [y,m] = ym.split('-').map(Number); return `${ym}-${UI.pad(Math.min(+day||1, new Date(y,m,0).getDate()))}`; };
  const calDue = (c, ym=UI.ym()) => dayIn(ym, c.calendarDay||25);
  const repDue = (c, ym=UI.ym()) => dayIn(ym, c.reportDay||5);
  const dueTag = (date, ok) => { if(ok) return `<span class="tag t-green">${UI.fdate(date,{abs:true})}</span>`; const d = UI.diffDays(UI.today(), date);
    return `<span class="tag ${d<0?'t-red':d<=3?'t-yellow':''}">${d<0?'venció ':''}${UI.fdate(date,{abs:true})}</span>`; };
  const nextYm = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+1); return UI.ym(d); };
  const unitOk = rec => App.matchUnit(rec.units || rec.unit || (rec.clientId ? client(rec.clientId)?.units : null) || []);

  function nextMonthCalendarPending(){
    const cs = activeClients().filter(needsCal), m = nextYm();
    return { total:cs.length, pending:cs.filter(c=>!CAL_OK.includes(calRec(c.id,m)?.stage)).length };
  }

  // ── Minutas preparadas (js/minutas.js) ────────────────────────────────────────
  const norm = x => (x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  function pendingMinutas(){ return (window.ANM_MINUTAS||[]).filter(m=>!Store.get('ops','meetings',m.id) && !(Store.setting('minutasDescartadas',[])).includes(m.id)); }
  const memberByFirst = n => n && App.members().find(m=>norm(m.name.split(' ')[0])===norm(n));
  const clientByName = n => n && activeClients().find(c=>norm(c.name)===norm(n) || norm(c.name).includes(norm(n)) || norm(n).includes(norm(c.name)));

  // ── Alertas ──────────────────────────────────────────────────────────────────
  // Alertas descartadas (por todo el equipo) hasta una fecha
  const dismissed = () => { const t = UI.today(); return new Set(S('dismissed').filter(d=>d.until>=t).map(d=>d.id)); };
  function alerts(){ const d = dismissed(); return allAlerts().filter(a=>!a.key || !d.has(a.key)); }
  function allAlerts(){
    const out = [], t = UI.today(), day = new Date().getDate();
    const push = a => out.push(a);
    activeClients().filter(c=>App.matchUnit(c.units||[])).forEach(c=>{
      const d = daysSinceUpdate(c), link = '#/ops/cliente/'+c.id;
      if(d>=999) push({ key:`upd:${c.id}`, cid:c.id||"", level:'warn', icon:'📡', title:`${c.name}: sin seguimiento registrado`, desc:'Cargá la primera actualización de estado.', link, to:c.ownerId });
      else if(d>14) push({ key:`upd:${c.id}`, cid:c.id||"", level:'danger', icon:'📡', title:`${c.name}: ${d} días sin actualizar`, desc:'Nadie registró en qué estamos hace más de dos semanas.', link, to:c.ownerId });
      else if(d>7) push({ key:`upd:${c.id}`, cid:c.id||"", level:'warn', icon:'📡', title:`${c.name}: ${d} días sin actualizar`, desc:'Toca una actualización de seguimiento.', link, to:c.ownerId });
      if(c.health==='riesgo') push({ key:`risk:${c.id}`, cid:c.id||"", level:'danger', icon:'🔴', title:`${c.name} está en riesgo`, desc:c.status||'Marcado en rojo en el último seguimiento.', link, to:c.ownerId });
      else if(c.health==='atencion') push({ key:`att:${c.id}`, cid:c.id||"", level:'warn', icon:'🟡', title:`${c.name} necesita atención`, desc:c.status||'', link, to:c.ownerId });
      if(c.nextStepDate && c.nextStepDate<t) push({ key:`next:${c.id}:${c.nextStepDate}`, cid:c.id||"", level:'warn', icon:'⏭️', title:`${c.name}: próximo paso vencido`, desc:`“${c.nextStep||'Próximo paso'}” era para el ${UI.fdate(c.nextStepDate,{abs:true})}.`, link, to:c.ownerId });
      if(needsCal(c)){
        const cur = calRec(c.id, UI.ym())?.stage;
        if(!CAL_OK.includes(cur)) push({ key:`cal:${c.id}:${UI.ym()}`, cid:c.id||"", level:'danger', icon:'🗓️', title:`${c.name}: calendario de ${UI.MONTHS[new Date().getMonth()]} sin aprobar`, desc:`Estado: ${label(CAL_ST, cur||'planificar')}.`, link:'#/ops/calendario', to:c.ownerId });
        const nx = calRec(c.id, nextYm())?.stage, cd = calDue(c), dd = UI.diffDays(t, cd);
        if(!CAL_OK.includes(nx) && dd<=5) push({ key:`caln:${c.id}:${nextYm()}`, cid:c.id||"", level:dd<0?'danger':'warn', icon:'🗓️', title:`${c.name}: calendario de ${UI.ymLabel(nextYm())} ${dd<0?'atrasado':'se entrega '+UI.fdate(cd).toLowerCase()}`, desc:`Estado: ${label(CAL_ST, nx||'planificar')} · fecha de entrega ${UI.fdate(cd,{abs:true})}.`, link, to:c.ownerId });
      }
      if(needsRep(c)){
        const st = repRec(c.id, prevYm())?.stage, rd = repDue(c), dr = UI.diffDays(t, rd);
        if(!REP_OK.includes(st) && dr<=3) push({ key:`rep:${c.id}:${prevYm()}`, cid:c.id||"", level:dr<0?'danger':'warn', icon:'📊', title:`${c.name}: reporte de ${UI.ymLabel(prevYm())} ${dr<0?'atrasado':'se presenta '+UI.fdate(rd).toLowerCase()}`, desc:`Estado: ${label(REP_ST, st||'pendiente')} · fecha ${UI.fdate(rd,{abs:true})}.`, link, to:c.ownerId });
      }
    });
    overdueTasks().filter(unitOk).forEach(tk=>{
      const d = UI.diffDays(tk.due);
      push({ key:`task:${tk.id}:${tk.due}`, cid:tk.clientId||"", level:d>3?'danger':'warn', icon:'⏰', title:`Tarea vencida: ${tk.title}`, desc:`${clientName(tk.clientId)} · venció ${UI.fdate(tk.due)} (${d} día${d>1?'s':''}) · ${App.member(tk.assigneeId)?.name||'sin responsable'}`, link:'#/ops/tareas', to:tk.assigneeId, taskId:tk.id });
    });
    S('meetings').filter(unitOk).forEach(m=>{
      const d = m.date?.slice(0,10); if(!d) return;
      if(d<t && UI.diffDays(d)<=30 && !m.minuta) push({ key:`min:${m.id}`, cid:m.clientId||"", level:'warn', icon:'📝', title:`Falta la minuta: ${m.title}`, desc:`${clientName(m.clientId)} · ${UI.fdate(d)}`, link:'#/ops/reuniones', to:m.by, meetingId:m.id });
      if(d===t) push({ key:`hoy:${m.id}`, cid:m.clientId||"", level:'info', icon:'🤝', title:`Hoy: ${m.title}`, desc:`${UI.time(m.date)} · ${clientName(m.clientId)}`, link:'#/ops/reuniones', meetingId:m.id });
    });
    S('content').filter(unitOk).forEach(p=>{
      if(!p.date || ['aprobado','publicado'].includes(p.status)) return;
      const d = UI.diffDays(t, p.date);
      if(d>=0 && d<=3) push({ key:`cont:${p.id}:${p.date}:${p.status}`, cid:p.clientId||"", level:'warn', icon:'🎬', title:`${clientName(p.clientId)}: “${p.title}” sale ${UI.fdate(p.date).toLowerCase()} y no está aprobado`, desc:`Estado: ${label(CONTENT_ST,p.status)}`, link:'#/ops/calendario', to:p.assigneeId });
    });
    const order = { danger:0, warn:1, info:2 };
    return out.sort((a,b)=>order[a.level]-order[b.level]);
  }

  const label = (opts, v) => (opts.find(o=>o[0]===v)||[,v||'—'])[1];

  // ── Vista principal ──────────────────────────────────────────────────────────
  const TABS = [['seguimiento','Seguimiento'],['tareas','Tareas'],['calendario','Calendario'],['reuniones','Reuniones y minutas'],['alertas','Alertas']];
  let search = '', taskMode = localStorage.getItem('anm_taskmode')||'board', taskWho = 'all', calCursor = UI.ym(), meetTopic = '';
  // Filtro global por cliente ('' = todos, '__int' = internas, o id de cliente)
  let cf = localStorage.getItem('anm_opsclient')||'';
  const cm = id => !cf || (cf==='__int' ? !id : id===cf);
  const curClient = () => cf && cf!=='__int' ? cf : '';

  App.route('ops', ([tab='seguimiento', id])=>{
    if(tab==='cliente'){ setCF(id); tab = 'seguimiento'; history.replaceState(null,'','#/ops/seguimiento'); }
    if(cf && cf!=='__int' && !client(cf)) setCF('');
    const al = alerts().filter(a=>a.level!=='info' && cm(a.cid)).length;
    const tabs = `<div class="tabs">${TABS.map(([k,l])=>`<a href="#/ops/${k}" class="${tab===k?'active':''}">${l}${k==='alertas'&&al?`<span class="cnt">${al}</span>`:''}</a>`).join('')}</div>`;
    const views = { seguimiento:viewFollow, tareas:viewTasks, calendario:viewCalendar, reuniones:viewMeetings, alertas:viewAlerts };
    const sel = curClient() ? client(cf) : null;
    const v = (tab==='seguimiento' && sel) ? clientDetail(cf) : (views[tab]||viewFollow)();
    return { title: sel ? sel.name : cf==='__int' ? 'Operaciones · Internas' : 'Operaciones', crumb: sel ? 'Operaciones · Cliente' : '¿En qué estamos con cada cliente?',
      html: `<div class="toolbar" style="margin-bottom:12px">${App.unitBar()}</div>` + clientBar() + tabs + v.html, after:v.after };
  });

  function setCF(v){ cf = v||''; try{ localStorage.setItem('anm_opsclient', cf); }catch(e){} }
  // Barra de clientes: elegís uno y todas las pestañas muestran solo lo suyo
  function clientBar(){
    const cs = activeClients().filter(c=>App.matchUnit(c.units||[]));
    const al = alerts().filter(a=>a.level!=='info'); const n = id => al.filter(a=>a.cid===id).length;
    const chip = (v, inner, extra='') => `<button class="chip ${cf===v?'on':''}" onclick="Ops.setClient('${v}')" ${extra}>${inner}</button>`;
    return `<div class="chips scroll" style="margin-bottom:18px">${chip('', '▦ Todos los clientes')}
      ${cs.map(c=>chip(c.id, `<span class="health h-${c.health||'ok'}" style="width:8px;height:8px;box-shadow:none"></span>${esc(c.name)}${n(c.id)?` <span class="tag t-red" style="padding:0 6px">${n(c.id)}</span>`:''}`)).join('')}
      ${chip('__int', '🏠 Internas')}</div>`;
  }

  // ── Seguimiento ──────────────────────────────────────────────────────────────
  function viewFollow(){
    const cs = activeClients().filter(c=>App.matchUnit(c.units||[])).filter(c=>!search || c.name.toLowerCase().includes(search.toLowerCase()));
    const fresh = cs.filter(c=>daysSinceUpdate(c)<=7).length;
    const pct = cs.length ? Math.round(fresh/cs.length*100) : 100;
    const cnt = h => cs.filter(c=>(c.health||'ok')===h).length;
    const al = alerts();
    const top = `<div class="grid g4" style="margin-bottom:22px">
      <div class="card row" style="gap:18px"><div class="ring" style="--p:${pct}"><div>${pct}%<small>AL DÍA</small></div></div>
        <div><div class="b">Salud del seguimiento</div><div class="small muted">${fresh} de ${cs.length} clientes actualizados en los últimos 7 días</div></div></div>
      <div class="card kpi"><div class="l">🟢 En curso</div><div class="v" style="color:var(--green)">${cnt('ok')}</div><div class="s">clientes sin problemas</div></div>
      <div class="card kpi"><div class="l">🟡 Atención</div><div class="v" style="color:var(--yellow)">${cnt('atencion')}</div><div class="s">hay que mirar de cerca</div></div>
      <div class="card kpi hover" onclick="App.go('#/ops/alertas')"><div class="l">🔴 Riesgo · alertas</div><div class="v" style="color:var(--red)">${cnt('riesgo')} · ${al.filter(a=>a.level==='danger').length}</div><div class="s">ver todas las alertas →</div></div>
    </div>`;
    const bar = `<div class="toolbar"><div class="search grow"><input class="inp" placeholder="Buscar cliente…" value="${esc(search)}" oninput="Ops.setSearch(this.value)"></div>
      ${App.isAdmin()?'<button class="btn g" onclick="Ops.importFinance()">⇣ Importar clientes de Finanzas</button>':''}
      <button class="btn p" onclick="Ops.editClient()">＋ Cliente</button></div>`;
    const cards = cs.length ? `<div class="grid g-auto">${cs.map(clientCard).join('')}</div>`
      : `<div class="card empty"><div class="big">🗂️</div>Todavía no hay clientes${App.unitFilter?' en esta unidad':''}.<br><br><button class="btn p" onclick="Ops.editClient()">＋ Agregar el primero</button></div>`;
    return { html: top + bar + cards };
  }

  function clientCard(c){
    const d = daysSinceUpdate(c), u = lastUpdate(c);
    const staleCol = d>14?'var(--red)':d>7?'var(--yellow)':'var(--text3)';
    const tasks = openTasks().filter(t=>t.clientId===c.id), over = tasks.filter(t=>t.due && t.due<UI.today()).length;
    const nextMeet = S('meetings').filter(m=>m.clientId===c.id && m.date>=UI.today()).sort((a,b)=>a.date.localeCompare(b.date))[0];
    const cal = needsCal(c) ? calRec(c.id, UI.ym())?.stage || 'planificar' : null;
    const team = [c.ownerId, ...(c.teamIds||[]).filter(x=>x!==c.ownerId)].map(App.member).filter(Boolean);
    return `<div class="card hover" onclick="App.go('#/ops/cliente/${c.id}')">
      <div class="row" style="margin-bottom:10px"><span class="health h-${c.health||'ok'}"></span><div class="b grow ellip" style="font-size:15.5px">${esc(c.name)}</div><span class="avs">${team.map(m=>UI.avatar(m,'sm')).join('')}</span></div>
      <div class="row wrap" style="margin-bottom:12px">${App.unitTags(c.units)}</div>
      <div class="small prewrap" style="min-height:40px;color:${u?'var(--text)':'var(--text3)'}">${esc(u ? trunc(c.status||u.text, 150) : 'Sin actualizaciones todavía.')}</div>
      ${c.nextStep?`<div class="small" style="margin-top:10px"><span class="faint b">PRÓXIMO →</span> ${esc(c.nextStep)} ${c.nextStepDate?`<span class="tag ${c.nextStepDate<UI.today()?'t-red':''}">${UI.fdate(c.nextStepDate)}</span>`:''}</div>`:''}
      <div class="divider"></div>
      <div class="row wrap xs b" style="gap:8px">
        <span style="color:${staleCol}">⟳ ${u?UI.ago(u.at):'nunca'}</span>
        <span class="tag">${tasks.length} tarea${tasks.length!==1?'s':''}</span>${over?`<span class="tag t-red">${over} vencida${over>1?'s':''}</span>`:''}
        ${needsCal(c)?(()=>{ const st = calRec(c.id,nextYm())?.stage||'planificar'; return `<span class="tag ${CAL_OK.includes(st)?'t-green':'t-yellow'}" title="Calendario de ${UI.ymLabel(nextYm())}">🗓️ ${label(CAL_ST,st)}</span>`; })():''}
        ${needsRep(c)?(()=>{ const st = repRec(c.id,prevYm())?.stage||'pendiente'; return `<span class="tag ${REP_OK.includes(st)?'t-green':'t-yellow'}" title="Reporte de ${UI.ymLabel(prevYm())}">📊 ${label(REP_ST,st)}</span>`; })():''}
        ${nextMeet?`<span class="tag t-blue">🤝 ${UI.fdate(nextMeet.date.slice(0,10))}</span>`:''}
        <span class="grow"></span><button class="btn xs p" onclick="event.stopPropagation();Ops.updateClient('${c.id}')">Actualizar</button>
      </div></div>`;
  }
  const trunc = (s,n) => { s = s||''; return s.length>n ? s.slice(0,n-1)+'…' : s; };

  // ── Detalle de cliente ──────────────────────────────────────────────────────
  function clientDetail(id){
    const c = client(id);
    if(!c) return { title:'Cliente', html:'<div class="empty">No encontrado. <a href="#/ops">Volver</a></div>' };
    const ups = S('updates').filter(u=>u.clientId===id).sort((a,b)=>b.at.localeCompare(a.at));
    const tasks = S('tasks').filter(t=>t.clientId===id).sort(taskSort);
    const meets = S('meetings').filter(m=>m.clientId===id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const content = S('content').filter(p=>p.clientId===id && p.date>=UI.addDays(UI.today(),-7)).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,12);
    const owner = App.member(c.ownerId);
    const delivRow = (icon, name, date, st, opts, okList, fn, rec, kind, month) => `<div class="li" style="flex-wrap:wrap;gap:10px">
      <span style="font-size:20px">${icon}</span><div class="grow" style="min-width:180px"><div class="b small">${name}</div><div class="xs faint">Fecha: ${dueTag(date, okList.includes(st))}</div></div>
      <select class="inp sm" style="${okList.includes(st)?'border-color:var(--green)':st==='enviado'||st==='correcciones'||st==='corregir'?'border-color:var(--yellow)':''}" onchange="${fn}">${opts.map(([k,l])=>`<option value="${k}" ${k===st?'selected':''}>${l}</option>`).join('')}</select>
      <input class="inp sm" style="width:190px" placeholder="Link (Drive, Canva…)" value="${esc(rec?.link||'')}" onchange="Ops.setDelivLink('${kind}','${id}','${month}',this.value)">${rec?.link?`<a class="btn xs g" href="${esc(rec.link)}" target="_blank">Abrir ↗</a>`:''}</div>`;
    const deliverables = (needsCal(c)||needsRep(c)) ? `<div class="card" style="margin-bottom:18px;border-color:color-mix(in srgb,var(--blue) 35%,transparent)"><div class="card-h"><h3>📦 Entregables del mes</h3><span class="grow"></span>
        <span class="xs faint">Calendario: día ${c.calendarDay||25} · Reporte: día ${c.reportDay||5}</span><button class="btn xs g" onclick="Ops.editClient('${id}')">Cambiar fechas</button></div><div class="list">
      ${needsCal(c) && !CAL_OK.includes(calRec(id,UI.ym())?.stage) ? delivRow('🗓️', `Calendario de ${UI.ymLabel(UI.ym())} <span class="tag t-red">atrasado</span>`, calDue(c, prevYm()), calRec(id,UI.ym())?.stage||'planificar', CAL_ST, CAL_OK, `Ops.setCal('${id}','${UI.ym()}',this.value)`, calRec(id,UI.ym()), 'cal', UI.ym()) : ''}
      ${needsCal(c) ? delivRow('🗓️', `Calendario de ${UI.ymLabel(nextYm())}`, calDue(c), calRec(id,nextYm())?.stage||'planificar', CAL_ST, CAL_OK, `Ops.setCal('${id}','${nextYm()}',this.value)`, calRec(id,nextYm()), 'cal', nextYm()) : ''}
      ${needsRep(c) ? delivRow('📊', `Reporte de ${UI.ymLabel(prevYm())}`, repDue(c), repRec(id,prevYm())?.stage||'pendiente', REP_ST, REP_OK, `Ops.setRep('${id}','${prevYm()}',this.value)`, repRec(id,prevYm()), 'rep', prevYm()) : ''}
      </div></div>` : '';
    const html = `
      <div class="row" style="margin-bottom:20px"><button class="btn g sm" onclick="Ops.setClient('')">← Todos los clientes</button></div>
      <div class="hero" style="margin-bottom:22px">
        <div class="grow"><div class="row" style="margin-bottom:8px"><span class="health h-${c.health||'ok'}"></span><span class="b small">${HEALTH[c.health||'ok'][0]}</span>${c.active===false?'<span class="tag t-red">Inactivo</span>':''}</div>
          <h2>${esc(c.name)}</h2><div class="row wrap" style="margin-top:10px">${App.unitTags(c.units)}</div>
          <div class="small muted" style="margin-top:12px">Responsable: <b>${esc(owner?.name||'—')}</b>${c.contactName?` · Contacto: <b>${esc(c.contactName)}</b>`:''}${c.contactPhone?` · <a href="${UI.waLink('',c.contactPhone)}" target="_blank">WhatsApp</a>`:''}${c.contactEmail?` · <a href="mailto:${esc(c.contactEmail)}">Email</a>`:''}${c.link?` · <a href="${esc(c.link)}" target="_blank">Carpeta ↗</a>`:''}</div></div>
        <div class="col" style="align-items:stretch"><button class="btn p" onclick="Ops.updateClient('${id}')">📡 Actualizar estado</button>
          <div class="row"><button class="btn g sm" onclick="Ops.editTask(null,{clientId:'${id}'})">＋ Tarea</button><button class="btn g sm" onclick="Ops.editMeeting(null,{clientId:'${id}'})">＋ Reunión</button><button class="btn g sm" onclick="Ops.editClient('${id}')">✎</button></div></div>
      </div>
      ${deliverables}
      <div class="grid g3">
        <div class="span2 col" style="gap:18px">
          <div class="card"><div class="card-h"><h3>Estado actual</h3><span class="grow"></span><span class="sub">${ups[0]?UI.ago(ups[0].at):''}</span></div>
            <div class="prewrap">${esc(c.status||'Sin actualizaciones todavía.')}</div>
            ${c.nextStep?`<div class="alert info" style="margin:14px 0 0"><div class="ai">⏭️</div><div><div class="at">${esc(c.nextStep)}</div><div class="ad">${c.nextStepDate?UI.fdate(c.nextStepDate,{abs:true}):'Sin fecha'}</div></div></div>`:''}</div>
          <div class="card"><div class="card-h"><h3>Tareas</h3><span class="sub">${tasks.filter(t=>t.status!=='done').length} abiertas</span><span class="grow"></span>${tasks.length?`<button class="btn xs g" onclick="Ops.selectHere()">☑ Seleccionar varias</button>`:''}</div>${taskList(tasks.slice(0,15), true)}</div>
          <div class="card"><div class="card-h"><h3>Historial de seguimiento</h3></div>
            ${ups.length?`<div class="tl">${ups.slice(0,25).map(u=>`<div class="tl-i ${u.health||'ok'}"><div class="when">${UI.fdate(u.at.slice(0,10),{abs:true})} · ${esc(App.member(u.by)?.name||'')}</div><div class="small prewrap">${esc(u.text)}</div>${u.nextStep?`<div class="xs muted">→ ${esc(u.nextStep)}</div>`:''}</div>`).join('')}</div>`:'<div class="empty">Sin historial</div>'}</div>
        </div>
        <div class="col" style="gap:18px">
          <div class="card"><div class="card-h"><h3>Reuniones</h3><span class="grow"></span><button class="btn xs g" onclick="Ops.editMeeting(null,{clientId:'${id}'})">＋</button></div>
            ${meets.length?`<div class="list">${meets.slice(0,8).map(meetRow).join('')}</div>`:'<div class="empty small">Sin reuniones</div>'}</div>
          <div class="card"><div class="card-h"><h3>Próximo contenido</h3><span class="grow"></span><button class="btn xs g" onclick="Ops.editContent(null,{clientId:'${id}'})">＋</button></div>
            ${content.length?`<div class="list">${content.map(p=>`<div class="li click" onclick="Ops.editContent('${p.id}')"><span class="tag" style="color:${CONTENT_COL[p.status]}">${label(CONTENT_ST,p.status)}</span><div class="grow ellip small b">${esc(p.title)}</div><span class="xs faint">${UI.fdate(p.date)}</span></div>`).join('')}</div>`:'<div class="empty small">Nada programado</div>'}</div>
          ${c.notes?`<div class="card"><div class="card-h"><h3>Notas</h3></div><div class="small prewrap muted">${esc(c.notes)}</div></div>`:''}
        </div>
      </div>`;
    return { title:c.name, crumb:'Operaciones · Cliente', html };
  }

  // ── Tareas ───────────────────────────────────────────────────────────────────
  const prioN = { alta:0, media:1, baja:2 };
  function taskSort(a,b){ return (a.status==='done')-(b.status==='done') || (a.due||'9999').localeCompare(b.due||'9999') || prioN[a.priority||'media']-prioN[b.priority||'media']; }

  function taskRow(t, showClient=true){
    const over = t.status!=='done' && t.due && t.due<UI.today();
    const m = App.member(t.assigneeId);
    return `<div class="li"><input type="checkbox" ${t.status==='done'?'checked':''} onchange="Ops.toggleTask('${t.id}')" style="width:18px;height:18px;cursor:pointer">
      <div class="grow" style="cursor:pointer" onclick="Ops.editTask('${t.id}')"><div class="b small" style="${t.status==='done'?'text-decoration:line-through;color:var(--text3)':''}">${t.priority==='alta'?'🔥 ':''}${esc(t.title)}</div>
      <div class="xs faint">${showClient?esc(clientName(t.clientId))+' · ':''}${esc(label(TASK_ST,t.status))}${t.unit?' · '+esc(App.unit(t.unit).label):''}</div></div>
      ${t.due?`<span class="tag ${over?'t-red':t.due===UI.today()?'t-yellow':''}">${UI.fdate(t.due)}</span>`:''}${UI.avatar(m,'sm')}</div>`;
  }
  function taskList(ts, hideClient){ return ts.length ? `<div class="list">${ts.map(t=>taskRow(t,!hideClient)).join('')}</div>` : '<div class="empty small">Sin tareas</div>'; }

  // Selección múltiple de tareas
  let selMode = false, visibleTasks = [];
  const sel = new Set();
  const pickCls = id => selMode && sel.has(id) ? 'picked' : '';
  function selRow(t){
    const over = t.status!=='done' && t.due && t.due<UI.today();
    return `<div class="li click ${pickCls(t.id)}" onclick="Ops.pick('${t.id}')"><input type="checkbox" ${sel.has(t.id)?'checked':''} style="width:18px;height:18px;pointer-events:none">
      <div class="grow"><div class="b small" style="${t.status==='done'?'text-decoration:line-through;color:var(--text3)':''}">${t.priority==='alta'?'🔥 ':''}${esc(t.title)}</div><div class="xs faint">${esc(clientName(t.clientId))} · ${esc(label(TASK_ST,t.status))}</div></div>
      ${t.due?`<span class="tag ${over?'t-red':''}">${UI.fdate(t.due)}</span>`:''}${UI.avatar(App.member(t.assigneeId),'sm')}</div>`;
  }
  function selBar(){
    if(!selMode) return '';
    const n = sel.size, opts = App.assignOpts().filter(o=>o[0]);
    return `<div class="selbar">
      <b>${n} seleccionada${n!==1?'s':''}</b>
      <button class="btn xs g" onclick="Ops.pickAll()">${visibleTasks.length && visibleTasks.every(id=>sel.has(id))?'Ninguna':'Todas ('+visibleTasks.length+')'}</button>
      ${n?`<span class="sep"></span>
      <button class="btn xs ok" onclick="Ops.bulk('done')">✓ Hechas</button>
      <select class="inp sm" onchange="Ops.bulk('status',this.value)"><option value="">Estado…</option>${TASK_ST.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select>
      <select class="inp sm" onchange="Ops.bulk('assign',this.value)"><option value="">Asignar a…</option>${opts.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <input class="inp sm" type="date" title="Cambiar fecha" onchange="Ops.bulk('due',this.value)">
      <select class="inp sm" onchange="Ops.bulk('client',this.value)"><option value="">Mover a cliente…</option><option value="__int">— Interna —</option>${activeClients().map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <select class="inp sm" onchange="Ops.bulk('priority',this.value)"><option value="">Prioridad…</option>${PRIO.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select>
      <button class="btn xs g" onclick="Ops.bulk('alert')">📣 Avisar</button>
      <button class="btn xs d" onclick="Ops.bulk('delete')">🗑 Eliminar</button>`:'<span class="xs faint">Tocá las tareas para elegirlas</span>'}
      <span class="grow"></span><button class="btn xs g" onclick="Ops.selMode(false)">✕ Salir</button></div>`;
  }

  function viewTasks(){
    const me = App.me();
    let ts = S('tasks').filter(unitOk).filter(t=>cm(t.clientId));
    if(taskWho==='me') ts = ts.filter(t=>t.assigneeId===me.id);
    else if(taskWho!=='all') ts = ts.filter(t=>t.assigneeId===taskWho);
    if(search) ts = ts.filter(t=>(t.title+' '+clientName(t.clientId)).toLowerCase().includes(search.toLowerCase()));
    const bar = `<div class="toolbar"><div class="chips"><button class="chip ${taskWho==='all'?'on':''}" onclick="Ops.setWho('all')">Todas</button><button class="chip ${taskWho==='me'?'on':''}" onclick="Ops.setWho('me')">Mías</button>
      ${App.members().filter(m=>m.id!==me.id).map(m=>`<button class="chip ${taskWho===m.id?'on':''}" onclick="Ops.setWho('${m.id}')">${esc(m.name)}</button>`).join('')}</div>
      <span class="grow"></span><div class="search"><input class="inp" placeholder="Buscar…" value="${esc(search)}" oninput="Ops.setSearch(this.value)"></div>
      <div class="chips"><button class="chip ${taskMode==='board'?'on':''}" onclick="Ops.setMode('board')">▦ Tablero</button><button class="chip ${taskMode==='list'?'on':''}" onclick="Ops.setMode('list')">☰ Lista</button></div>
      <button class="chip ${selMode?'on':''}" onclick="Ops.selMode(${!selMode})">☑ Seleccionar</button>
      <button class="btn p" onclick="Ops.editTask()">＋ Tarea</button></div>`;
    visibleTasks = [];
    if(taskMode==='list'){
      const t = UI.today(), wk = UI.addDays(t,7), open = ts.filter(x=>x.status!=='done').sort(taskSort);
      const groups = [['⏰ Vencidas',open.filter(x=>x.due&&x.due<t)],['📍 Hoy',open.filter(x=>x.due===t)],['📅 Próximos 7 días',open.filter(x=>x.due>t&&x.due<=wk)],['🔭 Más adelante',open.filter(x=>x.due>wk)],['· Sin fecha',open.filter(x=>!x.due)],
        ['✓ Hechas (últimas)', ts.filter(x=>x.status==='done').sort((a,b)=>(b.doneAt||'').localeCompare(a.doneAt||'')).slice(0,15)]];
      groups.forEach(g=>g[1].forEach(x=>visibleTasks.push(x.id)));
      return { html: bar + (groups.filter(g=>g[1].length).map(([l,g])=>`<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${l}</h3><span class="sub">${g.length}</span>${selMode?`<span class="grow"></span><button class="btn xs g" onclick="Ops.pickGroup('${g.map(x=>x.id).join(',')}')">Elegir estas</button>`:''}</div>${selMode?`<div class="list">${g.map(selRow).join('')}</div>`:taskList(g)}</div>`).join('') || '<div class="card empty"><div class="big">🎉</div>No hay tareas</div>') + selBar() };
    }
    const lanes = TASK_ST.map(([k,l])=>{
      let items = ts.filter(t=>(t.status||'todo')===k).sort(taskSort);
      if(k==='done') items = items.sort((a,b)=>(b.doneAt||'').localeCompare(a.doneAt||'')).slice(0,20);
      items.forEach(x=>visibleTasks.push(x.id));
      return `<div class="lane" data-lane="${k}"><div class="lane-h">${l} <span class="n">${items.length}</span></div>
        ${items.map(t=>{ const over = k!=='done' && t.due && t.due<UI.today();
          return `<div class="kc ${over?'over':''} ${pickCls(t.id)}" ${selMode?'':`data-drag="${t.id}"`} onclick="${selMode?`Ops.pick('${t.id}')`:`Ops.editTask('${t.id}')`}"><div class="t">${selMode?`<input type="checkbox" ${sel.has(t.id)?'checked':''} style="pointer-events:none;margin-right:6px;vertical-align:-2px">`:''}${t.priority==='alta'?'🔥 ':''}${esc(t.title)}</div>
          <div class="m">${UI.avatar(App.member(t.assigneeId),'sm')}<span>${esc(clientName(t.clientId))}</span>${t.due?`<span class="tag ${over?'t-red':''}">${UI.fdate(t.due)}</span>`:''}</div></div>`; }).join('')}
        ${k==='todo'?`<button class="btn g sm" style="width:100%;justify-content:center" onclick="Ops.editTask()">＋ Agregar</button>`:''}</div>`;
    }).join('');
    return { html: bar + `<div class="board" id="tboard">${lanes}</div><p class="xs faint" style="margin-top:8px">${selMode?'Tocá las tarjetas para seleccionarlas.':'Arrastrá las tarjetas entre columnas para cambiar su estado. Con “☑ Seleccionar” podés elegir varias y hacer acciones juntas.'}</p>` + selBar(),
      after:()=>{ if(!selMode) UI.kanban($('#tboard'), (id,st)=>setTaskStatus(id,st)); } };
  }

  function setTaskStatus(id, st){
    const t = Store.get('ops','tasks',id); if(!t || t.status===st) return;
    const wasDone = t.status==='done', before = t.assigneeId ? Game.perf(t.assigneeId).pct : null;
    Store.upsert('ops','tasks',{ id, status:st, doneAt: st==='done' ? new Date().toISOString() : null });
    if(st==='done' && !wasDone){
      const who = App.member(t.assigneeId), pf = who ? Game.perf(who.id) : null;
      Game.log('task_done', `Tarea completada: ${t.title}${pf&&pf.pct!=null?` · ${who.id===App.me().id?'vas':who.name.split(' ')[0]+' va'} ${pf.resolved}/${pf.assigned} este mes`:''}`, { icon:'✅', ref:id });
      if(who) Game.celebrate(who.id, before);
    }
    App.render();
  }

  // ── Calendario ───────────────────────────────────────────────────────────────
  function viewCalendar(){
    const [y,m] = calCursor.split('-').map(Number);
    const first = new Date(y,m-1,1), startOff = (first.getDay()+6)%7, days = new Date(y,m,0).getDate();
    const start = new Date(y,m-1,1-startOff);
    const cells = Math.ceil((startOff+days)/7)*7;
    const content = S('content').filter(unitOk).filter(p=>cm(p.clientId));
    const tasks = S('tasks').filter(unitOk).filter(t=>t.due && t.status!=='done' && cm(t.clientId));
    const meets = S('meetings').filter(unitOk).filter(x=>x.date && cm(x.clientId));
    let grid = UI.DAYS.slice(1).concat('Dom').map(d=>`<div class="dh">${d}</div>`).join('');
    for(let i=0;i<cells;i++){
      const d = new Date(start); d.setDate(start.getDate()+i); const ds = UI.ymd(d);
      const evs = [
        ...meets.filter(x=>x.date.slice(0,10)===ds).map(x=>`<div class="ev" style="border-color:var(--purple)" onclick="event.stopPropagation();Ops.viewMeeting('${x.id}')">🤝 ${esc(UI.time(x.date))} ${esc(x.title)}</div>`),
        ...content.filter(p=>p.date===ds).map(p=>{ const c=client(p.clientId), u=App.unit(p.unit||(c?.units||[])[0]); return `<div class="ev" style="border-color:${u.color}" title="${esc(label(CONTENT_ST,p.status))}" onclick="event.stopPropagation();Ops.editContent('${p.id}')"><span style="color:${CONTENT_COL[p.status]}">●</span> ${esc(c?.name||'')}: ${esc(p.title)}</div>`; }),
        ...tasks.filter(t=>t.due===ds).map(t=>`<div class="ev" style="border-color:var(--text3)" onclick="event.stopPropagation();Ops.editTask('${t.id}')">☐ ${esc(t.title)}</div>`),
        ...activeClients().filter(c=>cm(c.id) && App.matchUnit(c.units||[])).flatMap(c=>[
          ...(needsCal(c) && calDue(c, ds.slice(0,7))===ds ? [`<div class="ev" style="border-color:var(--blue);background:var(--blue-d)" onclick="event.stopPropagation();App.go('#/ops/cliente/${c.id}')">🗓️ Entrega calendario · ${esc(c.name)}</div>`] : []),
          ...(needsRep(c) && repDue(c, ds.slice(0,7))===ds ? [`<div class="ev" style="border-color:var(--teal);background:var(--teal-d)" onclick="event.stopPropagation();App.go('#/ops/cliente/${c.id}')">📊 Reporte · ${esc(c.name)}</div>`] : []),
        ]),
      ];
      const shown = evs.slice(0,4).join('') + (evs.length>4?`<div class="ev more">+${evs.length-4} más</div>`:'');
      grid += `<div class="d ${d.getMonth()!==m-1?'out':''} ${ds===UI.today()?'today':''}" onclick="Ops.editContent(null,{date:'${ds}'${curClient()?`,clientId:'${curClient()}'`:''}})"><div class="n">${d.getDate()}</div>${shown}</div>`;
    }
    const calClients = activeClients().filter(c=>needsCal(c)||needsRep(c)).filter(c=>App.matchUnit(c.units||[])).filter(c=>cm(c.id));
    const monthCnt = content.filter(p=>p.date?.startsWith(calCursor));
    const html = `<div class="toolbar"><button class="btn g sm" onclick="Ops.calMove(-1)">‹</button><div class="b" style="font-size:17px;min-width:170px;text-align:center">${UI.ymLabel(calCursor)}</div><button class="btn g sm" onclick="Ops.calMove(1)">›</button>
        <button class="btn g sm" onclick="Ops.calMove(0)">Hoy</button><span class="grow"></span>
        <button class="btn p" onclick="Ops.editContent()">＋ Contenido</button></div>
      <div class="row wrap xs b muted" style="margin-bottom:12px;gap:14px">${CONTENT_ST.map(([k,l])=>`<span><span style="color:${CONTENT_COL[k]}">●</span> ${l} (${monthCnt.filter(p=>p.status===k).length})</span>`).join('')}<span>🤝 Reunión</span><span>☐ Tarea</span></div>
      <div class="cal">${grid}</div>
      <div class="sec-t">Entregables · calendario de ${UI.ymLabel(calCursor)} y reporte de ${UI.ymLabel(UI.ym(new Date(+calCursor.slice(0,4), +calCursor.slice(5)-2, 1)))}</div>
      ${calClients.length?`<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Calendario</th><th>Reporte</th><th class="hide-m">Piezas cargadas</th><th class="hide-m">Aprobadas / publicadas</th><th>Responsable</th></tr></thead><tbody>
        ${calClients.map(c=>{ const st = calRec(c.id,calCursor)?.stage||'planificar'; const ps = monthCnt.filter(p=>p.clientId===c.id); const ok = ps.filter(p=>['aprobado','publicado'].includes(p.status)).length;
          return `<tr><td class="b"><a href="#/ops/cliente/${c.id}" style="color:inherit;text-decoration:none">${esc(c.name)}</a></td>
          <td><select class="inp sm" onchange="Ops.setCal('${c.id}','${calCursor}',this.value)" style="${CAL_OK.includes(st)?'border-color:var(--green)':''}">${CAL_ST.map(([k,l])=>`<option value="${k}" ${k===st?'selected':''}>${l}</option>`).join('')}</select><div class="xs faint" style="margin-top:3px">entrega ${UI.fdate(dayIn(UI.ym(new Date(+calCursor.slice(0,4), +calCursor.slice(5)-2, 1)), c.calendarDay||25),{abs:true})}</div></td>
          <td>${needsRep(c)?(()=>{ const rm = UI.ym(new Date(+calCursor.slice(0,4), +calCursor.slice(5)-2, 1)), rs = repRec(c.id, rm)?.stage||'pendiente'; return `<select class="inp sm" onchange="Ops.setRep('${c.id}','${rm}',this.value)" style="${REP_OK.includes(rs)?'border-color:var(--green)':''}">${REP_ST.map(([k,l])=>`<option value="${k}" ${k===rs?'selected':''}>${l}</option>`).join('')}</select><div class="xs faint" style="margin-top:3px">se presenta ${UI.fdate(dayIn(calCursor.slice(0,7)===UI.ym()?UI.ym():calCursor, c.reportDay||5),{abs:true})}</div>`; })():'<span class="faint">—</span>'}</td>
          <td class="hide-m">${ps.length}</td><td class="hide-m"><div class="row"><div class="bar grow" style="max-width:120px"><div style="width:${ps.length?ok/ps.length*100:0}%;background:var(--green)"></div></div><span class="xs">${ok}/${ps.length}</span></div></td>
          <td>${UI.avatar(App.member(c.ownerId),'sm')}</td></tr>`; }).join('')}</tbody></table></div>`
        : '<div class="card empty small">Los clientes con unidad Social Media o Producción de contenido aparecen acá para seguir su calendario mensual.</div>'}`;
    return { html };
  }

  function setRep(cid, month, stage){
    const prev = repRec(cid, month)?.stage;
    Store.upsert('ops','reports',{ id:cid+'_'+month, clientId:cid, month, stage });
    if(REP_OK.includes(stage) && !REP_OK.includes(prev)) Game.log('report_done', `Reporte presentado: ${clientName(cid)} (${UI.ymLabel(month)})`, { icon:'📊' });
    App.render();
  }
  function setCal(cid, month, stage){
    const prev = calRec(cid, month)?.stage;
    Store.upsert('ops','calendars',{ id:cid+'_'+month, clientId:cid, month, stage });
    if(CAL_OK.includes(stage) && !CAL_OK.includes(prev)) Game.log('calendar_approved', `Calendario aprobado: ${clientName(cid)} (${UI.ymLabel(month)})`, { icon:'🗓️' });
    App.render();
  }

  // ── Reuniones y minutas ──────────────────────────────────────────────────────
  function meetRow(m){
    const past = (m.date||'').slice(0,10) < UI.today();
    return `<div class="li click" onclick="Ops.viewMeeting('${m.id}')"><div style="text-align:center;min-width:44px"><div class="b" style="font-size:17px;line-height:1">${m.date?UI.parse(m.date).getDate():'?'}</div><div class="xs faint b">${m.date?UI.MONTHS[UI.parse(m.date).getMonth()].slice(0,3).toUpperCase():''}</div></div>
      <div class="grow"><div class="b small ellip">${esc(m.title)}</div><div class="xs faint ellip">${esc(clientName(m.clientId))} · ${esc(label(MEET_TYPES,m.type))}${UI.time(m.date)?' · '+UI.time(m.date):''}</div>
      ${(m.topics||[]).length?`<div class="row wrap" style="gap:4px;margin-top:4px">${m.topics.map(t=>`<span class="tag xs">#${esc(t)}</span>`).join('')}</div>`:''}</div>
      ${past ? (m.minuta?'<span class="tag t-green">Minuta ✓</span>':'<span class="tag t-yellow">Sin minuta</span>') : '<span class="tag t-blue">Próxima</span>'}</div>`;
  }

  function viewMeetings(){
    let ms = S('meetings').filter(unitOk);
    ms = ms.filter(m=>cm(m.clientId));
    const topics = {};
    S('meetings').forEach(m=>(m.topics||[]).forEach(t=>topics[t]=(topics[t]||0)+1));
    if(meetTopic) ms = ms.filter(m=>(m.topics||[]).includes(meetTopic));
    if(search) ms = ms.filter(m=>[m.title,m.minuta,m.decisiones,clientName(m.clientId)].join(' ').toLowerCase().includes(search.toLowerCase()));
    const t = UI.today();
    const up = ms.filter(m=>(m.date||'').slice(0,10)>=t).sort((a,b)=>a.date.localeCompare(b.date));
    const past = ms.filter(m=>(m.date||'').slice(0,10)<t).sort((a,b)=>b.date.localeCompare(a.date));
    const noMin = past.filter(m=>!m.minuta);
    const openActions = S('meetings').flatMap(m=>(m.actions||[]).filter(a=>!a.taskId).map(a=>({...a, m})));
    const html = `<div class="toolbar"><div class="search grow"><input class="inp" placeholder="Buscar en reuniones y minutas…" value="${esc(search)}" oninput="Ops.setSearch(this.value)"></div>
        <button class="btn p" onclick="Ops.editMeeting()">＋ Reunión</button></div>
      <div class="grid g3"><div class="span2 col" style="gap:18px">
        ${pendingMinutas().map(m=>`<div class="alert info" style="margin:0"><div class="ai">📥</div><div class="grow"><div class="at">Minuta para cargar: ${esc(m.title)}</div><div class="ad">${esc(m.client||'Interna')} · ${UI.fdate(m.date.slice(0,10),{abs:true})} · ${m.tasks.length} tareas${(m.content||[]).length?` · ${m.content.length} piezas de calendario`:''}</div></div><button class="btn sm p" onclick="Ops.importMinuta('${m.id}')">Revisar y cargar</button></div>`).join('')}
        ${noMin.length?`<div class="alert warn"><div class="ai">📝</div><div class="grow"><div class="at">${noMin.length} reunión${noMin.length>1?'es':''} sin minuta</div><div class="ad">Cargar la minuta suma +${Game.XP.minuta} XP y convierte los acuerdos en tareas.</div></div></div>`:''}
        <div class="card"><div class="card-h"><h3>Próximas</h3><span class="sub">${up.length}</span></div>${up.length?`<div class="list">${up.map(meetRow).join('')}</div>`:'<div class="empty small">No hay reuniones agendadas</div>'}</div>
        <div class="card"><div class="card-h"><h3>Pasadas</h3><span class="sub">${past.length}</span></div>${past.length?`<div class="list">${past.slice(0,40).map(meetRow).join('')}</div>`:'<div class="empty small">Sin reuniones registradas</div>'}</div>
      </div><div class="col" style="gap:18px">
        <div class="card"><div class="card-h"><h3># Temáticas</h3></div>${Object.keys(topics).length?`<div class="chips">${Object.entries(topics).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<button class="chip ${meetTopic===k?'on':''}" onclick="Ops.setTopic(${esc(JSON.stringify(k))})">#${esc(k)} <span class="faint">${n}</span></button>`).join('')}</div>`:'<div class="small faint">Etiquetá las reuniones con temáticas (ej: “precios”, “campaña día de la madre”) para encontrarlas después.</div>'}</div>
        <div class="card"><div class="card-h"><h3>Acuerdos sin convertir en tarea</h3><span class="sub">${openActions.length}</span></div>
          ${openActions.length?`<div class="list">${openActions.slice(0,12).map(a=>`<div class="li"><div class="grow"><div class="small b">${esc(a.text)}</div><div class="xs faint">${esc(a.m.title)}</div></div><button class="btn xs g" onclick="Ops.actionToTask('${a.m.id}','${a.id}')">→ Tarea</button></div>`).join('')}</div>`:'<div class="small faint">Todo acuerdo de reunión ya tiene su tarea. 👌</div>'}</div>
      </div></div>`;
    return { html };
  }

  // Extrae acuerdos / próximos pasos de un texto pegado (minuta propia o resumen de IA)
  function extractActions(text){
    const lines = (text||'').split(/\r?\n/);
    const head = /(acci[oó]n|action item|tarea|pr[oó]ximos pasos|next step|to-?do|pendiente|acuerdo|compromiso)/i;
    const bullet = /^\s*(?:[-*•·]|\d+[.)]|\[ ?\]|- \[ ?\])\s+/;
    let inSec = false; const out = [];
    lines.forEach(l=>{
      const clean = l.replace(/^#+\s*/,'').trim();
      if(!clean){ return; }
      if(head.test(clean) && clean.length<60 && !bullet.test(l)){ inSec = true; return; }
      if(/^#+\s|:\s*$/.test(l) && !head.test(clean)){ inSec = false; }
      if((inSec && bullet.test(l)) || /\[ ?\]/.test(l)) out.push(l.replace(bullet,'').replace(/^\[ ?\]\s*/,'').trim());
    });
    if(out.length) return out.filter(Boolean);
    // Sin secciones ni checkboxes: tomar mensajes de WhatsApp ("[28/9/26, 5:48 p. m.] Nombre: texto") y viñetas/párrafos sueltos
    const wa = /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?[^\]]*\]?\s*-?\s*([^:]{2,40}):\s*(.+)$/;
    lines.forEach(l=>{
      const t = l.trim(); if(!t || t.length<8) return;
      const m = t.match(wa);
      if(m){ out.push(`${m[2].trim()} @${m[1].trim().split(' ')[0]}`); return; }
      if(!/:\s*$/.test(t)) out.push(t.replace(bullet,'').trim());
    });
    return out.filter(Boolean);
  }
  // "texto @Nombre 12/10" → { text, assigneeId, due }
  function parseAction(s){
    let assigneeId = '', due = '';
    App.members().forEach(m=>{ const re = new RegExp('@'+m.name.split(' ')[0]+'\\b','i'); if(re.test(s)){ assigneeId = m.id; s = s.replace(re,'').trim(); } });
    const dm = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if(dm){ const y = dm[3] ? (dm[3].length===2?'20'+dm[3]:dm[3]) : new Date().getFullYear(); due = `${y}-${UI.pad(dm[2])}-${UI.pad(dm[1])}`; s = s.replace(dm[0],'').trim(); }
    return { text:s.replace(/\s{2,}/g,' ').replace(/[-–,]\s*$/,'').trim(), assigneeId, due };
  }

  // ── Alertas ──────────────────────────────────────────────────────────────────
  let aSelMode = false; const aSel = new Set();
  function viewAlerts(){
    const al = alerts().filter(a=>cm(a.cid));
    const hidden = allAlerts().filter(a=>cm(a.cid) && a.key && dismissed().has(a.key)).length;
    const sec = (lvl, t) => { const xs = al.filter(a=>a.level===lvl); return xs.length ? `<div class="sec-t">${t} · ${xs.length}</div>` + xs.map(a=>alertRow(a, true)).join('') : ''; };
    const bar = `<div class="toolbar"><div class="small muted grow">Las alertas se calculan solas. “Avisar” la manda a la persona responsable; ✕ la descarta por 7 días (vuelve si el problema sigue).</div>
      <button class="chip ${aSelMode?'on':''}" onclick="Ops.aSelMode(${!aSelMode})">☑ Seleccionar</button>
      <button class="btn g" onclick="Ops.downloadAlerts()">⇣ Descargar</button><button class="btn g" onclick="App.sendAlert()">📣 Alerta manual</button></div>`;
    const selbar = aSelMode ? `<div class="selbar"><b>${aSel.size} seleccionada${aSel.size!==1?'s':''}</b>
      <button class="btn xs g" onclick="Ops.aPickAll()">${al.length && al.filter(a=>a.key).every(a=>aSel.has(a.key))?'Ninguna':'Todas ('+al.filter(a=>a.key).length+')'}</button>
      ${aSel.size?`<span class="sep"></span><button class="btn xs d" onclick="Ops.dismissSel(7)">✕ Descartar 7 días</button><button class="btn xs g" onclick="Ops.dismissSel(30)">Descartar 30 días</button><button class="btn xs g" onclick="Ops.downloadAlerts(true)">⇣ Descargar estas</button>`:'<span class="xs faint">Tocá las alertas para elegirlas</span>'}
      <span class="grow"></span><button class="btn xs g" onclick="Ops.aSelMode(false)">✕ Salir</button></div>` : '';
    const foot = hidden ? `<p class="xs faint" style="margin-top:14px">${hidden} alerta${hidden>1?'s':''} descartada${hidden>1?'s':''} · <a href="#" onclick="Ops.restoreAlerts();return false">Volver a mostrarlas</a></p>` : '';
    return { html: bar + (al.length ? sec('danger','🔴 Urgente') + sec('warn','🟡 Para atender') + sec('info','🔵 Para hoy') : '<div class="card empty"><div class="big">🎉</div>No hay alertas. ¡Todo al día!</div>') + foot + selbar };
  }
  function alertRow(a, selectable){
    const to = App.member(a.to);
    const msg = `${a.icon} ${a.title}\n${a.desc}`;
    const picking = selectable && aSelMode && a.key;
    return `<div class="alert ${a.level} ${picking&&aSel.has(a.key)?'picked':''}" ${picking?`style="cursor:pointer" onclick="Ops.aPick(${esc(JSON.stringify(a.key))})"`:''}>${picking?`<input type="checkbox" ${aSel.has(a.key)?'checked':''} style="width:18px;height:18px;pointer-events:none;margin-top:2px">`:''}<div class="ai">${a.icon}</div><div class="grow"><div class="at">${esc(a.title)}</div><div class="ad">${esc(a.desc)}</div></div>
      ${to?UI.avatar(to,'sm'):''}${picking?'':`<a class="btn xs g" href="${a.link}">Ir</a><button class="btn xs g" onclick="App.sendAlert(${esc(JSON.stringify(msg))}, ${esc(JSON.stringify(a.to||'all'))}, ${esc(JSON.stringify(a.link))})">Avisar</button>${a.key?`<button class="icon-btn" title="Descartar por 7 días" onclick="Ops.dismiss(${esc(JSON.stringify(a.key))})">✕</button>`:''}`}</div>`;
  }

  // ── Formularios / acciones ──────────────────────────────────────────────────
  const clientOpts = (empty='— Interna / sin cliente —') => [['',empty], ...activeClients().map(c=>[c.id,c.name])];

  const Ops = {
    HEALTH, activeClients, daysSinceUpdate, overdueTasks, openTasks, alerts, nextMonthCalendarPending, clientName, client, alertRow, taskRow, meetRow, label, TASK_ST,
    setSearch(v){ search = v; const pos = document.activeElement?.selectionStart; App.render(); const i = $('.search input'); if(i){ i.focus(); try{ i.setSelectionRange(pos,pos); }catch(e){} } },
    setWho(v){ taskWho = v; App.render(); },
    setMode(v){ taskMode = v; localStorage.setItem('anm_taskmode', v); App.render(); },
    setTopic(v){ meetTopic = meetTopic===v ? '' : v; App.render(); },
    setClient(v){ setCF(v); if(location.hash.startsWith('#/ops')) App.render(); else App.go('#/ops'); window.scrollTo(0,0); },
    setClientFilter(v){ Ops.setClient(v); },
    calMove(n){ if(!n){ calCursor = UI.ym(); } else { const [y,m] = calCursor.split('-').map(Number); calCursor = UI.ym(new Date(y, m-1+n, 1)); } App.render(); },
    setCal, setRep,
    setDelivLink(kind, cid, month, link){ Store.upsert('ops', kind==='rep'?'reports':'calendars', { id:cid+'_'+month, clientId:cid, month, link }); App.render(); },

    editClient(id){
      const c = id ? client(id) : {};
      UI.form({ title: id ? 'Editar cliente' : 'Nuevo cliente', values:c, fields:[
        { k:'name', label:'Nombre', req:true },
        { k:'units', label:'Unidades de negocio', type:'multi', options:App.unitOpts(), req:true },
        { k:'ownerId', label:'Responsable', type:'select', options:App.memberOpts(), half:true },
        { k:'health', label:'Estado', type:'select', options:Object.entries(HEALTH).map(([k,[l,e]])=>[k,e+' '+l]), half:true, default:'ok' },
        { k:'teamIds', label:'Equipo que trabaja la cuenta', type:'multi', options:App.members().map(m=>[m.id,m.name]) },
        { k:'contactName', label:'Contacto del cliente', half:true }, { k:'contactPhone', label:'WhatsApp', half:true, placeholder:'54911…' },
        { k:'contactEmail', label:'Email', type:'email', half:true }, { k:'link', label:'Link a carpeta / Drive', half:true },
        { k:'calendarDay', label:'Día de entrega del calendario', type:'number', half:true, default:25, hint:'Día del mes en que se entrega el calendario del mes siguiente' },
        { k:'reportDay', label:'Día del reporte', type:'number', half:true, default:5, hint:'Día del mes en que se presenta el reporte del mes anterior' },
        { k:'notes', label:'Notas (accesos, tono de marca, particularidades)', type:'textarea', rows:3 },
      ],
      danger: id ? (c.active===false ? { label:'Reactivar', fn:()=>{ Store.upsert('ops','clients',{ id, active:true }); App.render(); } }
        : { label:'Dar de baja', confirm:`¿Dar de baja a ${c.name}? Se conserva todo el historial.`, fn:()=>Ops.churn(id) }) : null,
      onSubmit:v=>{ const r = Store.upsert('ops','clients',{ ...c, ...v, active:c.active??true }); if(!id) UI.toast(`Cliente ${v.name} creado`,'🗂️'); App.go(id?location.hash:'#/ops/cliente/'+r.id); } });
    },

    churn(id){
      const c = client(id);
      Store.upsert('ops','clients',{ id, active:false, churnedAt:UI.today() });
      if(App.canGrowth() && confirm(`${c.name} quedó inactivo.\n\n¿Lo agrego a “Ex clientes” en Crecimiento para intentar recuperarlo más adelante?`)) Growth.fromChurn(c);
      App.go('#/ops');
    },

    updateClient(id){
      id = id || curClient() || null;
      const cs = activeClients();
      if(!cs.length) return Ops.editClient();
      const c = id ? client(id) : null;
      UI.form({ title:'📡 ¿En qué estamos?', submit:`Guardar (+${Game.XP.client_update} XP)`, values:{ clientId:id||'', health:c?.health||'ok', nextStep:c?.nextStep||'', nextStepDate:c?.nextStepDate||'' }, fields:[
        ...(id ? [] : [{ k:'clientId', label:'Cliente', type:'select', options:cs.map(x=>[x.id,x.name]), req:true }]),
        { k:'health', label:'¿Cómo está la cuenta?', type:'select', options:Object.entries(HEALTH).map(([k,[l,e]])=>[k,e+' '+l]) },
        { k:'text', label:'Estado actual', type:'textarea', req:true, placeholder:'Ej: Se aprobó el calendario de octubre. Esperamos fotos de producto para los reels. El cliente pidió sumar una campaña para el Hot Sale.', rows:5 },
        { k:'nextStep', label:'Próximo paso', half:true }, { k:'nextStepDate', label:'Para cuándo', type:'date', half:true },
      ], onSubmit:v=>{
        const cid = id || v.clientId;
        Store.upsert('ops','updates',{ clientId:cid, at:new Date().toISOString(), by:App.me().id, health:v.health, text:v.text, nextStep:v.nextStep });
        Store.upsert('ops','clients',{ id:cid, health:v.health, status:v.text, nextStep:v.nextStep, nextStepDate:v.nextStepDate });
        Game.log('client_update', `Seguimiento de ${clientName(cid)}`, { icon:'📡', ref:cid });
        if(v.health==='riesgo'){ const cl = client(cid); App.notify('all', `🔴 ${cl.name} quedó en riesgo: ${v.text}`, '#/ops/cliente/'+cid); }
        App.render();
      } });
    },

    editTask(id, preset={}){
      const t = id ? Store.get('ops','tasks',id) : { status:'todo', priority:'media', assigneeId:App.me().id, clientId:curClient(), ...preset };
      if(!t.unit && t.clientId) t.unit = (client(t.clientId)?.units||[])[0];
      UI.form({ title: id ? 'Tarea' : 'Nueva tarea', values:t, fields:[
        { k:'title', label:'¿Qué hay que hacer?', req:true },
        { k:'clientId', label:'Cliente', type:'select', options:clientOpts(), half:true }, { k:'unit', label:'Unidad', type:'select', options:[['','—'],...App.unitOpts()], half:true },
        { k:'assigneeId', label:'Responsable', type:'select', options:App.assignOpts(), half:true, hint:App.isAdmin()?'':'Solo los socios pueden asignar a otras personas.' }, { k:'due', label:'Vence', type:'date', half:true },
        { k:'status', label:'Estado', type:'select', options:TASK_ST, half:true }, { k:'priority', label:'Prioridad', type:'select', options:PRIO, half:true },
        { k:'desc', label:'Detalle', type:'textarea', rows:3 },
      ], danger: id ? { label:'Eliminar', confirm:'¿Eliminar la tarea?', fn:()=>{ Store.remove('ops','tasks',id); App.render(); } } : null,
      onSubmit:v=>{
        const prevStatus = t.status;
        const r = Store.upsert('ops','tasks',{ ...t, ...v, status:prevStatus });
        if(v.status!==prevStatus || !id) setTaskStatus(r.id, v.status);
        if(!id){ UI.toast('Tarea creada','✅'); if(v.assigneeId && v.assigneeId!==App.me().id) App.notify(v.assigneeId, `Te asignaron: ${v.title}${v.due?' (vence '+UI.fdate(v.due,{abs:true})+')':''}`, '#/ops/tareas'); }
        App.render();
      } });
    },
    dismiss(key, days=7){ Store.upsert('ops','dismissed',{ id:key, until:UI.addDays(UI.today(), days), by:App.me().id }); UI.toast(`Alerta descartada por ${days} días`,'✕'); App.render(); },
    aSelMode(on){ aSelMode = !!on; aSel.clear(); App.render(); },
    aPick(k){ aSel.has(k) ? aSel.delete(k) : aSel.add(k); App.render(); },
    aPickAll(){ const ks = alerts().filter(a=>cm(a.cid) && a.key).map(a=>a.key), all = ks.length && ks.every(k=>aSel.has(k)); aSel.clear(); if(!all) ks.forEach(k=>aSel.add(k)); App.render(); },
    dismissSel(days){ const n = aSel.size; aSel.forEach(k=>Store.upsert('ops','dismissed',{ id:k, until:UI.addDays(UI.today(), days), by:App.me().id })); aSel.clear(); UI.toast(`${n} alerta${n!==1?'s':''} descartada${n!==1?'s':''} por ${days} días`,'✕'); App.render(); },
    restoreAlerts(){ S('dismissed').forEach(d=>Store.remove('ops','dismissed',d.id)); UI.toast('Alertas restauradas','↩'); App.render(); },
    // Descarga en CSV (se abre en Excel / Google Sheets)
    downloadAlerts(onlySel){
      let al = alerts().filter(a=>cm(a.cid)); if(onlySel) al = al.filter(a=>aSel.has(a.key));
      const lvl = { danger:'Urgente', warn:'Para atender', info:'Para hoy' };
      const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
      const rows = [['Nivel','Alerta','Detalle','Cliente','Responsable'], ...al.map(a=>[lvl[a.level], a.title, a.desc, a.cid?clientName(a.cid):'Interna', App.member(a.to)?.name||''])];
      const blob = new Blob(['\ufeff'+rows.map(r=>r.map(q).join(';')).join('\n')], { type:'text/csv;charset=utf-8' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `alertas-anm-${UI.today()}.csv`; link.click();
      UI.toast(`${al.length} alerta${al.length!==1?'s':''} descargada${al.length!==1?'s':''}`,'⇣');
    },
    selMode(on){ selMode = !!on; sel.clear(); App.render(); },
    selectHere(){ selMode = true; sel.clear(); taskMode = 'list'; App.go('#/ops/tareas'); },
    pick(id){ sel.has(id) ? sel.delete(id) : sel.add(id); App.render(); },
    pickAll(){ const all = visibleTasks.length && visibleTasks.every(id=>sel.has(id)); sel.clear(); if(!all) visibleTasks.forEach(id=>sel.add(id)); App.render(); },
    pickGroup(ids){ const list = ids.split(',').filter(Boolean), all = list.every(id=>sel.has(id)); list.forEach(id=>all ? sel.delete(id) : sel.add(id)); App.render(); },
    // Acciones en bloque sobre las tareas seleccionadas
    bulk(action, value){
      const me = App.me(), admin = App.isAdmin();
      let ids = [...sel].filter(id=>Store.get('ops','tasks',id));
      if(!ids.length) return;
      // Quien no es socio solo puede tocar sus propias tareas
      const own = ids.filter(id=>admin || Store.get('ops','tasks',id).assigneeId===me.id);
      if(own.length<ids.length) UI.toast(`${ids.length-own.length} tarea(s) no son tuyas: solo los socios pueden modificarlas`,'⚠️');
      ids = own; if(!ids.length) return App.render();
      const n = ids.length, s = n!==1?'s':'';
      if(action==='done' || action==='status'){
        const st = action==='done' ? 'done' : value; if(!st) return;
        let changed = 0; const before = {};
        ids.forEach(id=>{ const t = Store.get('ops','tasks',id); if(t.status===st) return;
          if(st==='done' && t.assigneeId && !(t.assigneeId in before)) before[t.assigneeId] = Game.perf(t.assigneeId).pct;
          Store.upsert('ops','tasks',{ id, status:st, doneAt: st==='done' ? new Date().toISOString() : null }); changed++; });
        if(st==='done' && changed){ Game.log('task_done', `${changed} tarea${changed!==1?'s':''} completada${changed!==1?'s':''}`, { icon:'✅' }); Object.keys(before).forEach(m=>Game.celebrate(m, before[m])); }
        else UI.toast(`${n} tarea${s} → ${label(TASK_ST,st)}`,'✓');
      }
      if(action==='assign' && value){
        ids.forEach(id=>Store.upsert('ops','tasks',{ id, assigneeId:value }));
        const who = App.member(value);
        if(value!==me.id && confirm(`${n} tarea${s} asignada${s} a ${who.name}. ¿Le mando el aviso con la lista?`)) Ops.bulk('alert');
        else UI.toast(`${n} tarea${s} asignada${s} a ${who.name.split(' ')[0]}`,'👤');
      }
      if(action==='due' && value){ ids.forEach(id=>Store.upsert('ops','tasks',{ id, due:value })); UI.toast(`Nueva fecha para ${n} tarea${s}: ${UI.fdate(value,{abs:true})}`,'📅'); }
      if(action==='client' && value){ const cid = value==='__int' ? '' : value; ids.forEach(id=>Store.upsert('ops','tasks',{ id, clientId:cid })); UI.toast(`${n} tarea${s} movida${s} a ${cid?clientName(cid):'Internas'}`,'↪'); }
      if(action==='priority' && value){ ids.forEach(id=>Store.upsert('ops','tasks',{ id, priority:value })); UI.toast(`Prioridad actualizada en ${n} tarea${s}`,'🔥'); }
      if(action==='alert'){
        const by = {}; ids.map(id=>Store.get('ops','tasks',id)).filter(t=>t.status!=='done' && t.assigneeId && t.assigneeId!==me.id).forEach(t=>(by[t.assigneeId] = by[t.assigneeId]||[]).push(t));
        const who = Object.keys(by); if(!who.length) return UI.toast('Ninguna de estas tareas está asignada a otra persona','ℹ️');
        who.forEach(p=>{ App.notify(p, `📋 Tenés ${by[p].length} tarea${by[p].length>1?'s':''} asignada${by[p].length>1?'s':''}:\n${by[p].map(t=>`• ${t.title} (${clientName(t.clientId)}${t.due?' · vence '+UI.fdate(t.due,{abs:true}):''})`).join('\n')}`, '#/ops/tareas');
          by[p].forEach(t=>Store.upsert('ops','tasks',{ id:t.id, alertedTo:t.assigneeId, alertedAt:new Date().toISOString() })); });
        Game.log('alert_sent', `Avisos enviados a ${who.map(p=>App.member(p)?.name.split(' ')[0]).join(', ')}`, { icon:'📣' });
      }
      if(action==='delete'){
        if(!confirm(`¿Eliminar ${n} tarea${s}? No se puede deshacer.`)) return;
        ids.forEach(id=>Store.remove('ops','tasks',id)); sel.clear(); UI.toast(`${n} tarea${s} eliminada${s}`,'🗑');
      }
      App.render();
    },
    toggleTask(id){ const t = Store.get('ops','tasks',id); setTaskStatus(id, t.status==='done' ? 'todo' : 'done'); },

    editContent(id, preset={}){
      const p = id ? Store.get('ops','content',id) : { status:'idea', format:'post', date:UI.today(), assigneeId:App.me().id, clientId:curClient(), ...preset };
      UI.form({ title: id ? 'Pieza de contenido' : 'Nueva pieza de contenido', values:p, fields:[
        { k:'title', label:'Título / idea', req:true, placeholder:'Ej: Reel lanzamiento colección' },
        { k:'clientId', label:'Cliente', type:'select', options:clientOpts('— Contenido propio ANM —'), half:true }, { k:'date', label:'Fecha de publicación / entrega', type:'date', req:true, half:true },
        { k:'format', label:'Formato', type:'select', options:FORMATS, half:true }, { k:'status', label:'Estado', type:'select', options:CONTENT_ST, half:true },
        { k:'unit', label:'Unidad', type:'select', options:[['','(la del cliente)'],...App.unitOpts()], half:true }, { k:'assigneeId', label:'Responsable', type:'select', options:App.assignOpts(), half:true },
        { k:'notes', label:'Copy / brief / links', type:'textarea', rows:4 },
      ], danger: id ? { label:'Eliminar', confirm:'¿Eliminar la pieza?', fn:()=>{ Store.remove('ops','content',id); App.render(); } } : null,
      onSubmit:v=>{
        Store.upsert('ops','content',{ ...p, ...v });
        if(!id) Game.log('content', `Contenido agendado: ${v.title}`, { icon:'🎬' });
        else if(v.status==='publicado' && p.status!=='publicado') Game.log('content_published', `Publicado: ${v.title}`, { icon:'🚀' });
        App.render();
      } });
    },

    // Vista de minuta: texto arriba, tareas bajadas abajo (asignables) y botón para mandar alertas
    viewMeeting(id){
      const m = Store.get('ops','meetings',id); if(!m) return;
      const tasks = S('tasks').filter(t=>t.meetingId===id).sort((a,b)=>(a.due||'9').localeCompare(b.due||'9'));
      const loose = (m.actions||[]).filter(a=>!a.taskId || !Store.get('ops','tasks',a.taskId));
      const opts = App.assignOpts();
      const pending = tasks.filter(t=>t.status!=='done' && t.assigneeId && t.assigneeId!==App.me().id && t.alertedTo!==t.assigneeId).length;
      const people = App.members().filter(x=>(m.attendees||[]).includes(x.id)).map(x=>x.name.split(' ')[0]).join(', ');
      UI.modal(`<h2>🤝 ${esc(m.title)}<button class="icon-btn x" data-close>✕</button></h2>
        <div class="row wrap small muted" style="gap:10px;margin:-8px 0 16px"><span class="tag t-blue">${esc(clientName(m.clientId))}</span><span>${UI.fdate((m.date||'').slice(0,10),{abs:true})}${UI.time(m.date)?' · '+UI.time(m.date):''}</span>${people?`<span>👥 ${esc(people)}</span>`:''}${(m.topics||[]).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}${m.link?`<a href="${esc(m.link)}" target="_blank">🔗 grabación / link</a>`:''}</div>
        <div class="card" style="padding:16px 18px;margin-bottom:12px"><div class="xs faint b" style="letter-spacing:1px;margin-bottom:8px">📝 MINUTA</div><div class="small prewrap" style="line-height:1.65">${esc(m.minuta||'Sin minuta cargada.')}</div>
          ${m.decisiones?`<div class="xs faint b" style="letter-spacing:1px;margin:14px 0 6px">✔ DECISIONES</div><div class="small prewrap" style="line-height:1.65">${esc(m.decisiones)}</div>`:''}</div>
        <div class="card" style="padding:16px 18px"><div class="row" style="margin-bottom:8px"><div class="xs faint b grow" style="letter-spacing:1px">✅ TAREAS BAJADAS (${tasks.length})</div><button class="btn xs g" onclick="UI.close();Ops.editTask(null,{clientId:'${m.clientId||''}',meetingId:'${id}'})">＋ Tarea</button></div>
          ${tasks.length?`<div class="list">${tasks.map(t=>`<div class="li" style="flex-wrap:wrap">
            <input type="checkbox" ${t.status==='done'?'checked':''} onchange="Ops.toggleTask('${t.id}');Ops.viewMeeting('${id}')" style="width:18px;height:18px">
            <div class="grow" style="min-width:220px"><input class="inp sm" style="width:100%;font-weight:700;${t.status==='done'?'text-decoration:line-through;color:var(--text3)':''}" value="${esc(t.title)}" onchange="Ops.assignFromMeeting('${t.id}','${id}',{title:this.value})">${t.alertedTo&&t.alertedTo===t.assigneeId?'<div class="xs" style="color:var(--green);margin-top:2px">✓ avisada</div>':''}</div>
            <select class="inp sm" onchange="Ops.assignFromMeeting('${t.id}','${id}',{assigneeId:this.value})">${[['','— Sin asignar —'],...opts.filter(o=>o[0])].map(([v,l])=>`<option value="${v}" ${t.assigneeId===v?'selected':''}>${esc(l)}</option>`).join('')}${t.assigneeId&&!opts.some(o=>o[0]===t.assigneeId)?`<option selected>${esc(App.member(t.assigneeId)?.name||'—')}</option>`:''}</select>
            <input class="inp sm" type="date" value="${t.due||''}" onchange="Ops.assignFromMeeting('${t.id}','${id}',{due:this.value})"><button class="icon-btn" title="Eliminar tarea" onclick="if(confirm('¿Eliminar esta tarea?')){Store.remove('ops','tasks','${t.id}');Ops.viewMeeting('${id}')}">🗑</button></div>`).join('')}</div>`:'<div class="small faint">Todavía no hay tareas de esta reunión.</div>'}
          ${loose.length?`<div class="xs faint b" style="margin:12px 0 6px">ACUERDOS SIN TAREA</div>${loose.map(a=>`<div class="li"><div class="grow small">${esc(a.text)}</div><button class="btn xs g" onclick="Ops.actionToTask('${id}','${a.id}',true);Ops.viewMeeting('${id}')">→ Tarea</button></div>`).join('')}`:''}</div>
        <div class="mfoot"><button class="btn g" style="margin-right:auto" onclick="Ops.copyMeeting('${id}')">📋 Copiar resumen (WhatsApp)</button><button class="btn g" onclick="UI.close();Ops.editMeeting('${id}')">✎ Editar</button>
          <button class="btn p" onclick="Ops.alertMeeting('${id}')">📣 Mandar alertas de tareas asignadas${pending?` (${pending})`:''}</button></div>`, true);
    },
    assignFromMeeting(tid, mid, patch){
      Store.upsert('ops','tasks',{ id:tid, ...patch });
      Ops.viewMeeting(mid);
    },
    // Una alerta por persona con todas sus tareas de la reunión (llega en la plataforma y por mail)
    alertMeeting(id){
      const m = Store.get('ops','meetings',id); if(!m) return;
      const tasks = S('tasks').filter(t=>t.meetingId===id && t.status!=='done' && t.assigneeId);
      const by = {}; tasks.forEach(t=>{ (by[t.assigneeId] = by[t.assigneeId]||[]).push(t); });
      const who = Object.keys(by).filter(p=>p!==App.me().id);
      if(!who.length) return UI.toast('No hay tareas asignadas a otras personas','ℹ️');
      const resumen = who.map(p=>`${App.member(p)?.name.split(' ')[0]} (${by[p].length})`).join(', ');
      if(!confirm(`Voy a avisar a: ${resumen}.\n\nCada uno recibe la lista de sus tareas de “${m.title}” en la plataforma y por mail.`)) return;
      who.forEach(p=>{
        const list = by[p].map(t=>`• ${t.title}${t.due?` (vence ${UI.fdate(t.due,{abs:true})})`:''}`).join('\n');
        App.notify(p, `📋 Reunión “${m.title}” (${clientName(m.clientId)}): te quedaron ${by[p].length} tarea${by[p].length>1?'s':''}:\n${list}`, '#/ops/tareas');
        by[p].forEach(t=>Store.upsert('ops','tasks',{ id:t.id, alertedTo:t.assigneeId, alertedAt:new Date().toISOString() }));
      });
      Game.log('alert_sent', `Alertas de “${m.title}” enviadas a ${who.length} persona${who.length>1?'s':''}`, { icon:'📣' });
      Ops.viewMeeting(id);
    },
    copyMeeting(id){
      const m = Store.get('ops','meetings',id);
      const tasks = S('tasks').filter(t=>t.meetingId===id);
      UI.copy(`*${m.title}* — ${clientName(m.clientId)} · ${UI.fdate((m.date||'').slice(0,10),{abs:true})}\n\n${m.minuta||''}${m.decisiones?`\n\n*Decisiones*\n${m.decisiones}`:''}\n\n*Tareas*\n${tasks.map(t=>`• ${t.title} → ${App.member(t.assigneeId)?.name.split(' ')[0]||'sin asignar'}${t.due?` (${UI.fdate(t.due,{abs:true})})`:''}`).join('\n')}`);
    },

    editMeeting(id, preset={}){
      const m = id ? Store.get('ops','meetings',id) : { type:(preset.clientId||curClient())?'seguimiento':'interna', date:UI.today()+'T10:00', attendees:[App.me().id], clientId:curClient(), ...preset };
      const actionsText = (m.actions||[]).map(a=>a.text + (a.taskId?'  ✓':'')).join('\n');
      const box = UI.form({ title: id ? '🤝 '+m.title : 'Nueva reunión', wide:true, submit: id ? 'Guardar' : 'Crear reunión', values:{ ...m, topics:(m.topics||[]).join(', '), actionsText }, fields:[
        { k:'title', label:'Título', req:true, placeholder:'Ej: Revisión mensual de resultados' },
        { k:'clientId', label:'Cliente', type:'select', options:clientOpts(), half:true }, { k:'type', label:'Tipo', type:'select', options:MEET_TYPES, half:true },
        { k:'date', label:'Fecha y hora', type:'datetime', req:true, half:true }, { k:'link', label:'Link (Meet, grabación, Read AI, Drive…)', half:true },
        { k:'attendees', label:'Participantes ANM', type:'multi', options:App.members().map(x=>[x.id,x.name]) },
        { k:'topics', label:'Temáticas (separadas por coma)', placeholder:'precios, campaña navidad, resultados', hint:'Sirven para encontrar todo lo que se habló de un tema.' },
        { k:'minuta', label:'Minuta / resumen', type:'textarea', rows:7, placeholder:'Qué se habló. Podés pegar el resumen de Read AI, Meet, Fathom, etc.' },
        { k:'decisiones', label:'Decisiones tomadas', type:'textarea', rows:3 },
        { k:'actionsText', label:'Acuerdos / próximos pasos (uno por línea)', type:'textarea', rows:4, placeholder:'Enviar propuesta de pauta @Santi 15/10\nPedir fotos de producto', hint:'Usá @Nombre para asignar y dd/mm para la fecha. Al guardar se convierten en tareas.' },
        { k:'mkTasks', label:'', type:'check', text:'Crear tareas automáticamente con los acuerdos nuevos', default:true },
      ],
      extra:`<button type="button" class="btn g sm" id="mt-extract" style="margin-bottom:8px">✨ Detectar acuerdos en la minuta</button>`,
      danger: id ? { label:'Eliminar', confirm:'¿Eliminar la reunión?', fn:()=>{ Store.remove('ops','meetings',id); App.render(); } } : null,
      onSubmit:v=>{
        const hadMinuta = !!m.minuta;
        const topics = v.topics.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
        const old = m.actions||[];
        const actions = v.actionsText.split('\n').map(s=>s.replace(/\s+✓$/,'').trim()).filter(Boolean).map(line=>{
          const prev = old.find(a=>a.text===line); return prev || { id:Store.uid(), text:line, taskId:null }; });
        const rec = Store.upsert('ops','meetings',{ ...m, title:v.title, clientId:v.clientId, type:v.type, date:v.date, link:v.link, attendees:v.attendees, topics, minuta:v.minuta, decisiones:v.decisiones, actions, by:m.by||App.me().id });
        if(!id) Game.log('meeting', `Reunión registrada: ${v.title}`, { icon:'🤝', silent:!!v.minuta });
        if(v.minuta && !hadMinuta) Game.log('minuta', `Minuta cargada: ${v.title}`, { icon:'📝' });
        if(v.mkTasks) actions.filter(a=>!a.taskId).forEach(a=>Ops.actionToTask(rec.id, a.id, true));
        App.render();
      } });
      box.querySelector('#mt-extract').onclick = ()=>{
        const found = extractActions(box.querySelector('#f_minuta').value);
        const ta = box.querySelector('#f_actionsText');
        if(!found.length) return UI.toast('No encontré acuerdos. Buscá secciones como “Próximos pasos” o líneas con [ ]','🔍');
        const cur = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
        ta.value = [...cur, ...found.filter(f=>!cur.includes(f))].join('\n');
        UI.toast(`${found.length} acuerdo${found.length>1?'s':''} detectado${found.length>1?'s':''}`,'✨');
      };
    },

    // Carga una minuta preparada: reunión + tareas (con responsable y fecha) + piezas de calendario
    importMinuta(id){
      const m = (window.ANM_MINUTAS||[]).find(x=>x.id===id); if(!m) return;
      const cl = clientByName(m.client);
      const members = App.members();
      const taskRow = (t={}, i) => { const as = memberByFirst(t.who)?.id || t.assigneeId || '';
        return `<div class="li im-row" style="flex-wrap:wrap;gap:8px"><input type="checkbox" checked class="im-on" style="width:18px;height:18px">
          <input class="inp sm im-text grow" style="min-width:240px" value="${esc(t.text||'')}" placeholder="Qué hay que hacer">
          <select class="inp sm im-who"><option value="">— Sin asignar —</option>${members.map(x=>`<option value="${x.id}" ${x.id===as?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
          <input class="inp sm im-due" type="date" value="${esc(t.due||'')}"><input type="hidden" class="im-unit" value="${esc(t.unit||'')}">
          <button type="button" class="icon-btn" title="Quitar" onclick="this.closest('.im-row').remove()">✕</button></div>`; };
      const box = UI.modal(`<h2>📥 Revisar minuta<button class="icon-btn x" data-close>✕</button></h2>
        <div class="fld"><label>Título</label><input class="inp" id="im-title" value="${esc(m.title)}"></div>
        <div class="frow"><div class="fld"><label>Cliente</label><select class="inp" id="im-client"><option value="">— Interna —</option>${activeClients().map(c=>`<option value="${c.id}" ${cl?.id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}${!cl&&m.client?`<option value="__new" selected>＋ Crear “${esc(m.client)}”</option>`:''}</select></div>
          <div class="fld"><label>Fecha</label><input class="inp" id="im-date" type="datetime-local" value="${esc(m.date)}"></div></div>
        <div class="fld"><label>📝 Minuta</label><textarea class="inp" id="im-minuta" rows="10" style="line-height:1.6">${esc(m.minuta||'')}</textarea></div>
        <div class="fld"><label>✔ Decisiones</label><textarea class="inp" id="im-dec" rows="3">${esc(m.decisiones||'')}</textarea></div>
        <div class="xs faint b" style="letter-spacing:1px;margin:6px 0">✅ TAREAS BAJADAS — editá el texto, a quién se asigna y la fecha (destildá o ✕ las que no van)</div>
        <div class="list" id="im-tasks">${m.tasks.map(taskRow).join('')}</div>
        <button type="button" class="btn g sm" style="margin:8px 0 14px" id="im-add">＋ Agregar tarea</button>
        ${(m.content||[]).length?`<div class="small muted" style="margin-bottom:6px">🗓️ También se agregan al calendario: ${m.content.map(c=>`${esc(c.title)} (${UI.fdate(c.date,{abs:true})})`).join(' · ')}</div>`:''}
        <div class="mfoot"><button class="btn d sm" id="im-skip" style="margin-right:auto">Descartar</button><button class="btn g" data-close>Cancelar</button>
          <button class="btn g" id="im-go">Cargar</button><button class="btn p" id="im-go-alert">Cargar y mandar alertas</button></div>`, true);
      box.querySelector('#im-add').onclick = ()=>{ box.querySelector('#im-tasks').insertAdjacentHTML('beforeend', taskRow({ due:UI.addDays(UI.today(),7) })); box.querySelector('#im-tasks .im-row:last-child .im-text').focus(); };
      box.querySelector('#im-skip').onclick = ()=>{ if(confirm('¿Descartar esta minuta? No se va a volver a mostrar.')){ Store.setSetting('minutasDescartadas', [...Store.setting('minutasDescartadas',[]), id]); UI.close(); App.render(); } };
      const go = alert => {
        let cid = box.querySelector('#im-client').value;
        const rows = [...box.querySelectorAll('.im-row')].filter(r=>r.querySelector('.im-on').checked).map(r=>({ text:r.querySelector('.im-text').value.trim(), assigneeId:r.querySelector('.im-who').value, due:r.querySelector('.im-due').value, unit:r.querySelector('.im-unit').value })).filter(r=>r.text);
        if(cid==='__new') cid = Store.upsert('ops','clients',{ name:m.client, units:[...new Set(m.tasks.map(t=>t.unit).filter(Boolean))].slice(0,3), health:'ok', active:true, ownerId:App.me().id }).id;
        const title = box.querySelector('#im-title').value.trim() || m.title;
        const attendees = (m.attendees||[]).map(memberByFirst).filter(Boolean).map(x=>x.id);
        const actions = rows.map(r=>{ const tk = Store.upsert('ops','tasks',{ title:r.text, clientId:cid, unit:r.unit||'', assigneeId:r.assigneeId, due:r.due, status:'todo', priority:'media', meetingId:m.id, desc:`De la reunión: ${title}` });
          return { id:Store.uid(), text:r.text, taskId:tk.id }; });
        (m.content||[]).forEach(c=>Store.upsert('ops','content',{ title:c.title, clientId:cid, date:c.date, format:c.format||'post', unit:c.unit||'', status:'idea', assigneeId:App.me().id }));
        Store.upsert('ops','meetings',{ id:m.id, title, clientId:cid, type:m.type||'seguimiento', date:box.querySelector('#im-date').value || m.date, attendees:attendees.length?attendees:[App.me().id], topics:m.topics||[],
          minuta:box.querySelector('#im-minuta').value, decisiones:box.querySelector('#im-dec').value, actions, by:App.me().id });
        Game.log('minuta', `Minuta cargada: ${title}`, { icon:'📝', silent:true });
        UI.close(); UI.toast(`Minuta cargada con ${rows.length} tareas`,'📝'); if(cid){ setCF(cid); }
        App.go('#/ops/reuniones');
        if(alert) setTimeout(()=>Ops.alertMeeting(m.id), 80); else setTimeout(()=>Ops.viewMeeting(m.id), 80);
      };
      box.querySelector('#im-go').onclick = ()=>go(false);
      box.querySelector('#im-go-alert').onclick = ()=>go(true);
    },
    pendingMinutas,

    actionToTask(meetingId, actionId, quiet){
      const m = Store.get('ops','meetings',meetingId); if(!m) return;
      const a = (m.actions||[]).find(x=>x.id===actionId); if(!a || a.taskId) return;
      const p = parseAction(a.text);
      const t = Store.upsert('ops','tasks',{ title:p.text, clientId:m.clientId||'', unit:(client(m.clientId)?.units||[])[0]||'', assigneeId:p.assigneeId||m.by||App.me().id, due:p.due||UI.addDays(UI.today(),7), status:'todo', priority:'media', meetingId, desc:`De la reunión: ${m.title}` });
      Store.upsert('ops','meetings',{ id:meetingId, actions:m.actions.map(x=>x.id===actionId?{...x, taskId:t.id}:x) });
      if(t.assigneeId!==App.me().id) App.notify(t.assigneeId, `Nueva tarea de la reunión “${m.title}”: ${t.title}`, '#/ops/tareas');
      if(!quiet){ UI.toast('Tarea creada','✅'); App.render(); }
    },

    async importFinance(){
      UI.toast('Leyendo clientes de Finanzas…','⏳');
      const fin = await Store.readFinance();
      if(!fin?.clientes) return UI.toast('No pude leer Finanzas (¿sin conexión?)','⚠️');
      const map = { rrss:['social'], pauta:['pauta'], 'rrss+pauta':['social','pauta'], web:['web'], branding:['branding'], otros:['otros'] };
      const have = new Set(S('clients').map(c=>c.name.trim().toLowerCase()));
      const nuevos = fin.clientes.filter(c=>c.estado!=='inactivo' && !c.finServicio && !have.has((c.nombre||'').trim().toLowerCase()));
      if(!nuevos.length) return UI.toast('Ya están todos los clientes activos','👌');
      if(!confirm(`Voy a crear ${nuevos.length} cliente(s) en Operaciones:\n\n${nuevos.map(c=>'• '+c.nombre).join('\n')}\n\n(Solo nombre y unidad — los montos quedan en Finanzas.)`)) return;
      nuevos.forEach(c=>Store.upsert('ops','clients',{ name:c.nombre, units:map[c.tipo]||['otros'], health:'ok', active:true, finanzasId:c.id, notes:c.servicios||'' }));
      UI.toast(`${nuevos.length} clientes importados`,'🗂️'); App.render();
    },
  };
  window.Ops = Ops;
})();
