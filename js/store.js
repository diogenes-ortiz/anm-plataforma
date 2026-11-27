// ─── STORE ────────────────────────────────────────────────────────────────────
// Guarda cada sección como un documento JSON en la tabla `anm_state` de Supabase
// (la misma que ya usa Finanzas, con ids 'ops', 'growth' y 'team').
// Cada documento tiene colecciones de registros { id, updatedAt, deleted? }.
// Al guardar, primero traemos la versión remota y fusionamos registro por registro
// (gana el updatedAt más nuevo). Así dos personas editando a la vez no se pisan.
(function(){
  const { SUPABASE_URL:SB_URL, SUPABASE_KEY:SB_KEY } = window.ANM_CONFIG;
  // Cada pedido va con el token de la sesión de Google (sin sesión, la base no devuelve nada)
  const H = extra => window.Auth ? Auth.headers(extra) : Promise.resolve({ 'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_KEY, ...(extra||{}) });
  let DOCS = ['ops','growth','team'];
  const LS = id => (window.ANM_CONFIG.LS_PREFIX||'')+'anm_doc_'+id;
  const TOMBSTONE_DAYS = 60;

  const docs = {};           // id -> { col: [records] }
  const dirty = new Set();
  let saveTimer = null, pollTimer = null, status = 'local', saving = false;
  const listeners = [];
  const logged = new Set();

  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
  // Hora del servidor (BUG-08): se corrige el reloj de la compu con la hora que informa la base
  let clockOffset = 0;
  function now(){ return new Date(Date.now()+clockOffset).toISOString(); }

  function setStatus(s){ status=s; listeners.forEach(fn=>fn({type:'status',status:s})); }
  function emit(){ listeners.forEach(fn=>fn({type:'change'})); }

  // Fusiona dos documentos: por colección, por id y POR CAMPO (BUG-07): cada registro guarda en
  // `_f` cuándo se cambió cada campo, así si una persona cambia la fecha y otra el estado, quedan
  // los dos cambios. Registros viejos sin `_f`: gana el updatedAt más nuevo, como antes.
  function mergeRec(x, y){
    if(!x) return y; if(!y) return x;
    const newer = (y.updatedAt||'') > (x.updatedAt||'') ? y : x, older = newer===x ? y : x;
    if(!x._f || !y._f) return newer;
    const out = { ...older, ...newer, _f:{ ...older._f } };
    Object.keys(newer._f).forEach(k=>{ out._f[k] = newer._f[k]; if(!(k in newer) && (newer._f[k]||'') >= (older._f[k]||'')) delete out[k]; });
    Object.keys(older._f).forEach(k=>{ if((older._f[k]||'') > (newer._f[k]||'')){ out[k] = older[k]; out._f[k] = older._f[k]; } });
    if(out.deleted && !(out._f.deleted)) out._f.deleted = out.updatedAt;
    return out;
  }
  function mergeDocs(a, b){
    const out = {};
    const keys = new Set([...Object.keys(a||{}), ...Object.keys(b||{})]);
    const cutoff = Date.now() - TOMBSTONE_DAYS*864e5;
    keys.forEach(k=>{
      const A = a?.[k], B = b?.[k];
      if(!Array.isArray(A) && !Array.isArray(B)){ out[k] = B!==undefined ? B : A; return; }
      const map = new Map();
      [...(A||[]), ...(B||[])].forEach(r=>{ if(!r || r.id==null) return; map.set(r.id, mergeRec(map.get(r.id), r)); });
      // Los borrados viejos se achican pero NO se eliminan: así una copia vieja no los revive (BUG-09)
      out[k] = [...map.values()].map(r=>r.deleted && Date.parse(r.updatedAt||0) < cutoff ? { id:r.id, deleted:true, updatedAt:r.updatedAt } : r);
    });
    return out;
  }

  // Firma estable (Postgres jsonb reordena claves, así que ordenamos antes de comparar)
  function sig(v){
    if(Array.isArray(v)) return '['+v.map(sig).join(',')+']';
    if(v && typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+sig(v[k])).join(',')+'}';
    return JSON.stringify(v);
  }

  // fetch con tiempo máximo: si la base no responde, no se queda colgado
  function tfetch(url, opts={}, ms=10000){
    const ctl = typeof AbortController!=='undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(()=>ctl.abort(), ms) : null;
    return fetch(url, ctl ? { ...opts, signal:ctl.signal } : opts).finally(()=>t && clearTimeout(t));
  }

  async function fetchRemote(id){
    const res = await tfetch(`${SB_URL}/rest/v1/anm_state?id=eq.${id}&select=data,updated_at`, { headers:await H() });
    if(!res.ok) throw new Error('fetch '+res.status);
    const d = Date.parse(res.headers.get('date')||''); if(d){ const off = d - Date.now(); clockOffset = Math.abs(off) > 5000 ? off : 0; }
    const rows = await res.json();
    return rows.length ? { data:rows[0].data||{}, at:rows[0].updated_at, exists:true } : null;
  }

  // Escritura condicionada (BUG-06): solo se guarda si nadie escribió desde que leímos.
  // Devuelve false si hubo un cambio en el medio (entonces se vuelve a leer y fusionar).
  async function pushRemote(id, data, seenAt, exists){
    if(exists && !seenAt){   // fila sin fecha (no debería pasar): se guarda sin condición
      const res = await tfetch(`${SB_URL}/rest/v1/anm_state?id=eq.${id}`, { method:'PATCH', headers:await H({ Prefer:'return=minimal' }), body:JSON.stringify({ data, updated_at:now() }) });
      if(!res.ok) throw new Error('push '+res.status); return true;
    }
    if(seenAt){
      const res = await tfetch(`${SB_URL}/rest/v1/anm_state?id=eq.${id}&updated_at=eq.${encodeURIComponent(seenAt)}`, {
        method:'PATCH', headers:await H({ Prefer:'return=representation' }), body:JSON.stringify({ data, updated_at:now() }) });
      if(!res.ok) throw new Error('push '+res.status);
      const rows = await res.json().catch(()=>[]);
      return Array.isArray(rows) && rows.length > 0;
    }
    const res = await tfetch(`${SB_URL}/rest/v1/anm_state`, { method:'POST', headers:await H({ Prefer:'return=minimal' }), body:JSON.stringify({ id, data, updated_at:now() }) });
    if(res.status===409) return false;   // otra persona la creó recién
    if(!res.ok) throw new Error('push '+res.status);
    return true;
  }

  let storageWarned = false;
  function persistLocal(id){
    try{ localStorage.setItem(LS(id), JSON.stringify(docs[id])); }
    catch(e){ if(!storageWarned){ storageWarned = true; window.UI?.toast('El navegador se quedó sin espacio para la copia local. Los cambios se siguen guardando en la nube; si se corta internet podrían perderse. Probá “Reparar” en Ajustes.','⚠️'); } }   // BUG-10
  }

  async function syncDoc(id, push){
    const before = sig(docs[id]);
    for(let intento=0; intento<4; intento++){
      const remote = await fetchRemote(id);
      const merged = mergeDocs(remote?.data||{}, docs[id]);
      docs[id] = merged;
      persistLocal(id);
      if(!(push || sig(remote?.data||{})!==sig(merged))) break;
      if(await pushRemote(id, merged, remote?.at, remote?.exists)) break;
      if(intento===3) throw new Error('conflicto');
    }
    return before !== sig(docs[id]);
  }

  async function flush(){
    if(!dirty.size) return;
    const ids = [...dirty]; dirty.clear();
    setStatus('syncing'); saving = true;
    try{
      let changed = false;
      for(const id of ids){ if(await syncDoc(id, true)) changed = true; }
      setStatus('synced');
      if(changed) emit();   // BUG-35: lo que trajo la fusión se ve enseguida
    }catch(e){ ids.forEach(i=>dirty.add(i)); setStatus('error'); }
    finally{ saving = false; }
  }

  async function pull(){
    if(dirty.size) return flush();
    try{
      let changed = false;
      for(const id of DOCS){ if(await syncDoc(id, false)) changed = true; }
      setStatus('synced');
      if(changed) emit();
    }catch(e){ setStatus('error'); }
  }

  const Store = {
    uid, now,
    get status(){ return status; },
    on(fn){ listeners.push(fn); },

    loadLocal(){
      DOCS.forEach(id=>{
        try{ docs[id] = JSON.parse(localStorage.getItem(LS(id))||'{}'); }catch(e){ docs[id] = {}; }
      });
    },

    async init(){
      this.loadLocal();
      setStatus('syncing');
      await pull();
      clearInterval(pollTimer);
      pollTimer = setInterval(()=>{ if(!document.hidden) pull(); }, 20000);
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) pull(); });
      // BUG-05: si quedan cambios sin subir, se intenta subir y el navegador avisa antes de cerrar
      window.addEventListener('beforeunload', e=>{ if(dirty.size || saving){ flush(); e.preventDefault(); e.returnValue = ''; } });
    },

    // Lectura: registros vivos de una colección
    all(doc, col){ return (docs[doc]?.[col]||[]).filter(r=>!r.deleted); },
    get(doc, col, id){ return (docs[doc]?.[col]||[]).find(r=>r.id===id && !r.deleted); },
    // ¿Existió alguna vez? (incluye los borrados)
    exists(doc, col, id){ return (docs[doc]?.[col]||[]).some(r=>r.id===id); },

    upsert(doc, col, rec){
      if(!docs[doc]) docs[doc] = {};
      if(!docs[doc][col]) docs[doc][col] = [];
      const arr = docs[doc][col];
      const ts = now(), r = { ...rec, id:rec.id||uid(), updatedAt:ts };
      const i = arr.findIndex(x=>x.id===r.id);
      // createdAt se pone solo al crear: una actualización parcial no lo pisa (BUG-03)
      if(i>=0){ if(arr[i].createdAt) r.createdAt = arr[i].createdAt; else if(!rec.createdAt) delete r.createdAt; }
      else if(!r.createdAt) r.createdAt = ts;
      // Hora de cambio por campo, para fusionar sin perder cambios de otra persona (BUG-07)
      const f = { ...(i>=0 ? arr[i]._f : null) }; Object.keys(rec).forEach(k=>{ if(k!=='id' && k!=='_f' && k!=='updatedAt') f[k] = ts; }); r._f = f;
      if(i>=0) arr[i] = { ...arr[i], ...r }; else arr.push(r);
      this.touch(doc);
      return i>=0 ? arr[i] : r;
    },

    remove(doc, col, id){
      const arr = docs[doc]?.[col]||[];
      const r = arr.find(x=>x.id===id);
      if(r){ r.deleted = true; r.updatedAt = now(); if(r._f) r._f.deleted = r.updatedAt; this.touch(doc); }
    },

    // Registro único (ej: ajustes) guardado dentro de una colección
    setting(key, fallback){ return this.get('team','settings',key)?.value ?? fallback; },
    setSetting(key, value){ this.upsert('team','settings',{ id:key, value }); },

    touch(doc){
      persistLocal(doc); dirty.add(doc); emit();
      clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900);
    },

    // Finanzas (documento 'main') — solo lectura de nombres para importar clientes
    async readFinance(){ try{ return await fetchRemote('main'); }catch(e){ return null; } },

    // Deja registro del error en la base (tabla anm_errors). Máximo 5 por carga, sin repetir.
    logError(msg){
      try{
        const m = String(msg||'').slice(0,1000); if(!m || logged.has(m) || logged.size>=5) return; logged.add(m);
        let who = ''; try{ who = localStorage.getItem('anm_me')||''; }catch(e){}
        H({ Prefer:'return=minimal' }).then(headers=>tfetch(`${SB_URL}/rest/v1/anm_errors`, { method:'POST', headers,
          body:JSON.stringify({ msg:m, page:location.hash||location.pathname, version:window.ANM_VERSION||'', who, agent:navigator.userAgent.slice(0,200) }) }, 5000)).catch(()=>{});
      }catch(e){}
    },
    // Qué documentos sincroniza este usuario (un invitado no tiene acceso a Crecimiento)
    setDocs(ids){ DOCS = ids.slice(); },
    // Borra campos de todos los registros de una colección (ej: datos sensibles viejos)
    stripFields(doc, col, fields){
      let n = 0; (docs[doc]?.[col]||[]).forEach(r=>{ if(fields.some(f=>f in r)){ fields.forEach(f=>{ delete r[f]; if(r._f) r._f[f] = now(); }); r.updatedAt = now(); n++; } });
      if(n) this.touch(doc); return n;
    },
    _mergeDocs: mergeDocs,   // para las pruebas
    exportAll(){ return JSON.parse(JSON.stringify(docs)); },
    importAll(data){
      DOCS.forEach(id=>{ if(data[id]){ docs[id] = mergeDocs(docs[id], data[id]); this.touch(id); } });
    },
    syncNow(){ return dirty.size ? flush() : pull(); },
  };

  window.Store = Store;
})();
