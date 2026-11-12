// ─── ASIGNACIÓN AUTOMÁTICA Y PERFILES DEL EQUIPO ──────────────────────────────
// · Reglas por temática: si la tarea habla de "diseño" va para Luli, "web" para Dio, etc.
//   Se editan en Equipo → Asignación automática (solo socios). Una regla puede tener varias personas.
// · Perfiles: el dueño autoriza Gmails; acá se crea (o se vincula) el perfil de cada uno,
//   así ya se le pueden asignar tareas antes de que entre por primera vez.
(function(){
  const esc = UI.esc;
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

  // Apodos para encontrar a cada persona por su nombre
  const ALIAS = { luli:['luli','lucia','pagui'], luisi:['luisi','luisina','lui','luo','luisa','mastrangelo'], santi:['santi','santiago','saem','cordero'], dio:['dio','diogenes','ortiz'] };
  // Gmails conocidos → nombre por defecto y apodo
  const KNOWN = { 'lulipagui@gmail.com':['Luli','luli'], 'luisimastrangelo@gmail.com':['Luisi','luisi'], 'saemcordero@gmail.com':['Santi','santi'], 'diogenessortiz@gmail.com':['Diogenes','dio'] };
  function memberByAlias(key){
    const al = ALIAS[key] || [key];
    const byMail = Object.entries(KNOWN).find(([,v])=>v[1]===key)?.[0];
    return App.members().find(m=>byMail && (m.email||'').toLowerCase()===byMail)
      || App.members().find(m=>m.nick && al.includes(norm(m.nick).trim()))
      || App.members().find(m=>norm(m.name).split(/\s+/).some(tok=>al.some(a=>tok===a || (a.length>=4 && tok.startsWith(a)))))
      || (key==='dio' ? App.owner() : null);   // Dio es el dueño principal
  }

  // ── Reglas ──
  const DEFAULT_RULES = [
    { id:'r-diseno',   words:'diseño, diseñar, diseñ, flyer, logo, placa, pieza gráfica, branding', who:['luli'] },
    { id:'r-social',   words:'social media, redes sociales, redes, contenido, creación de contenido, calendario, reporte, posteo, publicación, reel, historia, community', who:['luisi'] },
    { id:'r-web',      words:'web, página, pagina, landing, sitio, tecnología, tecnologia, dominio, hosting, tienda online, shopify, wordpress', who:['dio'] },
    { id:'r-estrategia', words:'estrategi, planificación, planificacion, plan de marketing, plan de comunicación, plan anual, plan trimestral, objetivos, kpi, posicionamiento, propuesta de valor, público objetivo, publico objetivo, buyer persona, brief, briefing, benchmark, competencia, análisis, analisis, investigación de mercado, investigacion de mercado, diagnóstico, diagnostico, auditoría, auditoria, consultoría, consultoria, propuesta comercial, presupuesto para cliente, cotización, cotizacion, cotizar, pitch, presentación al cliente, presentacion al cliente, ppt, kickoff, onboarding, reunión con cliente, reunion con cliente, nuevo cliente, renovación, renovacion, upsell, lanzamiento, plan de lanzamiento, concepto creativo, idea de campaña, embudo, funnel', who:['santi'] },
    { id:'r-foto',     words:'foto, fotos, fotografía, fotografia, sesión de fotos, producción de fotos', who:['santi'] },
    { id:'r-revisar',  words:'revisar, revisión, revision, chequear, controlar, aprobar internamente', who:['santi','dio'] },
    { id:'r-pauta',    words:'pauta, ads, anuncio, anuncios, campaña, meta ads, google ads, presupuesto de pauta', who:['dio','santi'] },
  ];
  // Reglas guardadas + las nuevas que se agregaron después por defecto (salvo que se hayan borrado a propósito)
  const rules = () => { const saved = Store.setting('assignRules', null); if(!saved) return DEFAULT_RULES;
    const del = Store.setting('assignRulesDel', []);
    return [...saved, ...DEFAULT_RULES.filter(d=>d.id==='r-estrategia' && !saved.some(r=>r.id===d.id) && !del.includes(d.id))]; };
  const people = r => (r.ids && r.ids.length ? r.ids.map(App.member) : (r.who||[]).map(memberByAlias)).filter(Boolean).map(m=>m.id);
  const words = r => String(r.words||'').split(',').map(w=>norm(w).trim()).filter(Boolean);
  const hit = (txt, w) => w.length<=4 ? new RegExp('(^|[^a-z0-9])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)').test(txt) : txt.includes(w);
  // ¿Para quién es esta tarea? → [ids] (el primero es el responsable principal)
  function suggest(title, area){
    const txt = norm(`${title||''} ${area||''}`), out = [];
    rules().forEach(r=>{ if(words(r).some(w=>hit(txt, w))) people(r).forEach(id=>{ if(!out.includes(id)) out.push(id); }); });
    return out;
  }

  // ── Perfiles para los Gmails autorizados (solo el dueño, al entrar) ──
  async function ensureProfiles(){
    if(!App.isOwner() || !window.Auth?.listAccess) return 0;
    let rows; try{ rows = await Auth.listAccess(); }catch(e){ return 0; }
    const ROLE = { owner:'admin', socio:'admin', equipo:'equipo', ventas:'ventas', invitado:'invitado' };
    let n = 0;
    for(const r of rows){
      const email = String(r.email||'').toLowerCase(); if(!email) continue;
      const ms = App.members();
      let m = (r.member_id && App.member(r.member_id)) || ms.find(x=>(x.email||'').toLowerCase()===email);
      if(!m){
        const [defName, key] = KNOWN[email] || [email.split('@')[0], ''];
        const cand = key && memberByAlias(key);
        m = cand && !cand.email ? Store.upsert('team','members',{ id:cand.id, email })
          : Store.upsert('team','members',{ name:defName, email, role:ROLE[r.role]||'equipo', units:[], color:UI.COLORS[ms.length % UI.COLORS.length], emailReminders:true });
        n++;
      }
      if(r.member_id!==m.id && r.role!=='owner'){ try{ await Auth.saveAccess({ email, role:r.role, member_id:m.id }); }catch(e){} }
    }
    if(n) App.render();
    return n;
  }

  // ── Pantalla de reglas (Equipo) ──
  function card(){
    const admin = App.isAdmin();
    return `<div class="card" style="margin-bottom:18px"><div class="card-h"><h3>🤖 Asignación automática</h3><span class="grow"></span>
      ${admin?`<button class="btn sm g" onclick="Asignar.repartir()">Repartir tareas abiertas</button><button class="btn sm p" onclick="Asignar.edit()">＋ Regla</button>`:''}</div>
      <p class="small muted" style="margin-bottom:10px">Al crear una tarea, si el título o el área tiene alguna de estas palabras, se asigna sola. Se puede cambiar a mano siempre.</p>
      <div class="list">${rules().map(r=>{ const ps = people(r).map(App.member).filter(Boolean);
        return `<div class="li ${admin?'click':''}" ${admin?`onclick="Asignar.edit('${esc(r.id)}')"`:''}><span class="avs">${ps.map(m=>UI.avatar(m,'sm')).join('')||'<span class="av sm">?</span>'}</span>
          <div class="grow"><div class="b small">${ps.map(m=>esc(App.short(m))).join(' y ')||'<span style="color:var(--orange)">falta elegir persona</span>'}</div><div class="xs faint">${esc(r.words)}</div></div>${admin?'<span class="xs faint">✎</span>':''}</div>`; }).join('')}</div></div>`;
  }
  const save = list => Store.setSetting('assignRules', list.map(r=>({ id:r.id, words:r.words, ids:people(r) })));

  const Asignar = {
    suggest, ensureProfiles, card, memberByAlias, rules,
    edit(id){
      const list = rules().map(r=>({ ...r })), r = id ? list.find(x=>x.id===id) : { id:'r-'+Store.uid(), words:'' };
      if(!r) return;
      UI.form({ title: id ? 'Regla de asignación' : 'Nueva regla', values:{ words:r.words, ids:people(r) }, fields:[
        { k:'words', label:'Palabras (separadas por coma)', type:'textarea', rows:3, req:true, placeholder:'diseño, diseñar, flyer…' },
        { k:'ids', label:'Va para', type:'multi', req:true, options:App.members().map(m=>[m.id,m.name]), hint:'Podés elegir más de una persona: la primera queda como responsable principal.' },
      ], danger: id ? { label:'Borrar regla', confirm:'¿Borrar esta regla?', fn:()=>{ save(list.filter(x=>x.id!==id)); Store.setSetting('assignRulesDel', [...new Set([...Store.setting('assignRulesDel', []), id])]); App.render(); } } : null,
      onSubmit:v=>{ Object.assign(r, { words:v.words, ids:v.ids, who:[] }); if(!id) list.push(r); save(list); UI.toast('Regla guardada','🤖'); App.render(); } });
    },
    // Aplica las reglas a las tareas abiertas: primero muestra qué cambiaría
    repartir(){
      const changes = Ops.openTasks().map(t=>{ const s = suggest(t.title, t.area); if(!s.length) return null;
        const cur = [t.assigneeId, ...(t.alsoIds||[])].filter(Boolean);
        return s.every(x=>cur.includes(x)) && cur[0]===s[0] ? null : { t, s }; }).filter(Boolean);
      if(!changes.length) return UI.toast('Las tareas abiertas ya están repartidas según las reglas','👌');
      const box = UI.modal(`<h2>Repartir tareas<button class="icon-btn x" data-close>✕</button></h2>
        <p class="small muted" style="margin:-6px 0 12px">${changes.length} tarea${changes.length!==1?'s':''} cambiarían de responsable. Destildá las que no.</p>
        <div class="list" style="max-height:55vh;overflow:auto">${changes.map((c,i)=>`<label class="li" style="cursor:pointer"><input type="checkbox" checked data-i="${i}" style="width:18px;height:18px">
          <div class="grow"><div class="b small">${esc(c.t.title)}</div><div class="xs faint">${esc(App.member(c.t.assigneeId)?.name||'sin asignar')} → <b>${c.s.map(id=>esc(App.short(App.member(id)))).join(' y ')}</b></div></div></label>`).join('')}</div>
        <div class="mfoot"><button class="btn g" data-close>Cancelar</button><button class="btn p" id="rp-go">Repartir</button></div>`, true);
      box.querySelector('#rp-go').onclick = ()=>{
        let n = 0;
        box.querySelectorAll('input[data-i]:checked').forEach(el=>{ const { t, s } = changes[+el.dataset.i];
          Store.upsert('ops','tasks',{ id:t.id, assigneeId:s[0], alsoIds:s.slice(1) }); n++;
          s.filter(id=>id!==App.me().id).forEach(id=>App.notify(id, `Te asignaron: ${t.title}`, '#/ops/tareas')); });
        UI.close(true); UI.toast(`${n} tarea${n!==1?'s':''} repartida${n!==1?'s':''}`,'🤖'); App.render(); };
    },
  };
  window.Asignar = Asignar;
})();
