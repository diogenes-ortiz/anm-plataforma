// ─── GAMIFICACIÓN ─────────────────────────────────────────────────────────────
// Toda acción importante queda en el log de actividad (team.activity) con XP.
// Niveles, rachas, insignias y ranking se calculan a partir de ese log.
(function(){
  const XP = {
    task_done:10, task_ontime:5, client_update:8, meeting:5, minuta:15, content:3, content_published:5,
    calendar_approved:20, lead:5, lead_advance:10, lead_won:100, interaction:5,
    alert_sent:3, member_invited:10, joined:20, finance_close:50,
  };
  const LEVELS = [
    [0,'Trainee'],[100,'Junior'],[250,'Semi Senior'],[500,'Senior'],[900,'Lead'],
    [1400,'Head'],[2100,'Director/a'],[3000,'Estratega'],[4200,'Leyenda ANM'],[6000,'Mito ANM'],
  ];

  function level(xp){
    let i = 0; while(i<LEVELS.length-1 && xp>=LEVELS[i+1][0]) i++;
    const cur = LEVELS[i][0], next = LEVELS[i+1]?.[0];
    return { n:i+1, name:LEVELS[i][1], xp, cur, next, pct: next ? Math.round((xp-cur)/(next-cur)*100) : 100, toNext: next ? next-xp : 0 };
  }

  const acts = () => Store.all('team','activity');
  const weekStart = () => { const d = new Date(); const w = (d.getDay()+6)%7; d.setDate(d.getDate()-w); return UI.ymd(d); };

  function xpOf(memberId, since){
    return acts().filter(a=>a.by===memberId && (!since || a.at.slice(0,10)>=since)).reduce((s,a)=>s+(a.xp||0),0);
  }

  // Días seguidos con actividad (cuenta hoy o, si hoy no hubo, desde ayer)
  function streak(memberId){
    const days = new Set(acts().filter(a=>a.by===memberId).map(a=>UI.ymd(new Date(a.at))));
    let d = UI.today(), n = 0;
    if(!days.has(d)) d = UI.addDays(d,-1);
    while(days.has(d)){ n++; d = UI.addDays(d,-1); }
    return n;
  }

  function count(memberId, type){ return acts().filter(a=>a.by===memberId && a.type===type).length; }

  const BADGES = [
    { id:'first', e:'🌱', n:'Primer paso', d:'Registrar tu primera acción', ok:m=>acts().some(a=>a.by===m) },
    { id:'tasks10', e:'✅', n:'Resolutivo', d:'Completar 10 tareas', ok:m=>count(m,'task_done')>=10 },
    { id:'tasks50', e:'🚀', n:'Máquina', d:'Completar 50 tareas', ok:m=>count(m,'task_done')>=50 },
    { id:'minutas5', e:'📝', n:'Minutero', d:'Cargar 5 minutas', ok:m=>count(m,'minuta')>=5 },
    { id:'updates20', e:'📡', n:'Radar', d:'20 actualizaciones de clientes', ok:m=>count(m,'client_update')>=20 },
    { id:'cal', e:'🗓️', n:'Calendarista', d:'Aprobar 3 calendarios de contenido', ok:m=>count(m,'calendar_approved')>=3 },
    { id:'leads10', e:'🎯', n:'Cazador', d:'Cargar 10 contactos al CRM', ok:m=>count(m,'lead')>=10 },
    { id:'touch25', e:'🤝', n:'Networker', d:'25 interacciones con contactos', ok:m=>count(m,'interaction')>=25 },
    { id:'won', e:'🏆', n:'Cerrador', d:'Ganar un cliente nuevo', ok:m=>count(m,'lead_won')>=1 },
    { id:'streak5', e:'🔥', n:'En llamas', d:'Racha de 5 días', ok:m=>streak(m)>=5 },
    { id:'lvl5', e:'⭐', n:'Senior', d:'Llegar a nivel 4', ok:m=>level(xpOf(m)).n>=4 },
    { id:'closer', e:'💰', n:'Cierre prolijo', d:'Cerrar un mes de finanzas', ok:m=>count(m,'finance_close')>=1 },
  ];

  function leaderboard(since){
    return App.members().map(m=>({ m, xp:xpOf(m.id, since) })).sort((a,b)=>b.xp-a.xp);
  }

  // Registra una acción (y devuelve el XP ganado)
  function log(type, text, extra={}){
    const me = App.me(); if(!me) return 0;
    const xp = extra.xp ?? XP[type] ?? 0;
    const beforeLvl = level(xpOf(me.id)).n;
    const beforeBadges = BADGES.filter(b=>b.ok(me.id)).map(b=>b.id);
    Store.upsert('team','activity',{ type, text, by:me.id, at:new Date().toISOString(), xp, ref:extra.ref||null });
    // Mantener el log acotado (los más viejos se descartan)
    const all = Store.all('team','activity');
    if(all.length>1500) all.sort((a,b)=>a.at.localeCompare(b.at)).slice(0, all.length-1500).forEach(a=>Store.remove('team','activity',a.id));
    if(!extra.silent) UI.toast(text, extra.icon||'✨', xp||null);
    const lv = level(xpOf(me.id));
    if(lv.n>beforeLvl){ UI.confetti(); setTimeout(()=>UI.toast(`¡Subiste a nivel ${lv.n}: ${lv.name}!`,'🎉'), 400); }
    BADGES.filter(b=>b.ok(me.id) && !beforeBadges.includes(b.id)).forEach(b=>{ UI.confetti(40); setTimeout(()=>UI.toast(`Nueva insignia: ${b.n}`, b.e), 700); });
    return xp;
  }

  // Misiones semanales del equipo (se calculan del estado real)
  function missions(){
    const ws = weekStart(), t = UI.today();
    const inWeek = iso => iso && iso.slice(0,10)>=ws;
    const clients = Ops.activeClients();
    const stale = clients.filter(c=>Ops.daysSinceUpdate(c)>7).length;
    const meetings = Store.all('ops','meetings').filter(m=>m.date && m.date.slice(0,10)>=ws && m.date.slice(0,10)<=t);
    const noMin = meetings.filter(m=>!m.minuta).length;
    const overdue = Ops.overdueTasks().length;
    const touches = acts().filter(a=>['interaction','lead','lead_advance'].includes(a.type) && inWeek(a.at)).length;
    const done = acts().filter(a=>a.type==='task_done' && inWeek(a.at)).length;
    const list = [
      { e:'📡', t:'Seguimiento al día', d: stale ? `${stale} cliente${stale>1?'s':''} sin actualizar hace +7 días` : 'Todos los clientes actualizados esta semana', p: clients.length ? (clients.length-stale)/clients.length : 1 },
      { e:'📝', t:'Minutas completas', d: meetings.length ? (noMin ? `${noMin} reunión${noMin>1?'es':''} sin minuta` : 'Todas las reuniones tienen minuta') : 'Sin reuniones esta semana (todavía)', p: meetings.length ? (meetings.length-noMin)/meetings.length : 1 },
      { e:'⏰', t:'Cero vencidas', d: overdue ? `${overdue} tarea${overdue>1?'s':''} vencida${overdue>1?'s':''}` : 'No hay tareas vencidas', p: overdue ? 0 : 1 },
      { e:'✅', t:'Cerrar 10 tareas', d:`${Math.min(done,10)}/10 esta semana`, p: Math.min(done/10,1) },
      { e:'🎯', t:'Mover el pipeline', d:`${Math.min(touches,5)}/5 contactos o avances esta semana`, p: Math.min(touches/5,1) },
    ];
    const next = Ops.nextMonthCalendarPending();
    if(new Date().getDate()>=15) list.push({ e:'🗓️', t:'Calendarios del mes próximo', d: next.total ? `${next.total-next.pending}/${next.total} aprobados` : 'No hay clientes con calendario', p: next.total ? (next.total-next.pending)/next.total : 1 });
    return list;
  }

  window.Game = { XP, LEVELS, level, xpOf, streak, BADGES, leaderboard, log, missions, weekStart };
})();
