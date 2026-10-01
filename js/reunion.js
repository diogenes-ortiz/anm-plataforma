// ─── ORDENAR REUNIÓN CON IA ───────────────────────────────────────────────────
// Se pega todo lo de una reunión (transcripción de Read AI/Meet, notas, audios
// pasados a texto, chat de WhatsApp) y Claude devuelve:
//   · la minuta ordenada por temas y las decisiones
//   · las tareas nuevas (responsable, fecha, área, estado, nota y link)
//   · los cambios de estado de las tareas que ya existían (para completar el status)
// Todo pasa por la ventana de revisión antes de guardarse.
// Dos modos: automático (Apps Script con la clave de la API, ver apps-script/IA.gs)
// o manual (se copian las instrucciones a Claude y se pega la respuesta).
(function(){
  const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ST = { todo:'pendiente', doing:'en curso', review:'en revisión / esperando al cliente', done:'cerrado' };

  function prompt({ cid, date, text }){
    const c = cid && Store.get('ops','clients',cid);
    const tasks = cid ? Store.all('ops','tasks').filter(t=>t.clientId===cid && (t.status!=='done' || (t.doneAt||'').slice(0,10)>=UI.addDays(UI.today(),-30))) : [];
    const who = id => (App.member(id)?.name||'').split(' ')[0];
    const team = App.members().map(m=>`- ${m.name.split(' ')[0]} (${m.name}) — ${m.title || (m.role==='admin'?'Socio':'Equipo')}`).join('\n');
    const areas = [...new Set([...(c?.areas||[]).map(a=>a.name), ...tasks.map(t=>t.area).filter(Boolean)])];
    return `Sos el asistente de operaciones de ANM Content Studio, una agencia de marketing digital de Argentina. Te paso todo lo que se habló en una reunión${c?` con el cliente ${c.name}`:''}. Ordenalo para cargarlo en nuestra plataforma.

Fecha de la reunión: ${date || UI.today()} (hoy es ${UI.today()}).
Cliente: ${c ? c.name : 'interna / sin cliente'}

EQUIPO (usá el primer nombre como responsable):
${team}

${areas.length ? `ÁREAS QUE YA USAMOS CON ESTE CLIENTE (reusalas con el mismo nombre; podés crear otras nuevas en MAYÚSCULAS):\n${areas.join(' · ')}\n` : 'ÁREAS: agrupá las tareas en áreas cortas en MAYÚSCULAS (ej: CONTENIDO, GOOGLE ADS, WEB, CRM Y ATENCIÓN AL CLIENTE, INFLUENCERS Y CANJES, SEGUIMIENTO COMERCIAL).\n'}
${tasks.length ? `TAREAS QUE YA EXISTEN PARA ESTE CLIENTE (id · estado · área · responsable · fecha · título):\n${tasks.map(t=>`${t.id} · ${t.status||'todo'} · ${t.area||'-'} · ${who(t.assigneeId)||'-'} · ${t.due||'-'} · ${t.title}${t.note?' — '+t.note:''}`).join('\n')}\n` : ''}
QUÉ NECESITO:
1. "minuta": lo que se habló, ordenado por tema, en viñetas "• " cortas y claras (sin relleno, sin repetir). Nombrá quién se encarga cuando se dijo.
2. "decisiones": solo lo que quedó decidido, en viñetas "• ".
3. "tareas": cada cosa a hacer.
   - Si es algo que YA EXISTE en la lista de arriba (aunque esté dicho con otras palabras), devolvela con su "id" y el estado/nota actualizados según lo que se habló. No la dupliques.
   - Si es nueva, sin "id".
   - "estado": "todo" (pendiente), "doing" (en curso), "review" (en revisión o esperando OK/respuesta del cliente), "done" (cerrado).
   - "nota": aclaración corta para el cliente (ej: "falta OK final", "le mandamos mensaje hoy"). Vacía si no hace falta.
   - "quien": primer nombre del equipo o "" si no se dijo. "fecha": YYYY-MM-DD si se dijo o se deduce (ej: "el viernes"), si no "".
   - "texto": empieza con verbo, claro y corto.
4. "contenido": piezas para el calendario de publicaciones si se mencionaron (titulo, fecha YYYY-MM-DD, formato post/reel/story/carrusel).
5. "areas": links (Canva, Drive) o notas generales de un área si se mencionaron.
No inventes nada que no esté en el texto. Escribí en español rioplatense, tono profesional.

Respondé SOLO con este JSON (sin texto antes ni después):
{"titulo":"…","minuta":"• …\\n• …","decisiones":"• …","tareas":[{"id":"","texto":"…","quien":"","fecha":"","area":"…","estado":"todo","nota":"","link":""}],"contenido":[{"titulo":"…","fecha":"…","formato":"post"}],"areas":[{"nombre":"…","link":"","nota":""}]}

CONTENIDO DE LA REUNIÓN:
"""
${text}
"""`;
  }

  // Lee la respuesta (JSON, aunque venga con ``` o texto alrededor)
  function parse(raw){
    const s = String(raw||''), a = s.indexOf('{'), b = s.lastIndexOf('}');
    if(a<0 || b<a) throw new Error('No encontré la respuesta en formato { … }');
    return JSON.parse(s.slice(a, b+1));
  }

  function toImport(r, { cid, date }){
    const c = cid && Store.get('ops','clients',cid);
    const st = x => ['todo','doing','review','done'].includes(x) ? x : 'todo';
    return {
      id:'ia-'+Store.uid(), kind:'ia', clientId:cid||'', client:c?.name||'',
      title: r.titulo || `Reunión ${c?.name||''}`.trim(), date:(date||UI.today())+'T12:00',
      minuta: r.minuta||'', decisiones: r.decisiones||'',
      areas: (r.areas||[]).filter(a=>a&&a.nombre).map(a=>({ name:String(a.nombre).toUpperCase(), link:a.link||'', note:a.nota||'' })),
      tasks: (r.tareas||[]).filter(t=>t&&t.texto).map(t=>{ const ex = t.id && Store.get('ops','tasks',t.id);
        return { existingId: ex ? ex.id : '', text: ex ? ex.title : t.texto, who:t.quien||'', due:t.fecha||(ex?.due||''), area:(t.area||ex?.area||'').toUpperCase(), status:st(t.estado), note:t.nota||'', link:t.link||ex?.link||'', unit:ex?.unit||'' }; }),
      content: (r.contenido||[]).filter(x=>x&&x.titulo&&x.fecha).map(x=>({ title:x.titulo, date:x.fecha, format:x.formato||'post' })),
    };
  }

  async function auto(p){
    const url = Store.setting('aiUrl','');
    const ctrl = new AbortController(), timer = setTimeout(()=>ctrl.abort(), 150000);
    try {
      const res = await fetch(url, { method:'POST', body:JSON.stringify({ prompt:p, token:Store.setting('aiToken','') }), signal:ctrl.signal });
      const j = await res.json();
      if(!j.ok) throw new Error(j.error || 'La IA no respondió');
      return j.text;
    } finally { clearTimeout(timer); }
  }

  const Reunion = {
    open(cid){
      const clients = Store.all('ops','clients').filter(c=>c.active!==false).sort((a,b)=>a.name.localeCompare(b.name));
      const hasAuto = !!Store.setting('aiUrl','');
      const box = UI.modal(`<h2>🧠 Ordenar reunión<button class="icon-btn x" data-close>✕</button></h2>
        <p class="small muted" style="margin:-6px 0 14px">Pegá todo lo de la reunión: transcripción (Read AI, Meet), notas sueltas, audios pasados a texto o el chat. Sale la minuta ordenada, las tareas nuevas y lo que cambió de las tareas que ya estaban, listo para revisar.</p>
        <div class="frow"><div class="fld"><label>Cliente</label><select class="inp" id="rn-client"><option value="">— Interna —</option>${clients.map(c=>`<option value="${c.id}" ${c.id===cid?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="fld"><label>Fecha de la reunión</label><input class="inp" type="date" id="rn-date" value="${UI.today()}"></div></div>
        <div class="fld"><label>Lo que se habló</label><textarea class="inp" id="rn-text" rows="12" placeholder="Pegá acá la transcripción o las notas…"></textarea></div>
        <div id="rn-manual" style="display:${hasAuto?'none':'block'}">
          <div class="alert info" style="margin:0 0 10px"><div class="ai">💡</div><div class="ad">${hasAuto?'':'Todavía no está conectada la IA automática (se configura en Ajustes). Mientras tanto: '}<b>1)</b> tocá “Copiar instrucciones”, <b>2)</b> pegalas en <a href="https://claude.ai/new" target="_blank">Claude</a>, <b>3)</b> pegá abajo lo que te responde.</div></div>
          <div class="fld"><label>Respuesta de Claude</label><textarea class="inp" id="rn-resp" rows="5" placeholder='{"titulo": …}'></textarea></div></div>
        <div class="mfoot">${hasAuto?'<button class="btn g" style="margin-right:auto" id="rn-showman">Hacerlo a mano</button>':''}<button class="btn g" id="rn-copy">📋 Copiar instrucciones</button>
          <button class="btn g" id="rn-read" style="display:${hasAuto?'none':''}">Leer respuesta</button>
          ${hasAuto?'<button class="btn p" id="rn-go">🧠 Ordenar</button>':''}</div>`, true);
      const ctx = ()=>({ cid:box.querySelector('#rn-client').value, date:box.querySelector('#rn-date').value, text:box.querySelector('#rn-text').value.trim() });
      const need = ()=>{ const c = ctx(); if(c.text.length<20){ UI.toast('Pegá primero lo que se habló en la reunión','👆'); return null; } return c; };
      const done = (raw, c)=>{
        let r; try { r = parse(raw); } catch(e){
          // Si en vez de JSON pegaron un status con ✅ 👀 🔸 ▫️, también sirve
          const st = Ops.parseStatus(raw); if(st.areas.some(a=>a.items.length)){ UI.close(); return Ops.openImport({ id:'st-'+Store.uid(), kind:'status', clientId:c.cid, client:Store.get('ops','clients',c.cid)?.name, title:'Status', date:(c.date||UI.today())+'T12:00', minuta:raw, ...Ops.statusToTasks(st) }); }
          return window.alert('No pude leer la respuesta: '+e.message+'\n\nAsegurate de pegar la respuesta completa de Claude.'); }
        UI.close(); setTimeout(()=>Ops.openImport(toImport(r, c)), 60);
      };
      box.querySelector('#rn-copy').onclick = ()=>{ const c = need(); if(c){ UI.copy(prompt(c)); UI.toast('Instrucciones copiadas: pegalas en Claude','📋'); box.querySelector('#rn-manual').style.display='block'; box.querySelector('#rn-read').style.display=''; } };
      box.querySelector('#rn-read').onclick = ()=>{ const c = need(), raw = box.querySelector('#rn-resp').value; if(!c) return; if(!raw.trim()) return UI.toast('Pegá la respuesta de Claude','👆'); done(raw, c); };
      box.querySelector('#rn-showman')?.addEventListener('click', ()=>{ box.querySelector('#rn-manual').style.display='block'; box.querySelector('#rn-read').style.display=''; });
      box.querySelector('#rn-go')?.addEventListener('click', async ev=>{
        const c = need(); if(!c) return; const b = ev.currentTarget; b.disabled = true; b.textContent = '🧠 Ordenando… (puede tardar 1 minuto)';
        try { done(await auto(prompt(c)), c); }
        catch(e){ b.disabled = false; b.textContent = '🧠 Ordenar'; box.querySelector('#rn-manual').style.display='block'; box.querySelector('#rn-read').style.display='';
          UI.toast('La IA automática falló ('+(e.name==='AbortError'?'tardó demasiado':e.message)+'). Podés hacerlo a mano con “Copiar instrucciones”.','⚠️'); }
      });
    },
    configure(){
      UI.form({ title:'🧠 IA para ordenar reuniones', submit:'Guardar', fields:[
        { k:'aiUrl', label:'URL de la aplicación web (Apps Script)', placeholder:'https://script.google.com/macros/s/…/exec', default:Store.setting('aiUrl','') },
        { k:'aiToken', label:'Clave ANM (la misma que pusiste en CLAVE_ANM del script)', default:Store.setting('aiToken','') },
        { k:'h', type:'html', html:'<p class="xs faint">Instrucciones en <a href="https://github.com/diogenes-ortiz/anm-plataforma/blob/main/apps-script/IA.gs" target="_blank">apps-script/IA.gs</a>. Si lo dejás vacío se usa el modo manual (copiar y pegar en Claude).</p>' },
      ], onSubmit:v=>{ Store.setSetting('aiUrl', (v.aiUrl||'').trim()); Store.setSetting('aiToken', (v.aiToken||'').trim()); UI.toast('Guardado','🧠'); App.render(); } });
    },
    prompt, parse, toImport,
  };
  window.Reunion = Reunion;
})();
