// ─── FINANZAS: contraseña, análisis por período y cierre del mes ──────────────
// Se carga después del script principal de finanzas.html y reutiliza sus funciones
// de cálculo (getMRR, getNomina, etc.) moviendo temporalmente S.mes / S.anio.
(function(){
  const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2,'0');
  const ymOf = (m,a) => `${a}-${pad(m+1)}`;
  const ymNow = () => ymOf(new Date().getMonth(), new Date().getFullYear());
  const ymAdd = (ym,n) => { const [y,m] = ym.split('-').map(Number); const d = new Date(y, m-1+n, 1); return ymOf(d.getMonth(), d.getFullYear()); };
  const ymLabel = (ym, short) => { const [y,m] = ym.split('-'); return short ? MONTHS[+m-1].slice(0,3)+' '+y.slice(2) : MONTHS[+m-1]+' '+y; };
  const ymRange = (a,b) => { const out = []; let x = a; while(x<=b && out.length<240){ out.push(x); x = ymAdd(x,1); } return out; };
  const pct = (a,b) => b ? Math.round((a-b)/Math.abs(b)*100) : null;

  document.head.insertAdjacentHTML('beforeend', `<style>
    .fx-gate{position:fixed;inset:0;z-index:5000;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px}
    .fx-gate .modal{width:420px}
    .fx-in{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:11px 12px;color:var(--text);font-family:Montserrat,sans-serif;font-size:14px;outline:none}
    .fx-in:focus{border-color:var(--blue)}
    .fx-delta{display:inline-block;font-size:10.5px;font-weight:800;border-radius:20px;padding:1px 7px;margin-left:6px}
    .fx-up{background:var(--green-d);color:var(--green)}.fx-down{background:var(--red-d);color:var(--red)}.fx-eq{background:var(--surface3);color:var(--text2)}
    .fx-bar{height:8px;background:var(--surface3);border-radius:8px;overflow:hidden}.fx-bar>div{height:100%;border-radius:8px}
    .fx-q{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px}
    .fx-q.done{border-color:rgba(45,202,114,.35)}
    .fx-q .ql{font-weight:800;font-size:13px;margin-bottom:4px}
    .fx-q .qh{font-size:11px;color:var(--text2);margin-bottom:10px}
    .fx-q textarea{min-height:70px;resize:vertical}
    .fx-rate{display:flex;gap:6px}.fx-rate button{width:44px;height:40px;border-radius:9px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;font-size:18px}
    .fx-rate button.on{background:var(--blue-d);border-color:var(--blue)}
    .fx-ins{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;line-height:1.5}.fx-ins:last-child{border:0}
    .ni .fx-cnt{margin-left:auto;background:var(--red);color:#fff;border-radius:20px;padding:0 7px;font-size:10px}
    .fx-tl td.num{text-align:right;font-variant-numeric:tabular-nums}
    @media(max-width:768px){.fx-hide-m{display:none}}
  </style>`);

  // ── Contraseña ──────────────────────────────────────────────────────────────
  const OK_KEY = 'anm_fin_ok', IDLE_MIN = 20;
  async function hash(txt){
    if(window.crypto?.subtle){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
    let h = 5381; for(const c of txt) h = (h*33) ^ c.charCodeAt(0); return 'djb'+(h>>>0).toString(16);
  }
  const rnd = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');

  function platformMember(){
    try{
      const me = localStorage.getItem('anm_me'); if(!me) return null;
      const team = JSON.parse(localStorage.getItem('anm_doc_team')||'{}');
      return (team.members||[]).find(m=>m.id===me && !m.deleted) || null;
    }catch(e){ return null; }
  }

  async function remoteSecurity(){
    const res = await fetch(SB_URL+'/rest/v1/anm_state?id=eq.main&select=data', { headers:SB_HEADERS });
    if(!res.ok) throw new Error('net');
    const rows = await res.json();
    return rows[0]?.data?.seguridad || null;
  }

  function gate(html){
    let g = document.getElementById('fx-gate');
    if(!g){ g = document.createElement('div'); g.id = 'fx-gate'; g.className = 'fx-gate'; document.body.appendChild(g); }
    g.innerHTML = `<div class="modal"><div class="logo-anm" style="margin-bottom:4px">ANM</div><div class="logo-sub" style="margin-bottom:22px">Finanzas · acceso restringido</div>${html}
      <div style="margin-top:18px;font-size:11px"><a href="index.html" style="color:var(--text2)">← Volver a la plataforma</a></div></div>`;
    setTimeout(()=>g.querySelector('input')?.focus(), 30);
    return g;
  }
  function unlock(){
    sessionStorage.setItem(OK_KEY, String(Date.now()));
    document.getElementById('fx-gate')?.remove();
    render();
  }
  window.finLock = ()=>{ sessionStorage.removeItem(OK_KEY); checkGate(); };

  async function checkGate(){
    const m = platformMember();
    if(m && m.role!=='admin'){ gate(`<div class="mtitle">No tenés acceso a Finanzas</div><div class="csub" style="font-size:12px">Esta sección es solo para admins. Pedile acceso a un admin del equipo.</div>`); return; }
    const last = +sessionStorage.getItem(OK_KEY)||0;
    if(last && Date.now()-last < IDLE_MIN*6e4){ sessionStorage.setItem(OK_KEY, String(Date.now())); return; }
    sessionStorage.removeItem(OK_KEY);
    gate(`<div class="csub" style="font-size:12px">Verificando…</div>`);
    let sec = S.seguridad;
    try{ const r = await remoteSecurity(); if(r){ sec = r; S.seguridad = r; } }catch(e){ if(!sec){ gate(`<div class="mtitle">Sin conexión</div><div class="csub" style="font-size:12px;margin-bottom:14px">No puedo verificar la contraseña sin conexión a la base de datos.</div><button class="btn bp" onclick="location.reload()">Reintentar</button>`); return; } }
    if(!sec){
      const g = gate(`<div class="mtitle">Creá la contraseña de Finanzas</div>
        <div class="csub" style="font-size:12px;margin-bottom:14px">Se va a pedir cada vez que alguien entre a esta sección. Compartila solo con los socios.</div>
        <div class="fr"><label>Contraseña (mínimo 6 caracteres)</label><input class="fx-in" id="fx-p1" type="password"></div>
        <div class="fr"><label>Repetila</label><input class="fx-in" id="fx-p2" type="password"></div>
        <button class="btn bp" style="width:100%;justify-content:center" id="fx-go">Crear y entrar</button>`);
      g.querySelector('#fx-go').onclick = async ()=>{
        const a = g.querySelector('#fx-p1').value, b = g.querySelector('#fx-p2').value;
        if(a.length<6) return alert('Mínimo 6 caracteres'); if(a!==b) return alert('Las contraseñas no coinciden');
        const salt = rnd(12), recovery = rnd(10);
        S.seguridad = { salt, hash:await hash(salt+a), recovery:await hash(salt+recovery), creada:new Date().toISOString() };
        guardarAhora();
        alert(`Contraseña creada ✅\n\nGuardá este CÓDIGO DE RECUPERACIÓN en un lugar seguro (sirve para cambiar la contraseña si se olvida):\n\n${recovery}`);
        unlock();
      };
      return;
    }
    const g = gate(`<div class="mtitle">🔒 Ingresá la contraseña</div>
      <div class="fr"><input class="fx-in" id="fx-p" type="password" placeholder="Contraseña" autocomplete="current-password"></div>
      <button class="btn bp" style="width:100%;justify-content:center" id="fx-go">Entrar</button>
      <div style="margin-top:12px"><a href="#" id="fx-forgot" style="font-size:11px;color:var(--text2)">Olvidé la contraseña</a></div>`);
    const go = async ()=>{ const v = g.querySelector('#fx-p').value; if(await hash(sec.salt+v)===sec.hash) unlock(); else { g.querySelector('#fx-p').value=''; g.querySelector('#fx-p').style.borderColor='var(--red)'; } };
    g.querySelector('#fx-go').onclick = go;
    g.querySelector('#fx-p').onkeydown = e=>{ if(e.key==='Enter') go(); };
    g.querySelector('#fx-forgot').onclick = async e=>{ e.preventDefault();
      const code = prompt('Ingresá el código de recuperación que se mostró al crear la contraseña:'); if(!code) return;
      if(await hash(sec.salt+code.trim().toUpperCase())!==sec.recovery) return alert('Código incorrecto');
      S.seguridad = null; guardarAhora(); alert('Listo. Ahora creá una contraseña nueva.'); checkGate(); };
  }
  window.finChangePassword = async ()=>{
    const sec = S.seguridad; if(!sec) return;
    const cur = prompt('Contraseña actual:'); if(cur==null) return;
    if(await hash(sec.salt+cur)!==sec.hash) return alert('Contraseña incorrecta');
    const nw = prompt('Nueva contraseña (mínimo 6):'); if(!nw || nw.length<6) return alert('Mínimo 6 caracteres');
    S.seguridad = { ...sec, hash:await hash(sec.salt+nw) }; guardarAhora(); alert('Contraseña actualizada ✅');
  };
  // Auto-bloqueo por inactividad
  ['click','keydown','scroll'].forEach(ev=>document.addEventListener(ev, ()=>{ if(sessionStorage.getItem(OK_KEY)) sessionStorage.setItem(OK_KEY, String(Date.now())); }, { passive:true }));
  setInterval(()=>{ const last = +sessionStorage.getItem(OK_KEY)||0; if(last && Date.now()-last > IDLE_MIN*6e4) finLock(); }, 30000);

  // ── Métricas por mes ────────────────────────────────────────────────────────
  function atMonth(ym, fn){
    const sm = S.mes, sa = S.anio; const [y,m] = ym.split('-').map(Number);
    S.mes = m-1; S.anio = y;
    try{ return fn(); } finally { S.mes = sm; S.anio = sa; }
  }
  function metrics(ym){
    return atMonth(ym, ()=>{
      const activos = S.clientes.filter(c=>clienteVigenteEnMes(c));
      const rec = getMRR(), os = getOneShotsMes(), nom = getNomina(), gf = getGastosFijos();
      const ing = rec+os, costos = nom+gf, neto = ing-costos;
      const porTipo = {}, porCliente = {};
      activos.forEach(c=>{ const v = retainer(c)+getTotalExtra(c.id); porTipo[c.tipo||'otros'] = (porTipo[c.tipo||'otros']||0)+v; porCliente[c.nombre] = (porCliente[c.nombre]||0)+v; });
      S.proyectos.filter(p=>p.fecha && p.estado==='cobrado' && isOneShot(p) && p.fecha.slice(0,7)===ym).forEach(p=>{ porTipo._puntual = (porTipo._puntual||0)+p.monto; porCliente[p.cliente] = (porCliente[p.cliente]||0)+p.monto; });
      const pendientes = activos.filter(c=>!isPagadoC(c.id)).map(c=>({ nombre:c.nombre, monto:retainer(c) }));
      const cierre = (S.cierres||{})[ym];
      const extra = +(cierre?.answers?.gastos_extra)||0;
      return { ym, rec, os, ing, nom, gf, costos, neto, margen: ing ? Math.round(neto/ing*100) : 0, clientes:activos.length, porTipo, porCliente, pendientes,
        cierre, extra, netoAj: neto-extra, saldo: cierre?.answers?.saldo!=null && cierre.answers.saldo!=='' ? +cierre.answers.saldo : null };
    });
  }
  function firstYm(){
    const c = [...S.clientes.map(c=>c.inicioServicio), ...S.proyectos.map(p=>p.fecha?.slice(0,7))].filter(Boolean).sort();
    return c[0] || '2025-09';
  }
  const sumM = (arr, k) => arr.reduce((s,x)=>s+(x[k]||0),0);
  function aggregate(months){
    const ms = months.map(metrics);
    const ing = sumM(ms,'ing'), neto = sumM(ms,'neto');
    const porTipo = {}, porCliente = {};
    ms.forEach(m=>{ Object.entries(m.porTipo).forEach(([k,v])=>porTipo[k]=(porTipo[k]||0)+v); Object.entries(m.porCliente).forEach(([k,v])=>porCliente[k]=(porCliente[k]||0)+v); });
    const avgCli = ms.length ? sumM(ms,'clientes')/ms.length : 0;
    return { ms, ing, rec:sumM(ms,'rec'), os:sumM(ms,'os'), costos:sumM(ms,'costos'), nom:sumM(ms,'nom'), gf:sumM(ms,'gf'), neto, extra:sumM(ms,'extra'),
      margen: ing ? Math.round(neto/ing*100) : 0, avgCli, ticket: avgCli ? sumM(ms,'rec')/ms.length/avgCli : 0, porTipo, porCliente, promedio: ms.length ? ing/ms.length : 0 };
  }

  // ── Análisis ────────────────────────────────────────────────────────────────
  const AN = { preset:'6m', cmp:'prev', from:'', to:'' };
  function periodFor(preset){
    const now = ymNow(), y = now.slice(0,4);
    switch(preset){
      case 'mes': return [now, now];
      case 'mespas': return [ymAdd(now,-1), ymAdd(now,-1)];
      case '3m': return [ymAdd(now,-2), now];
      case '6m': return [ymAdd(now,-5), now];
      case '12m': return [ymAdd(now,-11), now];
      case 'anio': return [y+'-01', now];
      case 'aniopas': return [(+y-1)+'-01', (+y-1)+'-12'];
      case 'todo': return [firstYm(), now];
      case 'custom': return [AN.from||ymAdd(now,-5), AN.to||now];
    }
  }
  function compareFor(from, to){
    const n = ymRange(from,to).length;
    if(AN.cmp==='prev') return [ymAdd(from,-n), ymAdd(from,-1)];
    if(AN.cmp==='yoy') return [ymAdd(from,-12), ymAdd(to,-12)];
    return null;
  }
  const delta = (a,b,invert) => { if(b==null) return ''; const p = pct(a,b); if(p==null) return ''; const good = invert ? p<0 : p>0;
    return `<span class="fx-delta ${p===0?'fx-eq':good?'fx-up':'fx-down'}">${p>0?'▲':p<0?'▼':'='} ${Math.abs(p)}%</span>`; };

  window.finAn = (k,v)=>{ AN[k] = v; renderAnalisis(); };
  function renderAnalisis(){
    const el = document.getElementById('an-body'); if(!el) return;
    const [from, to] = periodFor(AN.preset);
    const months = ymRange(from, to);
    const A = aggregate(months);
    let cmp = compareFor(from, to), cmpNote = '';
    // Sin historial en el período de comparación → no comparamos (evita “+2000%” engañosos)
    if(cmp && cmp[1] < firstYm()){ cmp = null; cmpNote = ' · sin datos para comparar en ese período'; }
    else if(cmp && cmp[0] < firstYm()) cmpNote = ' · ⚠️ comparación parcial: el período anterior empieza antes del historial';
    const B = cmp ? aggregate(ymRange(cmp[0], cmp[1])) : null;
    const cmpTxt = cmp ? (AN.cmp==='prev' ? 'vs período anterior' : 'vs mismo período año anterior') + ` (${ymLabel(cmp[0],1)}${cmp[0]!==cmp[1]?' – '+ymLabel(cmp[1],1):''})` : '';
    document.getElementById('an-custom').style.display = AN.preset==='custom' ? 'flex' : 'none';
    const kpi = (lbl, v, bv, sub, col, inv, isPct) => `<div class="card ct ${col}"><div class="clabel">${lbl}</div><div class="cval">${isPct?v+'%':fmt(v)}${B?delta(v,bv,inv):''}</div><div class="csub">${sub}${B?` · antes ${isPct?bv+'%':fmt(bv)}`:''}</div></div>`;
    const tipos = Object.entries(A.porTipo).sort((a,b)=>b[1]-a[1]);
    const maxT = Math.max(1,...tipos.map(t=>t[1]));
    const clientes = Object.entries(A.porCliente).sort((a,b)=>b[1]-a[1]);
    const top = clientes[0], conc = top && A.ing ? Math.round(top[1]/A.ing*100) : 0;
    const best = [...A.ms].sort((a,b)=>b.ing-a.ing)[0], worst = [...A.ms].sort((a,b)=>a.neto-b.neto)[0];
    const pendTot = A.ms.reduce((s,m)=>s+m.pendientes.reduce((x,p)=>x+p.monto,0),0);
    const ins = [];
    if(B && B.ing){ const p = pct(A.ing,B.ing); ins.push([p>=0?'📈':'📉', `Los ingresos ${p>=0?'crecieron':'cayeron'} <b>${Math.abs(p)}%</b> ${cmpTxt}.`]); }
    if(B && B.costos){ const p = pct(A.costos,B.costos); if(Math.abs(p)>=5) ins.push(['💸', `Los costos ${p>0?'subieron':'bajaron'} <b>${Math.abs(p)}%</b>.${p>0 && B.ing && pct(A.ing,B.ing)<p ? ' Crecen más rápido que los ingresos: ojo con el margen.' : ''}`]); }
    if(months.length>1 && best) ins.push(['🏆', `Mejor mes en ingresos: <b>${ymLabel(best.ym)}</b> (${fmt(best.ing)}).`]);
    if(months.length>1 && worst && worst.neto<A.neto/months.length) ins.push(['🔎', `Mes con menor neto: <b>${ymLabel(worst.ym)}</b> (${fmt(worst.neto)}).`]);
    if(conc>=30) ins.push(['⚠️', `<b>${esc(top[0])}</b> representa el <b>${conc}%</b> de los ingresos del período. Mucha dependencia de un solo cliente.`]);
    if(A.os && A.ing) ins.push(['🧩', `El <b>${Math.round(A.os/A.ing*100)}%</b> de los ingresos vino de proyectos puntuales; el resto es recurrente.`]);
    if(pendTot) ins.push(['⏳', `Quedan <b>${fmt(pendTot)}</b> de retainers sin marcar como cobrados en el período.`]);
    if(A.extra) ins.push(['🧾', `Declararon <b>${fmt(A.extra)}</b> de gastos no previstos en los cierres. Neto ajustado: <b>${fmt(A.neto-A.extra)}</b>.`]);
    const moods = A.ms.map(m=>+m.cierre?.answers?.animo).filter(Boolean);
    if(moods.length) ins.push(['💬', `Sensación promedio con las finanzas: <b>${(moods.reduce((a,b)=>a+b,0)/moods.length).toFixed(1)} / 5</b>.`]);

    el.innerHTML = `
      <div class="csub" style="margin-bottom:12px;font-size:11px">${ymLabel(from)}${from!==to?' – '+ymLabel(to):''} · ${months.length} mes${months.length>1?'es':''} ${B?'· '+cmpTxt:''}${cmpNote}</div>
      <div class="crow c4">
        ${kpi('Ingresos', A.ing, B?.ing, `Promedio ${fmt(A.promedio)}/mes`, 'ct-g')}
        ${kpi('Costos', A.costos, B?.costos, `Equipo ${fmt(A.nom)} · Fijos ${fmt(A.gf)}`, 'ct-r', true)}
        ${kpi('Neto', A.neto, B?.neto, 'Ingresos − costos', 'ct-bl')}
        ${kpi('Margen', A.margen, B?.margen, 'Neto / ingresos', 'ct-p', false, true)}
      </div>
      <div class="crow c4">
        ${kpi('Recurrente', A.rec, B?.rec, 'Retainers + extras', 'ct-t')}
        ${kpi('Puntuales', A.os, B?.os, 'Proyectos one-shot cobrados', 'ct-y')}
        <div class="card ct ct-bl"><div class="clabel">Clientes activos</div><div class="cval">${A.avgCli.toFixed(1)}${B?delta(A.avgCli,B.avgCli):''}</div><div class="csub">promedio por mes</div></div>
        ${kpi('Ticket promedio', Math.round(A.ticket), B?Math.round(B.ticket):null, 'Recurrente por cliente/mes', 'ct-g')}
      </div>
      <div class="crow c2" style="grid-template-columns:2fr 1fr">
        <div class="card"><div class="tt" style="margin-bottom:12px">Evolución mensual</div><canvas id="ch-an" height="120"></canvas></div>
        <div class="card"><div class="tt" style="margin-bottom:10px">Lo que hay que saber</div>${ins.length?ins.map(([i,t])=>`<div class="fx-ins"><span>${i}</span><span>${t}</span></div>`).join(''):'<div class="csub">Sin datos suficientes para el período.</div>'}</div>
      </div>
      <div class="crow c2">
        <div class="card"><div class="tt" style="margin-bottom:14px">Ingresos por servicio</div>
          ${tipos.map(([k,v])=>`<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${esc(k==='_puntual'?'Proyectos puntuales':TIPO_LABEL[k]||k)}</span><b>${fmt(v)} <span style="color:var(--text2);font-weight:600">${A.ing?Math.round(v/A.ing*100):0}%</span></b></div><div class="fx-bar"><div style="width:${v/maxT*100}%;background:var(--blue)"></div></div></div>`).join('')||'<div class="csub">Sin ingresos</div>'}</div>
        <div class="card"><div class="tt" style="margin-bottom:14px">Top clientes del período</div>
          ${clientes.slice(0,8).map(([k,v])=>`<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${esc(k)}</span><b>${fmt(v)} <span style="color:var(--text2);font-weight:600">${A.ing?Math.round(v/A.ing*100):0}%</span></b></div><div class="fx-bar"><div style="width:${clientes[0]?v/clientes[0][1]*100:0}%;background:var(--green)"></div></div></div>`).join('')||'<div class="csub">Sin ingresos</div>'}</div>
      </div>
      <div class="tw fx-tl"><div class="th"><div class="tt">Mes a mes</div><div class="csub">Saldo real y ánimo vienen del cierre mensual</div></div><div style="overflow-x:auto"><table>
        <thead><tr><th>Mes</th><th style="text-align:right">Ingresos</th><th style="text-align:right">vs mes ant.</th><th style="text-align:right" class="fx-hide-m">Costos</th><th style="text-align:right">Neto</th><th style="text-align:right" class="fx-hide-m">Margen</th><th style="text-align:right" class="fx-hide-m">Clientes</th><th style="text-align:right" class="fx-hide-m">Saldo real</th><th>Cierre</th></tr></thead>
        <tbody>${[...A.ms].reverse().map(m=>{ const prev = metrics(ymAdd(m.ym,-1)); return `<tr><td><b>${ymLabel(m.ym)}</b></td><td class="num">${fmt(m.ing)}</td><td class="num">${delta(m.ing, prev.ing)||'—'}</td><td class="num fx-hide-m">${fmt(m.costos)}</td>
          <td class="num" style="color:${m.neto>=0?'var(--blue-l)':'var(--red)'};font-weight:800">${fmt(m.neto)}</td><td class="num fx-hide-m">${m.margen}%</td><td class="num fx-hide-m">${m.clientes}</td><td class="num fx-hide-m">${m.saldo!=null?fmt(m.saldo):'—'}</td>
          <td>${m.cierre?.closedAt?'<span class="badge b-g">✓ Cerrado</span>':`<span class="badge b-y" style="cursor:pointer" onclick="finCierreGo('${m.ym}')">Pendiente</span>`}</td></tr>`; }).join('')}</tbody></table></div></div>`;

    destroyChart('an');
    const ctx = document.getElementById('ch-an');
    if(ctx){
      const ds = [
        { label:'Ingresos', data:A.ms.map(m=>m.ing), backgroundColor:'rgba(26,115,232,.65)', borderRadius:6, order:2 },
        { label:'Costos', data:A.ms.map(m=>m.costos), backgroundColor:'rgba(232,72,74,.45)', borderRadius:6, order:2 },
        { label:'Neto', data:A.ms.map(m=>m.neto), type:'line', borderColor:'#2dca72', backgroundColor:'rgba(45,202,114,.1)', tension:.35, pointRadius:4, borderWidth:2.5, order:1 },
      ];
      if(B && B.ms.length===A.ms.length) ds.push({ label:'Ingresos '+(AN.cmp==='yoy'?'año anterior':'período anterior'), data:B.ms.map(m=>m.ing), type:'line', borderColor:'rgba(232,184,74,.9)', borderDash:[6,4], pointRadius:3, borderWidth:2, tension:.35, fill:false, order:0 });
      const tk = { color:'#7a7a8c', font:{ family:'Montserrat', size:10 } };
      charts.an = new Chart(ctx.getContext('2d'), { type:'bar', data:{ labels:A.ms.map(m=>ymLabel(m.ym,1)), datasets:ds },
        options:{ responsive:true, interaction:{ mode:'index', intersect:false }, scales:{ x:{ grid:{ display:false }, ticks:tk }, y:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ ...tk, callback:v=>'$'+(v/1e6).toFixed(1)+'M' } } },
          plugins:{ legend:{ labels:{ color:'#7a7a8c', font:{ family:'Montserrat', size:11 }, usePointStyle:true } }, tooltip:{ callbacks:{ label:c=>' '+c.dataset.label+': '+fmt(c.raw) } } } } });
    }
  }

  // ── Cierre del mes ──────────────────────────────────────────────────────────
  const DEFAULT_Q = [
    { id:'cobros', t:'yesno', q:'¿Se cobraron todos los retainers del mes?', h:'Si falta alguno, contá quién y por qué.', req:true },
    { id:'saldo', t:'money', q:'Saldo real en cuentas / caja al cierre', h:'Sumá bancos, Mercado Pago y efectivo. Sirve para comparar lo calculado vs lo real.', req:true },
    { id:'gastos_extra', t:'money', q:'Gastos no previstos del mes (total)', h:'Lo que no está en gastos fijos ni sueldos: equipos, viajes, imprevistos. 0 si no hubo.', req:true },
    { id:'gastos_det', t:'text', q:'¿En qué fueron esos gastos?', h:'' },
    { id:'ingresos_extra', t:'text', q:'¿Hubo ingresos que no estén cargados? (extras, proyectos, adelantos)', h:'Si hubo, cargalos en Cobros o Proyectos para que los números cierren.' },
    { id:'cambios', t:'text', q:'¿Cambió algún retainer, sueldo o costo fijo?', h:'Aumentos, ajustes por inflación, bajas de herramientas…' },
    { id:'clientes', t:'text', q:'¿Algún cliente avisó baja, pausa o aumento de servicio?', h:'' },
    { id:'cotizacion', t:'money', q:'Cotización del dólar al cierre', h:'' },
    { id:'bien', t:'text', q:'¿Qué salió mejor de lo esperado?', h:'' },
    { id:'preocupa', t:'text', q:'¿Qué nos preocupa para el mes que viene?', h:'' },
    { id:'animo', t:'rating', q:'¿Cómo nos sentimos con las finanzas este mes?', h:'1 = preocupados · 5 = tranquilos', req:true },
  ];
  const questions = () => S.cierrePreguntas?.length ? S.cierrePreguntas : DEFAULT_Q;
  const defaultCierreYm = () => new Date().getDate()<=15 ? ymAdd(ymNow(),-1) : ymNow();
  let CI = defaultCierreYm();
  window.finCierreGo = ym=>{ CI = ym; document.querySelectorAll('.ni').forEach(n=>{ if(n.dataset.fx==='cierre') goTo('cierre', n); }); };
  window.finCierreYm = ym=>{ CI = ym; renderCierre(); };

  function cierreRec(ym){ if(!S.cierres) S.cierres = {}; if(!S.cierres[ym]) S.cierres[ym] = { answers:{} }; return S.cierres[ym]; }
  const answered = (q, a) => { const v = a[q.id]; if(q.t==='yesno') return v==='si' || (v==='no' && (a[q.id+'_det']||'').trim()); return v!=null && String(v).trim()!==''; };
  function streakClosed(){ let n = 0, ym = ymAdd(ymNow(),-1); if(S.cierres?.[ymNow()]?.closedAt) ym = ymNow(); while(S.cierres?.[ym]?.closedAt){ n++; ym = ymAdd(ym,-1); } return n; }
  function pendingClose(){ const p = ymAdd(ymNow(),-1); return new Date().getDate()>=1 && !S.cierres?.[p]?.closedAt && p>=firstYm() ? p : null; }

  window.finAnswer = (id, val)=>{ const r = cierreRec(CI); r.answers[id] = val; r.updatedAt = new Date().toISOString(); save(); renderCierreProgress(); };
  window.finRate = (id, n)=>{ finAnswer(id, n); renderCierre(); };
  window.finYesNo = (id, v)=>{ finAnswer(id, v); renderCierre(); };

  function renderCierreProgress(){
    const a = cierreRec(CI).answers, qs = questions();
    const done = qs.filter(q=>answered(q,a)).length, req = qs.filter(q=>q.req), reqOk = req.every(q=>answered(q,a));
    const bar = document.getElementById('ci-prog'); if(bar) bar.style.width = Math.round(done/qs.length*100)+'%';
    const t = document.getElementById('ci-count'); if(t) t.textContent = `${done}/${qs.length} respondidas`;
    const b = document.getElementById('ci-close'); if(b){ b.disabled = !reqOk; b.style.opacity = reqOk ? 1 : .45; }
    qs.forEach(q=>document.getElementById('q-'+q.id)?.classList.toggle('done', answered(q,a)));
  }

  window.finCloseMonth = ()=>{
    const r = cierreRec(CI);
    r.closedAt = new Date().toISOString();
    const me = platformMember(); r.by = me?.name || '';
    if(r.answers.cotizacion && CI===ymNow()) S.cotizacion = +r.answers.cotizacion || S.cotizacion;
    guardarAhora();
    confettiFx();
    // Suma XP en la plataforma (si la persona entró desde ahí)
    if(me && window.Store) Store.upsert('team','activity',{ type:'finance_close', text:`Cerró las finanzas de ${ymLabel(CI)}`, by:me.id, at:new Date().toISOString(), xp:50 });
    setTimeout(()=>alert(`¡Mes cerrado! 🎉\n\n${ymLabel(CI)} quedó registrado.${streakClosed()>1?`\n🔥 ${streakClosed()} meses seguidos cerrados.`:''}`), 300);
    renderCierre(); updateBadge();
  };
  window.finReopen = ()=>{ const r = cierreRec(CI); r.closedAt = null; save(); renderCierre(); updateBadge(); };

  function confettiFx(){
    for(let i=0;i<90;i++){ const c = document.createElement('div');
      c.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}vw;width:8px;height:13px;z-index:6000;pointer-events:none;background:${COLS[i%COLS.length]};transition:transform ${1.5+Math.random()*1.5}s linear,opacity 3s;`;
      document.body.appendChild(c); requestAnimationFrame(()=>{ c.style.transform = `translateY(110vh) rotate(${Math.random()*720}deg)`; c.style.opacity = '.3'; }); setTimeout(()=>c.remove(), 3500); }
  }

  window.finEditQuestions = ()=>{
    const txt = questions().map(q=>`${q.t}${q.req?'*':''} | ${q.q}${q.h?' | '+q.h:''}`).join('\n');
    const v = prompt('Editá las preguntas (una por línea):\n  tipo | pregunta | ayuda\nTipos: text, money, yesno, rating. Agregá * al tipo si es obligatoria.\nDejá vacío para volver a las preguntas por defecto.', txt.replace(/\n/g,' ;; '));
    if(v===null) return;
    if(!v.trim()){ S.cierrePreguntas = null; save(); return renderCierre(); }
    const old = questions();
    S.cierrePreguntas = v.split(';;').map(s=>s.trim()).filter(Boolean).map(line=>{
      const [tp, q, h] = line.split('|').map(s=>(s||'').trim());
      const t = ['text','money','yesno','rating'].includes(tp.replace('*','')) ? tp.replace('*','') : 'text';
      const prev = old.find(o=>o.q===q);
      return { id:prev?.id || 'q'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), t, q:q||tp, h:h||'', req:tp.endsWith('*') };
    });
    save(); renderCierre();
  };

  function renderCierre(){
    const el = document.getElementById('ci-body'); if(!el) return;
    const rec = cierreRec(CI), a = rec.answers, qs = questions(), m = metrics(CI), closed = !!rec.closedAt;
    const opts = ymRange(ymAdd(ymNow(),-17), ymNow()).reverse();
    const input = q => {
      const v = a[q.id] ?? '';
      if(q.t==='money') return `<input class="fx-in" type="number" step="any" value="${esc(v)}" ${closed?'disabled':''} onchange="finAnswer('${q.id}', this.value)" placeholder="$">`;
      if(q.t==='rating') return `<div class="fx-rate">${['😟','😕','😐','🙂','😄'].map((e,i)=>`<button ${closed?'disabled':''} class="${+v===i+1?'on':''}" onclick="finRate('${q.id}',${i+1})">${e}</button>`).join('')}</div>`;
      if(q.t==='yesno') return `<div style="display:flex;gap:8px;margin-bottom:${v==='no'?'10px':'0'}"><button class="btn ${v==='si'?'bs':'bg'} bsm" ${closed?'disabled':''} onclick="finYesNo('${q.id}','si')">Sí</button><button class="btn ${v==='no'?'bd':'bg'} bsm" ${closed?'disabled':''} onclick="finYesNo('${q.id}','no')">No</button></div>
        ${v==='no'?`<textarea class="fx-in" ${closed?'disabled':''} placeholder="Contá qué pasó" onchange="finAnswer('${q.id}_det', this.value)">${esc(a[q.id+'_det']||'')}</textarea>`:''}`;
      return `<textarea class="fx-in" ${closed?'disabled':''} onchange="finAnswer('${q.id}', this.value)">${esc(v)}</textarea>`;
    };
    const auto = q => {
      if(q.id==='cobros' && m.pendientes.length) return `<div class="csub" style="margin-bottom:8px;color:var(--yellow)">Según “Cobros del mes” faltan marcar: ${m.pendientes.map(p=>esc(p.nombre)+' ('+fmt(p.monto)+')').join(', ')}</div>`;
      if(q.id==='cobros') return `<div class="csub" style="margin-bottom:8px;color:var(--green)">Según “Cobros del mes” están todos marcados ✓</div>`;
      if(q.id==='saldo') return `<div class="csub" style="margin-bottom:8px">Neto calculado del mes: <b>${fmt(m.neto)}</b></div>`;
      return '';
    };
    const st = streakClosed();
    el.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
        <select class="fx-in" style="width:auto" onchange="finCierreYm(this.value)">${opts.map(o=>`<option value="${o}" ${o===CI?'selected':''}>${ymLabel(o)}${S.cierres?.[o]?.closedAt?' ✓':''}</option>`).join('')}</select>
        <span class="badge ${closed?'b-g':'b-y'}">${closed?'✓ Cerrado'+(rec.by?' por '+esc(rec.by):''):'Pendiente'}</span>
        <span style="flex:1"></span><span class="badge b-y" style="font-size:12px;padding:4px 12px">🔥 ${st} mes${st!==1?'es':''} seguidos cerrados</span>
        <button class="btn bg bsm" onclick="finEditQuestions()">✎ Preguntas</button></div>
      <div class="crow c4">
        <div class="card ct ct-g"><div class="clabel">Ingresos</div><div class="cval">${fmt(m.ing)}</div><div class="csub">Recurrente ${fmt(m.rec)} · Puntual ${fmt(m.os)}</div></div>
        <div class="card ct ct-r"><div class="clabel">Costos</div><div class="cval">${fmt(m.costos)}</div><div class="csub">Equipo ${fmt(m.nom)} · Fijos ${fmt(m.gf)}</div></div>
        <div class="card ct ct-bl"><div class="clabel">Neto calculado</div><div class="cval">${fmt(m.neto)}</div><div class="csub">${m.extra?'Ajustado por imprevistos: '+fmt(m.netoAj):'Margen '+m.margen+'%'}</div></div>
        <div class="card ct ct-p"><div class="clabel">Progreso del cierre</div><div class="cval" id="ci-count" style="font-size:17px">—</div><div class="fx-bar" style="margin-top:8px"><div id="ci-prog" style="width:0;background:linear-gradient(90deg,var(--blue),var(--purple))"></div></div></div>
      </div>
      <div class="csub" style="font-size:12px;margin-bottom:14px">Respondé estas preguntas una vez por mes (5 minutos). Las respuestas alimentan el análisis: saldo real, imprevistos y cómo nos sentimos. Se guardan solas.</div>
      ${qs.map((q,i)=>`<div class="fx-q" id="q-${q.id}"><div class="ql">${i+1}. ${esc(q.q)}${q.req?' <span style="color:var(--red)">*</span>':''}</div>${q.h?`<div class="qh">${esc(q.h)}</div>`:''}${auto(q)}${input(q)}</div>`).join('')}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin:20px 0 40px">${closed?'<button class="btn bg" onclick="finReopen()">Reabrir mes</button>':`<button class="btn bp" id="ci-close" onclick="finCloseMonth()" style="padding:12px 22px;font-size:13px">🎉 Cerrar ${ymLabel(CI)}</button>`}</div>`;
    renderCierreProgress();
  }

  function updateBadge(){
    const n = document.querySelector('.ni[data-fx="cierre"]'); if(!n) return;
    n.querySelector('.fx-cnt')?.remove();
    if(pendingClose()) n.insertAdjacentHTML('beforeend','<span class="fx-cnt">1</span>');
  }

  // ── Integración con la app existente ───────────────────────────────────────
  const origRenderPage = window.renderPage, origRender = window.render;
  window.renderPage = function(page){ if(page==='analisis') renderAnalisis(); else if(page==='cierre') renderCierre(); else origRenderPage(page); };
  window.render = function(){ origRender(); renderAnalisis(); renderCierre(); updateBadge(); };
  function render(){ window.render(); }

  // Banner en el dashboard si falta cerrar el mes anterior
  function dashBanner(){
    const p = pendingClose(); const host = document.querySelector('#page-dashboard .content'); if(!host) return;
    document.getElementById('fx-banner')?.remove();
    if(p) host.insertAdjacentHTML('afterbegin', `<div id="fx-banner" class="card" style="display:flex;gap:12px;align-items:center;margin-bottom:16px;border-color:rgba(232,184,74,.4);background:var(--yellow-d)"><span style="font-size:20px">🗓️</span><div style="flex:1"><div style="font-weight:800">Falta el cierre de ${ymLabel(p)}</div><div class="csub">Son 5 minutos de preguntas para entender cómo quedó el mes de verdad.</div></div><button class="btn bp bsm" onclick="finCierreGo('${p}')">Hacer el cierre</button></div>`);
  }
  const origDash = window.renderDash; window.renderDash = function(){ origDash(); dashBanner(); };

  checkGate();
  render();
})();
