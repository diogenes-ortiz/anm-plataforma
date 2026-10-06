// ─── FINANZAS (versión simple: Actualidad · Proyecciones) ──────────────────────
// Usa el mismo documento 'main' de Supabase y el mismo formato de datos que la
// app de finanzas original (clientes, proyectos, empleados, gastos…), así los
// backups siguen siendo compatibles y la "vista completa" sigue funcionando.
(function(){
  const { esc, $ } = UI;
  const { SUPABASE_URL:SB_URL, SUPABASE_KEY:SB_KEY } = window.ANM_CONFIG;
  const HEADERS = { 'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_KEY };
  const LS_KEY = 'anm_v7';            // mismo cache local que la app original
  const MONTHS = UI.MONTHS;
  const TIPO = { rrss:'Redes sociales', pauta:'Pauta / Ads', 'rrss+pauta':'Redes + Pauta', web:'Web', branding:'Branding', otros:'Otros' };
  const SOCIOS = ['dio','santi','diogenes','santiago'];

  let S = { clientes:[], proyectos:[], empleados:[], gastos:[], cobros:[], extras:[], clientesPausados:[], skips:[], cierres:{}, metas:{ facturacion:0 } };
  let status = 'local', saveTimer = null, tab = 'actualidad', cursor = UI.ym(), charts = {};

  // ── Formato y fechas ────────────────────────────────────────────────────────
  const fmtBase = (n, cur) => fmt(n, cur);
  const fmt = (n, cur) => (cur==='USD'?'U$S ':cur==='EUR'?'€':'$') + Math.round(n||0).toLocaleString('es-AR');
  const ymAdd = (ym, n) => { const [y,m] = ym.split('-').map(Number); return UI.ym(new Date(y, m-1+n, 1)); };
  const ymLabel = (ym, short) => { const [y,m] = ym.split('-'); return short ? MONTHS[+m-1].slice(0,3)+' '+y.slice(2) : MONTHS[+m-1]+' '+y; };
  const parts = ym => { const [y,m] = ym.split('-').map(Number); return { m:m-1, a:y }; };
  const pct = (a,b) => b ? Math.round((a-b)/Math.abs(b)*100) : null;

  // ── Datos: carga y guardado (documento completo, como la app original) ─────
  function setStatus(s){ status = s; const el = $('#sync'); if(!el) return;
    el.textContent = { local:'💾 Local', syncing:'⏳ Guardando', synced:'● En línea', error:'⚠️ Sin conexión' }[s];
    el.style.color = { synced:'var(--green)', error:'var(--red)', syncing:'var(--yellow)' }[s]||''; }
  function ensure(){ ['clientes','proyectos','empleados','gastos','cobros','extras','clientesPausados','skips'].forEach(k=>{ if(!Array.isArray(S[k])) S[k] = []; });
    if(!S.cierres || typeof S.cierres!=='object') S.cierres = {}; if(!S.metas) S.metas = { facturacion:0 };
    if(!S.mes || typeof S.mes!=='object') S.mes = {}; }
  async function load(){
    try{ const l = localStorage.getItem(LS_KEY); if(l) S = { ...S, ...JSON.parse(l) }; }catch(e){}
    ensure(); setStatus('syncing');
    try{
      const ctl = new AbortController(), to = setTimeout(()=>ctl.abort(), 10000);
      const r = await fetch(`${SB_URL}/rest/v1/anm_state?id=eq.main&select=data`, { headers:HEADERS, signal:ctl.signal }); clearTimeout(to);
      if(!r.ok) throw 0;
      const rows = await r.json();
      if(rows[0]?.data && Object.keys(rows[0].data).length){ S = { ...S, ...rows[0].data }; ensure(); }
      setStatus('synced');
      if(migrate()) save();
    }catch(e){ setStatus('error'); }
    try{ localStorage.setItem(LS_KEY, JSON.stringify(S)); }catch(e){}
  }
  function save(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(S)); }catch(e){}
    clearTimeout(saveTimer); saveTimer = setTimeout(push, 700);
  }
  async function push(){
    setStatus('syncing');
    const body = JSON.stringify({ id:'main', data:S, updated_at:new Date().toISOString() });
    try{
      let r = await fetch(`${SB_URL}/rest/v1/anm_state`, { method:'POST', headers:{ ...HEADERS, Prefer:'resolution=merge-duplicates,return=minimal' }, body });
      if(!r.ok) r = await fetch(`${SB_URL}/rest/v1/anm_state?id=eq.main`, { method:'PATCH', headers:{ ...HEADERS, Prefer:'return=minimal' }, body:JSON.stringify({ data:S, updated_at:new Date().toISOString() }) });
      setStatus(r.ok ? 'synced' : 'error');
    }catch(e){ setStatus('error'); }
  }
  window.addEventListener('beforeunload', ()=>{ if(saveTimer){ clearTimeout(saveTimer); push(); } });

  // ── Reglas de cálculo (compatibles con la app original) ────────────────────
  const retainerAt = (c, ym) => { const h = (c.retainerHistory||[]).filter(x=>x.desde<=ym).sort((a,b)=>b.desde.localeCompare(a.desde)); return h.length ? h[0].monto : (c.presupuesto ?? c.retainer ?? 0); };
  const paused = (cid, ym) => { const { m, a } = parts(ym); return S.clientesPausados.includes(`cp-${cid}-${m}-${a}`); };
  const vigente = (c, ym) => {
    if(c.estado==='inactivo' && !c.finServicio) return false;
    if(c.inicioServicio && c.inicioServicio>ym) return false;
    if(c.finServicio && c.finServicio<ym) return false;
    return !paused(c.id, ym);
  };
  const extrasOf = (cid, ym) => { const { m, a } = parts(ym); return S.extras.filter(x=>x.key===`extra-${cid}-${m}-${a}`).reduce((s,x)=>s+(+x.monto||0),0); };
  const isCobrado = (cid, ym) => { const { m, a } = parts(ym); return S.cobros.some(x=>x.key===`c-${cid}-${m}-${a}`); };
  const isOneShot = p => !((p.etapa||'').toLowerCase().includes('mensual') || ['rrss','pauta'].includes((p.nombre||'').toLowerCase()));
  const projectsOf = ym => S.proyectos.filter(p=>p.fecha && p.fecha.slice(0,7)===ym && isOneShot(p));
  const isSocio = e => SOCIOS.includes((e.nombre||'').trim().toLowerCase().split(' ')[0]) || /socio/i.test(e.rol||'');
  const sueldoAt = (e, ym) => { const h = (e.sueldoHistory||[]).filter(x=>x.desde<=ym).sort((a,b)=>b.desde.localeCompare(a.desde)); return h.length ? h[0].monto : (e.sueldo||0); };
  const empActivo = (e, ym) => {
    if(isSocio(e)) return false;
    if(e.estado==='inactivo' && !e.finLaboral) return false;
    if(e.inicioLaboral && e.inicioLaboral>ym) return false;
    if(e.finLaboral && e.finLaboral<ym) return false;
    const { m, a } = parts(ym); return !S.skips.includes(`skip-${e.id}-${m}-${a}`);
  };
  const gastoMensual = g => g.frecuencia==='mensual' ? (+g.monto||0) : g.frecuencia==='anual' ? (+g.monto||0)/12 : 0;
  const closed = ym => S.cierres[ym]?.closedAt ? S.cierres[ym] : null;

  // ── Un mes = la base (clientes, equipo, gastos, proyectos) + los ajustes de ese mes ──
  // Actualidad y el Cierre del mes leen y escriben exactamente lo mismo.
  // S.mes[ym] = { cli:{id:{monto,pendiente,in}}, eq:{id:{monto,in}}, fj:{id:{monto,off}}, pro:{id:{off}} }
  const ovGet = (ym, g, id) => S.mes?.[ym]?.[g]?.[String(id)] || {};
  function ovSet(ym, g, id, patch){
    S.mes[ym] = S.mes[ym] || {}; const grp = S.mes[ym][g] = S.mes[ym][g] || {};
    const cur = { ...(grp[String(id)]||{}), ...patch }; Object.keys(cur).forEach(k=>{ if(cur[k]==null) delete cur[k]; });
    if(Object.keys(cur).length) grp[String(id)] = cur; else delete grp[String(id)];
  }
  const ckey = (pre, id, ym) => { const { m, a } = parts(ym); return `${pre}-${id}-${m}-${a}`; };
  const setPaused = (id, ym, on) => { const k = ckey('cp', id, ym); S.clientesPausados = S.clientesPausados.filter(x=>x!==k); if(on) S.clientesPausados.push(k); };
  const setCobro = (id, ym, on) => { const k = ckey('c', id, ym); S.cobros = S.cobros.filter(x=>x.key!==k); if(on) S.cobros.push({ key:k }); };
  const setSkip = (id, ym, on) => { const k = ckey('skip', id, ym); S.skips = S.skips.filter(x=>x!==k); if(on) S.skips.push(k); };
  const enRango = (ini, fin, ym) => (!ini || ini<=ym) && (!fin || fin>=ym);
  const clearIn = (ym, g, id) => Object.keys(S.mes).filter(k=>k>=ym).forEach(k=>ovSet(k, g, id, { in:null }));

  const cliCands = ym => S.clientes.filter(x=>(!(x.estado==='inactivo' && !x.finServicio) && enRango(x.inicioServicio, x.finServicio, ym)) || ovGet(ym,'cli',x.id).in);
  function cliRow(x, ym){
    const o = ovGet(ym,'cli',x.id), base = retainerAt(x, ym)+extrasOf(x.id, ym), monto = o.monto ?? base, cob = isCobrado(x.id, ym);
    const pendiente = cob ? 0 : o.pendiente!=null ? Math.min(+o.pendiente||0, monto) : monto;
    return { id:x.id, nombre:x.nombre, tipo:x.tipo, moneda:x.moneda, estuvo:!paused(x.id, ym), monto, base, total:monto, cobrado: cob ? 'si' : o.pendiente!=null ? 'parcial' : 'no', pendiente };
  }
  const proRows = ym => projectsOf(ym).filter(p=>!ovGet(ym,'pro',p.id).off).map(p=>{ const m = +p.monto||0, cob = p.estado==='cobrado', par = !cob && p.pendienteParcial!=null;
    return { id:p.id, nombre:p.nombre, cliente:p.cliente, monto:m, costo:+p.empCosto||0, cobrado: cob ? 'si' : par ? 'parcial' : 'no', pendiente: cob ? 0 : par ? Math.min(+p.pendienteParcial||0, m) : m }; });
  const eqCands = ym => S.empleados.filter(e=>!isSocio(e) && ((!(e.estado==='inactivo' && !e.finLaboral) && enRango(e.inicioLaboral, e.finLaboral, ym)) || ovGet(ym,'eq',e.id).in));
  const eqRow = (e, ym) => { const base = sueldoAt(e, ym), o = ovGet(ym,'eq',e.id); return { id:e.id, nombre:e.nombre, base, monto:o.monto ?? base, incluir:!S.skips.includes(ckey('skip', e.id, ym)) }; };
  const fjRows = ym => S.gastos.filter(g=>gastoMensual(g) && enRango(g.desde, g.hasta, ym)).map(g=>{ const base = Math.round(gastoMensual(g)), o = ovGet(ym,'fj',g.id); return { id:g.id, concepto:g.concepto, base, monto:o.monto ?? base, incluir:!o.off }; });

  function month(ym){
    const c = S.cierres[ym] || null;
    const cli = cliCands(ym).map(x=>cliRow(x, ym)).filter(x=>x.estuvo);
    const pro = proRows(ym);
    const gastos = [...eqCands(ym).map(e=>eqRow(e, ym)).filter(x=>x.incluir).map(x=>({ grupo:'Equipo', kind:'eq', id:x.id, concepto:x.nombre, monto:x.monto, pagado:!!ovGet(ym,'eq',x.id).pagado })),
      ...fjRows(ym).filter(x=>x.incluir).map(x=>({ grupo:'Fijos', kind:'fj', id:x.id, concepto:x.concepto, monto:x.monto })),
      ...(c?.extras||[]).map((x,i)=>({ grupo:'Extras del mes', kind:'ex', id:i, concepto:x.concepto, monto:+x.monto||0 })),
      ...pro.filter(p=>p.costo).map(p=>({ grupo:'Costo de proyectos', kind:'pc', id:p.id, concepto:`${p.nombre} (${p.cliente})`, monto:p.costo }))];
    return build(ym, cli, pro, gastos, !!c?.closedAt, c);
  }

  // Pasa los cierres viejos (que guardaban su propia copia) al formato único. Corre una sola vez.
  function migrate(){
    if(S.mesV>=1) return false;
    Object.entries(S.cierres||{}).forEach(([ym, c])=>{
      if(!c || !Array.isArray(c.clientes)) return;
      const isC = !!c.closedAt, same = (a,b) => String(a)===String(b);
      c.clientes.forEach(x=>{
        let k = S.clientes.find(y=>same(y.id, x.id));
        if(!k){ k = { id:x.id, nombre:x.nombre, tipo:x.tipo, retainer:+x.monto||0, moneda:x.moneda||'ARS', estado:isC?'inactivo':'activo', inicioServicio:ym, finServicio:isC?ym:'', retainerHistory:[{ monto:+x.monto||0, desde:ym, nota:'Inicial' }], empleadoIds:[], presupuesto:null }; S.clientes.push(k); }
        setPaused(k.id, ym, x.estuvo===false);
        const base = retainerAt(k, ym)+extrasOf(k.id, ym);
        ovSet(ym,'cli',k.id,{ monto: (isC || +x.monto!==base) ? +x.monto||0 : null, in: isC ? true : null, pendiente: x.cobrado==='parcial' ? +x.pendiente||0 : null });
        setCobro(k.id, ym, x.cobrado==='si');
      });
      if(isC) cliCands(ym).filter(k=>!c.clientes.some(x=>same(x.id, k.id))).forEach(k=>setPaused(k.id, ym, true));
      (c.proyectos||[]).forEach(p=>{ let pr = S.proyectos.find(y=>same(y.id, p.id));
        if(!pr){ pr = { id:p.id, nombre:p.nombre, cliente:p.cliente, moneda:'ARS', etapa:'Pago único', fecha:`${ym}-15`, empNombre:'', desc:'' }; S.proyectos.push(pr); }
        if(pr.fecha && pr.fecha.slice(0,7)!==ym) return;
        pr.monto = +p.monto||0; pr.empCosto = +p.costo||0; pr.estado = p.cobrado==='si' ? 'cobrado' : 'pendiente';
        if(p.cobrado==='parcial') pr.pendienteParcial = +p.pendiente||0; else delete pr.pendienteParcial; });
      if(isC) projectsOf(ym).filter(p=>!(c.proyectos||[]).some(x=>same(x.id, p.id))).forEach(p=>ovSet(ym,'pro',p.id,{ off:true }));
      (c.equipo||[]).forEach(x=>{ let e = S.empleados.find(y=>same(y.id, x.id));
        if(!e){ e = { id:x.id, nombre:x.nombre, rol:'', sueldo:+x.monto||0, moneda:'ARS', estado:isC?'inactivo':'activo', inicioLaboral:ym, finLaboral:isC?ym:'', sueldoHistory:[{ monto:+x.monto||0, desde:ym, nota:'Inicial' }], clienteIds:[] }; S.empleados.push(e); }
        setSkip(e.id, ym, x.incluir===false);
        ovSet(ym,'eq',e.id,{ monto: (isC || +x.monto!==sueldoAt(e, ym)) ? +x.monto||0 : null, in: isC ? true : null }); });
      if(isC) eqCands(ym).filter(e=>!(c.equipo||[]).some(x=>same(x.id, e.id))).forEach(e=>setSkip(e.id, ym, true));
      (c.fijos||[]).forEach(x=>{ const g = S.gastos.find(y=>same(y.id, x.id));
        if(!g){ if(x.incluir!==false) (c.extras = c.extras||[]).push({ concepto:x.concepto, monto:+x.monto||0 }); return; }
        ovSet(ym,'fj',g.id,{ off: x.incluir===false ? true : null, monto: (isC || +x.monto!==Math.round(gastoMensual(g))) ? +x.monto||0 : null }); });
      if(isC) fjRows(ym).filter(g=>!(c.fijos||[]).some(x=>same(x.id, g.id))).forEach(g=>ovSet(ym,'fj',g.id,{ off:true }));
      if(!isC){ delete c.clientes; delete c.proyectos; delete c.equipo; delete c.fijos; }
    });
    S.mesV = 1; return true;
  }
  function build(ym, cli, pro, gastos, isClosed, cierre){
    const ingClientes = cli.reduce((s,x)=>s+x.total,0), ingProy = pro.reduce((s,p)=>s+(+p.monto||0),0);
    const ing = ingClientes + ingProy, gas = gastos.reduce((s,g)=>s+g.monto,0);
    const pend = cli.reduce((s,x)=>s+(+x.pendiente||0),0) + pro.reduce((s,p)=>s+(+p.pendiente||0),0);
    return { ym, cli, pro, gastos, ingClientes, ingProy, ing, gas, neto:ing-gas, margen: ing ? Math.round((ing-gas)/ing*100) : 0, pend, cobrado:ing-pend, closed:isClosed, cierre };
  }
  const firstYm = () => [...S.clientes.map(c=>c.inicioServicio), ...S.proyectos.map(p=>p.fecha?.slice(0,7)), ...Object.keys(S.cierres)].filter(Boolean).sort()[0] || UI.ym();
  // Mes que toca cerrar: el anterior si no se cerró; desde el 25 también el actual
  function toClose(){
    const prev = ymAdd(UI.ym(), -1);
    if(prev>=firstYm() && !closed(prev) && (S.clientes.length || S.proyectos.length)) return prev;
    if(new Date().getDate()>=25 && !closed(UI.ym()) && S.clientes.length) return UI.ym();
    return null;
  }

  // ── Render general ──────────────────────────────────────────────────────────
  function render(){
    if(tab!=='proyecciones') tab = 'actualidad';   // todo se carga en Actualidad (ya no hay cierre del mes aparte)
    $('#tabs').innerHTML = [['actualidad','📊 Actualidad'],['proyecciones','🔭 Proyecciones']].map(([k,l])=>
      `<a href="#" class="${tab===k?'active':''}" onclick="Fin.go('${k}');return false">${l}</a>`).join('');
    Object.values(charts).forEach(c=>c.destroy?.()); charts = {};
    const v = tab==='proyecciones' ? viewProjections() : viewNow();
    $('#page').innerHTML = v.html; v.after?.();
  }

  // ── 📊 Actualidad ───────────────────────────────────────────────────────────
  function viewNow(){
    const M = month(cursor), P = month(ymAdd(cursor,-1));
    const d = (a,b,inv) => { const p = pct(a,b); if(p==null||!b) return ''; const good = inv ? p<0 : p>0; return `<span class="tag ${p===0?'':good?'t-green':'t-red'}" style="margin-left:6px">${p>0?'▲':p<0?'▼':'='} ${Math.abs(p)}%</span>`; };
    const rows = [...M.cli.map(x=>({ ...x, proy:M.pro.filter(p=>p.cliente===x.nombre) })),
      ...[...new Set(M.pro.map(p=>p.cliente))].filter(n=>!M.cli.some(x=>x.nombre===n)).map(n=>({ nombre:n, total:0, pendiente:0, cobrado:'si', proy:M.pro.filter(p=>p.cliente===n), soloProyecto:true }))]
      .map(r=>({ ...r, proyMonto:r.proy.reduce((s,p)=>s+(+p.monto||0),0), proyPend:r.proy.reduce((s,p)=>s+(+p.pendiente||0),0) }))
      .map(r=>({ ...r, suma:r.total+r.proyMonto, queda:(+r.pendiente||0)+r.proyPend })).sort((a,b)=>b.suma-a.suma);
    const groups = {}; M.gastos.forEach(g=>{ (groups[g.grupo] = groups[g.grupo]||[]).push(g); });
    const cobroTag = r => r.queda ? `<span class="tag t-yellow">Falta ${fmt(r.queda)}</span>` : '<span class="tag t-green">Cobrado ✓</span>';
    return { html:`
      <div class="toolbar"><button class="btn g sm" onclick="Fin.move(-1)">‹</button><div class="b" style="font-size:18px;min-width:170px;text-align:center">${ymLabel(cursor)}</div><button class="btn g sm" onclick="Fin.move(1)">›</button>
        <span class="grow"></span>${cursor!==UI.ym()?`<button class="btn g sm" onclick="Fin.hoy()">Ir a este mes</button>`:''}<button class="btn ok sm" onclick="Fin.wpp()">💬 Exportar a WhatsApp</button></div>
      ${(()=>{ const prev = S.proyectos.filter(p=>p.estado!=='cobrado' && p.fecha && p.fecha.slice(0,7)<cursor && isOneShot(p)); return prev.length ? `<div class="card" style="margin-bottom:18px"><div class="card-h"><h3>⏳ Pendientes de cobro de meses anteriores</h3><span class="sub">${fmt(prev.reduce((s,p)=>s+(+(p.pendienteParcial ?? p.monto) || 0),0))}</span></div><div class="list">
        ${prev.map(p=>`<div class="li"><div class="grow"><div class="b small">${esc(p.cliente)} · ${esc(p.nombre)}</div><div class="xs faint">${UI.fdate(p.fecha,{abs:true})}</div></div><b>${fmt(p.pendienteParcial ?? p.monto)}</b><button class="btn xs ok" onclick="Fin.paidOld(${JSON.stringify(p.id)})">Se cobró ✓</button></div>`).join('')}</div></div>` : ''; })()}
      <div class="grid g4" style="margin-bottom:20px">
        <div class="card kpi"><div class="l">Ingresos del mes</div><div class="v" style="color:var(--green)">${fmt(M.ing)}${d(M.ing,P.ing)}</div><div class="s">Clientes ${fmt(M.ingClientes)} · Puntuales ${fmt(M.ingProy)}</div></div>
        <div class="card kpi"><div class="l">Gastos del mes</div><div class="v" style="color:var(--red)">${fmt(M.gas)}${d(M.gas,P.gas,true)}</div><div class="s">${Object.entries(groups).map(([k,v])=>`${k} ${fmt(v.reduce((s,g)=>s+g.monto,0))}`).join(' · ')||'Sin gastos'}</div></div>
        <div class="card kpi"><div class="l">Ganancia</div><div class="v" style="color:${M.neto>=0?'var(--blue-l)':'var(--red)'}">${fmt(M.neto)}${d(M.neto,P.neto)}</div><div class="s">Margen ${M.margen}% · ${(()=>{ const K = cuentaDe(M); return [...K.A.socios.map(x=>`${esc(x.nombre)} ${fmt(x.monto)}`), `Agencia ${fmt(K.A.ag)}`].join(' · '); })()}</div></div>
        <div class="card kpi"><div class="l">Falta cobrar</div><div class="v" style="color:${M.pend?'var(--yellow)':'var(--green)'}">${fmt(M.pend)}</div><div class="s">Cobrado ${fmt(M.cobrado)} de ${fmt(M.ing)}</div></div>
      </div>
      ${cuenta(M)}
      <div class="grid g3">
        <div class="span2 card"><div class="card-h"><h3>💰 Cuánto ganamos con cada cliente</h3><span class="sub">${cliView==='mes'?rows.length+' clientes':'últimos 12 meses'}</span><span class="grow"></span>
          <div class="row" style="gap:6px">${[['mes','Este mes'],['hist','📅 Mes por mes']].map(([k,l])=>`<button class="chip ${cliView===k?'on':''}" onclick="Fin.cliView('${k}')">${l}</button>`).join('')}</div></div>
          ${cliView==='hist' ? mesPorMes() : rows.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th style="text-align:right">Mensual</th><th style="text-align:right">Puntuales</th><th style="text-align:right">Total</th><th class="hide-m" style="text-align:right">% del mes</th><th>Estado</th></tr></thead><tbody>
            ${rows.map(r=>`<tr><td><div class="b">${esc(r.nombre)}</div><div class="xs faint">${esc(r.soloProyecto?'Solo proyecto':TIPO[r.tipo]||'')}${r.proy.length?' · '+r.proy.map(p=>`<a href="#" title="Editar" onclick="Fin.editIngreso('p','${p.id}');return false">${esc(p.nombre)} ✎</a>`).join(', '):''}</div></td>
              <td style="text-align:right;white-space:nowrap">${r.soloProyecto?'—':`<a href="#" class="editable" title="Editar monto" onclick="Fin.editIngreso('c','${r.id}');return false">${r.total?fmt(r.total,r.moneda):'—'} ✎</a> <a href="#" title="Sacar de este mes" style="text-decoration:none" onclick="Fin.quitar('c','${r.id}');return false">🗑</a>`}</td><td style="text-align:right">${r.proyMonto?fmt(r.proyMonto):'—'}</td><td style="text-align:right" class="b">${fmt(r.suma)}</td>
              <td class="hide-m" style="text-align:right"><div class="row" style="justify-content:flex-end"><div class="bar" style="width:70px"><div style="width:${M.ing?r.suma/M.ing*100:0}%;background:var(--green)"></div></div><span class="xs">${M.ing?Math.round(r.suma/M.ing*100):0}%</span></div></td>
              <td>${cobroTag(r)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No hay clientes activos este mes. Agregalos con “＋ Ingreso fijo” en la cuenta del mes.</div>'}
          ${cliView==='mes'?'<p class="xs faint" style="margin-top:8px">Tocá el monto ✎ para cambiarlo (solo este mes o desde este mes en adelante).</p>':''}</div>
        <div class="card"><div class="card-h"><h3>💸 Gastos del mes</h3><span class="sub">${fmt(M.gas)}</span></div>
          ${Object.keys(groups).length?Object.entries(groups).map(([k,v])=>`<div class="xs faint b" style="margin:12px 0 4px">${esc(k.toUpperCase())} · ${fmt(v.reduce((s,g)=>s+g.monto,0))}</div>
            ${v.map(g=>`<div class="row small" style="padding:5px 0;border-bottom:1px solid var(--border)"><span class="grow">${esc(g.concepto)}</span><b>${fmt(g.monto)}</b></div>`).join('')}`).join(''):'<div class="empty small">Sin gastos cargados</div>'}
          <div class="xs faint b" style="margin:18px 0 6px">📝 NOTAS DEL MES</div>
          <div class="fld"><label>Saldo real en cuentas (opcional)</label><input class="inp sm" type="number" step="any" value="${M.cierre?.answers?.saldo??''}" onchange="Fin.nota('saldo',this.value)"></div>
          <div class="fld"><label>¿Algo importante? (bajas, aumentos, imprevistos)</label><textarea class="inp" rows="3" onchange="Fin.nota('notas',this.value)">${esc(M.cierre?.answers?.notas||'')}</textarea></div></div>
      </div>`, after:()=>{ const w = document.getElementById('mpm'); if(w) w.scrollLeft = w.scrollWidth; } };
  }

  // ── 🧮 La cuenta del mes: ingresos − sueldos − gastos = queda → agencia → socios ──
  // Reparto: primero se separa el % de la agencia y lo que queda se divide entre los socios.
  const reparto = () => { const r = S.reparto || {}; return { agencia: r.agencia ?? 20, socios: (r.socios && r.socios.length) ? r.socios : [{ nombre:'Dio', pct:50 }, { nombre:'Santi', pct:50 }] }; };
  function cuentaDe(M){
    const ing = [...M.cli.map(x=>({ kind:'c', id:x.id, nombre:x.nombre, det:TIPO[x.tipo]||'Mensual', monto:+x.total||0, entro:(+x.total||0)-(+x.pendiente||0), cob:x.cobrado })),
      ...M.pro.map(p=>({ kind:'p', id:p.id, nombre:p.cliente||p.nombre, det:'Puntual · '+(p.nombre||''), monto:+p.monto||0, entro:(+p.monto||0)-(+p.pendiente||0), cob:p.cobrado }))];
    const R = reparto(), sum = (a,k) => a.reduce((s,x)=>s+x[k],0);
    const tot = { debe:sum(ing,'monto'), entro:sum(ing,'entro') }, gas = M.gas;
    const calc = base => { const queda = base - gas, ag = Math.max(0, queda) * R.agencia/100, soc = Math.max(0, queda) - ag;
      return { queda, ag, soc, socios: R.socios.map(x=>({ ...x, monto: soc * (+x.pct||0)/100 })) }; };
    return { ing, R, tot, gas, A:calc(tot.debe), B:calc(tot.entro) };
  }
  function cuenta(M){
    const K = cuentaDe(M), { ing, R, tot, A, B } = K;
    const groups = {}; M.gastos.forEach(g=>{ (groups[g.grupo] = groups[g.grupo]||[]).push(g); });
    const n = (v, neg) => `<td style="text-align:right;white-space:nowrap">${v ? (neg?'− ':'')+fmt(v) : '—'}</td>`;
    const sg = v => v<0 ? '− '+fmt(-v) : fmt(v);
    const sec = t => `<tr><td colspan="4" class="xs faint b" style="letter-spacing:1px;padding-top:16px">${t}</td></tr>`;
    const tot2 = (l, a, b, color, big) => `<tr style="border-top:2px solid var(--border)${big?';font-size:15px':''}"><td class="b"${color?` style="color:${color}"`:''}>${l}</td><td></td><td style="text-align:right;white-space:nowrap${color?';color:'+color:''}" class="b">${sg(a)}</td><td style="text-align:right;white-space:nowrap${color?';color:'+color:''}" class="b">${sg(b)}</td></tr>`;
    const tag = x => `<button class="tag ${x.cob==='si'?'t-green':x.cob==='parcial'?'t-yellow':'t-red'}" style="border:0;cursor:pointer" title="Tocá para cambiar" onclick="Fin.cobro('${x.kind}','${x.id}')">${x.cob==='si'?'✓ Pagó':x.cob==='parcial'?'Pagó una parte':'✗ No pagó'}</button>`;
    return `<div class="card" style="margin-bottom:20px"><div class="card-h"><h3>🧮 La cuenta del mes</h3><span class="sub">${ymLabel(M.ym)}</span><span class="grow"></span>
        <button class="btn g sm" onclick="Fin.addFijo2()">＋ Ingreso fijo</button><button class="btn g sm" onclick="Fin.addPuntual()">＋ Proyecto / puntual</button><button class="btn ok sm" onclick="Fin.wpp()">💬 Exportar a WhatsApp</button><button class="btn g sm" onclick="Fin.editReparto()">⚙ Reparto</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Concepto</th><th>¿Pagó?</th><th style="text-align:right">Si cobramos todo</th><th style="text-align:right">Con lo cobrado</th></tr></thead><tbody>
        ${sec('💰 LO QUE ENTRA DE CLIENTES')}
        ${ing.length ? ing.map(x=>`<tr><td><div class="b">${esc(x.nombre)} <a href="#" class="xs" style="text-decoration:none" title="Editar monto" onclick="Fin.editIngreso('${x.kind}','${x.id}');return false">✎</a> <a href="#" class="xs" style="text-decoration:none" title="${x.kind==='c'?'Sacar de este mes':'Eliminar'}" onclick="Fin.quitar('${x.kind}','${x.id}');return false">🗑</a></div><div class="xs faint">${esc(x.det)}</div></td><td>${tag(x)}</td>${n(x.monto)}${n(x.entro)}</tr>`).join('') : '<tr><td colspan="4" class="small faint">Sin ingresos cargados este mes. Usá “＋ Ingreso fijo” o “＋ Proyecto / puntual”.</td></tr>'}
        ${(()=>{ const q = quitados(M.ym).filter(x=>x.kind==='c'); return q.length ? `<tr><td colspan="4" class="xs faint">Sacados de este mes: ${q.map(c=>`${esc(c.nombre)} <a href="#" onclick="Fin.volver('c','${c.id}');return false">volver a sumar</a>`).join(' · ')}</td></tr>` : ''; })()}
        ${tot2('Total ingresos', tot.debe, tot.entro, 'var(--green)')}
        ${Object.entries(groups).map(([k,v])=>`${sec((k==='Equipo'?'👥 SUELDOS':'💸 '+k.toUpperCase()))}${v.map(g=>`<tr><td>${esc(g.concepto)} <a href="#" class="xs" style="text-decoration:none" title="Editar" onclick="Fin.editGasto('${g.kind}','${g.id}');return false">✎</a> <a href="#" class="xs" style="text-decoration:none" title="Sacar / eliminar" onclick="Fin.quitar('${g.kind}','${g.id}');return false">🗑</a></td><td>${g.kind==='eq'?`<button class="tag ${g.pagado?'t-green':'t-red'}" style="border:0;cursor:pointer" title="Tocá para cambiar" onclick="Fin.pagoEq('${g.id}')">${g.pagado?'✓ Pagado':'✗ No pagado'}</button>`:''}</td>${n(g.monto,1)}${n(g.monto,1)}</tr>`).join('')}`).join('')}
        ${(()=>{ const q = quitados(M.ym).filter(x=>x.kind!=='c'); return q.length ? `<tr><td colspan="4" class="xs faint">Sacados de este mes: ${q.map(c=>`${esc(c.nombre)} <a href="#" onclick="Fin.volver('${c.kind}','${c.id}');return false">volver a sumar</a>`).join(' · ')}</td></tr>` : ''; })()}
        <tr><td colspan="4"><button class="btn g xs" onclick="Fin.addGasto()">＋ Gasto / sueldo</button></td></tr>
        ${(()=>{ const f = M.gastos.filter(g=>g.kind==='eq' && !g.pagado); return f.length ? `<tr><td colspan="4" class="xs" style="color:var(--yellow)">Falta pagar sueldos: ${f.map(g=>`${esc(g.concepto)} ${fmt(g.monto)}`).join(' · ')} — total ${fmt(f.reduce((s,g)=>s+g.monto,0))}</td></tr>` : ''; })()}
        ${tot2('Total sueldos y gastos', -K.gas, -K.gas, 'var(--red)')}
        ${tot2('= Queda', A.queda, B.queda, A.queda>=0?'var(--blue-l)':'var(--red)', 1)}
        ${sec('🏢 REPARTO')}
        <tr><td>Para la agencia (${R.agencia}%)</td><td></td>${n(A.ag)}${n(B.ag)}</tr>
        <tr><td class="b">Para los socios</td><td></td>${n(A.soc)}${n(B.soc)}</tr>
        ${A.socios.map((x,i)=>`<tr style="font-size:15px"><td class="b">👤 ${esc(x.nombre)} <span class="xs faint">(${x.pct}% de los socios)</span></td><td></td><td style="text-align:right" class="b">${fmt(x.monto)}</td><td style="text-align:right;color:var(--green)" class="b">${fmt(B.socios[i].monto)}</td></tr>`).join('')}
      </tbody></table></div>
      ${A.queda<0?`<div class="alert warn" style="margin-top:12px"><div class="ai">⚠️</div><div class="ad">Este mes los sueldos y gastos superan lo que entra: no queda para repartir.</div></div>`:''}
      ${tot.debe>tot.entro?`<p class="xs faint" style="margin-top:10px">Falta cobrar ${fmt(tot.debe-tot.entro)}. “Con lo cobrado” es lo que se puede repartir hoy; “Si cobramos todo”, lo que queda cuando paguen todos. Tocá ✓/✗ para marcar quién pagó.</p>`:''}
    </div>`;
  }
  // Clientes que estaban activos ese mes pero se sacaron solo de ese mes
  // Lo que estaba ese mes pero se sacó solo de ese mes (para poder volver a sumarlo)
  const quitados = ym => [
    ...cliCands(ym).filter(x=>paused(x.id, ym)).map(x=>({ kind:'c', id:x.id, nombre:x.nombre })),
    ...eqCands(ym).filter(e=>S.skips.includes(ckey('skip', e.id, ym))).map(e=>({ kind:'eq', id:e.id, nombre:e.nombre })),
    ...fjRows(ym).filter(g=>!g.incluir).map(g=>({ kind:'fj', id:g.id, nombre:g.concepto })) ];
  const M_has = (cid, ym) => month(ym).cli.some(x=>String(x.id)===String(cid));
  // Resumen del mes listo para pegar en WhatsApp (*negrita* y emojis de WhatsApp)
  function cuentaTexto(M, modo='completo'){
    const { ing, R, tot, A, B } = cuentaDe(M), fmt = v => v<0 ? '−'+fmtBase(-v) : fmtBase(v);
    const ic = c => c==='si' ? '✅' : c==='parcial' ? '🟡' : '⏳';
    const eq = M.gastos.filter(g=>g.kind==='eq'), otros = M.gastos.filter(g=>g.kind!=='eq');
    const debeCli = ing.filter(x=>x.cob!=='si'), debeEq = eq.filter(g=>!g.pagado);
    const L = [`📊 *ANM · ${ymLabel(M.ym)}*`, ''];
    L.push(`💰 Ingresos: *${fmt(tot.debe)}*`, `💸 Sueldos y gastos: *${fmt(M.gas)}*`, `🟰 Queda: *${fmt(A.queda)}*`);
    if(tot.debe>tot.entro) L.push(`   _(con lo cobrado hasta hoy: ${fmt(B.queda)})_`);
    L.push('', '*Reparto*', `🏢 Agencia (${R.agencia}%): ${fmt(A.ag)}`);
    A.socios.forEach((x,i)=>L.push(`👤 ${x.nombre}: *${fmt(x.monto)}*${tot.debe>tot.entro?` _(hoy ${fmt(B.socios[i].monto)})_`:''}`));
    if(modo==='completo'){
      L.push('', `*Clientes* (${fmt(tot.entro)} cobrado de ${fmt(tot.debe)})`);
      ing.forEach(x=>L.push(`${ic(x.cob)} ${x.nombre}${x.kind==='p'?' _(puntual)_':''}: ${fmt(x.monto)}${x.cob==='parcial'?` _(falta ${fmt(x.monto-x.entro)})_`:''}`));
      if(eq.length){ L.push('', '*Sueldos*'); eq.forEach(g=>L.push(`${g.pagado?'✅':'⏳'} ${g.concepto}: ${fmt(g.monto)}`)); }
      if(otros.length){ L.push('', '*Gastos*'); otros.forEach(g=>L.push(`• ${g.concepto}: ${fmt(g.monto)}`)); }
    }
    if(debeCli.length || debeEq.length){
      L.push('', '*Pendientes*');
      if(debeCli.length) L.push(`⏳ Falta cobrar ${fmt(debeCli.reduce((s,x)=>s+x.monto-x.entro,0))}: ${debeCli.map(x=>x.nombre).join(', ')}`);
      if(debeEq.length) L.push(`⏳ Falta pagar ${fmt(debeEq.reduce((s,g)=>s+g.monto,0))}: ${debeEq.map(g=>g.concepto).join(', ')}`);
    } else L.push('', '🎉 Todo cobrado y todo pagado.');
    const notas = M.cierre?.answers?.notas; if(notas) L.push('', `📝 ${notas}`);
    return L.join('\n');
  }

  // ── 🔭 Proyecciones ─────────────────────────────────────────────────────────
  // ── 📅 Mes por mes: lo que dejó cada cliente en los últimos 12 meses (editable) ──
  let cliView = 'mes';
  function mesPorMes(){
    const yms = [...Array(12).keys()].map(i=>ymAdd(cursor, i-11)), Ms = yms.map(month);
    const key = x => String(x.id), names = new Map();
    Ms.forEach(M=>{ M.cli.forEach(x=>names.set('c'+key(x), { kind:'c', id:x.id, nombre:x.nombre })); M.pro.forEach(p=>{ if(!M.cli.some(x=>x.nombre===p.cliente)) names.set('n'+p.cliente, { kind:'n', nombre:p.cliente }); }); });
    const cell = (M, r) => { const cli = r.kind==='c' ? M.cli.find(x=>key(x)===key(r)) : null, nom = cli ? cli.nombre : r.nombre;
      const pro = M.pro.filter(p=>p.cliente===nom).reduce((s,p)=>s+(+p.monto||0),0); return { fijo: cli ? +cli.total||0 : null, pro, tot:(cli?+cli.total||0:0)+pro }; };
    const rows = [...names.values()].map(r=>({ ...r, cells:Ms.map(M=>cell(M, r)) })).map(r=>({ ...r, sum:r.cells.reduce((s,c)=>s+c.tot,0) })).filter(r=>r.sum).sort((a,b)=>b.sum-a.sum);
    if(!rows.length) return '<div class="empty">Sin ingresos en los últimos 12 meses.</div>';
    const k = n => n>=1e6 ? '$'+(n/1e6).toFixed(n%1e6?1:0).replace('.',',')+'M' : n>=1e3 ? '$'+Math.round(n/1e3)+'k' : fmt(n);
    return `<div class="tbl-wrap" id="mpm"><table class="tbl" style="font-size:12px"><thead><tr><th>Cliente</th>${yms.map((ym,i)=>`<th style="text-align:right;white-space:nowrap">${ymLabel(ym,1)}${Ms[i].closed?' ✓':''}</th>`).join('')}<th style="text-align:right">Total</th></tr></thead><tbody>
      ${rows.map(r=>`<tr><td class="b" style="white-space:nowrap">${esc(r.nombre)}</td>${r.cells.map((c,i)=>{ const prev = i ? r.cells[i-1].fijo : null, ch = c.fijo!=null && prev!=null && c.fijo!==prev;
          const click = r.kind==='c' && c.fijo!=null ? `onclick="Fin.editIngreso('c','${r.id}','${yms[i]}')" style="cursor:pointer;text-align:right;white-space:nowrap" title="${ymLabel(yms[i])}: tocá para editar"` : 'style="text-align:right;white-space:nowrap"';
          return `<td ${click}>${c.tot?`${c.fijo!=null?k(c.fijo):''}${ch?` <span style="color:${c.fijo>prev?'var(--green)':'var(--red)'}">${c.fijo>prev?'▲':'▼'}</span>`:''}${c.pro?`<div class="xs" style="color:var(--blue-l)">+${k(c.pro)}</div>`:''}`:'<span class="faint">—</span>'}</td>`; }).join('')}
        <td style="text-align:right" class="b">${k(r.sum)}</td></tr>`).join('')}
      <tr style="border-top:2px solid var(--border)"><td class="b">Total</td>${Ms.map(M=>`<td style="text-align:right" class="b">${k(M.ing)}</td>`).join('')}<td style="text-align:right" class="b">${k(Ms.reduce((s,M)=>s+M.ing,0))}</td></tr>
    </tbody></table></div>
    <p class="xs faint" style="margin-top:8px">Mensual del cliente; en azul, proyectos puntuales de ese mes. ▲▼ = cambió respecto del mes anterior. ✓ = mes cerrado. Tocá un monto para editarlo.</p>`;
  }

  let extraCliente = 0;
  function viewProjections(){
    const now = UI.ym(), past = [], fut = [];
    for(let i=5;i>=1;i--) past.push(month(ymAdd(now,-i)));
    const fijos = S.gastos.reduce((s,g)=>s+gastoMensual(g),0);
    for(let i=0;i<12;i++){
      const ym = ymAdd(now,i);
      const ret = S.clientes.filter(c=>vigente(c, ym) || (i>0 && !c.finServicio && c.estado!=='inactivo' && (!c.inicioServicio || c.inicioServicio<=ym))).reduce((s,c)=>s+retainerAt(c, ym),0);
      const proy = S.proyectos.filter(p=>p.fecha && p.fecha.slice(0,7)===ym && isOneShot(p)).reduce((s,p)=>s+(+p.monto||0),0);
      const equipo = S.empleados.filter(e=>empActivo(e, ym) || (i>0 && !isSocio(e) && e.estado!=='inactivo' && !e.finLaboral)).reduce((s,e)=>s+sueldoAt(e, ym),0);
      const fijosMes = fjRows(ym).filter(g=>g.incluir).reduce((s,g)=>s+g.monto,0);
      const ing = ret + proy + (i>0?extraCliente:0), gas = equipo + fijosMes;
      fut.push({ ym, ret, proy, ing, gas, neto:ing-gas });
    }
    const tot = k => fut.reduce((s,m)=>s+m[k],0);
    const avgPast = past.length ? past.reduce((s,m)=>s+m.ing,0)/past.length : 0;
    const meta = +S.metas?.facturacion || 0;
    const yearNow = now.slice(0,4), ytd = [...Array(+now.slice(5)).keys()].map(i=>month(`${yearNow}-${String(i+1).padStart(2,'0')}`).ing).reduce((a,b)=>a+b,0);
    const restYear = fut.filter(m=>m.ym.startsWith(yearNow) && m.ym>now).reduce((s,m)=>s+m.ing,0);
    const breakEven = fut[0].gas;
    return { html:`
      <div class="grid g4" style="margin-bottom:20px">
        <div class="card kpi"><div class="l">Ingreso mensual asegurado</div><div class="v" style="color:var(--green)">${fmt(fut[0].ret)}</div><div class="s">retainers de clientes activos</div></div>
        <div class="card kpi"><div class="l">Costo mensual fijo</div><div class="v" style="color:var(--red)">${fmt(breakEven)}</div><div class="s">equipo + gastos fijos (punto de equilibrio)</div></div>
        <div class="card kpi"><div class="l">Ganancia próximos 12 meses</div><div class="v" style="color:var(--blue-l)">${fmt(tot('neto'))}</div><div class="s">≈ ${fmt(tot('neto')/12)} por mes</div></div>
        <div class="card kpi"><div class="l">Cierre de ${yearNow} estimado</div><div class="v">${fmt(ytd+restYear)}</div><div class="s">${meta?`Meta ${fmt(meta)} · ${Math.round((ytd+restYear)/meta*100)}%`:`<a href="#" onclick="Fin.setMeta();return false">Definir meta anual</a>`}</div></div>
      </div>
      <div class="card" style="margin-bottom:18px"><div class="card-h"><h3>Próximos 12 meses</h3><span class="grow"></span>
        <span class="small muted">¿Y si sumamos un cliente de</span><input class="inp sm" type="number" style="width:130px" placeholder="$ por mes" value="${extraCliente||''}" onchange="Fin.whatIf(this.value)"><span class="small muted">?</span></div>
        <canvas id="ch-proj" height="95"></canvas>
        <p class="xs faint" style="margin-top:10px">Barras claras: últimos 5 meses reales. Proyección = retainers vigentes + proyectos puntuales agendados − equipo − gastos fijos. Promedio de ingresos de los últimos meses: ${fmt(avgPast)}.</p></div>
      <div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Mes</th><th style="text-align:right">Retainers</th><th style="text-align:right">Puntuales</th><th style="text-align:right">Gastos</th><th style="text-align:right">Ganancia</th></tr></thead><tbody>
        ${fut.map(m=>`<tr><td class="b">${ymLabel(m.ym)}</td><td style="text-align:right">${fmt(m.ret)}${extraCliente&&m.ym>now?` <span class="xs" style="color:var(--green)">+${fmt(extraCliente)}</span>`:''}</td><td style="text-align:right">${m.proy?fmt(m.proy):'—'}</td><td style="text-align:right">${fmt(m.gas)}</td><td style="text-align:right;color:${m.neto>=0?'var(--blue-l)':'var(--red)'}" class="b">${fmt(m.neto)}</td></tr>`).join('')}</tbody></table></div>`,
      after:()=>{ const ctx = $('#ch-proj'); if(!ctx || !window.Chart) return;
        const tk = { color:'#7a7a8c', font:{ family:'Montserrat', size:10 } };
        charts.proj = new Chart(ctx, { type:'bar', data:{ labels:[...past.map(m=>ymLabel(m.ym,1)), ...fut.map(m=>ymLabel(m.ym,1))], datasets:[
          { label:'Ingresos', data:[...past.map(m=>m.ing), ...fut.map(m=>m.ing)], backgroundColor:[...past.map(()=>'rgba(26,115,232,.3)'), ...fut.map(()=>'rgba(26,115,232,.7)')], borderRadius:6, order:2 },
          { label:'Gastos', data:[...past.map(m=>m.gas), ...fut.map(m=>m.gas)], backgroundColor:'rgba(232,72,74,.45)', borderRadius:6, order:2 },
          { label:'Ganancia', data:[...past.map(m=>m.neto), ...fut.map(m=>m.neto)], type:'line', borderColor:'#2dca72', tension:.35, pointRadius:3, borderWidth:2.5, order:1 },
          ...(meta?[{ label:'Meta mensual', data:[...past, ...fut].map(()=>meta/12), type:'line', borderColor:'rgba(232,184,74,.9)', borderDash:[6,4], pointRadius:0, borderWidth:2, order:0 }]:[]),
        ] }, options:{ responsive:true, interaction:{ mode:'index', intersect:false }, scales:{ x:{ grid:{ display:false }, ticks:tk }, y:{ grid:{ color:'rgba(128,128,128,.12)' }, ticks:{ ...tk, callback:v=>'$'+(v/1e6).toFixed(1)+'M' } } },
          plugins:{ legend:{ labels:{ color:'#7a7a8c', usePointStyle:true } }, tooltip:{ callbacks:{ label:c=>' '+c.dataset.label+': '+fmt(c.raw) } } } } }); } };
  }

  // ── ✅ Cierre del mes (preguntas guiadas) ──────────────────────────────────
  let ciYm = null, step = 0;
  const STEPS = ['Clientes del mes','Proyectos puntuales','Gastos','Resumen y cierre'];

  // El cierre usa los mismos datos que Actualidad; acá solo viven los gastos extra y las respuestas
  function draft(ym){ const c = S.cierres[ym] = S.cierres[ym] || {}; if(!Array.isArray(c.extras)) c.extras = []; c.answers = c.answers || {}; return c; }
  const touch = ym => { const c = S.cierres[ym]; if(c) c.updatedAt = new Date().toISOString(); save(); };
  const upd = () => touch(ciYm);
  const money = (val, onchange, extra='') => `<input class="inp sm" type="number" step="any" style="width:130px;text-align:right" value="${val??''}" onchange="${onchange}" ${extra}>`;
  const cobSel = (v, fn) => `<select class="inp sm" onchange="${fn}">${[['si','✓ Cobrado'],['parcial','Cobró una parte'],['no','Pendiente']].map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${l}</option>`).join('')}</select>`;

  function viewClose(){
    const target = ciYm || toClose() || UI.ym();
    ciYm = target;
    const c = draft(ciYm), isClosed = !!c.closedAt;
    const opts = [...Array(14).keys()].map(i=>ymAdd(UI.ym(), -i+1)).filter(x=>x>=ymAdd(firstYm(),-1));
    const stepper = `<div class="row wrap" style="gap:8px;margin-bottom:20px">${STEPS.map((s,i)=>`<button class="chip ${i===step?'on':''}" onclick="Fin.step(${i})">${i+1}. ${s}</button>`).join('')}</div>`;
    const nav = `<div class="row" style="justify-content:space-between;margin-top:20px">${step>0?`<button class="btn g" onclick="Fin.step(${step-1})">← Anterior</button>`:'<span></span>'}${step<3?`<button class="btn p" onclick="Fin.step(${step+1})">Siguiente →</button>`:''}</div>`;
    const head = `<div class="toolbar"><select class="inp" style="width:auto" onchange="Fin.pickClose(this.value)">${opts.map(o=>`<option value="${o}" ${o===ciYm?'selected':''}>${ymLabel(o)}${closed(o)?' ✓':''}</option>`).join('')}</select>
      <span class="tag ${isClosed?'t-green':'t-yellow'}">${isClosed?'✓ Cerrado'+(c.by?' por '+esc(c.by):''):'Pendiente de cierre'}</span><span class="grow"></span>
      ${isClosed?`<button class="btn g sm" onclick="Fin.reopen()">Reabrir para corregir</button>`:''}</div>
      <div class="hero" style="margin-bottom:18px;padding:20px 24px"><div class="grow"><h2 style="font-size:20px">Cierre de ${ymLabel(ciYm)}</h2><div class="muted small" style="margin-top:4px">Contestá qué pasó de verdad este mes. Con esto quedan los números reales y lo que le queda pagar a cada cliente.</div></div></div>`;
    let body = '';
    const dis = isClosed ? 'disabled' : '';
    if(step===0){
      const rows = cliCands(ciYm).map(x=>cliRow(x, ciYm)), tot = rows.filter(x=>x.estuvo).reduce((s,x)=>s+(+x.monto||0),0);
      body = `<div class="card"><div class="card-h"><h3>1. ¿Qué clientes estuvieron en ${ymLabel(ciYm)} y por cuánto?</h3><span class="grow"></span><b>${fmt(tot)}</b></div>
        <p class="small muted" style="margin-bottom:12px">Destildá a quien no trabajó este mes. Corregí el monto si fue distinto (aumentos, extras, descuentos). Marcá si ya pagó. Es lo mismo que ves en Actualidad: lo que cambies acá se ve allá y al revés.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Estuvo</th><th>Cliente</th><th style="text-align:right">Monto del mes</th><th>¿Pagó?</th><th style="text-align:right">Le queda pagar</th><th></th></tr></thead><tbody>
        ${rows.map(x=>`<tr style="${x.estuvo?'':'opacity:.45'}"><td><input type="checkbox" ${x.estuvo?'checked':''} ${dis} onchange="Fin.cli('${x.id}','estuvo',this.checked)" style="width:18px;height:18px"></td>
          <td><div class="b">${esc(x.nombre)}</div><div class="xs faint">${esc(TIPO[x.tipo]||'')}${x.base&&+x.monto!==+x.base?` · habitual ${fmt(x.base)}`:''}</div></td>
          <td style="text-align:right">${money(x.monto, `Fin.cli('${x.id}','monto',this.value)`, dis)}</td>
          <td>${x.estuvo?cobSel(x.cobrado, `Fin.cli('${x.id}','cobrado',this.value)`).replace('<select', `<select ${dis}`):'—'}</td>
          <td style="text-align:right">${!x.estuvo?'—':x.cobrado==='parcial'?money(x.pendiente, `Fin.cli('${x.id}','pendiente',this.value)`, dis):`<b style="color:${x.pendiente?'var(--yellow)':'var(--green)'}">${x.pendiente?fmt(x.pendiente):'$0'}</b>`}</td>
          <td>${isClosed?'':`<button class="icon-btn" title="Sacar / dar de baja" onclick="Fin.quitar('c','${x.id}','${ciYm}')">🗑</button>`}</td></tr>`).join('')||'<tr><td colspan="6" class="small faint">Sin clientes</td></tr>'}</tbody></table></div>
        ${isClosed?'':`<button class="btn g sm" style="margin-top:12px" onclick="Fin.addFijo2('${ciYm}')">＋ Cliente / ingreso fijo</button>`}</div>`;
    }
    if(step===1){
      const pros = proRows(ciYm), prev = S.proyectos.filter(p=>p.estado!=='cobrado' && p.fecha && p.fecha.slice(0,7)<ciYm && isOneShot(p));
      body = `<div class="card"><div class="card-h"><h3>2. Proyectos puntuales de ${ymLabel(ciYm)}</h3><span class="grow"></span><b>${fmt(pros.reduce((s,p)=>s+(+p.monto||0),0))}</b></div>
        <p class="small muted" style="margin-bottom:12px">Webs, brandings, pagos de 50%… todo lo que no es el mensual. Si tuvo costo (freelance), cargalo.</p>
        ${pros.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Proyecto</th><th style="text-align:right">Monto</th><th>¿Pagó?</th><th style="text-align:right">Le queda pagar</th><th style="text-align:right">Costo</th><th></th></tr></thead><tbody>
          ${pros.map(p=>`<tr><td><div class="b">${esc(p.nombre)}</div><div class="xs faint">${esc(p.cliente)}</div></td><td style="text-align:right">${money(p.monto, `Fin.pro('${p.id}','monto',this.value)`, dis)}</td>
            <td>${cobSel(p.cobrado, `Fin.pro('${p.id}','cobrado',this.value)`).replace('<select', `<select ${dis}`)}</td>
            <td style="text-align:right">${p.cobrado==='parcial'?money(p.pendiente, `Fin.pro('${p.id}','pendiente',this.value)`, dis):`<b style="color:${p.pendiente?'var(--yellow)':'var(--green)'}">${p.pendiente?fmt(p.pendiente):'$0'}</b>`}</td>
            <td style="text-align:right">${money(p.costo, `Fin.pro('${p.id}','costo',this.value)`, dis)}</td><td>${isClosed?'':`<button class="icon-btn" title="Eliminar" onclick="Fin.quitar('p','${p.id}','${ciYm}')">🗑</button>`}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty small">No hay proyectos puntuales cargados en este mes.</div>'}
        ${isClosed?'':`<button class="btn g sm" style="margin-top:12px" onclick="Fin.addPuntual('${ciYm}')">＋ Proyecto puntual</button>`}</div>
        ${prev.length&&!isClosed?`<div class="card" style="margin-top:16px"><div class="card-h"><h3>¿Se cobró algún pendiente de meses anteriores?</h3></div><div class="list">
          ${prev.map(p=>`<div class="li"><div class="grow"><div class="b small">${esc(p.cliente)} · ${esc(p.nombre)}</div><div class="xs faint">${esc(p.etapa||'')} · ${UI.fdate(p.fecha,{abs:true})}</div></div><b>${fmt(p.monto)}</b><button class="btn xs ok" onclick="Fin.paidOld(${p.id})">Se cobró ✓</button></div>`).join('')}</div></div>`:''}`;
    }
    if(step===2){
      const eqs = eqCands(ciYm).map(e=>eqRow(e, ciYm)), fjs = fjRows(ciYm);
      const eq = eqs.filter(x=>x.incluir).reduce((s,x)=>s+(+x.monto||0),0), fj = fjs.filter(x=>x.incluir).reduce((s,x)=>s+(+x.monto||0),0), ex = c.extras.reduce((s,x)=>s+(+x.monto||0),0);
      const del = (k,id) => isClosed ? '' : `<button class="icon-btn" title="Sacar / eliminar" onclick="Fin.quitar('${k}','${id}','${ciYm}')">🗑</button>`;
      body = `<div class="card"><div class="card-h"><h3>3. ¿Cuánto gastamos en ${ymLabel(ciYm)}?</h3><span class="grow"></span><b>${fmt(eq+fj+ex)}</b></div>
        <div class="xs faint b" style="margin:6px 0">EQUIPO · ${fmt(eq)}</div>
        ${eqs.map(x=>`<div class="row" style="padding:7px 0;border-bottom:1px solid var(--border)"><input type="checkbox" ${x.incluir?'checked':''} ${dis} onchange="Fin.eq('${x.id}','incluir',this.checked)" style="width:18px;height:18px"><span class="grow ${x.incluir?'':'faint'}">${esc(x.nombre)}${x.base&&+x.monto!==+x.base?` <span class="xs faint">(habitual ${fmt(x.base)})</span>`:''}</span>${money(x.monto, `Fin.eq('${x.id}','monto',this.value)`, dis)}${del('eq',x.id)}</div>`).join('')||'<div class="small faint">Sin equipo cargado</div>'}
        ${isClosed?'':`<button class="btn g xs" style="margin-top:8px" onclick="Fin.addEq('${ciYm}')">＋ Persona</button>`}
        <div class="xs faint b" style="margin:16px 0 6px">GASTOS FIJOS · ${fmt(fj)}</div>
        ${fjs.map(x=>`<div class="row" style="padding:7px 0;border-bottom:1px solid var(--border)"><input type="checkbox" ${x.incluir?'checked':''} ${dis} onchange="Fin.fj('${x.id}','incluir',this.checked)" style="width:18px;height:18px"><span class="grow ${x.incluir?'':'faint'}">${esc(x.concepto)}</span>${money(x.monto, `Fin.fj('${x.id}','monto',this.value)`, dis)}${del('fj',x.id)}</div>`).join('')||'<div class="small faint">Sin gastos fijos</div>'}
        ${isClosed?'':`<button class="btn g xs" style="margin-top:8px" onclick="Fin.addFijo('${ciYm}')">＋ Gasto fijo (todos los meses)</button>`}
        <div class="xs faint b" style="margin:16px 0 6px">GASTOS EXTRA DE ESTE MES · ${fmt(ex)}</div>
        ${c.extras.map((x,i)=>`<div class="row" style="padding:7px 0;border-bottom:1px solid var(--border)"><span class="grow">${esc(x.concepto)}</span><b>${fmt(x.monto)}</b>${del('ex',i)}</div>`).join('')||'<div class="small faint">¿Hubo algún gasto que no se repite? (equipos, viajes, imprevistos)</div>'}
        ${isClosed?'':`<button class="btn g xs" style="margin-top:8px" onclick="Fin.addEx('${ciYm}')">＋ Gasto extra</button>`}</div>`;
    }
    if(step===3){
      const M = month(ciYm);
      const owes = {}; M.cli.filter(x=>+x.pendiente).forEach(x=>owes[x.nombre]=(owes[x.nombre]||0)+(+x.pendiente)); M.pro.filter(p=>+p.pendiente).forEach(p=>owes[p.cliente]=(owes[p.cliente]||0)+(+p.pendiente));
      const a = c.answers||{};
      body = `<div class="grid g4" style="margin-bottom:16px">
          <div class="card kpi"><div class="l">Ingresos</div><div class="v" style="color:var(--green)">${fmt(M.ing)}</div></div>
          <div class="card kpi"><div class="l">Gastos</div><div class="v" style="color:var(--red)">${fmt(M.gas)}</div></div>
          <div class="card kpi"><div class="l">Ganancia</div><div class="v" style="color:var(--blue-l)">${fmt(M.neto)}</div><div class="s">Margen ${M.margen}%</div></div>
          <div class="card kpi"><div class="l">Falta cobrar</div><div class="v" style="color:var(--yellow)">${fmt(M.pend)}</div></div></div>
        <div class="grid g2"><div class="card"><div class="card-h"><h3>Lo que le queda pagar a cada cliente</h3></div>
          ${Object.keys(owes).length?Object.entries(owes).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="row small" style="padding:8px 0;border-bottom:1px solid var(--border)"><span class="grow b">${esc(k)}</span><b style="color:var(--yellow)">${fmt(v)}</b></div>`).join(''):'<div class="small" style="color:var(--green)">🎉 Todos pagaron todo.</div>'}</div>
          <div class="card"><div class="card-h"><h3>Para terminar</h3></div>
            <div class="fld"><label>Saldo real en cuentas al cierre (opcional)</label>${money(a.saldo, `Fin.ans('saldo',this.value)`, dis).replace('width:130px','width:100%')}</div>
            <div class="fld"><label>¿Algo importante del mes? (bajas, aumentos, preocupaciones)</label><textarea class="inp" rows="3" ${dis} onchange="Fin.ans('notas',this.value)">${esc(a.notas||'')}</textarea></div></div></div>
        ${isClosed?'':`<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn p" style="padding:13px 24px;font-size:14px" onclick="Fin.close()">🎉 Cerrar ${ymLabel(ciYm)}</button></div>`}`;
    }
    return { html: head + stepper + body + (step<3||isClosed?nav:(step>0?`<div style="margin-top:12px"><button class="btn g" onclick="Fin.step(2)">← Anterior</button></div>`:'')) };
  }

  // ── Acciones ────────────────────────────────────────────────────────────────
  const syncPend = x => { if(x.cobrado==='si') x.pendiente = 0; else if(x.cobrado==='no') x.pendiente = +x.monto||0; else if(+x.pendiente>+x.monto) x.pendiente = +x.monto; };
  window.Fin = {
    go(t){ tab = t; if(t==='cierre' && !ciYm) step = 0; render(); window.scrollTo(0,0); },
    move(n){ cursor = ymAdd(cursor, n); render(); },
    hoy(){ cursor = UI.ym(); render(); },
    // Sueldo pagado / no pagado en el mes que se está viendo
    pagoEq(id){ const ym = cursor; ovSet(ym,'eq',id,{ pagado: ovGet(ym,'eq',id).pagado ? null : true }); touch(ym); render(); },
    nota(k,v){ const c = draft(cursor); c.answers[k] = k==='saldo' ? (v===''?'':+v) : v; touch(cursor); },
    startClose(ym){ ciYm = ym; step = 0; tab = 'cierre'; render(); window.scrollTo(0,0); },
    pickClose(ym){ ciYm = ym; step = 0; render(); },
    step(n){ step = Math.max(0, Math.min(3, n)); render(); window.scrollTo(0,0); },
    whatIf(v){ extraCliente = +v||0; render(); },
    setMeta(){ const v = prompt('Meta de facturación anual ($):', S.metas.facturacion||''); if(v!=null){ S.metas.facturacion = +v||0; save(); render(); } },
    // ── Cambios (sirven igual desde Actualidad y desde el Cierre) ──
    cli(id,k,v){ const ym = ciYm, x = S.clientes.find(y=>String(y.id)===String(id)); if(!x) return; const r = cliRow(x, ym);
      if(k==='estuvo') setPaused(x.id, ym, !v);
      if(k==='monto'){ const n = +v||0; ovSet(ym,'cli',x.id,{ monto: n===r.base ? null : n }); }
      if(k==='cobrado'){ setCobro(x.id, ym, v==='si'); ovSet(ym,'cli',x.id,{ pendiente: v==='parcial' ? r.monto : null }); }
      if(k==='pendiente'){ const n = +v||0; if(n<=0){ setCobro(x.id, ym, true); ovSet(ym,'cli',x.id,{ pendiente:null }); } else ovSet(ym,'cli',x.id,{ pendiente:n }); }
      upd(); render(); },
    pro(id,k,v){ const p = S.proyectos.find(y=>String(y.id)===String(id)); if(!p) return;
      if(k==='monto') p.monto = +v||0;
      if(k==='costo') p.empCosto = +v||0;
      if(k==='cobrado'){ p.estado = v==='si' ? 'cobrado' : 'pendiente'; if(v==='parcial') p.pendienteParcial = +p.monto||0; else delete p.pendienteParcial; }
      if(k==='pendiente'){ const n = +v||0; if(n<=0){ p.estado = 'cobrado'; delete p.pendienteParcial; } else p.pendienteParcial = n; }
      upd(); render(); },
    eq(id,k,v){ const ym = ciYm, e = S.empleados.find(y=>String(y.id)===String(id)); if(!e) return;
      if(k==='incluir') setSkip(e.id, ym, !v);
      if(k==='monto'){ const n = +v||0; ovSet(ym,'eq',e.id,{ monto: n===sueldoAt(e, ym) ? null : n }); }
      upd(); render(); },
    fj(id,k,v){ const ym = ciYm, g = S.gastos.find(y=>String(y.id)===String(id)); if(!g) return;
      if(k==='incluir') ovSet(ym,'fj',g.id,{ off: v ? null : true });
      if(k==='monto'){ const n = +v||0; ovSet(ym,'fj',g.id,{ monto: n===Math.round(gastoMensual(g)) ? null : n }); }
      upd(); render(); },
    ans(k,v){ const c = draft(ciYm); c.answers[k] = k==='saldo' ? (v===''?'':+v) : v; upd(); },
    addEq(ymArg){ const ym = ymArg || cursor; UI.form({ title:`Persona del equipo · desde ${ymLabel(ym)}`, fields:[ { k:'nombre', label:'Nombre', req:true, half:true }, { k:'monto', label:'Sueldo por mes', type:'number', req:true, half:true } ],
      onSubmit:v=>{ S.empleados.push({ id:Date.now(), nombre:v.nombre, rol:'', sueldo:+v.monto||0, moneda:'ARS', estado:'activo', inicioLaboral:ym, sueldoHistory:[{ monto:+v.monto||0, desde:ym, nota:'Inicial' }], clienteIds:[] }); touch(ym); render(); } }); },
    addFijo(ymArg){ const ym = ymArg || cursor; UI.form({ title:`Gasto fijo mensual · desde ${ymLabel(ym)}`, fields:[ { k:'concepto', label:'Concepto', req:true, half:true }, { k:'monto', label:'Monto por mes', type:'number', req:true, half:true } ],
      onSubmit:v=>{ S.gastos.push({ id:Date.now(), concepto:v.concepto, categoria:'Otros', frecuencia:'mensual', monto:+v.monto||0, moneda:'ARS', desde:ym }); touch(ym); render(); } }); },
    addEx(ymArg){ const ym = ymArg || cursor; UI.form({ title:`Gasto extra · solo ${ymLabel(ym)}`, fields:[ { k:'concepto', label:'¿En qué?', req:true, half:true }, { k:'monto', label:'Monto', type:'number', req:true, half:true } ],
      onSubmit:v=>{ draft(ym).extras.push({ concepto:v.concepto, monto:+v.monto||0 }); touch(ym); render(); } }); },
    addGasto(ymArg){ const ym = ymArg || cursor;
      UI.form({ title:`＋ Gasto · ${ymLabel(ym)}`, submit:'Siguiente', fields:[ { k:'t', label:'¿Qué tipo de gasto?', type:'select', options:[['ex',`Gasto extra (solo ${ymLabel(ym)})`],['fj',`Gasto fijo (todos los meses desde ${ymLabel(ym)})`],['eq','Sueldo de una persona nueva']] } ],
        onSubmit:v=>{ setTimeout(()=>Fin[{ ex:'addEx', fj:'addFijo', eq:'addEq' }[v.t]](ym), 60); } }); },
    // Marca si un cliente/proyecto pagó (en el mes que se está viendo)
    cobro(kind, id){
      const ym = cursor;
      if(kind==='c'){ setCobro(id, ym, !isCobrado(id, ym)); ovSet(ym,'cli',id,{ pendiente:null }); }
      else { const p = S.proyectos.find(y=>String(y.id)===String(id)); if(p){ p.estado = p.estado==='cobrado' ? 'pendiente' : 'cobrado'; delete p.pendienteParcial; } }
      touch(ym); render();
    },
    // ── Cargar ingresos de un mes (fijos = clientes mensuales; puntuales = proyectos) ──
    addFijo2(ymArg){
      const ym = ymArg || cursor, act = S.clientes.filter(c=>!M_has(c.id, ym)).sort((a,b)=>a.nombre.localeCompare(b.nombre));
      UI.form({ title:`＋ Ingreso fijo · ${ymLabel(ym)}`, submit:'Agregar', fields:[
        { k:'cid', label:'Cliente', type:'select', options:[['__new','＋ Cliente nuevo'], ...act.map(c=>[String(c.id), c.nombre+(c.estado==='inactivo'?' (inactivo)':'')])] },
        { k:'nombre', label:'Nombre (si es nuevo)', placeholder:'Nombre del cliente' },
        { k:'tipo', label:'Servicio', type:'select', options:Object.entries(TIPO), half:true }, { k:'monto', label:'Monto mensual', type:'number', req:true, half:true },
        { k:'cobrado', label:`¿Pagó ${ymLabel(ym)}?`, type:'select', options:[['no','Todavía no'],['si','✓ Sí, pagó']] },
        { k:'h', type:'html', html:'<p class="xs faint">Queda como ingreso fijo desde este mes en adelante (se repite todos los meses hasta que lo des de baja).</p>' },
      ], onSubmit:v=>{
        let c = v.cid!=='__new' && S.clientes.find(x=>String(x.id)===v.cid);
        if(!c && !(v.nombre||'').trim()){ UI.toast('Poné el nombre del cliente','👆'); return false; }
        const monto = +v.monto||0;
        if(!c){ c = { id:Date.now(), nombre:v.nombre.trim(), tipo:v.tipo, retainer:monto, moneda:'ARS', estado:'activo', inicioServicio:ym, retainerHistory:[], empleadoIds:[], presupuesto:null }; S.clientes.push(c); }
        c.estado = 'activo'; c.tipo = v.tipo || c.tipo; if(c.finServicio && c.finServicio<ym) c.finServicio = '';
        if(!c.inicioServicio || c.inicioServicio>ym) c.inicioServicio = ym;
        c.retainerHistory = (c.retainerHistory||[]).filter(h=>h.desde!==ym); c.retainerHistory.push({ monto, desde:ym, nota:'Cargado' }); c.retainer = monto; c.presupuesto = null;
        setPaused(c.id, ym, false); setCobro(c.id, ym, v.cobrado==='si'); ovSet(ym,'cli',c.id,{ monto:null, pendiente:null });
        touch(ym); render(); UI.toast(`${c.nombre}: ${fmt(monto)} por mes`,'💰'); } });
    },
    addPuntual(ymArg){
      const ym = ymArg || cursor, today = UI.today(), def = today.slice(0,7)===ym ? today : ym+'-15';
      UI.form({ title:`＋ Proyecto / ingreso puntual · ${ymLabel(ym)}`, submit:'Agregar', fields:[
        { k:'cliente', label:'Cliente', req:true, half:true, placeholder:'Nombre del cliente' }, { k:'nombre', label:'Proyecto', req:true, half:true, placeholder:'Web, branding, pago 1 de 2…' },
        { k:'monto', label:'Monto', type:'number', req:true, half:true }, { k:'fecha', label:'Fecha', type:'date', default:def, half:true },
        { k:'costo', label:'Costo (freelance), si hubo', type:'number', half:true }, { k:'cobrado', label:'¿Pagó?', type:'select', options:[['no','Todavía no'],['si','✓ Sí, pagó']], half:true },
      ], onSubmit:v=>{
        const fecha = v.fecha || def, monto = +v.monto||0;
        S.proyectos.push({ id:Date.now(), nombre:v.nombre, cliente:v.cliente, monto, fecha, estado:v.cobrado==='si'?'cobrado':'pendiente', etapa:'Pago único', empCosto:+v.costo||0, moneda:'ARS' });
        if(tab==='actualidad' && fecha.slice(0,7)!==ym) cursor = fecha.slice(0,7);
        touch(ym); render(); UI.toast(`${v.cliente}: ${fmt(monto)}`,'💰'); } });
    },
    cliView(v){ cliView = v; render(); },
    // 🗑 Sacar algo de un mes, darlo de baja o eliminarlo (mismo efecto en Actualidad y en el Cierre)
    quitar(kind, id, ymArg){
      const ym = ymArg || cursor, L = ymLabel(ym), sid = x => String(x.id)===String(id);
      const nm = kind==='c' ? S.clientes.find(sid)?.nombre : kind==='eq' ? S.empleados.find(sid)?.nombre : kind==='fj' ? S.gastos.find(sid)?.concepto
        : kind==='ex' ? S.cierres[ym]?.extras?.[+id]?.concepto : (()=>{ const p = S.proyectos.find(sid); return p ? `${p.cliente} · ${p.nombre}` : ''; })();
      const opts = {
        c:[['mes',`Sacarlo solo de ${L}`,'No cuenta este mes; los demás meses quedan igual.'],['baja',`Dar de baja desde ${L}`,'Deja de ser cliente de acá en adelante (los meses anteriores no se tocan).']],
        eq:[['mes',`Sacarlo solo de ${L}`,'No cobra sueldo este mes; los demás meses quedan igual.'],['baja',`Ya no trabaja con nosotros desde ${L}`,'Se saca de acá en adelante (los meses anteriores no se tocan).']],
        fj:[['mes',`Sacarlo solo de ${L}`,'No se paga este mes; los demás meses quedan igual.'],['baja',`Dejar de pagarlo desde ${L}`,'Se saca de acá en adelante (los meses anteriores no se tocan).']],
        p:[['del','Eliminar este ingreso puntual','Se borra del todo.']], pc:[['del','Eliminar el proyecto (ingreso y costo)','Se borra del todo.']], ex:[['del','Eliminar este gasto extra','Se borra de este mes.']] }[kind];
      if(!opts) return;
      const box = UI.modal(`<h2>🗑 ${esc(nm||'')}<button class="icon-btn x" data-close>✕</button></h2><div class="list">${opts.map(([k,l,d])=>`<div class="li click" data-k="${k}" style="cursor:pointer"><div class="grow"><div class="b">${l}</div><div class="xs faint">${d}</div></div><span>›</span></div>`).join('')}</div>
        <div class="mfoot"><button class="btn g" data-close>Cancelar</button></div>`);
      box.querySelectorAll('[data-k]').forEach(el=>el.onclick = ()=>{ const k = el.dataset.k;
        if(kind==='c'){ const x = S.clientes.find(sid); if(k==='mes'){ setPaused(id, ym, true); setCobro(id, ym, false); } else if(x){ x.finServicio = ymAdd(ym,-1); x.estado = 'inactivo'; clearIn(ym,'cli',id); } }
        if(kind==='eq'){ const e = S.empleados.find(sid); if(k==='mes') setSkip(id, ym, true); else if(e){ e.finLaboral = ymAdd(ym,-1); e.estado = 'inactivo'; clearIn(ym,'eq',id); } }
        if(kind==='fj'){ const g = S.gastos.find(sid); if(k==='mes') ovSet(ym,'fj',id,{ off:true }); else if(g){ if(g.desde && g.desde>=ym) S.gastos = S.gastos.filter(x=>!sid(x)); else g.hasta = ymAdd(ym,-1); } }
        if(kind==='p' || kind==='pc') S.proyectos = S.proyectos.filter(x=>!sid(x));
        if(kind==='ex') S.cierres[ym]?.extras?.splice(+id, 1);
        UI.close(); touch(ym); render(); UI.toast(k==='mes' ? `Sacado de ${L}` : k==='baja' ? `De baja desde ${L}` : 'Eliminado','🗑'); });
    },
    quitarMes(id, ymArg){ Fin.quitar('c', id, ymArg); },
    volver(kind, id, ymArg){ const ym = ymArg || cursor;
      if(kind==='c') setPaused(id, ym, false); if(kind==='eq') setSkip(id, ym, false); if(kind==='fj') ovSet(ym,'fj',id,{ off:null });
      touch(ym); render(); },
    volverMes(id, ymArg){ Fin.volver('c', id, ymArg); },
    editIngreso(kind, id, ymArg){
      const ym = ymArg || cursor, sid = x => String(x.id)===String(id);
      if(kind==='c'){
        const c = S.clientes.find(sid); if(!c) return; const r = cliRow(c, ym);
        UI.form({ title:`✎ ${c.nombre} · ${ymLabel(ym)}`, submit:'Guardar', fields:[
          { k:'monto', label:`Monto de ${ymLabel(ym)}`, type:'number', default:r.monto, req:true },
          { k:'alcance', label:'¿Desde cuándo?', type:'select', options:[['adelante',`Desde ${ymLabel(ym)} en adelante (nuevo precio)`],['solo',`Solo ${ymLabel(ym)} (los demás meses quedan igual)`]] },
          ...((c.retainerHistory||[]).length ? [{ k:'h', type:'html', html:`<div class="xs faint" style="margin-top:4px"><b>Historial de precios:</b> ${[...c.retainerHistory].sort((a,b)=>a.desde.localeCompare(b.desde)).map(h=>`${ymLabel(h.desde,1)} ${fmt(h.monto)}`).join(' → ')}</div>` }] : []),
        ], danger:{ label:'🗑 Sacar / dar de baja', fn:()=>setTimeout(()=>Fin.quitar('c', id, ym), 60) },
        onSubmit:v=>{ const monto = +v.monto||0;
          if(v.alcance==='solo') ovSet(ym,'cli',c.id,{ monto: monto===r.base ? null : monto });
          else {
            const base = monto - extrasOf(c.id, ym);
            c.retainerHistory = (c.retainerHistory||[]).length ? c.retainerHistory : [{ monto:c.presupuesto ?? c.retainer ?? 0, desde:c.inicioServicio||ym, nota:'Inicial' }];
            c.retainerHistory = c.retainerHistory.filter(h=>h.desde<ym); c.retainerHistory.push({ monto:base, desde:ym, nota:'Editado' });
            c.retainer = base; c.presupuesto = null;
            Object.keys(S.mes).filter(k=>k>=ym && !closed(k)).forEach(k=>ovSet(k,'cli',c.id,{ monto:null }));   // los meses cerrados quedan como se cerraron
            ovSet(ym,'cli',c.id,{ monto:null });
          }
          touch(ym); render(); } });
      } else {
        const p = S.proyectos.find(sid); if(!p) return;
        UI.form({ title:`✎ ${p.cliente} · ${p.nombre}`, submit:'Guardar', fields:[
          { k:'cliente', label:'Cliente', default:p.cliente, half:true, req:true }, { k:'nombre', label:'Proyecto', default:p.nombre, half:true, req:true },
          { k:'monto', label:'Monto', type:'number', default:p.monto, req:true, half:true }, { k:'costo', label:'Costo (freelance)', type:'number', default:p.empCosto, half:true },
          { k:'fecha', label:'Fecha (define el mes)', type:'date', default:p.fecha },
        ], danger:{ label:'🗑 Eliminar', confirm:'¿Eliminar este ingreso puntual?', fn:()=>{ S.proyectos = S.proyectos.filter(x=>!sid(x)); touch(ym); render(); } },
        onSubmit:v=>{ Object.assign(p, { cliente:v.cliente, nombre:v.nombre, monto:+v.monto||0, empCosto:+v.costo||0, fecha:v.fecha||p.fecha }); touch(ym); render(); } });
      }
    },
    editGasto(kind, id, ymArg){
      const ym = ymArg || cursor, L = ymLabel(ym), sid = x => String(x.id)===String(id);
      const alc = { k:'alcance', label:'¿Desde cuándo?', type:'select', options:[['adelante',`Desde ${L} en adelante`],['solo',`Solo ${L} (los demás meses quedan igual)`]] };
      if(kind==='pc') return Fin.editIngreso('p', id, ym);
      if(kind==='eq'){ const e = S.empleados.find(sid); if(!e) return; const r = eqRow(e, ym);
        return UI.form({ title:`✎ ${e.nombre} · ${L}`, submit:'Guardar', fields:[ { k:'monto', label:`Sueldo de ${L}`, type:'number', default:r.monto, req:true }, alc ],
          danger:{ label:'🗑 Sacar / dar de baja', fn:()=>setTimeout(()=>Fin.quitar('eq', id, ym), 60) },
          onSubmit:v=>{ const n = +v.monto||0;
            if(v.alcance==='solo') ovSet(ym,'eq',e.id,{ monto: n===r.base ? null : n });
            else { e.sueldoHistory = (e.sueldoHistory||[]).filter(h=>h.desde<ym); e.sueldoHistory.push({ monto:n, desde:ym, nota:'Editado' }); e.sueldo = n;
              Object.keys(S.mes).filter(k=>k>=ym && !closed(k)).forEach(k=>ovSet(k,'eq',e.id,{ monto:null })); }
            touch(ym); render(); } }); }
      if(kind==='fj'){ const g = S.gastos.find(sid); if(!g) return; const r = fjRows(ym).find(x=>sid(x)) || { monto:0, base:0 };
        return UI.form({ title:`✎ ${g.concepto} · ${L}`, submit:'Guardar', fields:[ { k:'concepto', label:'Concepto', default:g.concepto, req:true }, { k:'monto', label:`Monto de ${L}`, type:'number', default:r.monto, req:true }, alc ],
          danger:{ label:'🗑 Sacar / dejar de pagar', fn:()=>setTimeout(()=>Fin.quitar('fj', id, ym), 60) },
          onSubmit:v=>{ const n = +v.monto||0; g.concepto = v.concepto;
            if(v.alcance==='solo') ovSet(ym,'fj',g.id,{ monto: n===r.base ? null : n });
            else if(g.desde && g.desde>=ym){ g.monto = n; g.frecuencia = 'mensual'; ovSet(ym,'fj',g.id,{ monto:null }); }
            else { S.gastos.push({ ...g, id:Date.now(), monto:n, frecuencia:'mensual', desde:ym }); g.hasta = ymAdd(ym,-1); }   // así los meses anteriores no cambian
            touch(ym); render(); } }); }
      if(kind==='ex'){ const x = S.cierres[ym]?.extras?.[+id]; if(!x) return;
        return UI.form({ title:`✎ Gasto extra · ${L}`, submit:'Guardar', fields:[ { k:'concepto', label:'¿En qué?', default:x.concepto, req:true, half:true }, { k:'monto', label:'Monto', type:'number', default:x.monto, req:true, half:true } ],
          danger:{ label:'🗑 Eliminar', confirm:'¿Eliminar este gasto?', fn:()=>{ S.cierres[ym].extras.splice(+id,1); touch(ym); render(); } },
          onSubmit:v=>{ x.concepto = v.concepto; x.monto = +v.monto||0; touch(ym); render(); } }); }
    },
    copyCuenta(){ UI.copy(cuentaTexto(month(cursor))); },
    // 💬 Resumen del mes para WhatsApp: se puede elegir corto/completo y editar antes de mandar
    wpp(){
      const M = month(cursor);
      const box = UI.modal(`<h2>💬 Resumen de ${ymLabel(cursor)} para WhatsApp<button class="icon-btn x" data-close>✕</button></h2>
        <div class="row" style="gap:6px;margin-bottom:10px"><button class="chip on" data-m="completo">Completo</button><button class="chip" data-m="corto">Corto (solo números)</button></div>
        <textarea class="inp" id="wa-text" rows="18" style="line-height:1.5;font-family:inherit"></textarea>
        <p class="xs faint" style="margin-top:6px">Podés editar el texto antes de mandarlo. En WhatsApp los *asteriscos* salen en negrita.</p>
        <div class="mfoot"><button class="btn g" data-close>Cerrar</button><button class="btn g" id="wa-copy">📋 Copiar</button><button class="btn p" id="wa-open">💬 Abrir WhatsApp</button></div>`, true);
      const ta = box.querySelector('#wa-text'), set = m => { ta.value = cuentaTexto(M, m); box.querySelectorAll('[data-m]').forEach(b=>b.classList.toggle('on', b.dataset.m===m)); };
      box.querySelectorAll('[data-m]').forEach(b=>b.onclick = ()=>set(b.dataset.m)); set('completo');
      box.querySelector('#wa-copy').onclick = ()=>{ UI.copy(ta.value); UI.toast('Copiado: pegalo en WhatsApp','📋'); };
      box.querySelector('#wa-open').onclick = ()=>window.open(UI.waLink(ta.value), '_blank');
    },
    editReparto(){
      const R = reparto();
      UI.form({ title:'⚙ Cómo se reparte lo que queda', submit:'Guardar', fields:[
        { k:'agencia', label:'% que queda para la agencia', type:'number', default:R.agencia },
        ...R.socios.map((x,i)=>[{ k:'n'+i, label:'Socio '+(i+1), default:x.nombre, half:true }, { k:'p'+i, label:'% de lo de socios', type:'number', default:x.pct, half:true }]).flat(),
        { k:'h', type:'html', html:'<p class="xs faint">Primero se separa el % de la agencia de lo que queda (ingresos − sueldos − gastos). El resto se reparte entre los socios según su %; tiene que sumar 100.</p>' },
      ], onSubmit:v=>{ const socios = R.socios.map((x,i)=>({ nombre:(v['n'+i]||x.nombre).trim(), pct:+v['p'+i]||0 }));
        const t = socios.reduce((s,x)=>s+x.pct,0); if(Math.round(t)!==100){ UI.toast(`Los % de los socios suman ${t}, tienen que sumar 100`,'⚠️'); return false; }
        S.reparto = { agencia:Math.min(100, Math.max(0, +v.agencia||0)), socios }; save(); render(); } });
    },
    paidOld(id){ const p = S.proyectos.find(x=>String(x.id)===String(id)); if(p) delete p.pendienteParcial; if(p){ p.estado = 'cobrado'; save(); UI.toast(`${p.cliente}: marcado como cobrado`,'✓'); render(); } },
    reopen(){ if(!confirm('¿Reabrir el mes para corregirlo?')) return; S.cierres[ciYm].closedAt = null; save(); render(); },

    // Cerrar: guarda la foto del mes y actualiza la base (tarifas, clientes, proyectos, cobros)
    close(){
      const ym = ciYm, c = draft(ym);
      const cls = cliCands(ym).map(x=>cliRow(x, ym));
      const changed = cls.filter(x=>x.estuvo && ovGet(ym,'cli',x.id).monto!=null && x.base && +x.monto!==+x.base);
      if(changed.length && confirm(`Estos clientes tuvieron un monto distinto al habitual:\n\n${changed.map(x=>`• ${x.nombre}: ${fmt(x.base)} → ${fmt(x.monto)}`).join('\n')}\n\n¿Es su NUEVO valor mensual desde ${ymLabel(ym)}?\n(Aceptar = nuevo valor fijo · Cancelar = fue solo este mes)`)){
        changed.forEach(x=>{ const k = S.clientes.find(y=>String(y.id)===String(x.id)); if(!k) return; const base = +x.monto - extrasOf(k.id, ym);
          k.retainerHistory = ((k.retainerHistory||[]).length ? k.retainerHistory : [{ monto:k.presupuesto ?? k.retainer ?? 0, desde:k.inicioServicio||ym, nota:'Inicial' }]).filter(h=>h.desde!==ym);
          k.retainerHistory.push({ monto:base, desde:ym, nota:'Cierre de mes' }); k.retainer = base; k.presupuesto = null; ovSet(ym,'cli',k.id,{ monto:null }); });
      }
      const sal = eqCands(ym).map(e=>eqRow(e, ym)).filter(x=>x.incluir && ovGet(ym,'eq',x.id).monto!=null && x.base && +x.monto!==+x.base);
      if(sal.length && confirm(`Sueldos distintos al habitual:\n\n${sal.map(x=>`• ${x.nombre}: ${fmt(x.base)} → ${fmt(x.monto)}`).join('\n')}\n\n¿Es el nuevo sueldo desde ${ymLabel(ym)}?`)){
        sal.forEach(x=>{ const e = S.empleados.find(y=>String(y.id)===String(x.id)); if(!e) return; e.sueldoHistory = (e.sueldoHistory||[]).filter(h=>h.desde!==ym); e.sueldoHistory.push({ monto:+x.monto, desde:ym, nota:'Cierre de mes' }); e.sueldo = +x.monto; ovSet(ym,'eq',e.id,{ monto:null }); });
      }
      // Foto del mes (respaldo) y montos fijados: si más adelante cambian tarifas o sueldos, este mes cerrado no se mueve
      c.clientes = cliCands(ym).map(x=>cliRow(x, ym)); c.proyectos = proRows(ym); c.equipo = eqCands(ym).map(e=>eqRow(e, ym)); c.fijos = fjRows(ym);
      c.clientes.forEach(x=>ovSet(ym,'cli',x.id,{ monto:x.monto, in:true }));
      c.equipo.forEach(x=>ovSet(ym,'eq',x.id,{ monto:x.monto, in:true }));
      c.fijos.forEach(x=>ovSet(ym,'fj',x.id,{ monto:x.monto }));
      c.closedAt = new Date().toISOString();
      const me = platformMember(); c.by = me?.name || '';
      save(); UI.confetti(120);
      if(me && window.Store) Store.upsert('team','activity',{ type:'finance_close', text:`Cerró las finanzas de ${ymLabel(ym)}`, by:me.id, at:new Date().toISOString(), xp:50 });
      UI.toast(`¡${ymLabel(ym)} cerrado!`,'🎉', me?50:null);
      cursor = ym; tab = 'actualidad'; ciYm = null; step = 0; setTimeout(render, 400);
    },

    // Menú ⚙
    menu(){
      UI.modal(`<h2>⚙ Finanzas<button class="icon-btn x" data-close>✕</button></h2><div class="list">
        <div class="li click" onclick="Fin.backup()"><span>⇣</span><div class="grow"><div class="b">Descargar backup</div><div class="xs faint">Archivo .json con todos los datos de Finanzas</div></div></div>
        <label class="li click" style="cursor:pointer"><span>⇡</span><div class="grow"><div class="b">Restaurar backup</div><div class="xs faint">Cargá el archivo de la app anterior o de un backup</div></div><input type="file" accept=".json" style="display:none" onchange="Fin.restore(this)"></label>
        <div class="li click" onclick="UI.close();Fin.setMeta()"><span>🎯</span><div class="grow"><div class="b">Meta de facturación anual</div></div></div>
        <div class="li click" onclick="UI.close();FinGate.changePassword()"><span>🔑</span><div class="grow"><div class="b">Cambiar contraseña de Finanzas</div></div></div>
        <a class="li click" href="finanzas-completa.html" style="text-decoration:none;color:inherit"><span>🗂️</span><div class="grow"><div class="b">Vista completa (anterior)</div><div class="xs faint">Para editar clientes, equipo y gastos con todo el detalle</div></div></a>
        <div class="li click" onclick="FinGate.lock()"><span>🔒</span><div class="grow"><div class="b">Bloquear</div></div></div></div>`);
    },
    backup(){ UI.download(`ANM_finanzas_${UI.today()}.json`, S); },
    restore(input){
      const f = input.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = ()=>{ try{ const d = JSON.parse(r.result); if(!d.clientes) throw 0;
        if(!confirm(`¿Restaurar este backup?\n\n${d.clientes.length} clientes · ${(d.proyectos||[]).length} proyectos · ${(d.empleados||[]).length} personas.\n\nReemplaza los datos actuales de Finanzas (la contraseña se mantiene).`)) return;
        const seg = S.seguridad; S = { ...d, seguridad:seg||d.seguridad }; ensure(); save(); UI.close(); UI.toast('Backup restaurado','⇡'); render();
      }catch(e){ UI.toast('Archivo inválido','⚠️'); } };
      r.readAsText(f);
    },
  };

  function platformMember(){
    try{ const me = localStorage.getItem('anm_me'); const team = JSON.parse(localStorage.getItem('anm_doc_team')||'{}');
      return (team.members||[]).find(m=>m.id===me && !m.deleted) || null; }catch(e){ return null; }
  }

  // ── Contraseña de Finanzas (misma que la app anterior: S.seguridad) ─────────
  const OK_KEY = 'anm_fin_ok', IDLE_MIN = 20;
  async function hash(txt){
    if(window.crypto?.subtle){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
    let h = 5381; for(const c of txt) h = (h*33) ^ c.charCodeAt(0); return 'djb'+(h>>>0).toString(16);
  }
  const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
  function gate(html){ $('#app').style.display = 'none'; const g = $('#gate'); g.style.display = ''; g.innerHTML = `<div class="mbox"><div class="row" style="margin-bottom:18px"><img src="logo.jpg" alt="" style="width:46px;height:46px;border-radius:12px"><div><div class="brand-t">ANM</div><div class="brand-s">Finanzas · acceso restringido</div></div></div>${html}<p class="xs" style="margin-top:16px"><a href="index.html">← Volver a la plataforma</a></p></div>`; setTimeout(()=>g.querySelector('input')?.focus(), 30); return g; }
  function open(){ $('#gate').style.display = 'none'; $('#app').style.display = ''; sessionStorage.setItem(OK_KEY, String(Date.now()));
    tab = 'actualidad'; render(); }
  const FinGate = {
    async check(){
      const me = platformMember();
      if(me && me.role!=='admin') return gate('<h2>Sin acceso</h2><p class="muted">Finanzas es solo para los socios.</p>');
      if(!me) return gate('<h2>Ingresá primero a la plataforma</h2><p class="muted">Finanzas se abre desde la plataforma, con un perfil de socio.</p><a class="btn p" href="index.html" style="margin-top:14px">Ir a la plataforma</a>');
      const last = +sessionStorage.getItem(OK_KEY)||0;
      if(last && Date.now()-last < IDLE_MIN*6e4) return open();
      const sec = S.seguridad;
      if(!sec){
        if(status!=='synced') return gate('<h2>Sin conexión</h2><p class="muted">No puedo verificar la contraseña sin conexión a la base de datos.</p><button class="btn p" onclick="location.reload()" style="margin-top:12px">Reintentar</button>');
        const g = gate(`<h2>Creá la contraseña de Finanzas</h2><p class="muted small" style="margin-bottom:14px">Se va a pedir cada vez que entren. Compartila solo entre socios.</p>
          <div class="frow"><div class="fld"><label>Contraseña</label><input class="inp" id="fp1" type="password"></div><div class="fld"><label>Repetila</label><input class="inp" id="fp2" type="password"></div></div>
          <button class="btn p" style="width:100%;justify-content:center" id="fgo">Crear y entrar</button>`);
        g.querySelector('#fgo').onclick = async ()=>{ const a = g.querySelector('#fp1').value, b = g.querySelector('#fp2').value;
          if(a.length<6) return UI.toast('Mínimo 6 caracteres','⚠️'); if(a!==b) return UI.toast('No coinciden','⚠️');
          const salt = rnd(12), rec = rnd(10); S.seguridad = { salt, hash:await hash(salt+a), recovery:await hash(salt+rec), creada:new Date().toISOString() }; await push();
          alert(`Contraseña creada ✅\n\nGuardá este CÓDIGO DE RECUPERACIÓN en un lugar seguro:\n\n${rec}`); open(); };
        return;
      }
      const g = gate(`<h2>🔒 Contraseña de Finanzas</h2><div class="fld"><input class="inp" id="fp" type="password" placeholder="Contraseña"></div>
        <button class="btn p" style="width:100%;justify-content:center" id="fgo">Entrar</button><p class="xs" style="margin-top:10px"><a href="#" id="fforgot">Olvidé la contraseña</a></p>`);
      const go = async ()=>{ const i = g.querySelector('#fp'); if(await hash(sec.salt+i.value)===sec.hash) open(); else { i.value = ''; i.style.borderColor = 'var(--red)'; UI.toast('Contraseña incorrecta','⛔'); } };
      g.querySelector('#fgo').onclick = go; g.querySelector('#fp').onkeydown = e=>{ if(e.key==='Enter') go(); };
      g.querySelector('#fforgot').onclick = async e=>{ e.preventDefault(); const code = prompt('Código de recuperación:'); if(!code) return;
        if(await hash(sec.salt+code.trim().toUpperCase())!==sec.recovery) return UI.toast('Código incorrecto','⛔');
        S.seguridad = null; await push(); FinGate.check(); };
    },
    lock(){ sessionStorage.removeItem(OK_KEY); UI.close(); FinGate.check(); },
    async changePassword(){ const sec = S.seguridad; if(!sec) return;
      const cur = prompt('Contraseña actual:'); if(cur==null) return; if(await hash(sec.salt+cur)!==sec.hash) return UI.toast('Contraseña incorrecta','⛔');
      const nw = prompt('Nueva contraseña (mínimo 6):'); if(!nw || nw.length<6) return UI.toast('Mínimo 6 caracteres','⚠️');
      S.seguridad = { ...sec, hash:await hash(sec.salt+nw) }; save(); UI.toast('Contraseña actualizada','🔑'); },
  };
  window.FinGate = FinGate;
  ['click','keydown'].forEach(ev=>document.addEventListener(ev, ()=>{ if(sessionStorage.getItem(OK_KEY)) sessionStorage.setItem(OK_KEY, String(Date.now())); }, { passive:true }));
  setInterval(()=>{ const l = +sessionStorage.getItem(OK_KEY)||0; if(l && Date.now()-l > IDLE_MIN*6e4) FinGate.lock(); }, 30000);

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{ const t = localStorage.getItem('anm_theme'); if(t) document.documentElement.dataset.theme = t; }catch(e){}
    if(window.Store) Store.loadLocal();
    try{ const r = await fetch('version.json?t='+Date.now(), { cache:'no-store' }); const { v } = await r.json();
      if(v && window.ANM_VERSION && v!==window.ANM_VERSION && sessionStorage.getItem('anm_reloaded')!==v){ sessionStorage.setItem('anm_reloaded', v); return location.reload(); } }catch(e){}
    await load();
    FinGate.check();
  });
})();
